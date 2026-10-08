export type InboxKind = 'email' | 'notification'
export type InboxTab = 'all' | 'unread' | 'archived'
export type InboxSource = 'all' | InboxKind

export type InboxItem = {
  id: string
  kind: InboxKind
  title: string
  summary: string
  sender: string
  receivedAt: string
  read: boolean
  archived: boolean
  body: string
  resourceList?: {
    title: string
    description: string
    path: string
  }[]
}
