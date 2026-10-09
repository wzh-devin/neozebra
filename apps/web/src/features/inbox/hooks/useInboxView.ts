import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useInboxSync } from '@/features/inbox/hooks/inbox-sync-context'
import type { InboxItem, InboxTab } from '@/features/inbox/types'
import {
  connectImapMailbox,
  disconnectMailbox,
  getMailAccounts,
  getMailMessage,
  getMailMessageList,
  markAllMailRead,
  updateMailMessage,
} from '@/services/inbox'
import type { Mailbox } from '@/services/inbox'

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to update Inbox. Try again.'

/**
 * 管理真实邮箱列表、按需正文、应用层同步及服务器持久化整理操作。
 *
 * @param 无参数
 * @returns Inbox 状态与交互；请求取消、错误和重复提交在此处理
 */
const useInboxView = () => {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<InboxTab>('all')
  const source = searchParams.get('account') ?? 'all'
  const {
    revision,
    isSyncing,
    syncError,
    syncHandler,
    setVisibleAccountHandler,
  } = useInboxSync()
  const [query, setQuery] = useState('')
  const [visibleItemList, setItemList] = useState<InboxItem[]>([])
  const [accountList, setAccountList] = useState<Mailbox[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [detail, setDetail] = useState<InboxItem | undefined>()
  const [isBodyLoading, setIsBodyLoading] = useState(false)
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [bodyRevision, setBodyRevision] = useState(0)
  const [isMissingItem, setIsMissingItem] = useState(false)
  const [isAccountsOpen, setIsAccountsOpen] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  const mutationRef = useRef(false)
  const selectedHeader = itemId
    ? visibleItemList.find((item) => item.id === itemId)
    : visibleItemList[0]
  const selectedId = itemId ?? selectedHeader?.id
  const selectedItem =
    detail && detail.id === selectedId
      ? {
          ...detail,
          ...selectedHeader,
          body: detail.body,
          bodyFormat: detail.bodyFormat,
        }
      : selectedHeader

  const reloadHandler = useCallback(
    async (before?: string) => {
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller
      setIsLoading(true)
      try {
        const accounts = await getMailAccounts(controller.signal)
        const messages = await getMailMessageList(
          { tab: activeTab, account: source, query },
          before,
          controller.signal,
        )
        if (controller.signal.aborted) return
        setAccountList(accounts.accountList)
        setUnreadCount(accounts.unreadCount)
        setItemList((currentList) =>
          before
            ? [
                ...currentList,
                ...messages.itemList.filter(
                  (item) =>
                    !currentList.some((current) => current.id === item.id),
                ),
              ]
            : messages.itemList,
        )
        setNextCursor(messages.nextCursor)
        setError(null)
      } catch (cause) {
        if (!controller.signal.aborted) setError(getErrorMessage(cause))
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    },
    [activeTab, source, query],
  )

  const refreshHandler = useCallback(async () => {
    try {
      await syncHandler(true)
      await reloadHandler()
    } catch (cause) {
      toast.error(getErrorMessage(cause))
      await reloadHandler()
    }
  }, [reloadHandler, syncHandler])

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        void reloadHandler()
      },
      query ? 250 : 0,
    )
    return () => {
      window.clearTimeout(timer)
      requestRef.current?.abort()
    }
  }, [reloadHandler, query, revision])

  useEffect(() => {
    setVisibleAccountHandler(source)
    return () => setVisibleAccountHandler(null)
  }, [source, setVisibleAccountHandler])

  useEffect(() => {
    if (!selectedId) return
    const controller = new AbortController()
    const loadDetail = async () => {
      setIsBodyLoading(true)
      setBodyError(null)
      setIsMissingItem(false)
      try {
        const message = await getMailMessage(selectedId, controller.signal)
        if (controller.signal.aborted) return
        if (itemId && !message.read && !mutationRef.current) {
          try {
            await updateMailMessage(message.id, { read: true })
            message.read = true
            if (!controller.signal.aborted) {
              setItemList((current) =>
                current.map((item) =>
                  item.id === message.id ? { ...item, read: true } : item,
                ),
              )
              const accounts = await getMailAccounts(controller.signal)
              if (!controller.signal.aborted)
                setUnreadCount(accounts.unreadCount)
            }
          } catch (cause) {
            if (!controller.signal.aborted) toast.error(getErrorMessage(cause))
          }
        }
        if (!controller.signal.aborted) setDetail(message)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setBodyError(getErrorMessage(cause))
          setIsMissingItem(true)
        }
      } finally {
        if (!controller.signal.aborted) setIsBodyLoading(false)
      }
    }
    void loadDetail()
    return () => controller.abort()

    // 列表刷新不重复下载当前正文，只在选择或显式重试时读取。
  }, [selectedId, bodyRevision, itemId])

  const queryChangeHandler = (value: string) => {
    setQuery(value)
    navigate(
      `/inbox${source === 'all' ? '' : `?account=${encodeURIComponent(source)}`}`,
      { replace: true },
    )
  }
  const tabChangeHandler = (value: string) => {
    if (value !== 'all' && value !== 'unread' && value !== 'archived') return
    setActiveTab(value)
    navigate(
      `/inbox${source === 'all' ? '' : `?account=${encodeURIComponent(source)}`}`,
      { replace: true },
    )
  }
  const sourceChangeHandler = (value: string) => {
    navigate(
      `/inbox${value === 'all' ? '' : `?account=${encodeURIComponent(value)}`}`,
      { replace: true },
    )
  }
  const resetFiltersHandler = () => {
    setActiveTab('all')
    setQuery('')
    navigate('/inbox', { replace: true })
  }

  /**
   * 保存整理操作，成功后才更新可见状态，失败保留原列表。
   *
   * @param operation - 要等待的服务器操作
   * @param successHandler - 成功反馈或导航
   * @returns 无返回值；设置处理中状态、刷新数据或显示错误
   */
  const mutateHandler = async (
    operation: () => Promise<unknown>,
    successHandler?: () => void,
  ) => {
    if (mutationRef.current) return
    mutationRef.current = true
    setIsMutating(true)
    try {
      await operation()
      successHandler?.()
      await reloadHandler()
    } catch (cause) {
      toast.error(getErrorMessage(cause))
    } finally {
      mutationRef.current = false
      setIsMutating(false)
    }
  }
  const markReadHandler = (id: string) => {
    const item =
      visibleItemList.find((message) => message.id === id) ??
      (detail?.id === id ? detail : undefined)
    if (!item || item.read) return
    void mutateHandler(
      () => updateMailMessage(id, { read: true }),
      () => {
        setItemList((current) =>
          current.map((item) =>
            item.id === id ? { ...item, read: true } : item,
          ),
        )
        setDetail((current) =>
          current && current.id === id ? { ...current, read: true } : current,
        )
      },
    )
  }
  const toggleReadHandler = () => {
    if (!selectedItem) return
    const item = selectedItem
    void mutateHandler(
      () => updateMailMessage(item.id, { read: !item.read }),
      () => {
        setItemList((current) =>
          current.map((message) =>
            message.id === item.id ? { ...message, read: !item.read } : message,
          ),
        )
        setDetail((current) =>
          current && current.id === item.id
            ? { ...current, read: !item.read }
            : current,
        )
        toast(item.read ? 'Marked as unread' : 'Marked as read')
      },
    )
  }
  const toggleArchiveHandler = () => {
    if (!selectedItem) return
    const item = selectedItem
    void mutateHandler(
      () => updateMailMessage(item.id, { archived: !item.archived }),
      () => {
        navigate(
          `/inbox${source === 'all' ? '' : `?account=${encodeURIComponent(source)}`}`,
          { replace: true },
        )
        toast(item.archived ? 'Moved to inbox' : 'Message archived')
      },
    )
  }
  const markAllReadHandler = () => {
    void mutateHandler(markAllMailRead, () =>
      toast('All messages marked as read'),
    )
  }
  const retryBodyHandler = () => setBodyRevision((current) => current + 1)
  const loadMoreHandler = () => {
    if (nextCursor && !isLoading) void reloadHandler(nextCursor)
  }
  const openAccountsHandler = () => setIsAccountsOpen(true)
  const connectMailboxHandler = async (
    provider: 'gmail' | 'qq',
    email: string,
    password: string,
  ) => {
    await connectImapMailbox(provider, email, password)
    await reloadHandler()
    toast.success(`${provider === 'gmail' ? 'Gmail' : 'QQ'} mailbox connected`)
  }
  const disconnectHandler = async (id: string) => {
    await disconnectMailbox(id)
    navigate('/inbox', { replace: true })
    await reloadHandler()
    toast('Mailbox disconnected')
  }

  return {
    activeTab,
    source,
    query,
    visibleItemList,
    selectedItem,
    hasDetailRoute: Boolean(itemId),
    isMissingItem,
    unreadCount,
    accountList,
    isLoading,
    isSyncing,
    isMutating,
    error: error ?? syncError,
    bodyError,
    isBodyLoading,
    nextCursor,
    isAccountsOpen,
    setIsAccountsOpen,
    queryChangeHandler,
    tabChangeHandler,
    sourceChangeHandler,
    markReadHandler,
    toggleReadHandler,
    toggleArchiveHandler,
    markAllReadHandler,
    resetFiltersHandler,
    refreshHandler,
    reloadHandler,
    retryBodyHandler,
    loadMoreHandler,
    openAccountsHandler,
    connectMailboxHandler,
    disconnectHandler,
  }
}

type InboxView = ReturnType<typeof useInboxView>
export { useInboxView }
export type { InboxView }
