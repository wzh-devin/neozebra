import { createContext, useContext } from 'react'

const InboxSyncContext = createContext<{
  revision: number
  isSyncing: boolean
  syncError: string | null
  syncHandler: (force?: boolean) => Promise<void>
  setVisibleAccountHandler: (account: string | null) => void
} | null>(null)

// Inbox 与应用层使用同一同步状态，不为页面分别创建轮询。
const useInboxSync = () => {
  const value = useContext(InboxSyncContext)
  if (!value) throw new Error('InboxSyncProvider is required.')
  return value
}

export { InboxSyncContext, useInboxSync }
