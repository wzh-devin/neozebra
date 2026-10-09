import {
  getDriveChildrenList,
  getDriveEntryList,
  getDriveRootNode,
} from '@/features/drive/data/mockDrive'
import type {
  DriveEntry,
  DriveProvider,
  DriveTreeNode,
} from '@/features/drive/types'

/**
 * 构建实例的初始目录树；只有旧示例实例使用synthetic/local mock目录。
 * @param connection - 连接实例
 * @returns 根名称与实例一致的独立目录树，新实例为空
 */
const buildDriveRootNode = (connection: DriveProvider): DriveTreeNode => {
  if (connection.id !== connection.providerId)
    return {
      id: 'root',
      name: connection.name,
      kind: 'folder',
      hasChildren: false,
      children: [],
    }
  /** 填充示例目录及文件列表中的子目录。
   * @param node - 当前目录
   * @returns 含独立子目录的节点
   */
  const buildNode = (node: DriveTreeNode): DriveTreeNode => {
    const children =
      node.children ?? getDriveChildrenList(connection.providerId, node.id)
    const childMap = new Map(children.map((child) => [child.id, child]))
    for (const entry of getDriveEntryList(connection.providerId, node.id)) {
      if (entry.kind === 'folder' && !childMap.has(entry.id))
        childMap.set(entry.id, {
          id: entry.id,
          name: entry.name,
          kind: 'folder',
          hasChildren: false,
        })
    }
    const childList = [...childMap.values()].map(buildNode)
    return { ...node, children: childList, hasChildren: childList.length > 0 }
  }
  return buildNode({
    ...getDriveRootNode(connection.providerId),
    name: connection.name,
  })
}

/**
 * 查找从实例根目录到当前目录的完整路径。
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
 * 从同一目录树投影右侧子目录，条目数据仅提供文件和已有元信息。
 * @param directory - 当前目录节点
 * @param entries - 当前目录的文件与条目元信息
 * @returns 与目录树一致的子文件夹和文件列表
 */
const buildDriveDirectoryEntryList = (
  directory: DriveTreeNode | undefined,
  entries: DriveEntry[],
): DriveEntry[] => {
  if (!directory) return []
  const metadataMap = new Map(entries.map((entry) => [entry.id, entry]))
  /** 投影当前子目录并保留已有修改时间。
   * @param child - 当前目录的子节点
   * @returns 同一名称和父目录的文件夹条目
   */
  const buildFolderEntry = (child: DriveTreeNode): DriveEntry => ({
    id: child.id,
    name: child.name,
    kind: 'folder',
    size: '—',
    updatedAt: metadataMap.get(child.id)?.updatedAt ?? '—',
    parentId: directory.id,
  })
  return [
    ...(directory.children ?? []).map(buildFolderEntry),
    ...entries.filter((entry) => entry.kind === 'file'),
  ]
}

/**
 * 更新一个目录节点，保持树的其他分支不变。
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

export {
  buildDriveRootNode,
  buildDriveDirectoryEntryList,
  getDriveDirectoryPathList,
  updateDriveDirectoryNode,
}
