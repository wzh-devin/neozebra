import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { NavigationItem } from '@/layouts/workbenchNavigation'

import styles from '@/layouts/components/NavigationGroup.module.css'

const favoriteToneClassMap: Record<string, string> = {
  yellow: 'nav-icon-yellow',
  blue: 'nav-icon-blue',
  purple: 'nav-icon-purple',
  orange: 'nav-icon-orange',
}

type NavigationGroupProps = {
  label: string
  items: NavigationItem[]
  selected: string
  onSelect: (id: string) => void
}

/**
 * 渲染工作台侧栏中的一组导航项。
 *
 * @param props - 分组标题、导航项和选中回调
 * @returns 导航分组 JSX
 */
const NavigationGroup = ({
  label,
  items,
  selected,
  onSelect,
}: NavigationGroupProps) => (
  <SidebarGroup className={styles['sidebar-group']}>
    <SidebarGroupLabel>{label}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        {items.map((item) => {
          const Icon = item.icon
          const isSelected = selected === item.id

          return (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                isActive={isSelected}
                onClick={() => onSelect(item.id)}
                tooltip={item.label}
                className={styles['sidebar-nav-button']}
              >
                <Icon
                  className={
                    item.tone
                      ? styles[favoriteToneClassMap[item.tone]]
                      : undefined
                  }
                />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)

export { NavigationGroup }
