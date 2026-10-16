import { useI18n } from '@/lib/i18n'
import { NavLink } from 'react-router-dom'

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import type { NavigationItem } from '@/layouts/workbench/navigation/types'

import styles from '@/layouts/workbench/navigation/NavigationGroup.module.css'

type NavigationLinksProps = {
  items: NavigationItem[]
  onNavigate: () => void
  variant?: 'primary' | 'submenu' | 'flyout'
  label?: string
}

/**
 * 渲染主导航、嵌套子菜单或浮层中的同一组路由链接。
 *
 * @param props - 导航项、导航完成回调、展示位置和可选列表名称
 * @returns 导航链接列表或空状态 JSX
 */
const NavigationLinks = ({
  items,
  onNavigate,
  variant = 'primary',
  label,
}: NavigationLinksProps) => {
  const { t } = useI18n()

  const isSubmenu = variant === 'submenu'
  const Menu = isSubmenu ? SidebarMenuSub : SidebarMenu
  const MenuItem = isSubmenu ? SidebarMenuSubItem : SidebarMenuItem

  /**
   * 渲染单个路由链接，子菜单采用专用的嵌套菜单按钮。
   *
   * @param item - 导航项
   * @returns 导航列表项 JSX
   */
  const renderNavigationItem = (item: NavigationItem) => {
    const Icon = item.icon
    const link = (
      <NavLink to={item.path} aria-label={t(item.label)} onClick={onNavigate}>
        <Icon aria-hidden="true" />
        <span className={styles['sidebar-nav-label']}>{t(item.label)}</span>
      </NavLink>
    )

    return (
      <MenuItem key={item.id}>
        {isSubmenu ? (
          <SidebarMenuSubButton
            asChild
            className={styles['sidebar-nav-button']}
          >
            {link}
          </SidebarMenuSubButton>
        ) : (
          <SidebarMenuButton
            asChild
            tooltip={variant === 'primary' ? t(item.label) : undefined}
            className={styles['sidebar-nav-button']}
          >
            {link}
          </SidebarMenuButton>
        )}
      </MenuItem>
    )
  }

  return items.length === 0 ? (
    <p className={styles['empty-menu']} role="status">
      {t('No menu items')}
    </p>
  ) : (
    <Menu
      aria-label={label}
      className={isSubmenu ? styles['sidebar-submenu'] : undefined}
    >
      {items.map(renderNavigationItem)}
    </Menu>
  )
}

export { NavigationLinks }
