import { useI18n } from '@/lib/i18n'
import type { ReactNode } from 'react'

import { CommandMenu } from '@/components/shared/command-menu'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'

import styles from '@/components/shared/page-frame/PageFrame.module.css'

type PageFrameProps = {
  kicker?: string
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/**
 * 渲染统一的工作台页面骨架。
 *
 * @param props - 页面标题、操作区、内容和页脚
 * @returns 带标题栏和内容区的页面 JSX
 */
const PageFrame = ({
  kicker = 'Workspace',
  title,
  description,
  actions,
  children,
  footer,
}: PageFrameProps) => {
  const { t } = useI18n()

  const { isMobile, state } = useSidebar()

  return (
    <main className={styles['page-frame']}>
      <header className={styles['page-header']}>
        <div className={styles['page-title-cluster']}>
          {isMobile || state === 'collapsed' ? (
            <SidebarTrigger
              aria-label={t('Expand sidebar')}
              className={styles['sidebar-trigger']}
            />
          ) : null}
          <div>
            <p className={styles['page-kicker']}>{t(kicker)}</p>
            <h1>{title}</h1>
            {description ? (
              <p className={styles['page-description']}>{description}</p>
            ) : null}
          </div>
        </div>
        <div className={styles['page-actions']}>
          <CommandMenu />
          {actions}
        </div>
      </header>
      <section className={styles['page-content']}>{children}</section>
      {footer ? (
        <footer className={styles['page-footer']}>{footer}</footer>
      ) : null}
    </main>
  )
}

export { PageFrame }
