import {
  Download,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { DriveEntry } from '@/features/drive/types'
import { DriveEntryIcon } from '@/features/drive/components/files/DriveEntryIcon'
import { DriveFilesEmptyState } from '@/features/drive/components/files/DriveFilesEmptyState'

import styles from '@/features/drive/components/files/DriveFilesTable.module.css'
import overlayStyles from '@/features/drive/styles/drive-overlays.module.css'

type DriveFileRowProps = {
  entry: DriveEntry
  busy: boolean
  onSelect: (id: string) => void
  onAction: (action: string, entry: DriveEntry) => void
}

/**
 * 渲染一个文件条目及其操作菜单。
 *
 * @param props - 条目数据、目录选择与条目操作
 * @returns 文件表格行 JSX
 */
const DriveFileRow = ({
  entry,
  busy,
  onSelect,
  onAction,
}: DriveFileRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    isDragging,
  } = useDraggable({
    id: `file-list-${entry.id}`,
    data: { entry },
    disabled: busy,
  })
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: `list-folder-${entry.id}`,
    data: { directoryId: entry.id },
    disabled: entry.kind !== 'folder' || busy,
  })

  // 进入目录或打开文件预览。
  const selectEntryHandler = (): void => {
    if (entry.kind === 'folder') onSelect(entry.id)
    else onAction('Preview', entry)
  }

  // 请求下载条目。
  const downloadEntryHandler = (): void => onAction('Download', entry)

  // 请求重命名条目。
  const renameEntryHandler = (): void => onAction('Rename', entry)

  // 请求选择条目的移动目标。
  const moveEntryHandler = (): void => onAction('Move', entry)

  // 请求删除条目。
  const deleteEntryHandler = (): void => onAction('Delete', entry)

  const entryName = (
    <>
      <DriveEntryIcon entry={entry} />
      <span className={styles.copy}>
        <strong>{entry.name}</strong>
        <span>{entry.updatedAt}</span>
      </span>
    </>
  )

  return (
    <TableRow
      ref={setDropNodeRef}
      className={styles.row}
      data-drive-drop-id={entry.kind === 'folder' ? entry.id : undefined}
      data-drop-over={isOver || undefined}
      data-dragging={isDragging || undefined}
    >
      <TableCell className={styles.name}>
        <button
          ref={setDragNodeRef}
          {...attributes}
          {...listeners}
          id={`drive-entry-${entry.id}`}
          className={styles.entry}
          onClick={selectEntryHandler}
          type="button"
          aria-haspopup={entry.kind === 'file' ? 'dialog' : undefined}
        >
          {entryName}
        </button>
      </TableCell>
      <TableCell className={styles.updated}>{entry.updatedAt}</TableCell>
      <TableCell className={styles.size}>{entry.size}</TableCell>
      <TableCell className={styles.actions}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              id={`drive-actions-${entry.id}`}
              aria-label={`Actions for ${entry.name}`}
              size="icon-sm"
              variant="ghost"
              className={styles['action-button']}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={overlayStyles.menu}>
            <DropdownMenuItem
              disabled={entry.kind === 'folder'}
              onSelect={downloadEntryHandler}
            >
              <Download aria-hidden="true" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={renameEntryHandler}>
              <Pencil aria-hidden="true" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy} onSelect={moveEntryHandler}>
              <FolderInput aria-hidden="true" />
              Move
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={deleteEntryHandler}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

type DriveFilesTableProps = {
  entryList: DriveEntry[]
  busy: boolean
  searchQuery: string
  onSelect: (id: string) => void
  onAction: (action: string, entry: DriveEntry) => void
  onUpload: () => void
  onCreateFolder: () => void
}

/**
 * 渲染文件列表与目录或搜索空状态。
 *
 * @param props - 可见条目、搜索条件与文件操作
 * @returns 文件列表 JSX
 */
const DriveFilesTable = ({
  entryList,
  busy,
  searchQuery,
  onSelect,
  onAction,
  onUpload,
  onCreateFolder,
}: DriveFilesTableProps) => {
  /**
   * 渲染单个文件列表条目。
   *
   * @param entry - 文件条目
   * @returns 文件表格行 JSX
   */
  const renderEntryRow = (entry: DriveEntry) => (
    <DriveFileRow
      key={entry.id}
      entry={entry}
      busy={busy}
      onSelect={onSelect}
      onAction={onAction}
    />
  )

  const hasSearchQuery = Boolean(searchQuery.trim())

  if (!entryList.length)
    return (
      <DriveFilesEmptyState
        hasSearchQuery={hasSearchQuery}
        onUpload={onUpload}
        onCreateFolder={onCreateFolder}
      />
    )

  return (
    <div className={styles.table}>
      <Table aria-label="Files">
        <TableHeader>
          <TableRow>
            <TableHead className={styles.name}>Name</TableHead>
            <TableHead className={styles.updated}>Modified</TableHead>
            <TableHead className={styles.size}>Size</TableHead>
            <TableHead className={styles.actions}>
              <span className="sr-only">File actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{entryList.map(renderEntryRow)}</TableBody>
      </Table>
    </div>
  )
}

export { DriveFilesTable }
