import { useI18n } from '@/lib/i18n'
import { Toaster } from '@/components/ui/sonner'

import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import styles from '@/components/shared/notifications/NotificationToaster.module.css'

/**
 * 统一工作台中所有 Sonner 通知的表面、排版与操作按钮。
 *
 * @param 无参数
 * @returns 全局通知容器 JSX；通知生命周期和交互由 Sonner 管理
 */
const NotificationToaster = () => {
  const { t } = useI18n()
  return (
    <Toaster
      containerAriaLabel={t('通知')}
      position="bottom-right"
      offset={24}
      mobileOffset={16}
      toastOptions={{
        closeButtonAriaLabel: t('关闭通知'),
        className: `${surfaceStyles.surface} ${styles.notification}`,
      }}
    />
  )
}

export { NotificationToaster }
