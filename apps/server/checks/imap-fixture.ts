import type { TestContext } from 'node:test'
import { Readable } from 'node:stream'
import { ImapFlow } from 'imapflow'

/**
 * 提供只在测试中使用的 synthetic IMAP 上游，持久化仍由真实 PostgreSQL/Redis 执行。
 *
 * @param context - 当前测试的自动还原 mock 生命周期
 * @returns 可定向覆盖并检查调用的 IMAP 操作
 */
const mockImapMailbox = (context: Pick<TestContext, 'mock'>) => {
  const connect = context.mock.method(
    ImapFlow.prototype,
    'connect',
    async () => {},
  )
  const close = context.mock.method(ImapFlow.prototype, 'close', () => {})
  const release = context.mock.fn(() => {})
  context.mock.method(
    ImapFlow.prototype,
    'getMailboxLock',
    async (path, options) => {
      if (path !== 'INBOX' || options?.readOnly !== true)
        throw new Error('Fixture requires read-only INBOX')
      const client = connect.mock.calls.at(-1)!.this as ImapFlow
      client.mailbox = {
        path: 'INBOX',
        exists: 150,
        uidValidity: 88n,
        uidNext: 9,
        readOnly: true,
      } as ImapFlow['mailbox']
      return { path, release }
    },
  )
  const fetch = context.mock.method(
    ImapFlow.prototype,
    'fetchAll',
    async () => [
      {
        uid: 7,
        emailId: '161',
        flags: new Set(['\\Seen']),
        envelope: {
          subject: '测试',
          from: [{ name: '测试', address: 'sender@example.test' }],
        },
        internalDate: new Date('2024-01-01'),
      },
      {
        uid: 8,
        emailId: '162',
        flags: new Set(),
        envelope: {
          subject: 'Synthetic second',
          from: [{ address: 'sender@example.test' }],
        },
        internalDate: new Date('2024-01-02'),
      },
    ],
  )
  const search = context.mock.method(ImapFlow.prototype, 'search', async () => [
    7,
  ])
  context.mock.method(ImapFlow.prototype, 'fetchOne', async () => ({
    uid: 7,
    size: 1000,
  }))
  const download = context.mock.method(
    ImapFlow.prototype,
    'download',
    async () => ({
      content: Readable.from([
        Buffer.from(
          'Content-Type: text/html; charset=utf-8\r\n\r\n<h1>测试邮件</h1><p>HTML body</p>',
        ),
      ]),
      meta: { expectedSize: 1000, contentType: 'message/rfc822' },
    }),
  )
  return { connect, close, release, fetch, search, download }
}

export { mockImapMailbox }
