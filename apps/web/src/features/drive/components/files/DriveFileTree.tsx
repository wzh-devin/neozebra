import {
  ChevronDown,
  ChevronRight,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DriveTreeNode } from '@/features/drive/types'
import { DriveFolderIcon } from '@/features/drive/components/files/DriveFolderIcon'

import styles from '@/features/drive/components/files/DriveFileTree.module.css'
import overlayStyles from '@/features/drive/styles/drive-overlays.module.css'

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

  /** 选中当前目录。
   * @param 无参数
   * @returns 无返回值；更新选中的目录路由
   */
  const selectNodeHandler = (): void => onSelect(node.id)
  /** 新建本地目录。
   * @param 无参数
   * @returns 无返回值；触发目录新建操作
   */
  const createNodeHandler = (): void => onAction('New folder', node)
  /** 请求目录重命名反馈。
   * @param 无参数
   * @returns 无返回值；显示本地操作反馈
   */
  const renameNodeHandler = (): void => onAction('Rename', node)
  /** 请求目录删除反馈。
   * @param 无参数
   * @returns 无返回值；显示本地操作反馈
   */
  const deleteNodeHandler = (): void => onAction('Delete', node)
  /** 渲染一个子目录节点。
   * @param child - 子目录节点
   * @returns 子目录节点 JSX
   */
  const renderChildNode = (child: DriveTreeNode) => (
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
  )

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
              onClick={selectNodeHandler}
              aria-current={isSelected ? 'location' : undefined}
              variant="ghost"
            >
              <DriveFolderIcon
                name={node.name}
                isOpen={isExpanded || isSelected}
              />
              <span>{node.name}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`Folder actions for ${node.name}`}
                  className={styles['tree-more']}
                  size="icon-xs"
                  variant="ghost"
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className={overlayStyles.menu}>
                <DropdownMenuItem onSelect={createNodeHandler}>
                  <Plus aria-hidden="true" />
                  New folder
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={renameNodeHandler}>
                  <Pencil aria-hidden="true" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={deleteNodeHandler}
                >
                  <Trash2 aria-hidden="true" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className={overlayStyles.menu}>
          <ContextMenuItem onSelect={createNodeHandler}>
            <Plus aria-hidden="true" />
            New folder
          </ContextMenuItem>
          <ContextMenuItem onSelect={renameNodeHandler}>
            <Pencil aria-hidden="true" />
            Rename
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={deleteNodeHandler}>
            <Trash2 aria-hidden="true" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {node.children?.length ? (
        <CollapsibleContent>
          {node.children.map(renderChildNode)}
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
