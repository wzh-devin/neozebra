import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import {
  driveProviderList,
  getDriveChildrenList,
  getDriveEntryList,
  getDriveRootNode,
} from '@/features/drive/data/mockDrive'
import type {
  DriveEntry,
  DriveProvider,
  DriveProviderId,
  DriveTreeNode,
} from '@/features/drive/types'

type DriveView = {
  provider: DriveProvider
  rootNode: DriveTreeNode
  selectedDirectoryId: string
  expandedSet: Set<string>
  visibleEntryList: DriveEntry[]
  searchQuery: string
  setSearchQuery: (query: string) => void
  toggleDirectory: (nodeId: string) => void
  selectDirectory: (nodeId: string) => void
  createFolder: () => void
  uploadFile: (fileName: string) => void
  deleteEntry: (entryId: string) => void
  renameEntry: (entryId: string) => void
  showEntryFeedback: (action: string, entryName: string) => void
}

/**
 * 从当前 URL 中解析 Drive 选中的目录标识。
 *
 * @param pathname - 当前浏览器路径
 * @param providerId - Provider 标识
 * @returns 当前目录标识
 */
const getSelectedDirectoryId = (
  pathname: string,
  providerId: DriveProviderId,
): string => {
  const pathParts = pathname.split('/').filter(Boolean)
  const providerIndex = pathParts.indexOf(providerId)
  const directoryId =
    providerIndex >= 0 ? pathParts[providerIndex + 1] : undefined

  return directoryId || 'root'
}

/**
 * 在文件树中递归替换一个目录节点。
 *
 * @param node - 当前树节点
 * @param nodeId - 目标节点标识
 * @param children - 目标节点的新子目录
 * @returns 更新后的树节点
 */
const updateDriveTreeNode = (
  node: DriveTreeNode,
  nodeId: string,
  children: DriveTreeNode[],
): DriveTreeNode => {
  if (node.id === nodeId) {
    return { ...node, children }
  }

  if (!node.children?.length) {
    return node
  }

  return {
    ...node,
    children: node.children.map((child) =>
      updateDriveTreeNode(child, nodeId, children),
    ),
  }
}

/**
 * 管理 Drive Provider、文件树、目录内容和本地文件操作。
 *
 * @param providerId - 当前 Provider 标识
 * @returns Drive 页面所需的状态和操作
 */
const useDriveView = (providerId: DriveProviderId): DriveView => {
  const location = useLocation()
  const navigate = useNavigate()
  const provider =
    driveProviderList.find((item) => item.id === providerId) ??
    driveProviderList[0]
  const [rootNode, setRootNode] = useState(() => getDriveRootNode(providerId))
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set(['root']))
  const [searchQuery, setSearchQuery] = useState('')
  const [entryListMap, setEntryListMap] = useState<
    Record<string, DriveEntry[]>
  >({})
  const selectedDirectoryId = getSelectedDirectoryId(
    location.pathname,
    providerId,
  )
  const entryKey = `${providerId}:${selectedDirectoryId}`
  const entryList =
    entryListMap[entryKey] ?? getDriveEntryList(providerId, selectedDirectoryId)

  const visibleEntryList = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return normalizedQuery
      ? entryList.filter((entry) =>
          entry.name.toLowerCase().includes(normalizedQuery),
        )
      : entryList
  }, [entryList, searchQuery])

  /**
   * 展开或收起一个目录节点，并在首次展开时注入子目录。
   *
   * @param nodeId - 目录标识
   * @returns 无返回值；更新树展开状态
   */
  const toggleDirectory = (nodeId: string): void => {
    const isExpanded = expandedSet.has(nodeId)
    setExpandedSet((currentSet) => {
      const nextSet = new Set(currentSet)
      if (isExpanded) {
        nextSet.delete(nodeId)
      } else {
        nextSet.add(nodeId)
      }
      return nextSet
    })

    if (!isExpanded) {
      setRootNode((currentRoot) =>
        updateDriveTreeNode(
          currentRoot,
          nodeId,
          getDriveChildrenList(providerId, nodeId),
        ),
      )
    }
  }

  /**
   * 选中目录并同步到嵌套路由。
   *
   * @param nodeId - 目录标识
   * @returns 无返回值；更新 URL
   */
  const selectDirectory = (nodeId: string): void => {
    navigate(
      `/assets/drive/${providerId}${nodeId === 'root' ? '' : `/${nodeId}`}`,
    )
  }

  /**
   * 创建一个本地 mock 文件夹。
   *
   * @param 无参数
   * @returns 无返回值；更新当前目录并触发反馈
   */
  const createFolder = (): void => {
    const newEntry: DriveEntry = {
      id: `folder-${Date.now()}`,
      name: 'New folder',
      kind: 'folder',
      size: '—',
      updatedAt: 'Just now',
      parentId: selectedDirectoryId,
    }
    setEntryListMap((currentMap) => ({
      ...currentMap,
      [entryKey]: [...entryList, newEntry],
    }))
    toast('Folder created')
  }

  /**
   * 将选中的本地文件加入当前 mock 目录。
   *
   * @param fileName - 文件名
   * @returns 无返回值；更新当前目录并触发反馈
   */
  const uploadFile = (fileName: string): void => {
    const newEntry: DriveEntry = {
      id: `file-${Date.now()}`,
      name: fileName,
      kind: 'file',
      size: 'Local file',
      updatedAt: 'Just now',
      parentId: selectedDirectoryId,
    }
    setEntryListMap((currentMap) => ({
      ...currentMap,
      [entryKey]: [...entryList, newEntry],
    }))
    toast(`${fileName} uploaded`)
  }

  /**
   * 删除当前目录中的一个 mock 条目。
   *
   * @param entryId - 条目标识
   * @returns 无返回值；更新当前目录并触发反馈
   */
  const deleteEntry = (entryId: string): void => {
    setEntryListMap((currentMap) => ({
      ...currentMap,
      [entryKey]: entryList.filter((entry) => entry.id !== entryId),
    }))
    toast('Item deleted')
  }

  /**
   * 使用原生输入修改 mock 条目名称。
   *
   * @param entryId - 条目标识
   * @returns 无返回值；更新当前目录或取消操作
   */
  const renameEntry = (entryId: string): void => {
    const entry = entryList.find((item) => item.id === entryId)
    const nextName = entry ? window.prompt('Rename item', entry.name) : null
    if (!entry || !nextName?.trim()) {
      return
    }

    setEntryListMap((currentMap) => ({
      ...currentMap,
      [entryKey]: entryList.map((item) =>
        item.id === entryId ? { ...item, name: nextName.trim() } : item,
      ),
    }))
    toast('Item renamed')
  }

  /**
   * 显示尚未持久化的文件操作反馈。
   *
   * @param action - 操作名称
   * @param entryName - 文件名
   * @returns 无返回值；触发 Sonner 通知
   */
  const showEntryFeedback = (action: string, entryName: string): void => {
    toast(`${action}: ${entryName}`)
  }

  return {
    provider,
    rootNode,
    selectedDirectoryId,
    expandedSet,
    visibleEntryList,
    searchQuery,
    setSearchQuery,
    toggleDirectory,
    selectDirectory,
    createFolder,
    uploadFile,
    deleteEntry,
    renameEntry,
    showEntryFeedback,
  }
}

export { useDriveView }
export type { DriveView }
