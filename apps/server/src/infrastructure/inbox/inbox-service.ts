import { randomUUID, createHash } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'

import type { Database } from '../database/database-client.ts'
import {
  decryptCredentials,
  encryptCredentials,
} from '../security/credentials.ts'
import { getImapBatch, getImapBody, withImapMailbox } from './imap-provider.ts'
import {
  getAccount,
  getAccountList,
  getStoredMessage,
  getPublicMessage,
  saveEncryptedAccount,
  saveSyncedBatch,
  saveAccountError,
  cacheMessageBody,
} from './inbox-repository.ts'
import type { MailAccount, MailCredentials, MailProvider } from './types.ts'

const getSafeProviderError = (error: unknown): string => {
  if (error instanceof HTTPException && error.status === 409)
    return error.message
  if ((error as { authenticationFailed?: boolean })?.authenticationFailed)
    return 'Mailbox authorization expired. Reconnect this mailbox.'
  return 'Unable to reach this mailbox. Check its authorization and try again.'
}

/**
 * 对单账号取得可续期 Redis 锁并同步；保留本地整理状态和失败前缓存。
 *
 * @param db - ORM、Redis 与服务配置
 * @param account - 当前会话拥有的邮箱
 * @returns 同步完成或因已有锁/节流而跳过的状态
 */
const syncAccount = async (
  db: Database,
  account: MailAccount,
  force = false,
) => {
  await db.connectRedis()
  const key = `${db.config.redisPrefix}sync:${account.id}`
  const throttleKey = `${db.config.redisPrefix}recent:${account.id}`
  const token = randomUUID()
  if (!force && (await db.redis.exists(throttleKey))) return 'throttled'
  if (!(await db.redis.set(key, token, { NX: true, EX: 120 }))) return 'busy'
  let ownsLock = true
  const renewHandler = async () => {
    try {
      ownsLock = Boolean(
        await db.redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], 120) else return 0 end",
          { keys: [key], arguments: [token] },
        ),
      )
    } catch {
      ownsLock = false
    }
  }
  const heartbeat = setInterval(renewHandler, 30_000)
  heartbeat.unref()
  try {
    const credentials = decryptCredentials<MailCredentials>(
      account.credentials,
      db.config.key,
    )
    const batch = await getImapBatch(account, credentials)
    if (!ownsLock || (await db.redis.get(key)) !== token)
      throw new Error('Sync lease expired')
    if (!(await saveSyncedBatch(db, account, batch, account.credentials)))
      return 'changed'
    await db.redis.set(throttleKey, '1', { EX: 8 })
    return 'synced'
  } catch (error) {
    await saveAccountError(db, account, getSafeProviderError(error))
    await db.redis.set(throttleKey, '1', { EX: 8 })
    return 'failed'
  } finally {
    clearInterval(heartbeat)
    await db.redis
      .eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        { keys: [key], arguments: [token] },
      )
      .catch(() => {})
  }
}

const syncMailboxList = async (db: Database, owner: string, force = false) => {
  const accountList = await getAccountList(db, owner)
  const statusList: { id: string; status: string }[] = []
  for (let index = 0; index < accountList.length; index += 3) {
    const batchList = await Promise.all(
      accountList.slice(index, index + 3).map(async (account) => ({
        id: account.id.toString(),
        status: await syncAccount(db, account, force),
      })),
    )
    statusList.push(...batchList)
  }
  return statusList
}

const saveAccount = async (
  db: Database,
  owner: string,
  provider: 'gmail' | 'qq',
  email: string,
  credentials: MailCredentials,
) => {
  await db.connectRedis()
  const key = `${db.config.redisPrefix}account:${createHash('sha256').update(`${owner}:${provider}:${email.toLowerCase()}`).digest('hex')}`
  const token = randomUUID()
  if (!(await db.redis.set(key, token, { NX: true, EX: 60 })))
    throw new HTTPException(409, {
      message: 'This mailbox is already being connected. Try again shortly.',
    })
  try {
    const account = await saveEncryptedAccount(
      db,
      owner,
      provider,
      email,
      encryptCredentials(credentials, db.config.key),
    )
    await db.redis.del(`${db.config.redisPrefix}recent:${account.id}`)
    return account
  } finally {
    await db.redis
      .eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        { keys: [key], arguments: [token] },
      )
      .catch(() => {})
  }
}

/**
 * 按所属会话读取邮件，正文按需缓存，应用密码仅在服务器解密使用。
 *
 * @param db - 数据连接与加密配置
 * @param owner - 当前会话标识
 * @param id - 邮件 bigint 主键
 * @returns 完整的公开邮件字段，不含上游凭据
 */
const getMessage = async (db: Database, owner: string, id: bigint) => {
  const row = await getStoredMessage(db, owner, id)

  // 旧 HTML 缓存未展开 CID 图片，需要重取 MIME 后再缓存。
  // shortcut: 附件缺失的 CID 会在重开时重取，遇到此类邮件再记录解析版本。
  const hasUnresolvedInlineImage =
    row.bodyFormat === 'html' && /\bsrc\s*=\s*["']?cid:/i.test(row.body ?? '')
  if (row.body !== null && row.bodyFormat !== null && !hasUnresolvedInlineImage)
    return getPublicMessage(row)
  const account = await getAccount(db, owner, row.accountId)
  const credentials = decryptCredentials<MailCredentials>(
    account.credentials,
    db.config.key,
  )
  try {
    const content = await getImapBody(account, credentials, row.providerId)
    const summary = row.summary || content.summary
    await cacheMessageBody(db, row.id, { ...content, summary })
    return getPublicMessage({ ...row, ...content, summary })
  } catch (error) {
    if (hasUnresolvedInlineImage) return getPublicMessage(row)
    throw new HTTPException(502, { message: getSafeProviderError(error) })
  }
}

const connectImap = async (
  db: Database,
  owner: string,
  provider: MailProvider,
  email: string,
  password: string,
) => {
  await db.connectRedis()
  if (
    !(await db.redis.set(`${db.config.redisPrefix}connect:${owner}`, '1', {
      NX: true,
      EX: 10,
    }))
  )
    throw new HTTPException(429, {
      message: 'Please wait before trying to connect again.',
    })
  try {
    await withImapMailbox(provider, email, password, async () => {})
  } catch {
    throw new HTTPException(502, {
      message:
        provider === 'gmail'
          ? 'Gmail connection failed. Enable two-step verification and enter a Google app password. Your account must allow IMAP app passwords.'
          : 'QQ connection failed. Enable IMAP and enter its authorization code.',
    })
  }
  return saveAccount(db, owner, provider, email, { password })
}

export {
  getSafeProviderError,
  syncAccount,
  syncMailboxList,
  saveAccount,
  getMessage,
  connectImap,
}
