import type { MailMessage } from '@/services/inbox'

export type InboxTab = 'all' | 'unread' | 'archived'
export type InboxItem = MailMessage
