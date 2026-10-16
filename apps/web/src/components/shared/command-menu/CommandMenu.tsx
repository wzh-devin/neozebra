import { useI18n } from '@/lib/i18n'
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
  const { t } = useI18n()

  const [open, setOpen] = useState(false)

  // 关闭命令菜单。
  const closeMenuHandler = (): void => {
    setOpen(false)
  }

  return (
    <>
      <Button
        aria-label={t('Open command menu')}
        onClick={() => setOpen(true)}
        size="icon-sm"
        variant="ghost"
      >
        <CommandIcon aria-hidden="true" />
      </Button>
      <CommandDialog
        title={t('命令菜单')}
        description={t('搜索要运行的命令…')}
        open={open}
        onOpenChange={setOpen}
      >
        <CommandInput placeholder={t('Search workspace')} />
        <CommandList>
          <CommandEmpty>{t('No matching workspace action.')}</CommandEmpty>
          <CommandGroup heading={t('Navigate')}>
            <CommandItem asChild>
              <Link to="/dashboard" onClick={closeMenuHandler}>
                <LayoutDashboard aria-hidden="true" />
                {t('Dashboard')}
              </Link>
            </CommandItem>
            <CommandItem asChild>
              <Link to="/inbox" onClick={closeMenuHandler}>
                <Inbox aria-hidden="true" />
                {t('Inbox')}
              </Link>
            </CommandItem>
            <CommandItem asChild>
              <Link to="/task" onClick={closeMenuHandler}>
                <ListChecks aria-hidden="true" />
                {t('Tasks')}
              </Link>
            </CommandItem>
            <CommandItem asChild>
              <Link to="/assets/vault" onClick={closeMenuHandler}>
                <HardDrive aria-hidden="true" />
                {t('Vault')}
              </Link>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}

export { CommandMenu }
