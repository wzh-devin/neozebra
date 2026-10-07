import { Command, LayoutGrid, PanelLeft, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { InitiativeTable } from '@/features/initiatives/components/InitiativeTable'
import type {
  InitiativeTab,
  InitiativesView,
} from '@/features/initiatives/hooks/useInitiativesView'

import styles from '@/features/initiatives/components/InitiativesPageContent.module.css'

type InitiativesPageContentProps = Pick<
  InitiativesView,
  | 'activeTab'
  | 'expandedSet'
  | 'visibleInitiativeList'
  | 'setActiveTab'
  | 'setExpanded'
>

/**
 * 组合 initiatives 页面标题、筛选标签、表格和页脚。
 *
 * @param props - initiatives 页面视图状态和交互回调
 * @returns initiatives 页面内容 JSX
 */
const InitiativesPageContent = ({
  activeTab,
  expandedSet,
  visibleInitiativeList,
  setActiveTab,
  setExpanded,
}: InitiativesPageContentProps) => {
  const { state, isMobile } = useSidebar()

  /**
   * 显示创建 initiative 的本地反馈。
   *
   * @param 无参数
   * @returns 无返回值；触发 Sonner 通知
   */
  const createInitiativeHandler = (): void => {
    toast('Create initiative is ready for the next step')
  }

  /**
   * 更新当前 initiative 标签。
   *
   * @param value - 新的筛选标签
   * @returns 无返回值；更新页面筛选状态
   */
  const changeInitiativeTabHandler = (value: string): void => {
    setActiveTab(value as InitiativeTab)
  }

  return (
    <main className={styles['content-panel']}>
      <header className={styles['content-header']}>
        <div className={styles['content-title-row']}>
          <div className={styles['content-title-cluster']}>
            {isMobile || state === 'collapsed' ? (
              <SidebarTrigger
                aria-label="Expand sidebar"
                className={styles['sidebar-expand-trigger']}
              />
            ) : null}
            <div>
              <p className={styles['content-kicker']}>Workspace</p>
              <h1>Initiatives</h1>
            </div>
          </div>
          <div className={styles['header-actions']}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Command menu"
                  className={styles['header-icon-button']}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Command aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Command menu</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Add initiative"
                  className={styles['header-add-button']}
                  size="icon-sm"
                  variant="ghost"
                  onClick={createInitiativeHandler}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add initiative</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={changeInitiativeTabHandler}
          className={styles['initiative-tabs']}
        >
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="planned">Planned</TabsTrigger>
            <TabsTrigger value="all">All initiatives</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <InitiativeTable
        initiativeList={visibleInitiativeList}
        expandedSet={expandedSet}
        onExpandedChange={setExpanded}
      />

      <footer className={styles['content-footer']}>
        <span>
          <LayoutGrid aria-hidden="true" /> Showing synthetic workspace data
        </span>
        <span>
          <PanelLeft aria-hidden="true" /> Press <kbd>⌘</kbd>
          <kbd>B</kbd> to collapse sidebar
        </span>
      </footer>
    </main>
  )
}

export { InitiativesPageContent }
