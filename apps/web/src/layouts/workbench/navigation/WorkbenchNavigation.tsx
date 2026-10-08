import {
  SidebarGroup,
  SidebarGroupContent,
  useSidebar,
} from '@/components/ui/sidebar'
import { NavigationGroup } from '@/layouts/workbench/navigation/NavigationGroup'
import { NavigationLinks } from '@/layouts/workbench/navigation/NavigationLinks'
import {
  navigationGroupList,
  primaryNavigationList,
} from '@/layouts/workbench/navigation/workbench-navigation'

import styles from '@/layouts/workbench/navigation/NavigationGroup.module.css'

/**
 * 组合主导航与具名菜单组，统一处理手机导航后的关闭。
 *
 * @param 无参数
 * @returns 主导航 JSX
 */
const WorkbenchNavigation = () => {
  const { isMobile, setOpenMobile } = useSidebar()

  /**
   * 手机选择任一导航后关闭侧栏抽屉。
   *
   * @param 无参数
   * @returns 无返回值；手机上关闭导航抽屉
   */
  const navigateHandler = (): void => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <nav aria-label="Main navigation">
      <SidebarGroup
        className={`${styles['sidebar-group']} ${styles['primary-group']}`}
      >
        <SidebarGroupContent>
          <NavigationLinks
            items={primaryNavigationList}
            onNavigate={navigateHandler}
          />
        </SidebarGroupContent>
      </SidebarGroup>
      {navigationGroupList.map((group) => (
        <NavigationGroup
          key={group.id}
          group={group}
          onNavigate={navigateHandler}
        />
      ))}
    </nav>
  )
}

export { WorkbenchNavigation }
