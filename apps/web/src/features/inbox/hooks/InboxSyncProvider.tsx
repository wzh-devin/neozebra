import { useI18n } from '@/lib/i18n'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getMailAccounts,
  getNewMailMessages,
  syncMailboxes,
} from '@/services/inbox'

import { InboxSyncContext } from '@/features/inbox/hooks/inbox-sync-context'

/**
 * 在工作台路由间共享同步任务和新邮件水位；手动刷新排在当前自动任务之后。
 *
 * @param props - 工作台路由节点
 * @returns 全局邮件同步与通知 Provider JSX
 */
const InboxSyncProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useI18n()

  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  const location = useLocation()
  const locationRef = useRef(location.pathname)
  useLayoutEffect(() => {
    navigateRef.current = navigate
    locationRef.current = location.pathname
  }, [navigate, location.pathname])
  const visibleAccountRef = useRef<string | null>(null)
  const cursorRef = useRef<string | undefined>(undefined)
  const jobRef = useRef<{
    promise: Promise<void>
    controller: AbortController
    force: boolean
  } | null>(null)
  const disposedRef = useRef(false)
  const [revision, setRevision] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const setVisibleAccountHandler = useCallback((account: string | null) => {
    visibleAccountRef.current = account
  }, [])

  const syncHandler = useCallback(
    async (force = false): Promise<void> => {
      if (disposedRef.current) return
      while (jobRef.current) {
        const active = jobRef.current
        if (!force || active.force) return active.promise
        await active.promise.catch(() => {})
        if (disposedRef.current) return
      }
      const controller = new AbortController()
      const performSyncHandler = async () => {
        setIsSyncing(true)
        try {
          const { accountList } = await getMailAccounts(controller.signal)
          if (controller.signal.aborted) return
          if (cursorRef.current === undefined) {
            const baseline = await getNewMailMessages(
              undefined,
              controller.signal,
            )
            cursorRef.current = baseline.cursor
          }
          const result = accountList.length
            ? await syncMailboxes(controller.signal, force)
            : { statusList: [] }
          let hasMore = true
          while (hasMore && !controller.signal.aborted) {
            const page = await getNewMailMessages(
              cursorRef.current,
              controller.signal,
            )
            if (controller.signal.aborted) return
            cursorRef.current = page.cursor
            hasMore = page.hasMore
            for (const account of accountList) {
              if (account.isInitialSync) continue
              const messageList = page.itemList.filter(
                (message) =>
                  message.accountId === account.id && !message.archived,
              )
              const message = messageList.at(-1)
              const visible = visibleAccountRef.current
              if (
                !message ||
                (locationRef.current.startsWith('/inbox') &&
                  (visible === 'all' ||
                    visible === 'email' ||
                    visible === account.id))
              )
                continue
              toast.message(
                messageList.length === 1
                  ? t('New email')
                  : t('{0} new emails', messageList.length),
                {
                  id: `mail-${account.id}-${message.id}`,
                  description: `${account.email} · ${message.sender}\n${message.title}`,
                  duration: 8000,
                  action: {
                    label: t('Open'),
                    onClick: () =>
                      navigateRef.current(
                        `/inbox/${message.id}?account=${account.id}`,
                      ),
                  },
                },
              )
            }
          }
          if (controller.signal.aborted) return
          setRevision((current) => current + 1)
          const failed = result.statusList.some(
            (account) =>
              account.status === 'failed' || account.status === 'changed',
          )
          const busy =
            force &&
            result.statusList.some((account) => account.status === 'busy')
          if (failed || busy)
            throw new Error(
              busy
                ? t(
                    'A mailbox is syncing in another tab. Try refreshing again shortly.',
                  )
                : t(
                    'Some mailboxes could not sync. Check their status in Manage mailboxes.',
                  ),
            )
          setSyncError(null)
        } catch (cause) {
          if (!controller.signal.aborted) {
            setSyncError(
              cause instanceof Error
                ? cause.message
                : t('Unable to sync mailboxes.'),
            )
            throw cause
          }
        } finally {
          if (jobRef.current?.controller === controller) jobRef.current = null
          if (!controller.signal.aborted) setIsSyncing(false)
        }
      }
      const promise = performSyncHandler()
      jobRef.current = { promise, controller, force }
      return promise
    },
    [t],
  )

  useEffect(() => {
    disposedRef.current = false
    const autoSyncHandler = () => {
      if (document.visibilityState === 'visible')
        void syncHandler().catch(() => {})
    }
    const initial = window.setTimeout(autoSyncHandler, 0)
    const timer = window.setInterval(autoSyncHandler, 10_000)
    document.addEventListener('visibilitychange', autoSyncHandler)
    return () => {
      disposedRef.current = true
      window.clearTimeout(initial)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', autoSyncHandler)
      jobRef.current?.controller.abort()
      jobRef.current = null
    }
  }, [syncHandler])

  return (
    <InboxSyncContext.Provider
      value={{
        revision,
        isSyncing,
        syncError,
        syncHandler,
        setVisibleAccountHandler,
      }}
    >
      {children}
    </InboxSyncContext.Provider>
  )
}

export { InboxSyncProvider }
