import type {
  EmailAccount as MailAccount,
  EmailMessage as MailRecord,
} from '@neozebra/database'
type MailProvider = 'gmail' | 'qq'
type MailCredentials = { password: string }
type MailHeader = {
  providerId: string
  title: string
  sender: string
  receivedAt: string
  summary: string
  read: boolean
}
type MailBody = {
  body: string
  bodyFormat: 'html' | 'markdown'
  summary: string
}
type MailBatch = {
  messageList: MailHeader[]
  cursor: { uidValidity?: string; uid?: number }
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
