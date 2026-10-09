import { LayoutDashboard, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { DashboardActivityFeed } from '@/features/dashboard/components/DashboardActivityFeed'
import { DashboardQuickActions } from '@/features/dashboard/components/DashboardQuickActions'
import { DashboardSummary } from '@/features/dashboard/components/DashboardSummary'
import {
  activityList,
  summaryList,
} from '@/features/dashboard/data/mockDashboard'
import styles from '@/features/dashboard/components/DashboardPageContent.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

/**
 * 组合统一工作台标题栏、概览统计、动态和快捷入口。
 * @param 无参数
 * @returns Dashboard 工作区 JSX
 */
const DashboardPageContent = () => {
  const { isMobile, state } = useSidebar()
  return (
    <main className={`${styles.workspace} ${surfaceStyles.surface}`}>
      <header className={styles.toolbar}>
        <div className={styles.brand}>
          {isMobile || state === 'collapsed' ? (
            <SidebarTrigger aria-label="Expand sidebar" />
          ) : null}
          <LayoutDashboard aria-hidden="true" />
          <h1>Dashboard</h1>
        </div>
        <Button asChild size="sm" className={styles.create}>
          <Link to="/task?new=1">
            <Plus aria-hidden="true" />
            New task
          </Link>
        </Button>
      </header>
      <div className={styles.scroll}>
        <div className={styles.content}>
          <DashboardSummary summaryList={summaryList} />
          <div className={styles.sections}>
            <DashboardActivityFeed activityList={activityList} />
            <DashboardQuickActions />
          </div>
        </div>
      </div>
    </main>
  )
}

export { DashboardPageContent }
