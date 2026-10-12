import { Prisma } from '@neozebra/database'
import { HTTPException } from 'hono/http-exception'

import type { Database } from '../database/database-client.ts'
import { ignoreMissingRecord } from '../database/prisma-errors.ts'
import type { MailFilterDto, MailPatchDto } from '../../dto/inbox/inbox-dto.ts'
import type { MailAccount, MailBatch, MailBody, MailRecord } from './types.ts'

const messageHeaderSelect = {
  id: true,
  accountId: true,
  providerId: true,
  title: true,
  sender: true,
  receivedAt: true,
  summary: true,
  read: true,
  archived: true,
} satisfies Prisma.EmailMessageSelect

const getAccount = async (db: Database, owner: string, id: bigint) => {
  const account = await db.store.emailAccount.findFirst({
    where: { id, ownerId: owner },
  })
  if (!account) throw new HTTPException(404, { message: 'Mailbox not found.' })
  return account
}

const getAccountList = (db: Database, owner: string) =>
  db.store.emailAccount.findMany({
    where: { ownerId: owner },
    orderBy: { createdAt: 'asc' },
  })
const getPublicAccountList = async (db: Database, owner: string) => {
  const accountList = await db.store.emailAccount.findMany({
    select: {
      id: true,
      provider: true,
      email: true,
      lastSyncedAt: true,
      cursor: true,
      error: true,
    },
    where: { ownerId: owner },
    orderBy: { createdAt: 'asc' },
  })
  return accountList.map(({ cursor, ...account }) => ({
    ...account,
    isInitialSync: cursor === null,
  }))
}
const getUnreadCount = (db: Database, owner: string) =>
  db.store.emailMessage.count({
    where: { account: { ownerId: owner }, read: false, archived: false },
  })
const getStoredMessage = async (db: Database, owner: string, id: bigint) => {
  const message = await db.store.emailMessage.findFirst({
    where: { id, account: { ownerId: owner } },
  })
  if (!message) throw new HTTPException(404, { message: 'Message not found.' })
  return message
}

const getPublicMessage = (
  row: Omit<MailRecord, 'createdAt' | 'updatedAt'>,
) => ({
  id: row.id.toString(),
  accountId: row.accountId.toString(),
  kind: 'email' as const,
  title: row.title,
  sender: row.sender,
  receivedAt: row.receivedAt.toISOString(),
  summary: row.summary,
  read: row.read,
  archived: row.archived,
  body: row.body ?? '',
  bodyFormat: row.bodyFormat ?? 'markdown',
})

/**
 * 按会话、账号、状态和字面搜索进行游标分页，正文不进入列表响应。
 *
 * @param db - 类型化 ORM 连接
 * @param owner - 工作台会话
 * @param filter - 已校验的分页与筛选参数
 * @returns 本页邮件头和下一页游标
 */
const getMessagePage = async (
  db: Database,
  owner: string,
  filter: MailFilterDto,
) => {
  const before = filter.before
    ? await getStoredMessage(db, owner, filter.before)
    : undefined
  const search = filter.query.trim().replace(/[\\%_]/g, '\\$&')
  const rows = await db.store.emailMessage.findMany({
    select: messageHeaderSelect,
    where: {
      account: { ownerId: owner },
      archived: filter.tab === 'archived',
      ...(filter.tab === 'unread' ? { read: false } : {}),
      ...(filter.account === 'all' || filter.account === 'email'
        ? {}
        : { accountId: filter.account }),
      AND: [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { sender: { contains: search, mode: 'insensitive' } },
            { summary: { contains: search, mode: 'insensitive' } },
          ],
        },
        ...(before
          ? [
              {
                OR: [
                  { receivedAt: { lt: before.receivedAt } },
                  { receivedAt: before.receivedAt, id: { lt: before.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: 101,
  })
  const itemList = rows
    .slice(0, 100)
    .map((row) => getPublicMessage({ ...row, body: null, bodyFormat: null }))
  return {
    itemList,
    nextCursor: rows.length > 100 ? itemList.at(-1)?.id : null,
  }
}

/**
 * 以所属会话的 ID 水位查询新增邮件；首次调用只建立基线，分页不丢失积压。
 *
 * @param db - ORM 连接
 * @param owner - 当前会话
 * @param after - 已处理水位；未传入时建立基线
 * @returns 新邮件头、下一水位和积压标识
 */
const getNewMessagePage = async (
  db: Database,
  owner: string,
  after?: bigint,
) => {
  const snapshot = await db.store.emailMessage.aggregate({
    _max: { id: true },
    where: { account: { ownerId: owner } },
  })
  const latest = snapshot._max.id ?? 0n
  if (after === undefined || after >= latest)
    return { itemList: [], cursor: latest.toString(), hasMore: false }
  const rows = await db.store.emailMessage.findMany({
    select: messageHeaderSelect,
    where: { account: { ownerId: owner }, id: { gt: after, lte: latest } },
    orderBy: { id: 'asc' },
    take: 101,
  })
  const hasMore = rows.length > 100
  const itemList = rows
    .slice(0, 100)
    .map((message) =>
      getPublicMessage({ ...message, body: null, bodyFormat: null }),
    )
  return {
    itemList,
    cursor: (hasMore ? rows[99].id : latest).toString(),
    hasMore,
  }
}

// 调用方持有该会话、Provider 和邮箱组合的 Redis 锁。
const saveEncryptedAccount = (
  db: Database,
  owner: string,
  provider: 'gmail' | 'qq',
  email: string,
  encrypted: string,
) =>
  db.store.$transaction(async (transaction) => {
    const address = email.toLowerCase()
    const existing = await transaction.emailAccount.findFirst({
      where: { ownerId: owner, provider, email: address },
    })
    if (existing) {
      const account = await transaction.emailAccount
        .update({
          where: { id: existing.id },
          data: { credentials: encrypted, cursor: Prisma.DbNull, error: null },
        })
        .catch(ignoreMissingRecord)
      if (account) return account
    }
    return transaction.emailAccount.create({
      data: {
        ownerId: owner,
        provider,
        email: address,
        credentials: encrypted,
      },
    })
  })

// 条件更新取得账号行锁，与同步共享；关联清理由代码完成。
const deleteAccount = (db: Database, owner: string, id: bigint) =>
  db.store.$transaction(async (transaction) => {
    const account = await transaction.emailAccount
      .update({
        where: { id, ownerId: owner },
        data: { updatedAt: new Date() },
      })
      .catch(ignoreMissingRecord)
    if (!account)
      throw new HTTPException(404, { message: 'Mailbox not found.' })
    await transaction.emailMessage.deleteMany({ where: { accountId: id } })
    await transaction.emailAccount.delete({ where: { id } })
  })

const patchMessage = async (
  db: Database,
  owner: string,
  id: bigint,
  patch: MailPatchDto,
) => {
  const result = await db.store.emailMessage
    .update({
      where: { id, account: { ownerId: owner } },
      data: patch,
    })
    .catch(ignoreMissingRecord)
  if (!result) throw new HTTPException(404, { message: 'Message not found.' })
}
const markAllRead = async (db: Database, owner: string) => {
  await db.store.emailMessage.updateMany({
    where: { account: { ownerId: owner }, archived: false },
    data: { read: true },
  })
}

/**
 * 事务内去重保存同步结果，并通过凭据版本阻止重新授权前的旧任务覆盖新账号。
 *
 * @param db - 类型化 ORM 连接
 * @param account - 发起同步时的账号快照
 * @param batch - 上游增量结果
 * @param credentials - 同步后加密凭据
 * @returns 是否仍持有同一账号版本并完成保存
 */
const saveSyncedBatch = (
  db: Database,
  account: MailAccount,
  batch: MailBatch,
  credentials: string,
) =>
  db.store.$transaction(async (transaction) => {
    // 更新原时间取得行锁；等待期间凭据改变时 PostgreSQL 会重新检查条件。
    const current = await transaction.emailAccount
      .update({
        where: { id: account.id, credentials: account.credentials },
        data: { updatedAt: account.updatedAt },
      })
      .catch(ignoreMissingRecord)
    if (!current) return false
    if (batch.messageList.length) {
      const providerIdList = [
        ...new Set(batch.messageList.map((message) => message.providerId)),
      ]
      const storedList = await transaction.emailMessage.findMany({
        select: { providerId: true },
        where: { accountId: account.id, providerId: { in: providerIdList } },
      })
      const existingIdSet = new Set(
        storedList.map((message) => message.providerId),
      )
      const newMessageList = batch.messageList.filter((message) => {
        if (existingIdSet.has(message.providerId)) return false
        existingIdSet.add(message.providerId)
        return true
      })
      if (newMessageList.length)
        await transaction.emailMessage.createMany({
          data: newMessageList.map((message) => ({
            ...message,
            accountId: account.id,
            receivedAt: new Date(message.receivedAt),
          })),
        })
    }
    await transaction.emailAccount.update({
      where: { id: account.id },
      data: {
        cursor: batch.cursor,
        credentials,
        lastSyncedAt: new Date(),
        error: null,
      },
    })
    return true
  })

const saveAccountError = async (
  db: Database,
  account: MailAccount,
  error: string,
) => {
  await db.store.emailAccount
    .update({
      where: { id: account.id, credentials: account.credentials },
      data: { error },
    })
    .catch(ignoreMissingRecord)
}
const cacheMessageBody = async (
  db: Database,
  id: bigint,
  content: MailBody,
) => {
  await db.store.emailMessage.updateMany({ where: { id }, data: content })
}

export {
  getAccount,
  getAccountList,
  getPublicAccountList,
  getUnreadCount,
  getStoredMessage,
  getPublicMessage,
  getMessagePage,
  getNewMessagePage,
  saveEncryptedAccount,
  deleteAccount,
  patchMessage,
  markAllRead,
  saveSyncedBatch,
  saveAccountError,
  cacheMessageBody,
}
