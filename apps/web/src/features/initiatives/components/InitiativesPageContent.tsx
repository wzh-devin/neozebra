import { Command, LayoutGrid, PanelLeft, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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
    <main className="content-panel">
      <header className="content-header">
        <div className="content-title-row">
          <div>
            <p className="content-kicker">Workspace</p>
            <h1>Initiatives</h1>
          </div>
          <div className="header-actions">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Command menu"
                  className="header-icon-button"
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
                  className="header-add-button"
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
          className="initiative-tabs"
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

      <footer className="content-footer">
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
