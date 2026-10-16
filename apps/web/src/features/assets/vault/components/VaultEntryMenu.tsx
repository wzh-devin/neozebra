import { useI18n } from '@/lib/i18n'
import type { ReactElement } from 'react'
import {
  Download,
  FolderInput,
  FolderPlus,
  Pencil,
  Trash2,
  Undo2,
  Eye,
} from 'lucide-react'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { getVaultContentUrl } from '@/services/assets/vault'
import type { VaultEntry, FileAction } from '@/features/assets/vault/types'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

type EntryMenuProps = {
  children: ReactElement
  entry?: VaultEntry
  trash?: boolean
  busy?: boolean
  variant?: 'context' | 'dropdown'
  onOpen: () => void
  onCreate?: () => void
  onAction: (entry: VaultEntry, action: FileAction) => void
}

/**
 * 为文件树与列表复用同一套右键和操作菜单，根目录仅允许打开与新建。
 *
 * @param props - 菜单触发元素、条目、视图与操作回调
 * @returns 由项目现有 ContextMenu 或 DropdownMenu 组成的 JSX
 */
const VaultEntryMenu = ({
  children,
  entry,
  trash = false,
  busy = false,
  variant = 'context',
  onOpen,
  onCreate,
  onAction,
}: EntryMenuProps) => {
  const { t } = useI18n()

  const Item = variant === 'context' ? ContextMenuItem : DropdownMenuItem
  const Separator =
    variant === 'context' ? ContextMenuSeparator : DropdownMenuSeparator
  const renameHandler = () => {
    if (entry) onAction(entry, 'rename')
  }
  const moveHandler = () => {
    if (entry) onAction(entry, 'move')
  }
  const trashHandler = () => {
    if (entry) onAction(entry, 'trash')
  }
  const restoreHandler = () => {
    if (entry) onAction(entry, 'restore')
  }
  const purgeHandler = () => {
    if (entry) onAction(entry, 'purge')
  }
  const content = trash ? (
    <>
      <Item disabled={busy} onSelect={restoreHandler}>
        <Undo2 />
        {t('恢复')}
      </Item>
      <Item disabled={busy} variant="destructive" onSelect={purgeHandler}>
        <Trash2 />
        {t('永久删除')}
      </Item>
    </>
  ) : (
    <>
      <Item disabled={busy} onSelect={onOpen}>
        <Eye />
        {t('打开')}
      </Item>
      {onCreate ? (
        <Item disabled={busy} onSelect={onCreate}>
          <FolderPlus />
          {t('新建文件夹')}
        </Item>
      ) : null}
      {entry?.kind === 'file' ? (
        <Item asChild disabled={busy}>
          <a href={getVaultContentUrl(entry.id)} download>
            <Download />
            {t('下载')}
          </a>
        </Item>
      ) : null}
      {entry ? (
        <>
          <Item disabled={busy} onSelect={renameHandler}>
            <Pencil />
            {t('重命名')}
          </Item>
          <Item disabled={busy} onSelect={moveHandler}>
            <FolderInput />
            {t('移动到')}
          </Item>
          <Separator />
          <Item disabled={busy} variant="destructive" onSelect={trashHandler}>
            <Trash2 />
            {t('移入回收站')}
          </Item>
        </>
      ) : null}
    </>
  )
  return variant === 'context' ? (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={busy}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className={surfaceStyles.surface}>
        {content}
      </ContextMenuContent>
    </ContextMenu>
  ) : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={busy}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={surfaceStyles.surface}>
        {content}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
export { VaultEntryMenu }
