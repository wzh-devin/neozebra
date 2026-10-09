import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { ImapFlow } from 'imapflow'
import { Readable } from 'node:stream'
import { mockImapMailbox } from './imap-fixture.ts'
import { migrateImapAccounts } from '../src/infrastructure/database/migrate-imap-accounts.ts'
import { and, count, eq } from 'drizzle-orm'
import {
  emailAccounts,
  emailMessages,
} from '../src/infrastructure/database/schema.ts'

import { createApp } from '../src/app.ts'
import {
  getDatabase,
  closeDatabase,
} from '../src/infrastructure/database/database-client.ts'
import {
  encryptCredentials,
  decryptCredentials,
} from '../src/infrastructure/security/credentials.ts'
import {
  syncAccount,
  saveAccount,
} from '../src/infrastructure/inbox/inbox-service.ts'
import {
  getAccount,
  deleteAccount,
  saveSyncedBatch,
} from '../src/infrastructure/inbox/inbox-repository.ts'

// 所有数据均为 synthetic integration fixtures，清理只针对本次生成的账号与 Redis 键。
const isConfigured = Boolean(
  process.env.DATABASE_URL &&
  process.env.REDIS_URL &&
  process.env.MAIL_ENCRYPTION_KEY,
)

test(
  'Inbox 使用真实 PostgreSQL / Redis 的集成检查',
  { skip: !isConfigured },
  async (context) => {
    const db = getDatabase()
    let owner = ''
    context.after(async () => {
      try {
        if (owner) {
          const accounts = await db.store
            .select({ id: emailAccounts.id })
            .from(emailAccounts)
            .where(eq(emailAccounts.ownerId, owner))
          for (const account of accounts) {
            if (db.redis.isReady)
              await db.redis.del([
                `${db.config.redisPrefix}sync:${account.id}`,
                `${db.config.redisPrefix}recent:${account.id}`,
              ])
            await deleteAccount(db, owner, account.id)
          }
        }
      } finally {
        await closeDatabase()
      }
    })
    await db.connectRedis()
    const app = createApp()
    const first = await app.request('/api/inbox/accounts')
    assert.equal(first.status, 200)
    const cookie = first.headers.get('set-cookie').split(';')[0]
    assert.match(first.headers.get('set-cookie'), /HttpOnly/)
    assert.match(first.headers.get('set-cookie'), /SameSite=Lax/i)
    const session = decodeURIComponent(cookie.split('=')[1]).split('.')[0]
    owner = createHash('sha256').update(session).digest('hex')
    const foreignResponse = await app.request('/api/inbox/accounts')
    const foreignCookie = foreignResponse.headers
      .get('set-cookie')
      .split(';')[0]
    const headers = {
      Cookie: cookie,
      Origin: db.config.origin,
      'Content-Type': 'application/json',
    }
    const ownRequest = (path: string, method = 'GET', body?: unknown) =>
      app.request(`/api/inbox${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    const credentials = encryptCredentials(
      { password: 'abcdefghijklmnop' },
      db.config.key,
    )
    const [account, otherAccount] = await db.store
      .insert(emailAccounts)
      .values([
        {
          ownerId: owner,
          provider: 'gmail',
          email: 'synthetic@example.test',
          credentials,
        },
        {
          ownerId: owner,
          provider: 'qq',
          email: 'synthetic@qq.com',
          credentials,
        },
      ])
      .returning()
    const accountId = account.id
    const otherAccountId = otherAccount.id
    const [message] = await db.store
      .insert(emailMessages)
      .values({
        accountId,
        providerId: 'a1',
        title: 'Synthetic title',
        sender: 'Sender',
        receivedAt: new Date(),
        summary: 'Synthetic preview',
        body: 'Synthetic body',
        bodyFormat: 'markdown',
      })
      .returning()
    const messageId = message.id

    await context.test('账号和正文按会话隔离，响应没有密文或凭据', async () => {
      const accounts = await ownRequest('/accounts')
      const accountData = await accounts.json()
      assert.equal(accountData.accountList.length, 2)
      assert.doesNotMatch(
        JSON.stringify(accountData),
        /credentials|abcdefghijklmnop/,
      )
      assert.equal(
        (
          await app.request('/api/inbox/messages', {
            headers: { Cookie: foreignCookie },
          })
        ).status,
        200,
      )
      const foreignList = await app.request('/api/inbox/messages', {
        headers: { Cookie: foreignCookie },
      })
      assert.equal((await foreignList.json()).itemList.length, 0)
      assert.equal(
        (
          await app.request(`/api/inbox/messages/${messageId}`, {
            headers: { Cookie: foreignCookie },
          })
        ).status,
        404,
      )
      assert.equal((await ownRequest(`/messages/${messageId}`)).status, 200)
      assert.equal(
        (await ownRequest(`/messages/${messageId}`)).headers.get(
          'cache-control',
        ),
        'no-store',
      )
    })
    await context.test(
      '验证请求边界、同源限制以及旧授权入口已删除',
      async () => {
        assert.equal((await ownRequest('/messages/not-a-uuid')).status, 400)
        assert.equal(
          (await ownRequest(`/messages/${messageId}`, 'PATCH', { read: 'bad' }))
            .status,
          400,
        )
        assert.equal(
          (
            await ownRequest('/accounts/qq', 'POST', {
              email: 'x@evil.test',
              password: 'abc123456',
            })
          ).status,
          400,
        )
        const forbidden = await app.request('/api/inbox/read-all', {
          method: 'POST',
          headers: { ...headers, Origin: 'https://evil.test' },
        })
        assert.equal(forbidden.status, 403)
        assert.equal((await ownRequest('/oauth/google', 'POST')).status, 404)
        assert.equal(
          (await ownRequest('/oauth/google/callback?code=old')).status,
          404,
        )
        assert.equal(
          (
            await ownRequest('/accounts/gmail', 'POST', {
              email: 'you@gmail.com',
              password: 'normal-password',
            })
          ).status,
          400,
        )
        assert.equal(
          (
            await ownRequest('/accounts/gmail', 'POST', {
              email: 'you@gmail.com',
              password: 'abcdefghijklmnop',
              host: 'evil.test',
            })
          ).status,
          400,
        )
      },
    )
    await context.test('整理状态落库、账号搜索和游标分页保持隔离', async () => {
      assert.equal(
        (
          await ownRequest(`/messages/${messageId}`, 'PATCH', {
            read: true,
            archived: true,
          })
        ).status,
        200,
      )
      assert.equal((await ownRequest('/messages')).status, 200)
      assert.equal(
        (await (await ownRequest('/messages')).json()).itemList.length,
        0,
      )
      const archived = await (
        await ownRequest('/messages?tab=archived&query=title')
      ).json()
      assert.equal(archived.itemList[0].id, messageId.toString())
      assert.equal(
        (
          await (
            await ownRequest(`/messages?tab=archived&account=${otherAccountId}`)
          ).json()
        ).itemList.length,
        0,
      )
      const [row] = await db.store
        .select({ read: emailMessages.read, archived: emailMessages.archived })
        .from(emailMessages)
        .where(eq(emailMessages.id, messageId))
      assert.deepEqual(row, { read: true, archived: true })
      await ownRequest(`/messages/${messageId}`, 'PATCH', {
        archived: false,
        read: false,
      })
      await ownRequest('/read-all', 'POST')
      assert.equal(
        (await (await ownRequest('/accounts')).json()).unreadCount,
        0,
      )
    })
    await context.test('分页和字面搜索覆盖 101 封以上邮件', async () => {
      await db.store.insert(emailMessages).values(
        Array.from({ length: 101 }, (_, index) => ({
          accountId: otherAccountId,
          providerId: `page-${index}`,
          title: index === 0 ? '100%_literal' : `Synthetic page ${index}`,
          sender: 'Fixture',
          receivedAt: new Date(1700000000000 - index * 1000),
          body: 'Synthetic fixture',
        })),
      )
      const page = await (await ownRequest('/messages')).json()
      assert.equal(page.itemList.length, 100)
      assert.ok(page.nextCursor)
      const next = await (
        await ownRequest(`/messages?before=${page.nextCursor}`)
      ).json()
      assert.equal(next.itemList.length, 2)
      assert.equal(next.nextCursor, null)
      assert.equal(
        new Set([...page.itemList, ...next.itemList].map((item) => item.id))
          .size,
        102,
      )
      assert.equal(
        (await (await ownRequest('/messages?query=%25_')).json()).itemList
          .length,
        1,
      )
      await db.store
        .delete(emailMessages)
        .where(eq(emailMessages.accountId, otherAccountId))
    })
    await context.test(
      'Gmail IMAP 绑定保存加密应用密码，重连失败保留账号',
      async (subcontext) => {
        const fixture = mockImapMailbox(subcontext)
        const response = await ownRequest('/accounts/gmail', 'POST', {
          email: 'bind@example.test',
          password: 'abcd efgh ijkl mnop',
        })
        assert.equal(response.status, 201)
        const id = BigInt((await response.json()).id)
        const saved = await getAccount(db, owner, id)
        assert.deepEqual(decryptCredentials(saved.credentials, db.config.key), {
          password: 'abcdefghijklmnop',
        })
        assert.equal(saved.cursor, null)
        const client = fixture.connect.mock.calls[0].this as ImapFlow
        assert.equal(client.options.host, 'imap.gmail.com')
        assert.equal(client.options.secure, true)
        assert.equal(fixture.release.mock.calls.length, 1)
        assert.equal(fixture.close.mock.calls.length, 1)
        await db.redis.del(`${db.config.redisPrefix}connect:${owner}`)
        fixture.connect.mock.mockImplementation(async () => {
          throw new Error('private-app-password')
        })
        const failed = await ownRequest('/accounts/gmail', 'POST', {
          email: 'bind@example.test',
          password: 'abcdefghijklmnop',
        })
        assert.equal(failed.status, 502)
        assert.doesNotMatch(await failed.text(), /private-app-password/)
        assert.equal(
          (await getAccount(db, owner, id)).credentials,
          saved.credentials,
        )
        await db.redis.del(`${db.config.redisPrefix}connect:${owner}`)
        await deleteAccount(db, owner, id)
      },
    )
    await context.test(
      '旧 Gmail 凭据清理幂等、保留缓存并避免覆盖并发重连',
      async () => {
        const old = await saveAccount(
          db,
          owner,
          'gmail',
          'legacy@example.test',
          { password: 'abcdefghijklmnop' },
        )
        const [legacy] = await db.store
          .update(emailAccounts)
          .set({
            credentials: encryptCredentials(
              { refresh_token: 'synthetic-legacy-token' },
              db.config.key,
            ),
            cursor: { uidValidity: '88', uid: 8 },
          })
          .where(eq(emailAccounts.id, old.id))
          .returning()
        const [cached] = await db.store
          .insert(emailMessages)
          .values({
            accountId: old.id,
            providerId: 'a1',
            title: 'Legacy cached',
            sender: 'Fixture',
            receivedAt: new Date(),
            body: 'Keep this body',
            bodyFormat: 'markdown',
            read: true,
            archived: true,
          })
          .returning()
        assert.equal(await migrateImapAccounts(db, [legacy]), 1)
        const cleaned = await getAccount(db, owner, old.id)
        assert.deepEqual(
          decryptCredentials(cleaned.credentials, db.config.key),
          { password: '' },
        )
        assert.equal(cleaned.cursor, null)
        assert.match(cleaned.error, /app password/)
        assert.equal(await migrateImapAccounts(db, [cleaned]), 0)
        const [body] = await db.store
          .select()
          .from(emailMessages)
          .where(eq(emailMessages.id, cached.id))
        assert.equal(body.body, 'Keep this body')
        assert.equal(body.read, true)
        assert.equal(body.archived, true)
        await saveAccount(db, owner, 'gmail', old.email, {
          password: 'ponmlkjihgfedcba',
        })
        assert.equal(await migrateImapAccounts(db, [legacy]), 0)
        assert.deepEqual(
          decryptCredentials(
            (await getAccount(db, owner, old.id)).credentials,
            db.config.key,
          ),
          { password: 'ponmlkjihgfedcba' },
        )
        await deleteAccount(db, owner, old.id)
      },
    )
    await context.test('代码维护账号与邮件去重，并更新审计时间', async () => {
      const temporary = await saveAccount(
        db,
        owner,
        'gmail',
        'dedupe@example.test',
        { password: 'abcdefghijklmnop' },
      )
      const attempts = await Promise.allSettled([
        saveAccount(db, owner, 'gmail', 'dedupe@example.test', {
          password: 'abcdefghijklmnop',
        }),
        saveAccount(db, owner, 'gmail', 'dedupe@example.test', {
          password: 'ponmlkjihgfedcba',
        }),
      ])
      assert.ok(attempts.some((result) => result.status === 'fulfilled'))
      const stored = await db.store
        .select()
        .from(emailAccounts)
        .where(
          and(
            eq(emailAccounts.ownerId, owner),
            eq(emailAccounts.email, 'dedupe@example.test'),
          ),
        )
      assert.equal(stored.length, 1)
      assert.equal(stored[0].id, temporary.id)
      assert.ok(stored[0].updatedAt >= stored[0].createdAt)
      const message = {
        providerId: 'duplicate',
        title: 'Synthetic duplicate',
        sender: 'Fixture',
        receivedAt: new Date().toISOString(),
        summary: '',
        read: false,
      }
      const batch = {
        messageList: [message, message],
        cursor: { uidValidity: '88', uid: 8 },
      }
      await Promise.all([
        saveSyncedBatch(db, stored[0], batch, stored[0].credentials),
        saveSyncedBatch(db, stored[0], batch, stored[0].credentials),
      ])
      const messages = await db.store
        .select()
        .from(emailMessages)
        .where(eq(emailMessages.accountId, temporary.id))
      assert.equal(messages.length, 1)
      await deleteAccount(db, owner, temporary.id)
      assert.equal(
        (
          await db.store
            .select()
            .from(emailMessages)
            .where(eq(emailMessages.accountId, temporary.id))
        ).length,
        0,
      )
    })
    await context.test(
      '新增邮件水位隔离、延迟投递与超过100封分页',
      async () => {
        const baseline = await (await ownRequest('/messages/new')).json()
        assert.deepEqual(baseline.itemList, [])
        const added = await db.store
          .insert(emailMessages)
          .values(
            Array.from({ length: 105 }, (_, index) => ({
              accountId: otherAccountId,
              providerId: `arrival-${index}`,
              title: 'Synthetic arrival',
              sender: 'Fixture',
              receivedAt: new Date('2000-01-01'),
              body: '<p>secret body omitted</p>',
              bodyFormat: 'html' as const,
            })),
          )
          .returning({ id: emailMessages.id })
        const firstPage = await (
          await ownRequest(`/messages/new?after=${baseline.cursor}`)
        ).json()
        assert.equal(firstPage.itemList.length, 100)
        assert.equal(firstPage.hasMore, true)
        assert.ok(
          firstPage.itemList.every(
            (item) =>
              item.body === '' && item.accountId === otherAccountId.toString(),
          ),
        )
        const secondPage = await (
          await ownRequest(`/messages/new?after=${firstPage.cursor}`)
        ).json()
        assert.equal(secondPage.itemList.length, 5)
        assert.equal(secondPage.hasMore, false)
        assert.equal(secondPage.cursor, added.at(-1).id.toString())
        assert.deepEqual(
          (
            await (
              await ownRequest(`/messages/new?after=${secondPage.cursor}`)
            ).json()
          ).itemList,
          [],
        )
        const foreign = await app.request('/api/inbox/messages/new?after=0', {
          headers: { Cookie: foreignCookie },
        })
        assert.deepEqual((await foreign.json()).itemList, [])
        assert.equal((await ownRequest('/messages/new?after=-1')).status, 400)
        assert.equal(
          (await ownRequest('/messages/new?after=9223372036854775808')).status,
          400,
        )
        assert.equal(
          (await ownRequest('/sync', 'POST', { force: 'true' })).status,
          400,
        )
        const invalidJson = await app.request('/api/inbox/sync', {
          method: 'POST',
          headers,
          body: '{',
        })
        assert.equal(invalidJson.status, 400)
      },
    )
    await context.test(
      '旧纯文本缓存按需重新解析HTML，后续读取复用缓存',
      async (subcontext) => {
        await db.store
          .update(emailMessages)
          .set({ bodyFormat: null })
          .where(eq(emailMessages.id, messageId))
        const upstream = mockImapMailbox(subcontext).download
        const response = await ownRequest(`/messages/${messageId}`)
        assert.equal(response.status, 200)
        const body = await response.json()
        assert.equal(body.bodyFormat, 'html')
        assert.match(body.body, /<h1>测试邮件/)
        assert.equal(upstream.mock.calls.length, 1)
        assert.equal((await ownRequest(`/messages/${messageId}`)).status, 200)
        assert.equal(upstream.mock.calls.length, 1)
      },
    )
    await context.test(
      '旧 CID 图片缓存重新解析，转换后的正文复用缓存',
      async (subcontext) => {
        await db.store
          .update(emailMessages)
          .set({ bodyFormat: 'html', body: '<img src="cid:logo">' })
          .where(eq(emailMessages.id, messageId))
        const raw = Buffer.from(
          [
            'Content-Type: multipart/related; boundary="cid-boundary"',
            '',
            '--cid-boundary',
            'Content-Type: text/html; charset=utf-8',
            '',
            '<img src="cid:logo">',
            '--cid-boundary',
            'Content-Type: image/png',
            'Content-ID: <logo>',
            'Content-Disposition: inline',
            'Content-Transfer-Encoding: base64',
            '',
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
            '--cid-boundary--',
          ].join('\r\n'),
        )
        const fixture = mockImapMailbox(subcontext)
        fixture.download.mock.mockImplementation(async () => ({
          content: Readable.from([raw]),
          meta: { expectedSize: raw.length, contentType: 'message/rfc822' },
        }))
        const upstream = fixture.download
        const response = await ownRequest(`/messages/${messageId}`)
        assert.equal(response.status, 200)
        assert.match(
          (await response.json()).body,
          /src="data:image\/png;base64,/,
        )
        assert.equal(upstream.mock.calls.length, 1)
        assert.equal((await ownRequest(`/messages/${messageId}`)).status, 200)
        assert.equal(upstream.mock.calls.length, 1)
        await db.store
          .update(emailMessages)
          .set({ body: '<img src="cid:logo">' })
          .where(eq(emailMessages.id, messageId))
        subcontext.mock.restoreAll()
        subcontext.mock.method(ImapFlow.prototype, 'connect', async () => {
          throw new Error('Synthetic unavailable provider')
        })
        const fallback = await ownRequest(`/messages/${messageId}`)
        assert.equal(fallback.status, 200)
        assert.equal((await fallback.json()).body, '<img src="cid:logo">')
      },
    )
    await context.test(
      'Redis 并发锁、节流、增量去重和失败保留缓存',
      async (subcontext) => {
        const account = await getAccount(db, owner, accountId)
        const lockKey = `${db.config.redisPrefix}sync:${accountId}`
        await db.redis.set(lockKey, 'other-owner', { EX: 60 })
        assert.equal(await syncAccount(db, account), 'busy')
        assert.equal(await db.redis.get(lockKey), 'other-owner')
        await db.redis.del(lockKey)
        mockImapMailbox(subcontext)
        assert.equal(await syncAccount(db, account), 'synced')
        assert.equal(
          (
            await db.store
              .select({ count: count() })
              .from(emailMessages)
              .where(eq(emailMessages.accountId, accountId))
          )[0].count,
          2,
        )
        assert.equal(
          (
            await db.store
              .select({ read: emailMessages.read })
              .from(emailMessages)
              .where(eq(emailMessages.id, messageId))
          )[0].read,
          true,
        )
        assert.equal(await db.redis.get(lockKey), null)
        assert.equal(
          await syncAccount(db, await getAccount(db, owner, accountId)),
          'throttled',
        )
        assert.equal(
          await syncAccount(db, await getAccount(db, owner, accountId), true),
          'synced',
        )
        assert.ok(
          (await db.redis.ttl(`${db.config.redisPrefix}recent:${accountId}`)) <=
            8,
        )
        await db.redis.del(`${db.config.redisPrefix}recent:${accountId}`)
        subcontext.mock.restoreAll()
        subcontext.mock.method(ImapFlow.prototype, 'connect', async () => {
          throw { authenticationFailed: true, message: 'secret-token' }
        })
        assert.equal(
          await syncAccount(db, await getAccount(db, owner, accountId)),
          'failed',
        )
        assert.equal(
          (
            await db.store
              .select({ count: count() })
              .from(emailMessages)
              .where(eq(emailMessages.accountId, accountId))
          )[0].count,
          2,
        )
        assert.match(
          (await getAccount(db, owner, accountId)).error,
          /Reconnect/,
        )
        assert.doesNotMatch(
          JSON.stringify(await (await ownRequest('/accounts')).json()),
          /secret-token/,
        )
      },
    )
    await context.test('关联清理由代码执行，外部会话不能删除', async () => {
      const forbidden = await app.request(`/api/inbox/accounts/${accountId}`, {
        method: 'DELETE',
        headers: { ...headers, Cookie: foreignCookie },
      })
      assert.equal(forbidden.status, 404)
      assert.equal(
        (await ownRequest(`/accounts/${accountId}`, 'DELETE')).status,
        200,
      )
      assert.equal(
        (
          await db.store
            .select({ count: count() })
            .from(emailMessages)
            .where(eq(emailMessages.accountId, accountId))
        )[0].count,
        0,
      )
      assert.equal((await ownRequest(`/messages/${messageId}`)).status, 404)
    })
  },
)
