import type { DriveEntry, DriveTreeNode } from '@/features/drive/types'

/**
 * 查找从实例根目录到当前目录的完整路径。
 *
 * @param node - 实例目录树
 * @param directoryId - 选中目录ID
 * @returns 包含根目录的路径；未知目录返回空列表
 */
const getDriveDirectoryPathList = (
  node: DriveTreeNode,
  directoryId: string,
): DriveTreeNode[] => {
  if (node.id === directoryId) return [node]
  for (const child of node.children ?? []) {
    const path = getDriveDirectoryPathList(child, directoryId)
    if (path.length) return [node, ...path]
  }
  return []
}

/**
 * 更新一个目录节点，保持树的其他分支不变。
 *
 * @param node - 目录树
 * @param nodeId - 目标目录ID
 * @param updateNode - 目标节点更新方法
 * @returns 更新后的目录树
 */
const updateDriveDirectoryNode = (
  node: DriveTreeNode,
  nodeId: string,
  updateNode: (node: DriveTreeNode) => DriveTreeNode,
): DriveTreeNode => {
  if (node.id === nodeId) return updateNode(node)
  return {
    ...node,
    children: node.children?.map((child) =>
      updateDriveDirectoryNode(child, nodeId, updateNode),
    ),
  }
}

/**
 * 限制移动到同一连接内的其他目录，已知子孙路径在投放前拒绝。
 *
 * @param entry - 待移动条目
 * @param parent - 目标目录ID
 * @param root - 当前已加载文件树
 * @param connectionId - 当前连接ID
 * @returns 是否可以提交移动；未知路径交由用户先展开
 */
const canMoveDriveEntry = (
  entry: DriveEntry,
  parent: string,
  root: DriveTreeNode,
  connectionId: string,
): boolean => {
  const path = getDriveDirectoryPathList(root, parent)
  return (
    entry.id !== 'root' &&
    entry.connectionId === connectionId &&
    entry.parentId !== parent &&
    path.at(-1)?.kind === 'folder' &&
    !path.some((node) => node.id === entry.id)
  )
}

export {
  getDriveDirectoryPathList,
  updateDriveDirectoryNode,
  canMoveDriveEntry,
}
