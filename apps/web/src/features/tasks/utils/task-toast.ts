import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import styles from '@/features/tasks/styles/task-notifications.module.css'

// Sonner 渲染到 Portal，需显式携带 Task 表面主题。
export const taskToastOptions = {
  className: `${surfaceStyles.surface} ${styles.notification}`,
}
