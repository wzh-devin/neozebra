import { simpleParser } from 'mailparser'
import type { MailBody } from './types.ts'
const maxMailBytes = 4 * 1024 * 1024
const bodyLimitNotice =
  'This message exceeds the 4 MB preview limit. Read the complete message in your mailbox.'
const limitedMailBody: MailBody = {
  body: bodyLimitNotice,
  bodyFormat: 'markdown',
  summary: bodyLimitNotice,
}

// 保留 HTML 排版；浏览器在隔离阅读区执行清理，不将正文注入工作台 DOM。
const parseMailBody = async (source: Buffer): Promise<MailBody> => {
  if (source.length > maxMailBytes) return limitedMailBody
  const mail = await simpleParser(source, {
    skipTextToHtml: true,
  })
  const text = mail.text?.trim() || '(This message has no text content.)'
  return {
    body: mail.html ? mail.html.slice(0, maxMailBytes) : text.slice(0, 200_000),
    bodyFormat: mail.html ? 'html' : 'markdown',
    summary: text.replace(/\s+/g, ' ').slice(0, 240),
  }
}

export { maxMailBytes, bodyLimitNotice, limitedMailBody, parseMailBody }
