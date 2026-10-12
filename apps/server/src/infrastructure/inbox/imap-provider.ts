import { z } from 'zod'
import { ImapFlow } from 'imapflow'
import { HTTPException } from 'hono/http-exception'
import { maxMailBytes, limitedMailBody, parseMailBody } from './mail-parser.ts'
import type {
  MailAccount,
  MailBatch,
  MailBody,
  MailCredentials,
  MailHeader,
  MailProvider,
} from './types.ts'

// Gmail IMAP 的 X-GM-MSGID 与原有邮件 ID 等价，保持缓存、已读和归档记录。
const getGmailMessageId = (value?: string): string => {
  if (!value || !/^[1-9]\d{0,19}$/.test(value))
    throw new Error('Missing Gmail message ID')
  return BigInt(value).toString(16)
}
const mailProviderSchema = z.enum(['gmail', 'qq'])
const mailCursorSchema = z
  .object({
    uidValidity: z.string().optional(),
    uid: z.number().int().nonnegative().optional(),
  })
  .nullable()

const unavailableMailBody: MailBody = {
  body: 'This message is no longer available in this mailbox.',
  bodyFormat: 'markdown',
  summary: '',
}

/**
 * 在固定 Gmail / QQ TLS 主机上以只读方式执行操作，并始终关闭连接。
 *
 * @param provider - 邮箱服务商
 * @param email - 邮箱地址
 * @param password - 应用专用密码或 IMAP 授权码
 * @param operation - 持有只读 INBOX 锁期间的操作
 * @returns 操作结果；超时或断线拒绝请求
 */
const withImapMailbox = async <T>(
  provider: MailProvider,
  email: string,
  password: string,
  operation: (client: ImapFlow) => Promise<T>,
): Promise<T> => {
  if (!password)
    throw new HTTPException(409, {
      message:
        'Reconnect this mailbox with its IMAP app password or authorization code.',
    })
  const client = new ImapFlow({
    host: provider === 'gmail' ? 'imap.gmail.com' : 'imap.qq.com',
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableAutoIdle: true,
  })
  client.on('error', () => {})
  const deadline = setTimeout(() => client.close(), 45_000)
  deadline.unref()
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX', { readOnly: true })
    try {
      return await operation(client)
    } finally {
      lock.release()
    }
  } finally {
    clearTimeout(deadline)
    client.close()
  }
}

/**
 * 首次取最近100封，之后按 UID 增量读取；Gmail 沿用稳定消息标识。
 *
 * @param account - 当前邮箱与同步游标
 * @param credentials - 已解密的应用密码或授权码
 * @returns 邮件头列表及新游标；不修改上游已读状态
 */
const getImapBatch = async (
  account: MailAccount,
  credentials: MailCredentials,
): Promise<MailBatch> =>
  withImapMailbox(
    mailProviderSchema.parse(account.provider),
    account.email,
    credentials.password,
    async (client) => {
      if (!client.mailbox) throw new Error('IMAP INBOX unavailable')
      const cursor = mailCursorSchema.parse(account.cursor)
      const uidValidity = client.mailbox.uidValidity.toString()
      const isInitial = cursor?.uidValidity !== uidValidity
      const range = isInitial
        ? `${Math.max(1, client.mailbox.exists - 99)}:*`
        : `${(cursor?.uid ?? 0) + 1}:*`
      const fetchedList = client.mailbox.exists
        ? await client.fetchAll(
            range,
            { uid: true, envelope: true, flags: true, internalDate: true },
            { uid: !isInitial },
          )
        : []
      const messageList = fetchedList
        .filter((message) => isInitial || message.uid > (cursor?.uid ?? 0))
        .map((message): MailHeader => ({
          providerId:
            account.provider === 'gmail'
              ? getGmailMessageId(message.emailId)
              : `${uidValidity}:${message.uid}`,
          title: (message.envelope?.subject ?? '(No subject)').slice(0, 1000),
          sender: (
            message.envelope?.from
              ?.map((sender) =>
                sender.name
                  ? `${sender.name} <${sender.address}>`
                  : sender.address,
              )
              .join(', ') || 'Unknown sender'
          ).slice(0, 1000),
          receivedAt: (message.internalDate instanceof Date
            ? message.internalDate
            : new Date()
          ).toISOString(),
          summary: '',
          read: message.flags?.has('\\Seen') ?? false,
        }))
      return {
        messageList,
        cursor: {
          uidValidity,
          uid: Math.max(
            cursor?.uidValidity === uidValidity ? (cursor.uid ?? 0) : 0,
            ...fetchedList.map((message) => message.uid),
          ),
        },
      }
    },
  )

/**
 * 只读查找并下载有体积限制的 MIME 正文，Gmail 先将稳定 ID 映射为 UID。
 *
 * @param account - 所属邮箱
 * @param credentials - 已解密的应用密码或授权码
 * @param id - Provider 稳定邮件标识
 * @returns 解析正文；邮件已移出 INBOX 时返回明确提示
 */
const getImapBody = async (
  account: MailAccount,
  credentials: MailCredentials,
  id: string,
): Promise<MailBody> =>
  withImapMailbox(
    mailProviderSchema.parse(account.provider),
    account.email,
    credentials.password,
    async (client) => {
      let uid: string
      if (account.provider === 'gmail') {
        if (!/^[a-f\d]{1,16}$/i.test(id))
          throw new Error('Invalid Gmail message ID')
        const matches = await client.search(
          { emailId: BigInt(`0x${id}`).toString() },
          { uid: true },
        )
        if (!Array.isArray(matches) || !matches.length)
          return unavailableMailBody
        uid = String(matches[0])
      } else {
        const [validity, value] = id.split(':')
        if (
          !client.mailbox ||
          validity !== client.mailbox.uidValidity.toString()
        )
          return unavailableMailBody
        uid = value
      }
      const info = await client.fetchOne(uid, { size: true }, { uid: true })
      if (!info) return unavailableMailBody
      if ((info.size ?? 0) > maxMailBytes) return limitedMailBody
      const download = await client.download(uid, undefined, {
        uid: true,
        maxBytes: maxMailBytes + 1,
      })
      if (!download?.content) throw new Error('IMAP message unavailable')
      const chunkList: Buffer[] = []
      let size = 0
      for await (const chunk of download.content) {
        const buffer = Buffer.from(chunk)
        size += buffer.length
        if (size > maxMailBytes) {
          download.content.destroy()
          return limitedMailBody
        }
        chunkList.push(buffer)
      }
      return parseMailBody(Buffer.concat(chunkList))
    },
  )

export { getImapBatch, getImapBody, withImapMailbox }
