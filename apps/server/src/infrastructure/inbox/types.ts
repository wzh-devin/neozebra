import type { emailAccounts, emailMessages } from '../database/schema.ts'
type MailProvider = 'gmail' | 'qq'
type MailCredentials = { password: string }
type MailAccount = typeof emailAccounts.$inferSelect
type MailHeader = {
  providerId: string
  title: string
  sender: string
  receivedAt: string
  summary: string
  read: boolean
}
type MailRecord = typeof emailMessages.$inferSelect
type MailBody = {
  body: string
  bodyFormat: 'html' | 'markdown'
  summary: string
}
type MailBatch = {
  messageList: MailHeader[]
  cursor: NonNullable<MailAccount['cursor']>
}

export type {
  MailProvider,
  MailCredentials,
  MailAccount,
  MailHeader,
  MailRecord,
  MailBatch,
  MailBody,
}
