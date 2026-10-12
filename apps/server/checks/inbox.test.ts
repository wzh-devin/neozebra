import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ImapFlow } from 'imapflow'

import { getInboxConfig } from '../src/infrastructure/config/inbox-config.ts'
import {
  encryptCredentials,
  decryptCredentials,
} from '../src/infrastructure/security/credentials.ts'
import {
  getImapBatch,
  getImapBody,
  withImapMailbox,
} from '../src/infrastructure/inbox/imap-provider.ts'
import { mockImapMailbox } from './imap-fixture.ts'
import { parseMailBody } from '../src/infrastructure/inbox/mail-parser.ts'
import { getSafeProviderError } from '../src/infrastructure/inbox/inbox-service.ts'
import type { MailAccount } from '../src/infrastructure/inbox/types.ts'
import { idSchema, gmailSchema } from '../src/dto/inbox/inbox-dto.ts'
import { getPublicMessage } from '../src/infrastructure/inbox/inbox-repository.ts'

test('业务表审计字段和约束规范，bigint API 不丢精度', () => {
  for (const value of ['0', '-1', 'bad-id', '1e3', '9223372036854775808'])
    assert.equal(idSchema.safeParse(value).success, false)
  assert.equal(idSchema.parse('9007199254740993'), 9007199254740993n)
  const message = getPublicMessage({
    id: 9007199254740993n,
    accountId: 9007199254740995n,
    providerId: 'synthetic',
    title: 'Synthetic',
    sender: 'Fixture',
    receivedAt: new Date(),
    summary: '',
    read: false,
    archived: false,
    body: '',
    bodyFormat: null,
  })
  assert.equal(JSON.parse(JSON.stringify(message)).id, '9007199254740993')
})

const account: MailAccount = {
  id: 1n,
  ownerId: 'synthetic-owner',
  provider: 'gmail',
  email: 'synthetic@example.test',
  credentials: '',
  cursor: null,
  lastSyncedAt: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}
test('邮箱配置需要存储与 256 位密钥，密文随机且拒绝篡改', () => {
  assert.throws(() => getInboxConfig({}), /Configure/)
  assert.throws(
    () =>
      getInboxConfig({
        DATABASE_URL: 'x',
        REDIS_URL: 'x',
        MAIL_ENCRYPTION_KEY: 'short',
      }),
    /Configure/,
  )
  const key = 'ab'.repeat(32)
  const first = encryptCredentials({ password: 'synthetic-secret' }, key)
  const second = encryptCredentials({ password: 'synthetic-secret' }, key)
  assert.notEqual(first, second)
  assert.equal(first.includes('synthetic-secret'), false)
  assert.deepEqual(decryptCredentials(first, key), {
    password: 'synthetic-secret',
  })
  const modified = Buffer.from(first, 'base64')
  modified[30] ^= 1
  assert.throws(() => decryptCredentials(modified.toString('base64'), key))
  assert.throws(() => decryptCredentials(first, 'cd'.repeat(32)))
})

test('MIME 正文保留中文，HTML 保留排版、纯文本支持 Markdown 且限制体积', async () => {
  const source = Buffer.from(
    'Content-Type: text/html; charset=utf-8\r\n\r\n<h1>邮件</h1><script>alert(1)</script><p>正文</p><img src="https://example.test/tracker">',
  )
  const body = await parseMailBody(source)
  assert.match(body.body, /<h1>邮件/)
  assert.match(body.summary, /正文/)
  assert.equal(body.bodyFormat, 'html')
  assert.doesNotMatch(body.summary, /<script|alert\(1\)/)
  const markdown = await parseMailBody(
    Buffer.from(
      'Content-Type: text/plain; charset=utf-8\r\n\r\n# 测试\n\n**Markdown**',
    ),
  )
  assert.equal(markdown.bodyFormat, 'markdown')
  assert.match(markdown.body, /# 测试/)
  assert.match(
    (await parseMailBody(Buffer.alloc(4 * 1024 * 1024 + 1))).body,
    /4 MB preview/,
  )
})

test('MIME 内嵌 CID 图片转换为可直接加载的 data URL', async () => {
  const source = Buffer.from(
    [
      'Content-Type: multipart/related; boundary="synthetic-boundary"',
      '',
      '--synthetic-boundary',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>内嵌图片</p><img src="cid:synthetic-logo">',
      '--synthetic-boundary',
      'Content-Type: image/png',
      'Content-ID: <synthetic-logo>',
      'Content-Disposition: inline',
      'Content-Transfer-Encoding: base64',
      '',
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
      '--synthetic-boundary--',
    ].join('\r\n'),
  )
  const mail = await parseMailBody(source)
  assert.equal(mail.bodyFormat, 'html')
  assert.match(mail.body, /src="data:image\/png;base64,/)
  assert.doesNotMatch(mail.body, /cid:synthetic-logo/)
})

test('Gmail 应用密码归一化，拒绝常规密码、超长和额外上游字段', () => {
  assert.deepEqual(
    gmailSchema.parse({
      email: 'you@gmail.com',
      password: 'abcd efgh ijkl mnop',
    }),
    { email: 'you@gmail.com', password: 'abcdefghijklmnop' },
  )
  for (const input of [
    { email: 'invalid', password: 'abcdefghijklmnop' },
    { email: 'you@gmail.com', password: 'normal-password' },
    { email: 'you@gmail.com', password: 'abcdefghijklmnop', host: 'evil.test' },
  ])
    assert.equal(gmailSchema.safeParse(input).success, false)
})

test('Gmail / QQ 固定 TLS 主机、只读锁、初始100封及 UID 增量', async (context) => {
  const fixture = mockImapMailbox(context)
  for (const provider of ['gmail', 'qq'] as const) {
    const current = { ...account, provider }
    const batch = await getImapBatch(current, { password: 'abcdefghijklmnop' })
    const client = fixture.connect.mock.calls.at(-1)!.this as ImapFlow
    assert.equal(
      client.options.host,
      provider === 'gmail' ? 'imap.gmail.com' : 'imap.qq.com',
    )
    assert.equal(client.options.port, 993)
    assert.equal(client.options.secure, true)
    assert.equal(fixture.fetch.mock.calls.at(-1)!.arguments[0], '51:*')
    assert.deepEqual(batch.cursor, { uidValidity: '88', uid: 8 })
    assert.equal(
      batch.messageList[0].providerId,
      provider === 'gmail' ? 'a1' : '88:7',
    )
    assert.equal(batch.messageList[0].title, '测试')
    assert.equal(batch.messageList[0].read, true)
    const incremental = await getImapBatch(
      { ...current, cursor: { uidValidity: '88', uid: 7 } },
      { password: 'abcdefghijklmnop' },
    )
    assert.equal(incremental.messageList.length, 1)
    assert.equal(fixture.fetch.mock.calls.at(-1)!.arguments[0], '8:*')
    assert.equal(fixture.fetch.mock.calls.at(-1)!.arguments[2]?.uid, true)
    const empty = await getImapBatch(
      { ...current, cursor: { uidValidity: '88', uid: 8 } },
      { password: 'abcdefghijklmnop' },
    )
    assert.equal(empty.messageList.length, 0)
    await getImapBatch(
      { ...current, cursor: { uidValidity: 'old', uid: 100 } },
      { password: 'abcdefghijklmnop' },
    )
    assert.equal(fixture.fetch.mock.calls.at(-1)!.arguments[0], '51:*')
  }
  assert.equal(fixture.close.mock.calls.length, 8)
  assert.equal(fixture.release.mock.calls.length, 8)
})

test('Gmail 稳定消息ID查找正文，兼容原缓存并保留64位精度', async (context) => {
  const fixture = mockImapMailbox(context)
  const body = await getImapBody(
    account,
    { password: 'abcdefghijklmnop' },
    'fffffffffffffffe',
  )
  assert.equal(
    fixture.search.mock.calls[0].arguments[0].emailId,
    '18446744073709551614',
  )
  assert.equal(fixture.search.mock.calls[0].arguments[1]?.uid, true)
  assert.equal(fixture.download.mock.calls[0].arguments[0], '7')
  assert.equal(body.bodyFormat, 'html')
  await assert.rejects(
    getImapBody(account, { password: 'abcdefghijklmnop' }, 'invalid'),
  )
  fixture.fetch.mock.mockImplementation(async () => [
    { uid: 7, emailId: '18446744073709551614', flags: new Set() },
  ])
  assert.equal(
    (await getImapBatch(account, { password: 'abcdefghijklmnop' }))
      .messageList[0].providerId,
    'fffffffffffffffe',
  )
  fixture.search.mock.mockImplementation(async () => [])
  assert.match(
    (await getImapBody(account, { password: 'abcdefghijklmnop' }, 'a1')).body,
    /no longer/,
  )
})

test('IMAP 失败和旧凭据拒绝连接、关闭连接，错误不泄露密码', async (context) => {
  const fixture = mockImapMailbox(context)
  await assert.rejects(
    withImapMailbox('gmail', account.email, '', async () => {}),
    /Reconnect/,
  )
  assert.equal(fixture.connect.mock.calls.length, 0)
  fixture.connect.mock.mockImplementation(async () => {
    throw { authenticationFailed: true, message: 'private-password' }
  })
  await assert.rejects(getImapBatch(account, { password: 'abcdefghijklmnop' }))
  assert.equal(fixture.close.mock.calls.length, 1)
  assert.match(
    getSafeProviderError({ authenticationFailed: true }),
    /Reconnect/,
  )
  assert.doesNotMatch(
    getSafeProviderError(new Error('private-password')),
    /private-password/,
  )
})
