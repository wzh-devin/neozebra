import {
  Command as CommandIcon,
  HardDrive,
  Inbox,
  LayoutDashboard,
  ListChecks,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

/**
 * 渲染工作台全局路由快捷菜单。
 *
 * @param 无参数
 * @returns 快捷菜单按钮和命令弹窗 JSX
 */
const CommandMenu = () => {
  const [open, setOpen] = useState(false)

  /**
   * 关闭命令菜单。
   *
   * @param 无参数
   * @returns 无返回值；关闭命令弹窗
   */
  const closeMenuHandler = (): void => {
    setOpen(false)
  }

  return (
    <>
      <Button
        aria-label="Open command menu"
        onClick={() => setOpen(true)}
        size="icon-sm"
        variant="ghost"
      >
        <CommandIcon aria-hidden="true" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search workspace" />
        <CommandList>
          <CommandEmpty>No matching workspace action.</CommandEmpty>
          <CommandGroup heading="Navigate">
            <CommandItem asChild>
              <Link to="/dashboard" onClick={closeMenuHandler}>
                <LayoutDashboard aria-hidden="true" />
                Dashboard
              </Link>
            </CommandItem>
            <CommandItem asChild>
              <Link to="/inbox" onClick={closeMenuHandler}>
                <Inbox aria-hidden="true" />
                Inbox
              </Link>
            </CommandItem>
            <CommandItem asChild>
              <Link to="/task" onClick={closeMenuHandler}>
                <ListChecks aria-hidden="true" />
                Task
              </Link>
            </CommandItem>
            <CommandItem asChild>
              <Link to="/assets/drive" onClick={closeMenuHandler}>
                <HardDrive aria-hidden="true" />
                Drive
              </Link>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}

export { CommandMenu }
