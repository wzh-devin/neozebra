import { atom, useAtom } from 'jotai'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { getDriveEntryList } from '@/features/drive/data/mockDrive'
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

type DriveFileState = {
  rootNode: DriveTreeNode
  entryListMap: Record<string, DriveEntry[]>
}
// synthetic/local mock文件操作按连接ID保留在当前会话，不调用真实存储。
const fileStateMapAtom = atom<Record<string, DriveFileState>>({})

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

/**
 * 从当前 URL 中解析 Drive 选中的目录标识。
 *
 * @param pathname - 当前浏览器路径
 * @returns 当前目录标识
 */
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

  /** 保存当前实例的目录和条目状态。
   * @param nextState - 更新后的文件空间状态
   * @returns 无返回值；仅更新当前连接的内存数据
   */
  const updateFileState = (nextState: DriveFileState): void =>
    setFileStateMap((currentMap) => ({
      ...currentMap,
      [provider.id]: nextState,
    }))
  /** 保存当前目录的条目列表及同步后的目录树。
   * @param nextList - 新文件条目列表
   * @param nextRoot - 更新后的目录树
   * @returns 无返回值；更新当前实例状态
   */
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

  /**
   * 选中目录并同步到嵌套路由。
   *
   * @param nodeId - 目录标识
   * @returns 无返回值；更新 URL
   */
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
    /** 将新目录加入当前父目录。
     * @param node - 父目录
     * @returns 含新子目录的父节点
     */
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
    /** 删除目录树中的同名条目。
     * @param node - 当前父目录
     * @returns 删除后的父节点
     */
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
   * @param nextName - 输入的新名称
   * @returns 无返回值；更新当前目录并触发反馈，忽略无效输入
   */
  const renameEntry = (entryId: string, nextName: string): void => {
    const entry = entryList.find((item) => item.id === entryId)
    if (!entry || !nextName.trim()) {
      return
    }

    /** 同步目录树中的名称。
     * @param node - 目标目录
     * @returns 使用新名称的目录
     */
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
