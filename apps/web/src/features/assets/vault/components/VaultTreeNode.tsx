import { useI18n } from '@/lib/i18n'
import { useEffect } from 'react'
import type {
  CSSProperties,
  Dispatch,
  KeyboardEvent,
  SetStateAction,
} from 'react'
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useVaultEntries } from '@/features/assets/vault/hooks/useVaultEntries'
import type { VaultEntry, FileAction } from '@/features/assets/vault/types'
import { VaultEntryIcon } from './VaultEntryIcon'
import { VaultEntryMenu } from './VaultEntryMenu'
import styles from './VaultTree.module.css'

type TreeProps = {
  selectedId: string
  path: VaultEntry[]
  onSelect: (entry: VaultEntry | null) => void
  onTrash: () => void
  onPreview: (entry: VaultEntry) => void
  foldersOnly?: boolean
  busy?: boolean
  onAction?: (entry: VaultEntry, action: FileAction) => void
  onCreate?: (entry: VaultEntry | null) => void
}
type NodeProps = TreeProps & {
  entry?: VaultEntry
  level: number
  expandedSet: Set<string>
  onToggle: (id: string, expanded: boolean) => void
  focusId: string
  onFocus: Dispatch<SetStateAction<string>>
}

/**
 * 复用原 Drive 文件树的 Collapsible、Button 与菜单结构，并懒加载新存储目录。
 *
 * @param props - 当前条目、展开/焦点状态和文件库操作回调
 * @returns 原文件树节点结构及有界目录加载状态 JSX
 */
const VaultTreeNode = (props: NodeProps) => {
  const { t } = useI18n()

  const {
    entry,
    level,
    expandedSet,
    onToggle,
    focusId,
    onFocus,
    foldersOnly,
    busy,
  } = props
  const id = entry?.id ?? '0'
  const node = entry ?? {
    id: '0',
    name: t('我的文件'),
    kind: 'folder' as const,
  }
  const isFolder = node.kind === 'folder'
  const isExpanded = isFolder && expandedSet.has(id)
  const isSelected = props.selectedId === id && (foldersOnly || Boolean(entry))
  useEffect(() => {
    const cleanupHandler = () =>
      onFocus((current) => (current === id ? '0' : current))
    return cleanupHandler
  }, [id, onFocus])
  const query = useVaultEntries(id, false, '', isExpanded)
  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    isDragging,
  } = useDraggable({
    id: (foldersOnly ? 'picker-tree-' : 'tree-') + id,
    data: { entry },
    disabled: foldersOnly || busy || !entry,
  })
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: (foldersOnly ? 'picker-drop-' : 'tree-drop-') + id,
    data: { parentId: id, name: node.name },
    disabled: !isFolder || foldersOnly || busy,
  })
  const openChangeHandler = (open: boolean) => onToggle(id, open)
  const selectHandler = () => props.onSelect(entry ?? null)
  const openHandler = () =>
    isFolder ? props.onSelect(entry ?? null) : props.onPreview(entry!)
  const keyDownHandler = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    openHandler()
  }
  const createHandler = () => props.onCreate?.(entry ?? null)
  const focusHandler = () => onFocus(id)
  const reloadHandler = () => {
    void query.refetch()
  }
  const moreHandler = () => {
    void query.fetchNextPage()
  }
  const pathEntry = props.path.find((item) => item.parentId === id)
  const loadedEntryList =
    !query.isError &&
    pathEntry &&
    !query.entries.some((item) => item.id === pathEntry.id)
      ? [pathEntry, ...query.entries]
      : query.entries
  const entryList = foldersOnly
    ? loadedEntryList.filter((item) => item.kind === 'folder')
    : loadedEntryList
  const renderChildNode = (child: VaultEntry) => (
    <VaultTreeNode key={child.id} {...props} entry={child} level={level + 1} />
  )
  const row = (
    <div
      ref={setDropNodeRef}
      data-vault-drop-id={isFolder && !foldersOnly ? id : undefined}
      data-drop-over={isOver || undefined}
      data-dragging={isDragging || undefined}
      data-tree-root={!entry || undefined}
      className={`${styles['tree-row']}${isSelected ? ` ${styles['tree-row-selected']}` : ''}`}
      style={{ marginLeft: (level - 1) * 16 }}
    >
      {isFolder ? (
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            aria-label={`${isExpanded ? t('收起') : t('展开')} ${node.name}`}
            className={styles['tree-toggle']}
            size="icon-xs"
            variant="ghost"
            tabIndex={-1}
          >
            {isExpanded ? (
              <ChevronDown aria-hidden="true" />
            ) : (
              <ChevronRight aria-hidden="true" />
            )}
          </Button>
        </CollapsibleTrigger>
      ) : null}
      <div className={styles['tree-item']}>
        <Button
          type="button"
          ref={setDragNodeRef}
          {...(entry && !foldersOnly ? attributes : {})}
          {...listeners}
          role="treeitem"
          data-tree-node={id}
          data-parent={entry?.parentId}
          data-kind={node.kind}
          aria-level={level}
          aria-expanded={isFolder ? isExpanded : undefined}
          aria-selected={isSelected}
          tabIndex={focusId === id ? 0 : -1}
          onFocus={focusHandler}
          className={styles['tree-label']}
          onClick={selectHandler}
          onDoubleClick={isFolder ? undefined : openHandler}
          onKeyDown={isFolder ? undefined : keyDownHandler}
          title={node.name}
          variant="ghost"
          disabled={busy}
        >
          <VaultEntryIcon entry={node} expanded={isExpanded} />
          <span>{node.name}</span>
        </Button>
        {!foldersOnly && props.onAction ? (
          <VaultEntryMenu
            entry={entry}
            variant="dropdown"
            busy={busy}
            onOpen={openHandler}
            onCreate={isFolder ? createHandler : undefined}
            onAction={props.onAction}
          >
            <Button
              type="button"
              aria-label={t('操作') + ' ' + node.name}
              className={styles['tree-more']}
              size="icon-xs"
              variant="ghost"
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </VaultEntryMenu>
        ) : null}
      </div>
    </div>
  )
  return (
    <Collapsible open={isExpanded} onOpenChange={openChangeHandler}>
      {!foldersOnly && props.onAction ? (
        <VaultEntryMenu
          entry={entry}
          busy={busy}
          onOpen={openHandler}
          onCreate={isFolder ? createHandler : undefined}
          onAction={props.onAction}
        >
          {row}
        </VaultEntryMenu>
      ) : (
        row
      )}
      {isFolder ? (
        <CollapsibleContent
          className={styles['tree-children']}
          style={
            { '--branch-indent': `${18 + (level - 1) * 16}px` } as CSSProperties
          }
        >
          <div role="group">
            {query.isPending ? (
              <div className={styles.state} role="status">
                <Spinner />
                {t('加载中')}
              </div>
            ) : null}
            {query.isError ? (
              <div className={styles.state}>
                <span role="alert">{t('目录加载失败')}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={reloadHandler}
                >
                  <RefreshCw size={13} />
                  {t('重试')}
                </Button>
              </div>
            ) : null}
            {entryList.map(renderChildNode)}
            {query.hasNextPage ? (
              <Button
                type="button"
                className={styles.more}
                variant="ghost"
                size="sm"
                disabled={query.isFetchingNextPage}
                onClick={moreHandler}
              >
                {query.isFetchingNextPage ? t('加载中…') : t('加载更多')}
              </Button>
            ) : null}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
}
export { VaultTreeNode }
export type { TreeProps }
