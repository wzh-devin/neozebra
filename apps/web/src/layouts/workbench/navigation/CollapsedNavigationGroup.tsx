import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import type { LucideIcon } from 'lucide-react'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { NavigationLinks } from '@/layouts/workbench/navigation/NavigationLinks'
import type { NavigationItem } from '@/layouts/workbench/navigation/types'

import styles from '@/layouts/workbench/navigation/NavigationGroup.module.css'

type CollapsedNavigationGroupProps = {
  label: string
  icon: LucideIcon
  items: NavigationItem[]
  triggerRef: RefObject<HTMLButtonElement | null>
  onNavigate: () => void
}

/**
 * 在整栏收起时渲染菜单组图标，提供悬停、聚焦和点击子菜单。
 *
 * @param props - 分组信息、入口引用和导航完成回调
 * @returns 图标入口和子菜单浮层 JSX
 */
const CollapsedNavigationGroup = ({
  label,
  icon: Icon,
  items,
  triggerRef,
  onNavigate,
}: CollapsedNavigationGroupProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const closeTimerRef = useRef<number | undefined>(undefined)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const skipFocusOpenRef = useRef(false)

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), [])

  /**
   * 更新浮层显示状态并取消待执行的关闭。
   *
   * @param open - 是否显示子菜单
   * @returns 无返回值；取消计时器并更新浮层状态
   */
  const flyoutOpenChangeHandler = (open: boolean): void => {
    window.clearTimeout(closeTimerRef.current)
    setIsOpen(open)
  }

  /**
   * 保持浮层打开，允许指针从组图标移入子菜单。
   *
   * @param 无参数
   * @returns 无返回值；取消关闭并打开浮层
   */
  const keepFlyoutOpenHandler = (): void => {
    flyoutOpenChangeHandler(true)
  }

  /**
   * 在鼠标悬停图标时显示子菜单，忽略触屏指针。
   *
   * @param event - 图标入口指针事件
   * @returns 无返回值；鼠标悬停时打开浮层
   */
  const triggerPointerEnterHandler = (
    event: PointerEvent<HTMLButtonElement>,
  ): void => {
    if (event.pointerType === 'mouse') {
      keepFlyoutOpenHandler()
    }
  }

  /**
   * 延迟关闭浮层，保留指针跨过入口与浮层间隙的时间。
   *
   * @param 无参数
   * @returns 无返回值；安排关闭，键盘仍在子菜单内时保持打开
   */
  const delayFlyoutCloseHandler = (): void => {
    if (
      document.activeElement?.matches(':focus-visible') &&
      (triggerRef.current?.contains(document.activeElement) ||
        contentRef.current?.contains(document.activeElement))
    ) {
      return
    }

    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => setIsOpen(false), 200)
  }

  /**
   * 键盘聚焦入口时显示子菜单，避免 Escape 恢复焦点后重新打开。
   *
   * @param event - 入口聚焦事件
   * @returns 无返回值；必要时打开浮层
   */
  const triggerFocusHandler = (event: FocusEvent<HTMLButtonElement>): void => {
    if (skipFocusOpenRef.current) {
      skipFocusOpenRef.current = false
      return
    }

    if (event.currentTarget.matches(':focus-visible')) {
      keepFlyoutOpenHandler()
    }
  }

  /**
   * 当焦点离开入口和子菜单时关闭浮层。
   *
   * @param event - 入口或浮层失焦事件
   * @returns 无返回值；焦点移出分组时关闭浮层
   */
  const flyoutBlurHandler = (event: FocusEvent<HTMLElement>): void => {
    const target = event.relatedTarget
    if (
      !(target instanceof Node) ||
      (!triggerRef.current?.contains(target) &&
        !contentRef.current?.contains(target))
    ) {
      flyoutOpenChangeHandler(false)
    }
  }

  /**
   * 点击整栏收起的组图标时保持子菜单打开。
   *
   * @param event - 组图标点击事件
   * @returns 无返回值；打开浮层
   */
  const openFlyoutHandler = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    keepFlyoutOpenHandler()
  }

  /**
   * 使用方向键从组图标进入子菜单。
   *
   * @param event - 组图标键盘事件
   * @returns 无返回值；打开浮层并聚焦首个导航链接
   */
  const triggerKeyDownHandler = (
    event: KeyboardEvent<HTMLButtonElement>,
  ): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      keepFlyoutOpenHandler()
      window.requestAnimationFrame(() =>
        contentRef.current?.querySelector<HTMLAnchorElement>('a')?.focus(),
      )
    }
  }

  /**
   * Escape 关闭子菜单时将内部键盘焦点恢复到组图标。
   *
   * @param 无参数
   * @returns 无返回值；必要时恢复入口焦点并抑制重新打开
   */
  const flyoutEscapeHandler = (): void => {
    if (contentRef.current?.contains(document.activeElement)) {
      skipFocusOpenRef.current = true
      triggerRef.current?.focus()
    }
  }

  /**
   * 保留当前焦点，避免悬停打开或关闭浮层时自动移动焦点。
   *
   * @param event - Popover 自动聚焦事件
   * @returns 无返回值；阻止默认自动聚焦
   */
  const preventFlyoutAutoFocusHandler = (event: Event): void => {
    event.preventDefault()
  }

  /**
   * 选择子菜单后关闭浮层并通知父级导航完成。
   *
   * @param 无参数
   * @returns 无返回值；关闭浮层并触发导航回调
   */
  const navigateHandler = (): void => {
    flyoutOpenChangeHandler(false)
    onNavigate()
  }

  return (
    <Popover open={isOpen} onOpenChange={flyoutOpenChangeHandler}>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          ref={triggerRef}
          type="button"
          aria-label={label}
          className={`${styles['sidebar-nav-button']} ${styles['group-icon-button']}`}
          onClick={openFlyoutHandler}
          onPointerEnter={triggerPointerEnterHandler}
          onPointerLeave={delayFlyoutCloseHandler}
          onFocus={triggerFocusHandler}
          onBlur={flyoutBlurHandler}
          onKeyDown={triggerKeyDownHandler}
        >
          <Icon aria-hidden="true" />
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        side="right"
        align="start"
        sideOffset={8}
        aria-label={`${label} submenu`}
        className={styles['group-flyout']}
        onPointerEnter={keepFlyoutOpenHandler}
        onPointerLeave={delayFlyoutCloseHandler}
        onBlur={flyoutBlurHandler}
        onEscapeKeyDown={flyoutEscapeHandler}
        onOpenAutoFocus={preventFlyoutAutoFocusHandler}
        onCloseAutoFocus={preventFlyoutAutoFocusHandler}
      >
        <p className={styles['flyout-title']}>{label}</p>
        <NavigationLinks
          items={items}
          onNavigate={navigateHandler}
          variant="flyout"
        />
      </PopoverContent>
    </Popover>
  )
}

export { CollapsedNavigationGroup }
