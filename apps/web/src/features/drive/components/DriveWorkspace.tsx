import { HardDrive } from 'lucide-react'
import type { ReactNode } from 'react'

import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'

import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

import styles from '@/features/drive/components/DriveWorkspace.module.css'

type DriveWorkspaceProps = {
  actions?: ReactNode
  children: ReactNode
}

/**
 * 组合与 Inbox、Task 一致的 Drive 工具栏和工作区。
 *
 * @param props - 页面操作与工作区内容
 * @returns Drive 页面骨架 JSX
 */
const DriveWorkspace = ({ actions, children }: DriveWorkspaceProps) => {
  const { isMobile, state } = useSidebar()

  return (
    <main className={`${styles.workspace} ${surfaceStyles.surface}`}>
      <header className={styles.toolbar}>
        <div className={styles.brand}>
          {isMobile || state === 'collapsed' ? (
            <SidebarTrigger aria-label="Expand sidebar" />
          ) : null}
          <HardDrive aria-hidden="true" />
          <h1>Drive</h1>
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <div className={styles.content}>{children}</div>
    </main>
  )
}

export { DriveWorkspace }
