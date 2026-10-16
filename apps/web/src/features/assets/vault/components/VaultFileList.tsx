import { useI18n, getLocale } from '@/lib/i18n'
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  VaultEntry,
  VaultEntryLocation,
  FileAction,
  VaultViewMode,
} from '@/features/assets/vault/types'
import {
  formatVaultEntryMeta,
  formatVaultEntryType,
  formatVaultSize,
} from '@/features/assets/vault/vault-format'
import { VaultEntryIcon } from './VaultEntryIcon'
import { VaultEntryMenu } from './VaultEntryMenu'
import { VaultFileThumbnail } from './VaultFileThumbnail'
import styles from './VaultFileList.module.css'

type FileListProps = {
  entries: VaultEntry[]
  trash: boolean
  onOpen: (entry: VaultEntry) => void
  onAction: (entry: VaultEntry, action: FileAction) => void
  onCreate: (entry: VaultEntry | null) => void
  busy: boolean
  viewMode?: VaultViewMode
  locatedEntry?: VaultEntryLocation
}

/**
 * 在表格行与缩略图间复用同一条目的菜单、打开和拖放契约。
 *
 * @param props - 条目、视图、操作状态与已有文件操作回调
 * @returns 具有独立打开按钮和操作菜单的文件条目 JSX
 */
const VaultFileItem = ({
  entry,
  trash,
  onOpen,
  onAction,
  onCreate,
  busy,
  viewMode = 'list',
  locatedEntry,
}: Omit<FileListProps, 'entries'> & { entry: VaultEntry }) => {
  const { t } = useI18n()

  const entryRef = useRef<HTMLButtonElement>(null)
  const isLocated =
    locatedEntry?.id === entry.id && locatedEntry.parentId === entry.parentId

  // 仅滚动右侧条目，不抢走树的焦点，保留双击与键盘操作。
  useEffect(() => {
    if (isLocated)
      entryRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [isLocated, locatedEntry, viewMode])

  const {
    setNodeRef: setDragRef,
    listeners,
    isDragging,
  } = useDraggable({
    id: 'list-' + entry.id,
    data: { entry },
    disabled: trash || busy,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: 'list-drop-' + entry.id,
    data: { parentId: entry.id, name: entry.name },
    disabled: trash || busy || entry.kind !== 'folder',
  })
  const refHandler = (element: HTMLElement | null) => {
    setDragRef(element)
    setDropRef(element)
  }
  const openHandler = () => onOpen(entry)
  const createHandler = () => onCreate(entry)
  const date = entry.deletedAt ?? entry.updatedAt
  const dateLabel = new Date(date).toLocaleString(getLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const isThumbnail = viewMode === 'thumbnail'
  const rowProps = {
    ref: refHandler,
    ...listeners,
    'data-vault-drop-id':
      !trash && entry.kind === 'folder' ? entry.id : undefined,
    'data-dragging': isDragging || undefined,
    'data-trash': trash || undefined,
    'data-located': isLocated || undefined,
    className: `${styles.row} ${isOver ? styles.dropTarget : ''}`,
  }
  const entryButton = (
    <button
      ref={entryRef}
      type="button"
      className={styles.entry}
      data-vault-entry={entry.id}
      aria-current={isLocated ? 'true' : undefined}
      onClick={openHandler}
      disabled={trash || busy}
      title={entry.name}
    >
      {isThumbnail ? (
        <VaultFileThumbnail entry={entry} />
      ) : (
        <VaultEntryIcon entry={entry} className={styles.icon} />
      )}
      <span className={styles.copy}>
        <span className={styles.name}>{entry.name}</span>
        {isThumbnail ? (
          <span className={styles.meta}>{formatVaultEntryMeta(entry)}</span>
        ) : null}
      </span>
    </button>
  )
  const actionMenu = (
    <VaultEntryMenu
      entry={entry}
      trash={trash}
      busy={busy}
      variant="dropdown"
      onOpen={openHandler}
      onCreate={!trash && entry.kind === 'folder' ? createHandler : undefined}
      onAction={onAction}
    >
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={styles.more}
        disabled={busy}
        aria-label={t('操作') + ' ' + entry.name}
        data-vault-action-entry={entry.id}
      >
        <MoreHorizontal size={16} />
      </Button>
    </VaultEntryMenu>
  )
  return (
    <VaultEntryMenu
      entry={entry}
      trash={trash}
      busy={busy}
      onOpen={openHandler}
      onCreate={!trash && entry.kind === 'folder' ? createHandler : undefined}
      onAction={onAction}
    >
      {isThumbnail ? (
        <li {...rowProps}>
          {entryButton}
          {actionMenu}
        </li>
      ) : (
        <TableRow {...rowProps}>
          <TableCell>{entryButton}</TableCell>
          <TableCell
            className={styles.meta}
            title={formatVaultEntryType(entry)}
          >
            {formatVaultEntryType(entry)}
          </TableCell>
          <TableCell className={styles.size}>
            {entry.kind === 'folder'
              ? '—'
              : formatVaultSize(Number(entry.size))}
          </TableCell>
          <TableCell className={styles.date}>
            <time
              dateTime={date}
              title={`${trash ? t('删除于') : t('修改于')} ${dateLabel}`}
            >
              {dateLabel}
            </time>
          </TableCell>
          <TableCell>{actionMenu}</TableCell>
        </TableRow>
      )}
    </VaultEntryMenu>
  )
}

/**
 * 使用同一份目录条目渲染文件表格或缩略图网格，回收站默认表格。
 *
 * @param props - 当前目录的条目及文件操作回调
 * @returns 可右键与拖放的文件表格或缩略图 JSX
 */
const VaultFileList = (props: FileListProps) => {
  const { t } = useI18n()

  const renderEntry = (entry: VaultEntry) => (
    <VaultFileItem key={entry.id} {...props} entry={entry} />
  )
  const label = props.trash ? t('回收站内容') : t('当前文件夹内容')
  return props.viewMode === 'thumbnail' ? (
    <ul className={styles.list} aria-label={label}>
      {props.entries.map(renderEntry)}
    </ul>
  ) : (
    <Table className={styles.table} aria-label={label}>
      <colgroup>
        <col />
        <col className={styles.typeColumn} />
        <col className={styles.sizeColumn} />
        <col className={styles.dateColumn} />
        <col className={styles.actionColumn} />
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t('名称')}</TableHead>
          <TableHead scope="col">{t('类型')}</TableHead>
          <TableHead scope="col">{t('大小')}</TableHead>
          <TableHead scope="col">
            {props.trash ? t('删除时间') : t('修改时间')}
          </TableHead>
          <TableHead scope="col">
            <span className="sr-only">{t('操作')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{props.entries.map(renderEntry)}</TableBody>
    </Table>
  )
}
export { VaultFileList }
