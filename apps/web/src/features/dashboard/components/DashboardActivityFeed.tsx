import { History } from 'lucide-react'
import { Card } from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import type { DashboardActivity } from '@/features/dashboard/types'
import styles from '@/features/dashboard/components/DashboardActivityFeed.module.css'

/**
 * 渲染一条动态，按来源区分图标并展示时间。
 *
 * @param activity - 动态内容、来源和时间
 * @returns 动态列表项 JSX
 */
const renderActivityItem = (activity: DashboardActivity) => {
  const Icon = activity.icon
  return (
    <li className={styles.item} key={activity.title}>
      <span className={styles.mark} style={{ color: activity.color }}>
        <Icon aria-hidden="true" />
      </span>
      <div className={styles.copy}>
        <p>{activity.title}</p>
        <span>{activity.source}</span>
      </div>
      <span className={styles.time}>{activity.time}</span>
    </li>
  )
}

/**
 * 展示工作区动态列表和无动态时的空状态。
 *
 * @param props - 现有动态列表
 * @returns 动态区域 JSX
 */
const DashboardActivityFeed = ({
  activityList,
}: {
  activityList: DashboardActivity[]
}) => (
  <Card
    className={styles.activity}
    role="region"
    aria-labelledby="dashboard-activity-title"
  >
    <header className={styles.header}>
      <h2 id="dashboard-activity-title">Recent activity</h2>
      <p>Updates across your workspace</p>
    </header>
    {activityList.length ? (
      <ol className={styles.list}>{activityList.map(renderActivityItem)}</ol>
    ) : (
      <Empty className={styles.empty}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No recent activity</EmptyTitle>
          <EmptyDescription>Nothing to show right now.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )}
  </Card>
)

export { DashboardActivityFeed }
