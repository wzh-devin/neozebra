import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Inbox,
  ListChecks,
  Plus,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageFrame } from '@/components/shared/page-frame'

import styles from '@/features/dashboard/components/DashboardPageContent.module.css'

const summaryList = [
  { label: 'Open tasks', value: '12', detail: '3 due today', icon: ListChecks },
  { label: 'Unread inbox', value: '7', detail: '2 need a reply', icon: Inbox },
  {
    label: 'At risk',
    value: '2',
    detail: 'Review this week',
    icon: CircleAlert,
  },
]

const activityList = [
  {
    title: 'Design review moved to tomorrow',
    source: 'Task',
    time: '12 min ago',
  },
  {
    title: 'New message from the product team',
    source: 'Inbox',
    time: '38 min ago',
  },
  { title: 'MinIO workspace connected', source: 'Drive', time: 'Yesterday' },
]

/**
 * 渲染个人工作台概览和快捷入口。
 *
 * @param 无参数
 * @returns Dashboard 内容 JSX
 */
const DashboardPageContent = () => (
  <PageFrame
    title="Dashboard"
    description="Your personal workspace overview"
    actions={
      <Button asChild>
        <Link to="/task?new=1">
          <Plus aria-hidden="true" />
          New task
        </Link>
      </Button>
    }
  >
    <div className={styles['summary-grid']}>
      {summaryList.map((summary) => {
        const Icon = summary.icon

        return (
          <Card key={summary.label} className={styles['summary-card']}>
            <CardHeader>
              <CardDescription className={styles['summary-label']}>
                <Icon aria-hidden="true" />
                {summary.label}
              </CardDescription>
              <CardTitle className={styles['summary-value']}>
                {summary.value}
              </CardTitle>
            </CardHeader>
            <CardContent className={styles['summary-detail']}>
              {summary.detail}
            </CardContent>
          </Card>
        )
      })}
    </div>

    <div className={styles['dashboard-grid']}>
      <Card>
        <CardHeader className={styles['section-header']}>
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Updates across your workspace</CardDescription>
          </div>
          <Badge variant="outline">Today</Badge>
        </CardHeader>
        <CardContent className={styles['activity-list']}>
          {activityList.map((activity) => (
            <div key={activity.title} className={styles['activity-row']}>
              <div>
                <p>{activity.title}</p>
                <span>{activity.time}</span>
              </div>
              <Badge variant="secondary">{activity.source}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
          <CardDescription>Jump into the work that needs you</CardDescription>
        </CardHeader>
        <CardContent className={styles['quick-actions']}>
          <Button asChild variant="outline">
            <Link to="/inbox">
              <Inbox aria-hidden="true" />
              Review inbox
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/task">
              <CheckCircle2 aria-hidden="true" />
              View tasks
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  </PageFrame>
)

export { DashboardPageContent }
