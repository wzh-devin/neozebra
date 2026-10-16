import { useI18n } from '@/lib/i18n'
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
  const { t } = useI18n()

  const { state, isMobile } = useSidebar()

  // 显示创建 initiative 的本地反馈。
  const createInitiativeHandler = (): void => {
    toast(t('Create initiative is ready for the next step'))
  }

  // 更新当前 initiative 标签。
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
                aria-label={t('Expand sidebar')}
                className={styles['sidebar-expand-trigger']}
              />
            ) : null}
            <div>
              <p className={styles['content-kicker']}>{t('Workspace')}</p>
              <h1>{t('Initiatives')}</h1>
            </div>
          </div>
          <div className={styles['header-actions']}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t('Command menu')}
                  className={styles['header-icon-button']}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Command aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('Command menu')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t('Add initiative')}
                  className={styles['header-add-button']}
                  size="icon-sm"
                  variant="ghost"
                  onClick={createInitiativeHandler}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('Add initiative')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={changeInitiativeTabHandler}
          className={styles['initiative-tabs']}
        >
          <TabsList>
            <TabsTrigger value="active">{t('Active')}</TabsTrigger>
            <TabsTrigger value="planned">{t('Planned')}</TabsTrigger>
            <TabsTrigger value="all">{t('All initiatives')}</TabsTrigger>
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
          <LayoutGrid aria-hidden="true" />
          {t('Showing synthetic workspace data')}
        </span>
        <span>
          <PanelLeft aria-hidden="true" /> {t('Press')} <kbd>⌘</kbd>
          <kbd>B</kbd>
          {t('to collapse sidebar')}
        </span>
      </footer>
    </main>
  )
}

export { InitiativesPageContent }
