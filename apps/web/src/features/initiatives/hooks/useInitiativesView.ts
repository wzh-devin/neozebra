import { useMemo, useState } from 'react'

import { getInitiativeMockList } from '@/features/initiatives/data/mockInitiatives'
import type { InitiativeRow } from '@/features/initiatives/types'

type InitiativeTab = 'active' | 'planned' | 'all'

type InitiativesView = {
  activeTab: InitiativeTab
  expandedSet: Set<string>
  visibleInitiativeList: InitiativeRow[]
  setActiveTab: (tab: InitiativeTab) => void
  setExpanded: (id: string, open: boolean) => void
}

/**
 * 管理 initiatives 页面筛选、展开状态和本地 synthetic 数据。
 *
 * @param 无参数
 * @returns initiatives 页面所需的视图状态和操作
 */
const useInitiativesView = (): InitiativesView => {
  const initiativeList = useMemo(() => getInitiativeMockList(), [])
  const [activeTab, setActiveTab] = useState<InitiativeTab>('active')
  const [expandedSet, setExpandedSet] = useState<Set<string>>(
    new Set(['core-product', 'autonomous-systems', 'apac-expansion']),
  )

  const visibleInitiativeList = useMemo(() => {
    if (activeTab === 'all') return initiativeList
    return initiativeList.filter(
      (initiative) => initiative.status === activeTab,
    )
  }, [activeTab, initiativeList])

  /**
   * 更新一行 initiative 的展开状态。
   *
   * @param id - initiative 唯一标识
   * @param open - 是否展开子项
   * @returns 无返回值；更新本地展开状态
   */
  const setExpanded = (id: string, open: boolean): void => {
    setExpandedSet((currentSet) => {
      const nextSet = new Set(currentSet)
      if (open) nextSet.add(id)
      else nextSet.delete(id)
      return nextSet
    })
  }

  return {
    activeTab,
    expandedSet,
    visibleInitiativeList,
    setActiveTab,
    setExpanded,
  }
}

export { useInitiativesView }
export type { InitiativeTab, InitiativesView }
