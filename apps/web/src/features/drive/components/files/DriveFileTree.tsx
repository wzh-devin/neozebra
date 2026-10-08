import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DriveTreeNode } from '@/features/drive/types'

import styles from '@/features/drive/components/files/DriveProviderPageContent.module.css'

type DriveFileTreeProps = {
  rootNode: DriveTreeNode
  expandedSet: Set<string>
  selectedDirectoryId: string
  onToggle: (nodeId: string) => void
  onSelect: (nodeId: string) => void
  onAction: (action: string, node: DriveTreeNode) => void
}

type DriveTreeNodeViewProps = Omit<DriveFileTreeProps, 'rootNode'> & {
  node: DriveTreeNode
  depth: number
}

/**
 * 递归渲染单个 Drive 文件树节点。
 *
 * @param props - 节点、层级和文件树交互
 * @returns 文件树节点 JSX
 */
const DriveTreeNodeView = ({
  node,
  depth,
  expandedSet,
  selectedDirectoryId,
  onToggle,
  onSelect,
  onAction,
}: DriveTreeNodeViewProps) => {
  const isExpanded = expandedSet.has(node.id)
  const isSelected = selectedDirectoryId === node.id

  /**
   * 处理目录展开状态变化。
   *
   * @param open - 目录是否展开
   * @returns 无返回值；更新文件树状态
   */
  const openChangeHandler = (open: boolean): void => {
    if (open !== isExpanded) {
      onToggle(node.id)
    }
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={openChangeHandler}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`${styles['tree-row']}${isSelected ? ` ${styles['tree-row-selected']}` : ''}`}
            style={{ paddingLeft: `${8 + depth * 15}px` }}
          >
            {node.hasChildren ? (
              <CollapsibleTrigger asChild>
                <Button
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`}
                  className={styles['tree-toggle']}
                  size="icon-xs"
                  variant="ghost"
                >
                  {isExpanded ? (
                    <ChevronDown aria-hidden="true" />
                  ) : (
                    <ChevronRight aria-hidden="true" />
                  )}
                </Button>
              </CollapsibleTrigger>
            ) : (
              <span className={styles['tree-toggle-spacer']} />
            )}
            <Button
              className={styles['tree-label']}
              onClick={() => onSelect(node.id)}
              variant="ghost"
            >
              {isExpanded ? (
                <FolderOpen aria-hidden="true" />
              ) : (
                <Folder aria-hidden="true" />
              )}
              <span>{node.name}</span>
            </Button>
            <MoreHorizontal
              className={styles['tree-more']}
              aria-hidden="true"
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onAction('New folder', node)}>
            <Plus aria-hidden="true" />
            New folder
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onAction('Rename', node)}>
            <Pencil aria-hidden="true" />
            Rename
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onClick={() => onAction('Delete', node)}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {node.children?.length ? (
        <CollapsibleContent>
          {node.children.map((child) => (
            <DriveTreeNodeView
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedSet={expandedSet}
              selectedDirectoryId={selectedDirectoryId}
              onToggle={onToggle}
              onSelect={onSelect}
              onAction={onAction}
            />
          ))}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
}

/**
 * 使用 shadcn Collapsible 组合渲染 Drive 文件树。
 *
 * @param props - 根节点和文件树交互
 * @returns 文件树 JSX
 */
const DriveFileTree = ({
  rootNode,
  expandedSet,
  selectedDirectoryId,
  onToggle,
  onSelect,
  onAction,
}: DriveFileTreeProps) => (
  <ScrollArea className={styles['tree-scroll']}>
    <div className={styles['tree-list']}>
      <DriveTreeNodeView
        node={rootNode}
        depth={0}
        expandedSet={expandedSet}
        selectedDirectoryId={selectedDirectoryId}
        onToggle={onToggle}
        onSelect={onSelect}
        onAction={onAction}
      />
    </div>
  </ScrollArea>
)

export { DriveFileTree }
