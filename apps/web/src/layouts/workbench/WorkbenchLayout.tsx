import { useState, type CSSProperties } from 'react'
import { Outlet } from 'react-router-dom'

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { WorkbenchSidebar } from '@/layouts/workbench/sidebar/WorkbenchSidebar'

import styles from '@/layouts/workbench/WorkbenchLayout.module.css'

type SidebarWidthStyle = CSSProperties & { '--sidebar-width': string }

/**
 * 组合侧栏与路由内容，维护两者共享的侧栏宽度。
 *
 * @param 无参数
 * @returns 工作台布局 JSX
 */
const WorkbenchLayout = () => {
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const sidebarStyle: SidebarWidthStyle = {
    '--sidebar-width': `${sidebarWidth}px`,
  }

  return (
    <div className={styles['app-canvas']}>
      <div className={styles['workbench-shell']}>
        <SidebarProvider
          className={styles['workbench-provider']}
          style={sidebarStyle}
        >
          <WorkbenchSidebar
            width={sidebarWidth}
            onWidthChange={setSidebarWidth}
          />
          <SidebarInset className={styles['workbench-main']}>
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  )
}

export { WorkbenchLayout }
