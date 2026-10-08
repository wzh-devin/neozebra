import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { CollapsedNavigationGroup } from '@/layouts/workbench/navigation/CollapsedNavigationGroup'
import { NavigationLinks } from '@/layouts/workbench/navigation/NavigationLinks'
import type { NavigationGroup as NavigationGroupConfig } from '@/layouts/workbench/navigation/types'

import styles from '@/layouts/workbench/navigation/NavigationGroup.module.css'

type NavigationGroupProps = {
  group: NavigationGroupConfig
  onNavigate: () => void
}

/**
 * 渲染父菜单组与嵌套子项，整栏收起时改用图标浮层。
 *
 * @param props - 父组配置及导航完成回调
 * @returns 导航分组 JSX
 */
const NavigationGroup = ({ group, onNavigate }: NavigationGroupProps) => {
  const [isOpen, setIsOpen] = useState(true)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const { state, isMobile } = useSidebar()
  const isSidebarCollapsed = state === 'collapsed' && !isMobile
  const isExpanded = isOpen && !isSidebarCollapsed
  const Icon = group.icon

  /**
   * 更新分组展开状态并保留标题入口的键盘焦点。
   *
   * @param open - 是否展开分组
   * @returns 无返回值；更新展开状态并恢复入口焦点
   */
  const groupOpenChangeHandler = (open: boolean): void => {
    setIsOpen(open)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <SidebarGroup className={styles['sidebar-group']}>
      <SidebarMenu>
        <Collapsible
          asChild
          open={isExpanded}
          onOpenChange={groupOpenChangeHandler}
        >
          <SidebarMenuItem>
            {!isSidebarCollapsed ? (
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  ref={triggerRef}
                  type="button"
                  aria-label={group.label}
                  className={`${styles['sidebar-nav-button']} ${styles['group-trigger']}`}
                >
                  <Icon aria-hidden="true" />
                  <span>{group.label}</span>
                  <ChevronDown
                    className={styles['group-chevron']}
                    aria-hidden="true"
                  />
                </SidebarMenuButton>
              </CollapsibleTrigger>
            ) : (
              <CollapsedNavigationGroup
                label={group.label}
                icon={Icon}
                items={group.children}
                triggerRef={triggerRef}
                onNavigate={onNavigate}
              />
            )}
            <CollapsibleContent>
              <NavigationLinks
                items={group.children}
                onNavigate={onNavigate}
                variant="submenu"
                label={`${group.label} submenu`}
              />
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      </SidebarMenu>
    </SidebarGroup>
  )
}

export { NavigationGroup }
