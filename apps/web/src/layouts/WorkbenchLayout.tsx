import {
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'

import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
} from '@/components/ui/sidebar'
import { NavigationGroup } from '@/layouts/components/NavigationGroup'
import {
  favoriteNavigationList,
  mainNavigationList,
  workspaceNavigationList,
} from '@/layouts/workbenchNavigation'

import styles from '@/layouts/WorkbenchLayout.module.css'

type WorkbenchLayoutProps = {
  children: ReactNode
}

/**
 * 渲染带侧栏导航的 Neozebra 工作台外壳。
 *
 * @param props - 页面主内容
 * @returns 工作台布局 JSX
 */
const WorkbenchLayout = ({ children }: WorkbenchLayoutProps) => {
  const [selectedNav, setSelectedNav] = useState('initiatives')
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarHoverOpen, setSidebarHoverOpen] = useState(false)
  const sidebarResizeRef = useRef<{
    startWidth: number
    startX: number
  } | null>(null)
  const sidebarRailDraggedRef = useRef(false)

  const sidebarVisible = sidebarOpen || sidebarHoverOpen

  /**
   * 响应侧栏导航选择并提示尚未实现的页面。
   *
   * @param id - 被选中的导航项标识
   * @returns 无返回值；更新选中态并在需要时触发通知
   */
  const handleNavigationSelectHandler = (id: string): void => {
    setSelectedNav(id)
    if (id !== 'initiatives') {
      toast(`${id.replace('-', ' ')} is available in the next workspace pass`, {
        icon: <Sparkles className="size-4" />,
      })
    }
  }

  /**
   * 开始拖拽侧栏轨道，记录拖拽起点并捕获指针事件。
   *
   * @param event - 侧栏轨道指针事件
   * @returns 无返回值；启动侧栏宽度调整
   */
  const sidebarRailPointerDownHandler = (
    event: PointerEvent<HTMLButtonElement>,
  ): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    sidebarRailDraggedRef.current = false
    sidebarResizeRef.current = {
      startWidth: sidebarWidth,
      startX: event.clientX,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  /**
   * 根据指针横向位移更新侧栏宽度。
   *
   * @param event - 侧栏轨道指针事件
   * @returns 无返回值；更新侧栏宽度
   */
  const sidebarRailPointerMoveHandler = (
    event: PointerEvent<HTMLButtonElement>,
  ): void => {
    const resize = sidebarResizeRef.current
    if (!resize) {
      return
    }

    const delta = event.clientX - resize.startX
    if (Math.abs(delta) <= 4) {
      return
    }

    sidebarRailDraggedRef.current = true
    setSidebarWidth(Math.min(420, Math.max(240, resize.startWidth + delta)))
  }

  /**
   * 结束侧栏轨道拖拽并释放指针捕获。
   *
   * @param event - 侧栏轨道指针事件
   * @returns 无返回值；结束侧栏宽度调整
   */
  const sidebarRailPointerUpHandler = (
    event: PointerEvent<HTMLButtonElement>,
  ): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    sidebarResizeRef.current = null
  }

  /**
   * 阻止拖拽结束后的点击事件触发侧栏折叠。
   *
   * @param event - 侧栏轨道点击事件
   * @returns 无返回值；拖拽后阻止折叠
   */
  const sidebarRailClickCaptureHandler = (
    event: MouseEvent<HTMLButtonElement>,
  ): void => {
    if (!sidebarRailDraggedRef.current) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    sidebarRailDraggedRef.current = false
  }

  /**
   * 根据鼠标是否进入左侧保留区域，控制临时抽屉侧栏。
   *
   * @param event - 工作台容器指针事件
   * @returns 无返回值；更新临时侧栏可见状态
   */
  const sidebarHoverPointerMoveHandler = (
    event: PointerEvent<HTMLDivElement>,
  ): void => {
    if (
      sidebarOpen ||
      sidebarResizeRef.current ||
      event.pointerType !== 'mouse'
    ) {
      return
    }

    const isOverRevealZone = event.clientX <= 18
    const isOverDrawer = sidebarHoverOpen && event.clientX <= sidebarWidth
    const nextHoverOpen = isOverRevealZone || isOverDrawer

    if (nextHoverOpen !== sidebarHoverOpen) {
      setSidebarHoverOpen(nextHoverOpen)
    }
  }

  /**
   * 鼠标离开工作台时收起临时抽屉侧栏。
   *
   * @param 无参数
   * @returns 无返回值；关闭临时侧栏
   */
  const sidebarHoverPointerLeaveHandler = (): void => {
    if (!sidebarOpen) {
      setSidebarHoverOpen(false)
    }
  }

  /**
   * 响应侧栏展开状态变化并清理临时悬停状态。
   *
   * @param open - 侧栏是否保持展开
   * @returns 无返回值；更新持久展开状态
   */
  const sidebarOpenChangeHandler = (open: boolean): void => {
    setSidebarOpen(open)
    setSidebarHoverOpen(false)
  }

  return (
    <div className={styles['app-canvas']}>
      <div className={styles['workbench-shell']}>
        <SidebarProvider
          open={sidebarVisible}
          onOpenChange={sidebarOpenChangeHandler}
          className={`${styles['workbench-provider']}${!sidebarOpen ? ` ${styles['sidebar-floating']}` : ''}`}
          onPointerMove={sidebarHoverPointerMoveHandler}
          onPointerLeave={sidebarHoverPointerLeaveHandler}
          style={
            {
              '--sidebar-width': `${sidebarWidth}px`,
              '--sidebar-width-icon': '4.5rem',
            } as CSSProperties
          }
        >
          <Sidebar
            className={styles['workbench-sidebar']}
            collapsible="offcanvas"
            variant="sidebar"
          >
            <SidebarHeader className={styles['sidebar-header']}>
              <span className={styles['brand-name']}>Neozebra</span>
            </SidebarHeader>
            <ScrollArea className={styles['sidebar-scroll']}>
              <SidebarContent className={styles['sidebar-content']}>
                <NavigationGroup
                  label=""
                  items={mainNavigationList}
                  selected={selectedNav}
                  onSelect={handleNavigationSelectHandler}
                />
                <NavigationGroup
                  label="Workspace"
                  items={workspaceNavigationList}
                  selected={selectedNav}
                  onSelect={handleNavigationSelectHandler}
                />
                <NavigationGroup
                  label="Favorites"
                  items={favoriteNavigationList}
                  selected={selectedNav}
                  onSelect={handleNavigationSelectHandler}
                />
              </SidebarContent>
            </ScrollArea>
            <SidebarRail
              onClickCapture={sidebarRailClickCaptureHandler}
              onPointerDown={sidebarRailPointerDownHandler}
              onPointerMove={sidebarRailPointerMoveHandler}
              onPointerUp={sidebarRailPointerUpHandler}
              onPointerCancel={sidebarRailPointerUpHandler}
              title="Drag to resize · Click to collapse"
            />
          </Sidebar>

          <SidebarInset className={styles['workbench-main']}>
            {children}
          </SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  )
}

export { WorkbenchLayout }
