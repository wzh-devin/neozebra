import { InboxPageContent, useInboxView } from '@/features/inbox'

/**
 * 组合 Inbox 列表页面。
 *
 * @param 无参数
 * @returns Inbox 页面 JSX
 */
const InboxPage = () => {
  const inboxView = useInboxView()

  return <InboxPageContent {...inboxView} />
}

export { InboxPage }
