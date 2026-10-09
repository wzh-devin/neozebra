import { useAtom } from 'jotai'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { getDriveEntryList } from '@/features/drive/data/mockDrive'
import {
  fileStateMapAtom,
  type DriveFileState,
} from '@/features/drive/data/drive-file-state'
import { formatDriveFileSize } from '@/features/drive/data/drive-file-preview'
import {
  buildDriveRootNode,
  buildDriveDirectoryEntryList,
  getDriveDirectoryPathList,
  updateDriveDirectoryNode,
} from '@/features/drive/data/drive-directories'
import type {
  DriveEntry,
  DriveProvider,
  DriveTreeNode,
} from '@/features/drive/types'

type DriveView = {
  provider: DriveProvider
  rootNode: DriveTreeNode
  directoryPathList: DriveTreeNode[]
  selectedDirectoryId: string
  expandedSet: Set<string>
  visibleEntryList: DriveEntry[]
  searchQuery: string
  setSearchQuery: (query: string) => void
  toggleDirectory: (nodeId: string) => void
  selectDirectory: (nodeId: string) => void
  createFolder: () => void
  uploadFile: (file: File) => void
  deleteEntry: (entryId: string) => void
  renameEntry: (entryId: string, nextName: string) => void
  showEntryFeedback: (action: string, entryName: string) => void
}

// 从当前 URL 解析选中的目录，默认使用根目录。
const getSelectedDirectoryId = (pathname: string): string =>
  pathname.split('/').filter(Boolean)[3] || 'root'

/**
 * 管理 Drive Provider、文件树、目录内容和本地文件操作。
 *
 * @param provider - 当前连接实例
 * @returns Drive 页面所需的状态和操作
 */
const useDriveView = (provider: DriveProvider): DriveView => {
  const location = useLocation()
  const navigate = useNavigate()
  const [fileStateMap, setFileStateMap] = useAtom(fileStateMapAtom)
  const initialRoot = useMemo(() => buildDriveRootNode(provider), [provider])
  const fileState = Object.hasOwn(fileStateMap, provider.id)
    ? fileStateMap[provider.id]
    : { rootNode: initialRoot, entryListMap: {} }
  const rootNode = { ...fileState.rootNode, name: provider.name }
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set(['root']))
  const [searchQuery, setSearchQuery] = useState('')
  const selectedDirectoryId = getSelectedDirectoryId(location.pathname)
  const entryKey = selectedDirectoryId
  const sourceEntryList =
    fileState.entryListMap[entryKey] ??
    (provider.id === provider.providerId
      ? getDriveEntryList(provider.providerId, selectedDirectoryId)
      : [])
  const directoryPathList = getDriveDirectoryPathList(
    rootNode,
    selectedDirectoryId,
  )

  const entryList = buildDriveDirectoryEntryList(
    directoryPathList.at(-1),
    sourceEntryList,
  )

  // 保存当前连接的目录和条目状态，仅更新内存。
  const updateFileState = (nextState: DriveFileState): void =>
    setFileStateMap((currentMap) => ({
      ...currentMap,
      [provider.id]: nextState,
    }))

  // 同步当前目录的条目列表和目录树。
  const updateEntryList = (nextList: DriveEntry[], nextRoot = rootNode): void =>
    updateFileState({
      rootNode: nextRoot,
      entryListMap: { ...fileState.entryListMap, [entryKey]: nextList },
    })

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const visibleEntryList = normalizedQuery
    ? entryList.filter((entry) =>
        entry.name.toLowerCase().includes(normalizedQuery),
      )
    : entryList

  /**
   * 展开或收起一个目录节点，保留已有子目录。
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
  }

  // 切换目录并同步路由。
  const selectDirectory = (nodeId: string): void => {
    navigate(
      `/assets/drive/${provider.id}${nodeId === 'root' ? '' : `/${nodeId}`}`,
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
      id: `folder-${crypto.randomUUID()}`,
      name: 'New folder',
      kind: 'folder',
      size: '—',
      updatedAt: 'Just now',
      parentId: selectedDirectoryId,
    }

    // 将新建文件夹加入当前父目录。
    const addDirectory = (node: DriveTreeNode): DriveTreeNode => ({
      ...node,
      hasChildren: true,
      children: [
        ...(node.children ?? []),
        {
          id: newEntry.id,
          name: newEntry.name,
          kind: 'folder',
          hasChildren: false,
          children: [],
        },
      ],
    })
    updateEntryList(
      [...entryList, newEntry],
      updateDriveDirectoryNode(rootNode, selectedDirectoryId, addDirectory),
    )
    setExpandedSet(
      (currentSet) => new Set([...currentSet, selectedDirectoryId]),
    )
    toast('Folder created')
  }

  /**
   * 将选中的本地文件加入当前 mock 目录。
   *
   * @param file - 当前会话保留的本地文件
   * @returns 无返回值；更新当前目录并触发反馈
   */
  const uploadFile = (file: File): void => {
    const newEntry: DriveEntry = {
      id: `file-${crypto.randomUUID()}`,
      name: file.name,
      kind: 'file',
      size: formatDriveFileSize(file.size),
      updatedAt: 'Just now',
      parentId: selectedDirectoryId,
      localFile: file,
    }
    updateEntryList([...entryList, newEntry])
    toast(`${file.name} uploaded`)
  }

  /**
   * 删除当前目录中的一个 mock 条目。
   *
   * @param entryId - 条目标识
   * @returns 无返回值；更新当前目录并触发反馈
   */
  const deleteEntry = (entryId: string): void => {
    const removeDirectory = (node: DriveTreeNode): DriveTreeNode => {
      const children = (node.children ?? []).filter(
        (child) => child.id !== entryId,
      )
      return { ...node, children, hasChildren: children.length > 0 }
    }
    const nextRoot = updateDriveDirectoryNode(
      rootNode,
      selectedDirectoryId,
      removeDirectory,
    )
    const nextEntryListMap = Object.fromEntries(
      Object.entries({
        ...fileState.entryListMap,
        [entryKey]: entryList.filter((entry) => entry.id !== entryId),
      }).filter(
        ([directoryId]) =>
          getDriveDirectoryPathList(nextRoot, directoryId).length > 0,
      ),
    )
    updateFileState({ rootNode: nextRoot, entryListMap: nextEntryListMap })
    toast('Item deleted')
  }

  /**
   * 保存表单输入的 mock 条目名称。
   *
   * @param entryId - 条目标识
   *
   * @param nextName - 输入的新名称
   * @returns 无返回值；更新当前目录并触发反馈，忽略无效输入
   */
  const renameEntry = (entryId: string, nextName: string): void => {
    const entry = entryList.find((item) => item.id === entryId)
    if (!entry || !nextName.trim()) {
      return
    }

    // 将新名称同步到目录树。
    const renameDirectory = (node: DriveTreeNode): DriveTreeNode => ({
      ...node,
      name: nextName.trim(),
    })
    updateEntryList(
      entryList.map((item) =>
        item.id === entryId ? { ...item, name: nextName.trim() } : item,
      ),
      updateDriveDirectoryNode(rootNode, entryId, renameDirectory),
    )
    toast('Item renamed')
  }

  // 显示当前文件操作提示。
  const showEntryFeedback = (action: string, entryName: string): void => {
    toast(`${action}: ${entryName}`)
  }

  return {
    provider,
    rootNode,
    directoryPathList,
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
