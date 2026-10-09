import type { InboxItem, InboxSource, InboxTab } from '@/features/inbox/types'

type InboxFilterParams = {
  itemList: InboxItem[]
  activeTab: InboxTab
  source: InboxSource
  query: string
}

/**
 * 根据收件状态、来源和搜索词筛选本地消息。
 *
 * @param params - 消息列表和当前筛选条件
 * @returns 可见消息列表，保持原始顺序
 */
const getVisibleInboxItemList = ({
  itemList,
  activeTab,
  source,
  query,
}: InboxFilterParams): InboxItem[] => {
  const normalizedQuery = query.trim().toLowerCase()

  return itemList.filter((item) => {
    const matchesTab =
      activeTab === 'archived'
        ? item.archived
        : !item.archived && (activeTab === 'all' || !item.read)
    const matchesSource = source === 'all' || item.kind === source
    const matchesQuery = `${item.title} ${item.summary} ${item.sender}`
      .toLowerCase()
      .includes(normalizedQuery)

    return matchesTab && matchesSource && matchesQuery
  })
}

// 根据深链接或列表默认选择查找阅读区消息。
const getSelectedInboxItem = (
  itemId: string | undefined,
  itemList: InboxItem[],
  visibleItemList: InboxItem[],
): InboxItem | undefined =>
  itemId ? itemList.find((item) => item.id === itemId) : visibleItemList[0]

export { getSelectedInboxItem, getVisibleInboxItemList }
