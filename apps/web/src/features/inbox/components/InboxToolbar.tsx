import { useState, type ChangeEvent, type KeyboardEvent } from 'react'
import {
  Archive,
  CheckCheck,
  Inbox,
  ListFilter,
  MoreHorizontal,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  RefreshCw,
  Settings2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { InboxView } from '@/features/inbox/hooks/useInboxView'

import styles from '@/features/inbox/components/InboxToolbar.module.css'

type InboxToolbarProps = Pick<
  InboxView,
  | 'activeTab'
  | 'source'
  | 'query'
  | 'unreadCount'
  | 'queryChangeHandler'
  | 'tabChangeHandler'
  | 'sourceChangeHandler'
  | 'markAllReadHandler'
  | 'resetFiltersHandler'
  | 'accountList'
  | 'openAccountsHandler'
  | 'refreshHandler'
  | 'isSyncing'
  | 'isMutating'
>

/**
 * 组合 Inbox 的紧凑标题栏和 shadcn 搜索、筛选菜单。
 *
 * @param props - Inbox 筛选状态和操作
 * @returns 标题工具栏与可展开搜索栏 JSX
 */
const InboxToolbar = ({
  activeTab,
  source,
  query,
  unreadCount,
  queryChangeHandler,
  tabChangeHandler,
  sourceChangeHandler,
  markAllReadHandler,
  resetFiltersHandler,
  accountList,
  openAccountsHandler,
  refreshHandler,
  isSyncing,
  isMutating,
}: InboxToolbarProps) => {
  const { isMobile, state } = useSidebar()
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // 展开搜索输入框。
  const openSearchHandler = (): void => {
    setIsSearchOpen(true)
  }

  // 关闭搜索栏并清除关键词。
  const closeSearchHandler = (): void => {
    setIsSearchOpen(false)
    queryChangeHandler('')
  }

  // 将输入内容传给 Inbox 筛选逻辑。
  const searchChangeHandler = (event: ChangeEvent<HTMLInputElement>): void => {
    queryChangeHandler(event.target.value)
  }

  // 按 Escape 关闭搜索栏。
  const searchKeyDownHandler = (
    event: KeyboardEvent<HTMLInputElement>,
  ): void => {
    if (event.key === 'Escape') closeSearchHandler()
  }

  // 在归档与默认收件列表间切换。
  const showArchiveHandler = (): void => {
    tabChangeHandler(activeTab === 'archived' ? 'all' : 'archived')
  }

  const refreshClickHandler = () => {
    void refreshHandler()
  }

  return (
    <>
      <header className={styles['toolbar']}>
        <div className={styles['title-cluster']}>
          {isMobile || state === 'collapsed' ? (
            <SidebarTrigger aria-label="Expand sidebar" />
          ) : null}
          <Inbox aria-hidden="true" className={styles['title-icon']} />
          <h1>Inbox</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="More inbox actions"
                className={styles['icon-button']}
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={styles['menu']}>
              <DropdownMenuItem onSelect={openAccountsHandler}>
                <Settings2 aria-hidden="true" />
                Manage mailboxes
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!unreadCount || isMutating}
                onSelect={markAllReadHandler}
              >
                <CheckCheck aria-hidden="true" />
                Mark all as read
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={resetFiltersHandler}>
                <RotateCcw aria-hidden="true" />
                Reset filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className={styles['toolbar-actions']}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Sync mailboxes"
                aria-busy={isSyncing}
                className={styles['icon-button']}
                onClick={refreshClickHandler}
                size="icon-sm"
                variant="ghost"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={isSyncing ? 'motion-safe:animate-spin' : undefined}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sync mailboxes</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Search inbox"
                aria-expanded={isSearchOpen}
                className={styles['icon-button']}
                onClick={openSearchHandler}
                size="icon-sm"
                variant="ghost"
              >
                <Search aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search inbox</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Show archived messages"
                aria-pressed={activeTab === 'archived'}
                className={styles['icon-button']}
                onClick={showArchiveHandler}
                size="icon-sm"
                variant="ghost"
              >
                <Archive aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Archived messages</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Filter inbox"
                className={styles['icon-button']}
                data-active={activeTab !== 'all'}
                size="icon-sm"
                variant="ghost"
              >
                <ListFilter aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={styles['menu']}>
              <DropdownMenuLabel>Messages</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={activeTab}
                onValueChange={tabChangeHandler}
              >
                <DropdownMenuRadioItem value="all">
                  All messages
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="unread">
                  Unread
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="archived">
                  Archived
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Filter message sources"
                className={styles['icon-button']}
                data-active={source !== 'all'}
                size="icon-sm"
                variant="ghost"
              >
                <SlidersHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={styles['menu']}>
              <DropdownMenuLabel>Sources</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={source}
                onValueChange={sourceChangeHandler}
              >
                <DropdownMenuRadioItem value="all">
                  All messages
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="email">
                  All email
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="system"
                  disabled
                  title="Not available yet"
                >
                  System notifications
                </DropdownMenuRadioItem>
                {accountList.map((account) => (
                  <DropdownMenuRadioItem key={account.id} value={account.id}>
                    {account.email}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                {unreadCount} unread messages
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {isSearchOpen ? (
        <div className={styles['search-bar']}>
          <Search aria-hidden="true" />
          <Input
            aria-label="Search messages"
            autoFocus
            className={styles['search-input']}
            onChange={searchChangeHandler}
            onKeyDown={searchKeyDownHandler}
            placeholder="Search inbox…"
            value={query}
          />
          <Button
            aria-label="Close search"
            onClick={closeSearchHandler}
            size="icon-sm"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </>
  )
}

export { InboxToolbar }
