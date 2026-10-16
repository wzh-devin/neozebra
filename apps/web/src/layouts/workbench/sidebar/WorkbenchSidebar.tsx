import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar'
import { WorkbenchNavigation } from '@/layouts/workbench/navigation/WorkbenchNavigation'
import { SidebarResizeRail } from '@/layouts/workbench/sidebar/SidebarResizeRail'
import { LanguageSwitcher } from './LanguageSwitcher'

import styles from '@/layouts/workbench/sidebar/WorkbenchSidebar.module.css'

type WorkbenchSidebarProps = {
  width: number
  onWidthChange: (width: number) => void
}

/**
 * 组合工作台品牌、滚动导航和侧栏宽度轨道。
 *
 * @param props - 当前侧栏宽度及更新回调
 * @returns 工作台侧栏 JSX
 */
const WorkbenchSidebar = ({ width, onWidthChange }: WorkbenchSidebarProps) => (
  <Sidebar
    className={styles['workbench-sidebar']}
    collapsible="icon"
    variant="sidebar"
  >
    <SidebarHeader
      className={styles['sidebar-header']}
      role="img"
      aria-label="Neozebra"
      title="Neozebra"
    >
      <span className={styles['brand-mark']} aria-hidden="true">
        N
      </span>
      <span className={styles['brand-name']} aria-hidden="true">
        Neozebra
      </span>
    </SidebarHeader>
    <ScrollArea className={styles['sidebar-scroll']}>
      <SidebarContent className={styles['sidebar-content']}>
        <WorkbenchNavigation />
      </SidebarContent>
    </ScrollArea>
    <SidebarFooter className={styles['sidebar-footer']}>
      <LanguageSwitcher />
    </SidebarFooter>
    <SidebarResizeRail width={width} onWidthChange={onWidthChange} />
  </Sidebar>
)

export { WorkbenchSidebar }
