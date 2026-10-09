import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import {
  getSelectedInboxItem,
  getVisibleInboxItemList,
} from '@/features/inbox/data/inbox-view'
import { inboxMockList } from '@/features/inbox/data/mockInbox'
import type { InboxItem, InboxSource, InboxTab } from '@/features/inbox/types'

type InboxView = {
  activeTab: InboxTab
  source: InboxSource
  query: string
  visibleItemList: InboxItem[]
  selectedItem: InboxItem | undefined
  hasDetailRoute: boolean
  isMissingItem: boolean
  unreadCount: number
  queryChangeHandler: (query: string) => void
  tabChangeHandler: (tab: string) => void
  sourceChangeHandler: (source: string) => void
  markReadHandler: (id: string) => void
  toggleReadHandler: () => void
  toggleArchiveHandler: () => void
  markAllReadHandler: () => void
  resetFiltersHandler: () => void
}

/**
 * 管理 Inbox 分栏的路由选择、搜索、筛选和本地消息处理。
 *
 * @param 无参数
 * @returns Inbox 的列表、阅读区状态和操作
 */
const useInboxView = (): InboxView => {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<InboxTab>(() =>
    inboxMockList.find((item) => item.id === itemId)?.archived
      ? 'archived'
      : 'all',
  )
  const [source, setSource] = useState<InboxSource>('all')
  const [query, setQuery] = useState('')
  const [itemList, setItemList] = useState(inboxMockList)

  const visibleItemList = useMemo(
    () => getVisibleInboxItemList({ itemList, activeTab, source, query }),
    [activeTab, itemList, query, source],
  )
  const selectedItem = getSelectedInboxItem(itemId, itemList, visibleItemList)
  const unreadCount = itemList.filter(
    (item) => !item.read && !item.archived,
  ).length

  // 更新搜索词并让阅读区跟随筛选结果。
  const queryChangeHandler = (value: string): void => {
    setQuery(value)
    navigate('/inbox', { replace: true })
  }

  /**
   * 切换收件、未读或归档视图。
   *
   * @param value - 目标收件状态
   * @returns 无返回值；更新筛选状态和 URL
   */
  const tabChangeHandler = (value: string): void => {
    if (value !== 'all' && value !== 'unread' && value !== 'archived') return
    setActiveTab(value)
    navigate('/inbox', { replace: true })
  }

  /**
   * 按邮件或工作区信息筛选。
   *
   * @param value - 目标消息来源
   * @returns 无返回值；更新来源筛选和 URL
   */
  const sourceChangeHandler = (value: string): void => {
    if (value !== 'all' && value !== 'email' && value !== 'notification') return
    setSource(value)
    navigate('/inbox', { replace: true })
  }

  /**
   * 标记用户打开的消息为已读。
   *
   * @param id - 消息标识
   * @returns 无返回值；更新本地已读状态
   */
  const markReadHandler = (id: string): void => {
    setItemList((currentList) =>
      currentList.map((item) =>
        item.id === id ? { ...item, read: true } : item,
      ),
    )
  }

  /**
   * 切换当前消息的已读状态。
   *
   * @param 无参数
   * @returns 无返回值；更新本地状态并显示反馈
   */
  const toggleReadHandler = (): void => {
    if (!selectedItem) return
    setItemList((currentList) =>
      currentList.map((item) =>
        item.id === selectedItem.id ? { ...item, read: !item.read } : item,
      ),
    )
    toast(selectedItem.read ? 'Marked as unread' : 'Marked as read')
  }

  /**
   * 归档当前消息或将其移回收件箱。
   *
   * @param 无参数
   * @returns 无返回值；更新本地归档状态、清除当前路由选择并显示反馈
   */
  const toggleArchiveHandler = (): void => {
    if (!selectedItem) return
    setItemList((currentList) =>
      currentList.map((item) =>
        item.id === selectedItem.id
          ? { ...item, archived: !item.archived }
          : item,
      ),
    )
    navigate('/inbox', { replace: true })
    toast(selectedItem.archived ? 'Moved to inbox' : 'Message archived')
  }

  /**
   * 将全部未归档消息标记为已读。
   *
   * @param 无参数
   * @returns 无返回值；更新本地消息状态并显示反馈
   */
  const markAllReadHandler = (): void => {
    setItemList((currentList) =>
      currentList.map((item) =>
        item.archived ? item : { ...item, read: true },
      ),
    )
    toast('All messages marked as read')
  }

  /**
   * 清除搜索、来源和收件状态筛选。
   *
   * @param 无参数
   * @returns 无返回值；恢复收件箱默认视图和 URL
   */
  const resetFiltersHandler = (): void => {
    setActiveTab('all')
    setSource('all')
    setQuery('')
    navigate('/inbox', { replace: true })
  }

  return {
    activeTab,
    source,
    query,
    visibleItemList,
    selectedItem,
    hasDetailRoute: Boolean(itemId),
    isMissingItem: Boolean(itemId && !selectedItem),
    unreadCount,
    queryChangeHandler,
    tabChangeHandler,
    sourceChangeHandler,
    markReadHandler,
    toggleReadHandler,
    toggleArchiveHandler,
    markAllReadHandler,
    resetFiltersHandler,
  }
}

export { useInboxView }
export type { InboxView }
