import { useRef, type MouseEvent, type PointerEvent } from 'react'

import { SidebarRail, useSidebar } from '@/components/ui/sidebar'

type SidebarResizeRailProps = {
  width: number
  onWidthChange: (width: number) => void
}

/**
 * 使用现有侧栏轨道调整宽度，区分拖拽和折叠点击。
 *
 * @param props - 当前侧栏宽度及更新回调
 * @returns 可拖拽和点击的侧栏轨道 JSX
 */
const SidebarResizeRail = ({
  width,
  onWidthChange,
}: SidebarResizeRailProps) => {
  const { open } = useSidebar()
  const sidebarResizeRef = useRef<{
    startWidth: number
    startX: number
  } | null>(null)
  const sidebarRailDraggedRef = useRef(false)

  /**
   * 开始拖拽侧栏轨道，记录拖拽起点并捕获指针事件。
   *
   * @param event - 侧栏轨道指针事件
   * @returns 无返回值；启动侧栏宽度调整
   */
  const sidebarRailPointerDownHandler = (
    event: PointerEvent<HTMLButtonElement>,
  ): void => {
    if (!open || (event.pointerType === 'mouse' && event.button !== 0)) {
      return
    }

    sidebarRailDraggedRef.current = false
    sidebarResizeRef.current = {
      startWidth: width,
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
    onWidthChange(Math.min(420, Math.max(240, resize.startWidth + delta)))
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

  return (
    <SidebarRail
      onClickCapture={sidebarRailClickCaptureHandler}
      onPointerDown={sidebarRailPointerDownHandler}
      onPointerMove={sidebarRailPointerMoveHandler}
      onPointerUp={sidebarRailPointerUpHandler}
      onPointerCancel={sidebarRailPointerUpHandler}
      title={open ? 'Drag to resize · Click to collapse' : 'Click to expand'}
    />
  )
}

export { SidebarResizeRail }
