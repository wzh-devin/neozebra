import { useState, type CSSProperties, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Bell,
  ChevronDown,
  Plus,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-react'

import { BrandMark } from '@/components/shared/BrandMark'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenuButton,
  SidebarProvider,
  SidebarRail,
} from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { NavigationGroup } from '@/layouts/components/NavigationGroup'
import {
  favoriteNavigationList,
  mainNavigationList,
  workspaceNavigationList,
} from '@/layouts/workbenchNavigation'

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
   * 响应工作台外壳中的创建按钮。
   *
   * @param 无参数
   * @returns 无返回值；触发创建提示
   */
  const createInitiativeHandler = (): void => {
    toast('Create initiative is ready for the next step')
  }

  return (
    <div className="app-canvas">
      <div className="workbench-shell">
        <SidebarProvider
          defaultOpen
          className="workbench-provider"
          style={
            {
              '--sidebar-width': '19.5rem',
              '--sidebar-width-icon': '4.5rem',
            } as CSSProperties
          }
        >
          <Sidebar
            className="workbench-sidebar"
            collapsible="icon"
            variant="sidebar"
          >
            <SidebarHeader className="sidebar-header">
              <div className="brand-row">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="brand-button" size="lg">
                      <BrandMark />
                      <span className="brand-name">Neozebra</span>
                      <ChevronDown
                        aria-hidden="true"
                        className="brand-chevron"
                      />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="workspace-menu">
                    <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                    <DropdownMenuItem>
                      <BrandMark /> Neozebra
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Plus aria-hidden="true" /> Add workspace
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="brand-actions">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Search"
                        className="icon-button"
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Search aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Search</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Create"
                        className="create-button"
                        size="icon"
                        variant="outline"
                        onClick={createInitiativeHandler}
                      >
                        <Plus aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Create</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </SidebarHeader>
            <ScrollArea className="sidebar-scroll">
              <SidebarContent className="sidebar-content">
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
            <div className="sidebar-footer">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Settings"
                    className="footer-icon-button"
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Settings2 aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Notifications"
                    className="footer-icon-button"
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Bell aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Notifications</TooltipContent>
              </Tooltip>
              <div className="footer-spacer" />
              <span className="user-avatar" aria-label="Devin profile">
                D
              </span>
            </div>
            <SidebarRail />
          </Sidebar>

          <SidebarInset className="workbench-main">{children}</SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  )
}

export { WorkbenchLayout }
