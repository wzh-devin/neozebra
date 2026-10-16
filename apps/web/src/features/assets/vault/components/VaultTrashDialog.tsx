import { useI18n } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Search, Trash2, X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useVaultEntries } from '@/features/assets/vault/hooks/useVaultEntries'
import type { FileAction, VaultEntry } from '@/features/assets/vault/types'
import { VaultActionDialog } from './VaultActionDialog'
import type { Action } from './VaultActionDialog'
import { VaultFileList } from './VaultFileList'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import styles from './VaultTrashDialog.module.css'

/**
 * 独立展示回收站并复用恢复与删除确认，保留背景目录的查询和滚动状态。
 *
 * @param props - 关闭弹窗的回调
 * @returns 具备独立搜索、分页和错误恢复的回收站弹窗 JSX
 */
const VaultTrashDialog = ({ onClose }: { onClose: () => void }) => {
  const { t } = useI18n()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [action, setAction] = useState<Action>()
  const [opener] = useState(() => document.activeElement)
  const entries = useVaultEntries('0', true, filter)
  useEffect(() => {
    const timer = setTimeout(() => setFilter(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  const searchHandler = (event: ChangeEvent<HTMLInputElement>) =>
    setSearch(event.target.value)
  const openHandler = (open: boolean) => {
    if (!open && !action) onClose()
  }
  const closeAutoFocusHandler = (event: Event) => {
    event.preventDefault()
    const target =
      opener instanceof HTMLElement &&
      opener.isConnected &&
      opener !== document.body
        ? opener
        : document.querySelector<HTMLElement>(
            '[data-vault-trash-trigger], [data-vault-tree-trigger]',
          )
    target?.focus({ preventScroll: true })
  }
  const actionHandler = (entry: VaultEntry, type: FileAction) => {
    if (type === 'restore' || type === 'purge') setAction({ entry, type })
  }
  const closeActionHandler = () => setAction(undefined)
  const actionCloseAutoFocusHandler = (event: Event) => {
    event.preventDefault()
    const target =
      (action?.type === 'empty-trash'
        ? document.querySelector<HTMLElement>(
            '[data-vault-empty-trash-trigger]:not(:disabled)',
          )
        : document.querySelector<HTMLElement>(
            `[data-vault-trash-content] [data-vault-action-entry="${CSS.escape(action?.entry?.id ?? '')}"]`,
          )) ?? document.querySelector<HTMLElement>('[data-vault-trash-search]')
    target?.focus({ preventScroll: true })
  }
  const emptyTrashHandler = () => setAction({ type: 'empty-trash' })
  const clearSearchHandler = () => setSearch('')
  const noopHandler = () => {}
  const retryHandler = () => {
    void entries.refetch()
  }
  const loadMoreHandler = () => {
    void entries.fetchNextPage()
  }
  return (
    <Dialog open onOpenChange={openHandler}>
      <DialogContent
        className={`${styles.dialog} ${surfaceStyles.surface}`}
        showCloseButton={false}
        onCloseAutoFocus={closeAutoFocusHandler}
      >
        <div className={styles.header}>
          <DialogHeader className={styles.heading}>
            <DialogTitle className={styles.title}>
              <Trash2 size={17} aria-hidden="true" />
              {t('回收站')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('已删除的文件可恢复，永久删除后无法找回。')}
            </DialogDescription>
          </DialogHeader>
          <div className={styles.actions}>
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className={styles.iconButton}
                      aria-label={t('搜索回收站')}
                      data-vault-trash-search
                      data-active={Boolean(search.trim()) || undefined}
                    >
                      <Search size={16} />
                      {search.trim() ? (
                        <span className={styles.filterDot} aria-hidden="true" />
                      ) : null}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>{t('搜索回收站')}</TooltipContent>
              </Tooltip>
              <PopoverContent
                className={`${styles.searchPopover} ${surfaceStyles.surface}`}
                align="end"
                sideOffset={8}
              >
                <InputGroup className={styles.search}>
                  <InputGroupAddon>
                    <Search size={15} />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label={t('搜索已删除的文件')}
                    placeholder={t('搜索文件或文件夹')}
                    value={search}
                    onChange={searchHandler}
                    maxLength={255}
                  />
                  {search ? (
                    <InputGroupAddon align="inline-end">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('清除回收站搜索')}
                        onClick={clearSearchHandler}
                      >
                        <X size={14} />
                      </Button>
                    </InputGroupAddon>
                  ) : null}
                </InputGroup>
              </PopoverContent>
            </Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={styles.iconButton}
                  aria-label={t('清空回收站')}
                  data-vault-empty-trash-trigger
                  onClick={emptyTrashHandler}
                  disabled={
                    Boolean(action) ||
                    entries.isPending ||
                    entries.isError ||
                    (!filter && !entries.entries.length)
                  }
                >
                  <Trash2 size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('清空回收站')}</TooltipContent>
            </Tooltip>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className={styles.iconButton}
                aria-label={t('关闭回收站')}
                disabled={Boolean(action)}
              >
                <X size={16} />
              </Button>
            </DialogClose>
          </div>
        </div>
        <div
          className={styles.content}
          data-vault-trash-content
          aria-busy={entries.isFetching}
        >
          {entries.isPending ? (
            <div className={styles.state} role="status">
              <Spinner />
              {t('正在加载回收站…')}
            </div>
          ) : entries.isError ? (
            <div className={styles.state} role="alert">
              <p>
                {entries.error instanceof Error
                  ? t(entries.error.message)
                  : t('回收站加载失败')}
              </p>
              <Button variant="outline" size="sm" onClick={retryHandler}>
                {t('重新加载')}
              </Button>
            </div>
          ) : entries.entries.length ? (
            <>
              <VaultFileList
                entries={entries.entries}
                trash
                onOpen={noopHandler}
                onCreate={noopHandler}
                onAction={actionHandler}
                busy={Boolean(action)}
              />
              {entries.hasNextPage ? (
                <div className={styles.loadMore}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMoreHandler}
                    disabled={entries.isFetchingNextPage}
                  >
                    {entries.isFetchingNextPage ? t('加载中…') : t('加载更多')}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <Empty className={styles.empty}>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Trash2 />
                </EmptyMedia>
                <EmptyTitle>
                  {filter ? t('没有找到匹配的文件') : t('回收站为空')}
                </EmptyTitle>
                <EmptyDescription>
                  {filter
                    ? t('换个关键词试试。')
                    : t('删除的文件和文件夹会出现在这里。')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
        {action ? (
          <VaultActionDialog
            key={action.type + action.entry?.id}
            action={action}
            parentId="0"
            onClose={closeActionHandler}
            onCloseAutoFocus={actionCloseAutoFocusHandler}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
export { VaultTrashDialog }
