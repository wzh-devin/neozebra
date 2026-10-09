import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lte,
  lt,
  max,
  or,
  isNull,
} from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { Database } from '../database/database-client.ts'
import { emailAccounts, emailMessages } from '../database/schema.ts'
import type { MailFilterDto, MailPatchDto } from '../../dto/inbox/inbox-dto.ts'
import type { MailAccount, MailBatch, MailBody, MailRecord } from './types.ts'

const getAccount = async (db: Database, owner: string, id: bigint) => {
  const [account] = await db.store
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.id, id), eq(emailAccounts.ownerId, owner)))
  if (!account) throw new HTTPException(404, { message: 'Mailbox not found.' })
  return account
}

const getAccountList = (db: Database, owner: string) =>
  db.store
    .select()
    .from(emailAccounts)
    .where(eq(emailAccounts.ownerId, owner))
    .orderBy(emailAccounts.createdAt)
const getPublicAccountList = (db: Database, owner: string) =>
  db.store
    .select({
      id: emailAccounts.id,
      provider: emailAccounts.provider,
      email: emailAccounts.email,
      lastSyncedAt: emailAccounts.lastSyncedAt,
      isInitialSync: isNull(emailAccounts.cursor),
      error: emailAccounts.error,
    })
    .from(emailAccounts)
    .where(eq(emailAccounts.ownerId, owner))
    .orderBy(emailAccounts.createdAt)
const getUnreadCount = async (db: Database, owner: string) => {
  const [result] = await db.store
    .select({ count: count() })
    .from(emailMessages)
    .innerJoin(emailAccounts, eq(emailMessages.accountId, emailAccounts.id))
    .where(
      and(
        eq(emailAccounts.ownerId, owner),
        eq(emailMessages.read, false),
        eq(emailMessages.archived, false),
      ),
    )
  return result.count
}
const getStoredMessage = async (db: Database, owner: string, id: bigint) => {
  const [result] = await db.store
    .select({ message: emailMessages })
    .from(emailMessages)
    .innerJoin(emailAccounts, eq(emailMessages.accountId, emailAccounts.id))
    .where(and(eq(emailMessages.id, id), eq(emailAccounts.ownerId, owner)))
  if (!result) throw new HTTPException(404, { message: 'Message not found.' })
  return result.message
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
  const search = `%${filter.query.trim().replace(/[\\%_]/g, '\\$&')}%`
  const rows = await db.store
    .select({
      id: emailMessages.id,
      accountId: emailMessages.accountId,
      providerId: emailMessages.providerId,
      title: emailMessages.title,
      sender: emailMessages.sender,
      receivedAt: emailMessages.receivedAt,
      summary: emailMessages.summary,
      read: emailMessages.read,
      archived: emailMessages.archived,
    })
    .from(emailMessages)
    .innerJoin(emailAccounts, eq(emailMessages.accountId, emailAccounts.id))
    .where(
      and(
        eq(emailAccounts.ownerId, owner),
        eq(emailMessages.archived, filter.tab === 'archived'),
        filter.tab === 'unread' ? eq(emailMessages.read, false) : undefined,
        filter.account === 'all' || filter.account === 'email'
          ? undefined
          : eq(emailAccounts.id, filter.account),
        or(
          ilike(emailMessages.title, search),
          ilike(emailMessages.sender, search),
          ilike(emailMessages.summary, search),
        ),
        before
          ? or(
              lt(emailMessages.receivedAt, before.receivedAt),
              and(
                eq(emailMessages.receivedAt, before.receivedAt),
                lt(emailMessages.id, before.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(emailMessages.receivedAt), desc(emailMessages.id))
    .limit(101)
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
  const [snapshot] = await db.store
    .select({ id: max(emailMessages.id) })
    .from(emailMessages)
    .innerJoin(emailAccounts, eq(emailMessages.accountId, emailAccounts.id))
    .where(eq(emailAccounts.ownerId, owner))
  const latest = snapshot.id ?? 0n
  if (after === undefined || after >= latest)
    return { itemList: [], cursor: latest.toString(), hasMore: false }
  const rows = await db.store
    .select({
      id: emailMessages.id,
      accountId: emailMessages.accountId,
      providerId: emailMessages.providerId,
      title: emailMessages.title,
      sender: emailMessages.sender,
      receivedAt: emailMessages.receivedAt,
      summary: emailMessages.summary,
      read: emailMessages.read,
      archived: emailMessages.archived,
    })
    .from(emailMessages)
    .innerJoin(emailAccounts, eq(emailMessages.accountId, emailAccounts.id))
    .where(
      and(
        eq(emailAccounts.ownerId, owner),
        gt(emailMessages.id, after),
        lte(emailMessages.id, latest),
      ),
    )
    .orderBy(asc(emailMessages.id))
    .limit(101)
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
  db.store.transaction(async (transaction) => {
    const address = email.toLowerCase()
    const [existing] = await transaction
      .select()
      .from(emailAccounts)
      .where(
        and(
          eq(emailAccounts.ownerId, owner),
          eq(emailAccounts.provider, provider),
          eq(emailAccounts.email, address),
        ),
      )
      .for('update')
    if (existing) {
      const [account] = await transaction
        .update(emailAccounts)
        .set({ credentials: encrypted, cursor: null, error: null })
        .where(eq(emailAccounts.id, existing.id))
        .returning()
      return account
    }
    const [account] = await transaction
      .insert(emailAccounts)
      .values({
        ownerId: owner,
        provider,
        email: address,
        credentials: encrypted,
      })
      .returning()
    return account
  })

// 删除与同步取得同一账号行锁，关联清理由代码完成。
const deleteAccount = (db: Database, owner: string, id: bigint) =>
  db.store.transaction(async (transaction) => {
    const [account] = await transaction
      .select({ id: emailAccounts.id })
      .from(emailAccounts)
      .where(and(eq(emailAccounts.id, id), eq(emailAccounts.ownerId, owner)))
      .for('update')
    if (!account)
      throw new HTTPException(404, { message: 'Mailbox not found.' })
    await transaction
      .delete(emailMessages)
      .where(eq(emailMessages.accountId, id))
    await transaction.delete(emailAccounts).where(eq(emailAccounts.id, id))
  })

const patchMessage = async (
  db: Database,
  owner: string,
  id: bigint,
  patch: MailPatchDto,
) => {
  const ownedAccounts = db.store
    .select({ id: emailAccounts.id })
    .from(emailAccounts)
    .where(eq(emailAccounts.ownerId, owner))
  const result = await db.store
    .update(emailMessages)
    .set(patch)
    .where(
      and(
        eq(emailMessages.id, id),
        inArray(emailMessages.accountId, ownedAccounts),
      ),
    )
    .returning({ id: emailMessages.id })
  if (!result.length)
    throw new HTTPException(404, { message: 'Message not found.' })
}
const markAllRead = async (db: Database, owner: string) => {
  const ownedAccounts = db.store
    .select({ id: emailAccounts.id })
    .from(emailAccounts)
    .where(eq(emailAccounts.ownerId, owner))
  await db.store
    .update(emailMessages)
    .set({ read: true })
    .where(
      and(
        inArray(emailMessages.accountId, ownedAccounts),
        eq(emailMessages.archived, false),
      ),
    )
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
  db.store.transaction(async (transaction) => {
    const current = await transaction
      .select({ id: emailAccounts.id })
      .from(emailAccounts)
      .where(
        and(
          eq(emailAccounts.id, account.id),
          eq(emailAccounts.credentials, account.credentials),
        ),
      )
      .for('update')
    if (!current.length) return false
    if (batch.messageList.length) {
      const providerIdList = [
        ...new Set(batch.messageList.map((message) => message.providerId)),
      ]
      const storedList = await transaction
        .select({ providerId: emailMessages.providerId })
        .from(emailMessages)
        .where(
          and(
            eq(emailMessages.accountId, account.id),
            inArray(emailMessages.providerId, providerIdList),
          ),
        )
      const existingIdSet = new Set(
        storedList.map((message) => message.providerId),
      )
      const newMessageList = batch.messageList.filter((message) => {
        if (existingIdSet.has(message.providerId)) return false
        existingIdSet.add(message.providerId)
        return true
      })
      if (newMessageList.length)
        await transaction.insert(emailMessages).values(
          newMessageList.map((message) => ({
            accountId: account.id,
            providerId: message.providerId,
            title: message.title,
            sender: message.sender,
            receivedAt: new Date(message.receivedAt),
            summary: message.summary,
            read: message.read,
          })),
        )
    }
    await transaction
      .update(emailAccounts)
      .set({
        cursor: batch.cursor,
        credentials,
        lastSyncedAt: new Date(),
        error: null,
      })
      .where(eq(emailAccounts.id, account.id))
    return true
  })

const saveAccountError = async (
  db: Database,
  account: MailAccount,
  error: string,
) => {
  await db.store
    .update(emailAccounts)
    .set({ error })
    .where(
      and(
        eq(emailAccounts.id, account.id),
        eq(emailAccounts.credentials, account.credentials),
      ),
    )
}
const cacheMessageBody = async (
  db: Database,
  id: bigint,
  content: MailBody,
) => {
  await db.store
    .update(emailMessages)
    .set(content)
    .where(eq(emailMessages.id, id))
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
