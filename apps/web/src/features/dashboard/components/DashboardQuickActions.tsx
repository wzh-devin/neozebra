import { ArrowRight, CheckCircle2, Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import styles from '@/features/dashboard/components/DashboardQuickActions.module.css'

/**
 * 展示既有 Inbox 和 Task 快捷入口。
 *
 * @param 无参数
 * @returns 快捷入口卡片 JSX
 */
const DashboardQuickActions = () => (
  <Card className={styles.card}>
    <CardHeader className={styles.header}>
      <h2 id="dashboard-actions-title">Quick actions</h2>
      <p>Jump into the work that needs you</p>
    </CardHeader>
    <CardContent>
      <nav aria-labelledby="dashboard-actions-title" className={styles.actions}>
        <Button asChild variant="outline" className={styles.link}>
          <Link to="/inbox">
            <span className={styles.mark}>
              <Inbox aria-hidden="true" className={styles['inbox-icon']} />
            </span>
            <span className={styles.label}>Review inbox</span>
            <ArrowRight aria-hidden="true" className={styles.arrow} />
          </Link>
        </Button>
        <Button asChild variant="outline" className={styles.link}>
          <Link to="/task">
            <span className={styles.mark}>
              <CheckCircle2
                aria-hidden="true"
                className={styles['task-icon']}
              />
            </span>
            <span className={styles.label}>View tasks</span>
            <ArrowRight aria-hidden="true" className={styles.arrow} />
          </Link>
        </Button>
      </nav>
    </CardContent>
  </Card>
)

export { DashboardQuickActions }
