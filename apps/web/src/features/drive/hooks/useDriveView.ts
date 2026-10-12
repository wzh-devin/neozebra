import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  getDriveEntryPage,
  requestDriveSync,
  createDriveFolder,
  updateDriveEntry,
  deleteDriveEntry,
  getDriveContentUrl,
} from '@/services/drive'
import { useDriveSync } from '@/features/drive/hooks/useDriveSync'
import type { DrivePage, DriveSyncStatus } from '@/services/drive'
import { updateDriveDirectoryNode } from '@/features/drive/data/drive-directories'
import type {
  DriveEntry,
  DriveProvider,
  DriveTreeNode,
} from '@/features/drive/types'

/**
 * 从本地元数据加载分页目录与目录树，写操作完成后刷新并等待后台复核。
 *
 * @param provider - 当前服务端连接
 * @returns 工作区状态及异步文件操作，失败保留当前数据并提供错误反馈
 */
const useDriveView = (provider: DriveProvider) => {
  const location = useLocation()
  const navigate = useNavigate()
  const selectedDirectoryId =
    location.pathname.split('/').filter(Boolean)[3] || 'root'
  const [rootNode, setRootNode] = useState<DriveTreeNode>({
    id: 'root',
    name: provider.name,
    kind: 'folder',
    hasChildren: true,
  })
  const [expandedSet, setExpandedSet] = useState(new Set(['root']))
  const [searchQuery, setSearchQuery] = useState('')
  const [data, setData] = useState<{
    parent: string
    entries: DriveEntry[]
    path: DriveTreeNode[]
    cursor: string | null
    sync?: DriveSyncStatus
  }>({ parent: selectedDirectoryId, entries: [], path: [], cursor: null })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const operationRef = useRef(false)
  const requestRef = useRef<AbortController | null>(null)
  const treeRequestRef = useRef<AbortController | null>(null)
  const displayedGenerationRef = useRef<string | null>(null)
  const treeCacheRef = useRef(
    new Map<string, { children: DriveTreeNode[]; generation: string | null }>(),
  )
  const currentRef = useRef({ selectedDirectoryId, searchQuery })
  useEffect(() => {
    currentRef.current = { selectedDirectoryId, searchQuery }
  }, [selectedDirectoryId, searchQuery])

  // 文件树独立于搜索；分支完整加载后更新条目并保留已经展开的后代。
  const loadChildren = useCallback(
    async (parent: string, refresh = false): Promise<void> => {
      const controller = treeRequestRef.current
      if (!controller) return
      let children = treeCacheRef.current.get(parent)?.children
      if (!children || refresh) {
        children = []
        let generation: string | null = null
        let cursor: string | null = ''
        do {
          const page: DrivePage | null = await getDriveEntryPage(
            provider.id,
            parent,
            {
              cursor,
              refresh,
              signal: controller.signal,
            },
          ).catch((cause: unknown) => {
            if (controller.signal.aborted) return null
            throw cause
          })
          if (!page || controller.signal.aborted) return
          if (!cursor || page.resetCursor) generation = page.sync.generation
          if (page.resetCursor) children = []
          children.push(
            ...page.entries.map((entry): DriveTreeNode => ({
              id: entry.id,
              name: entry.name,
              kind: entry.kind,
              hasChildren: entry.kind === 'folder',
              entry,
            })),
          )
          cursor = page.nextCursor
          if (children.length > 10_000)
            throw new Error(
              'This folder has too many items to display in the tree. Browse it in the file list.',
            )
        } while (cursor)
        treeCacheRef.current.set(parent, { children, generation })
      }
      if (!controller.signal.aborted) {
        const childList = children
        setRootNode((root) =>
          updateDriveDirectoryNode(root, parent, (node) => {
            const previousChildMap = new Map(
              node.children?.map((child) => [child.id, child]),
            )
            return {
              ...node,
              children: childList.map((child) => {
                const previous = previousChildMap.get(child.id)
                return previous?.kind === 'folder' && child.kind === 'folder'
                  ? {
                      ...child,
                      children: previous.children,
                      hasChildren: previous.hasChildren,
                    }
                  : child
              }),
              hasChildren: Boolean(childList.length),
            }
          }),
        )
      }
    },
    [provider.id],
  )

  // 取消过期搜索或目录请求，分页只合并同一次目录和搜索的结果。
  const loadEntries = useCallback(
    async (refresh = false, cursor = '', background = false): Promise<void> => {
      if (background && requestRef.current) return
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller
      const { selectedDirectoryId: parent, searchQuery: query } =
        currentRef.current
      if (!background) {
        setLoading(true)
        setError(null)
      }
      try {
        let page = await getDriveEntryPage(provider.id, parent, {
          query,
          refresh,
          cursor,
          signal: controller.signal,
        })
        let append = Boolean(cursor) && !page.resetCursor
        if (append && page.sync.generation !== displayedGenerationRef.current) {
          append = false
          page = await getDriveEntryPage(provider.id, parent, {
            query,
            signal: controller.signal,
          })
        }
        if (controller.signal.aborted) return
        displayedGenerationRef.current = page.sync.generation
        const path = page.path.map((part): DriveTreeNode => ({
          ...part,
          kind: 'folder',
          hasChildren: true,
        }))
        setData((current) => ({
          parent,
          sync: page.sync,
          entries: append
            ? [
                ...current.entries,
                ...page.entries.filter(
                  (entry) =>
                    !current.entries.some((item) => item.id === entry.id),
                ),
              ]
            : page.entries,
          path,
          cursor: page.nextCursor,
        }))
        if (!background && !cursor && !query)
          setExpandedSet((current) =>
            path.every((part) => current.has(part.id))
              ? current
              : new Set([...current, ...path.map((part) => part.id)]),
          )
        setRootNode((root) => {
          let next = root
          for (let index = 0; index < path.length - 1; index++) {
            const child = path[index + 1]
            next = updateDriveDirectoryNode(next, path[index].id, (node) => ({
              ...node,
              hasChildren: true,
              children: node.children?.some((item) => item.id === child.id)
                ? node.children.map((item) =>
                    item.id === child.id ? { ...item, name: child.name } : item,
                  )
                : [...(node.children ?? []), child],
            }))
          }
          return next
        })
        await loadChildren(
          parent,
          refresh ||
            treeCacheRef.current.get(parent)?.generation !==
              page.sync.generation,
        )
      } catch (cause) {
        if (!controller.signal.aborted) {
          const message =
            cause instanceof Error
              ? cause.message
              : 'Could not load this folder.'
          setError(message)
          if (!background) toast.error(message)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
        if (requestRef.current === controller) requestRef.current = null
      }
    },
    [provider.id, loadChildren],
  )
  useEffect(() => {
    treeRequestRef.current = new AbortController()
    if (currentRef.current.selectedDirectoryId !== 'root')
      void loadChildren('root').catch((cause: unknown) => {
        if (!treeRequestRef.current?.signal.aborted) {
          const message =
            cause instanceof Error ? cause.message : 'Could not load folders.'
          setError(message)
          toast.error(message)
        }
      })
    return () => {
      requestRef.current?.abort()
      treeRequestRef.current?.abort()
    }
  }, [loadChildren])
  useEffect(() => {
    const timer = setTimeout(
      () => {
        void loadEntries()
      },
      searchQuery ? 250 : 0,
    )
    return () => {
      clearTimeout(timer)
      requestRef.current?.abort()
    }
  }, [selectedDirectoryId, searchQuery, loadEntries])
  const reloadSnapshot = useCallback(async () => {
    if (operationRef.current) return
    await loadEntries(true, '', true)
  }, [loadEntries])
  const sync = useDriveSync(
    provider.id,
    selectedDirectoryId,
    data.parent === selectedDirectoryId ? data.sync?.generation : undefined,
    reloadSnapshot,
  )
  useEffect(() => {
    const uploadCompletedHandler = (event: Event) => {
      const detail = (
        event as CustomEvent<{ connectionId: string; parent: string }>
      ).detail
      if (!detail || detail.connectionId !== provider.id) return
      if (detail.parent === currentRef.current.selectedDirectoryId) {
        void loadEntries(true, '', true)
      } else if (treeCacheRef.current.has(detail.parent)) {
        void loadChildren(detail.parent, true).catch(() => undefined)
      }
    }
    window.addEventListener('drive-upload-completed', uploadCompletedHandler)
    return () =>
      window.removeEventListener(
        'drive-upload-completed',
        uploadCompletedHandler,
      )
  }, [provider.id, loadEntries, loadChildren])
  const selectDirectory = (id: string): void => {
    setSearchQuery('')
    setExpandedSet((current) =>
      current.has(id) ? current : new Set([...current, id]),
    )
    navigate(`/assets/drive/${provider.id}${id === 'root' ? '' : '/' + id}`)
  }
  const toggleDirectory = (id: string): void => {
    const opening = !expandedSet.has(id)
    setExpandedSet((current) => {
      const next = new Set(current)
      if (opening) next.add(id)
      else next.delete(id)
      return next
    })
    if (opening)
      void loadChildren(id).catch((cause: unknown) => {
        const message =
          cause instanceof Error ? cause.message : 'Could not load folders.'
        setError(message)
        toast.error(message)
      })
  }
  const refresh = (): void => {
    treeCacheRef.current.clear()
    void requestDriveSync(provider.id, selectedDirectoryId, 'refresh')
      .then(() => loadEntries(true))
      .catch((cause: unknown) => {
        const message =
          cause instanceof Error ? cause.message : 'Could not refresh files.'
        setError(message)
        toast.error(message)
      })
  }
  const loadMore = (): void => {
    if (data.cursor && !loading) void loadEntries(false, data.cursor)
  }

  /**
   * 串行执行文件操作，失败也复核受影响目录以展示部分完成的远端操作。
   *
   * @param action - 远端操作
   * @param message - 成功通知
   * @param affectedDirectoryId - 被修改条目，供路径回退和缓存失效使用
   * @param parentIdList - 移动的源与目标目录；其他操作沿用根目录刷新
   * @returns 无返回值；更新列表、树、忙碌状态及通知，远端失败向调用方抛出
   */
  const runOperation = async (
    action: () => Promise<unknown>,
    message: string,
    affectedDirectoryId?: string,
    parentIdList?: string[],
  ): Promise<void> => {
    if (operationRef.current)
      throw new Error('Wait for the current operation to finish.')
    operationRef.current = true
    setBusy(true)
    setError(null)
    let succeeded = false
    try {
      await action()
      succeeded = true
      const affectedIndex = data.path.findIndex(
        (part) => part.id === affectedDirectoryId,
      )

      // 路径型 ID 会随重命名或移动改变；正在浏览被变更的目录时回到其原父目录。
      if (affectedIndex > 0) {
        const parent = data.path[affectedIndex - 1].id
        currentRef.current = { selectedDirectoryId: parent, searchQuery: '' }
        selectDirectory(parent)
      }
      toast(message)
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'The storage operation failed.'
      setError(message)
      toast.error(message)
      throw cause
    } finally {
      const refreshParentList = parentIdList
        ? [...new Set(parentIdList)].filter(
            (parent) => parent === 'root' || treeCacheRef.current.has(parent),
          )
        : ['root']
      if (parentIdList) {
        for (const parent of parentIdList) treeCacheRef.current.delete(parent)
        if (affectedDirectoryId) {
          treeCacheRef.current.delete(affectedDirectoryId)
          if (succeeded)
            setExpandedSet((current) => {
              if (!current.has(affectedDirectoryId)) return current
              const next = new Set(current)
              next.delete(affectedDirectoryId)
              return next
            })
        }
      } else treeCacheRef.current.clear()
      let treeError: string | null = null
      for (const parent of refreshParentList) {
        if (parent === currentRef.current.selectedDirectoryId) continue
        await loadChildren(parent, true).catch((cause: unknown) => {
          treeError =
            cause instanceof Error
              ? cause.message
              : 'Could not refresh folders.'
        })
      }
      await loadEntries(true)
      if (treeError) setError(treeError)
      operationRef.current = false
      setBusy(false)
    }
  }
  const createFolder = (name: string, parent = selectedDirectoryId) =>
    runOperation(
      () => createDriveFolder(provider.id, parent, name),
      'Folder created',
    )
  const deleteEntry = (id: string) =>
    runOperation(() => deleteDriveEntry(provider.id, id), 'Item deleted', id)
  const renameEntry = (id: string, name: string) =>
    runOperation(
      () => updateDriveEntry(provider.id, id, { name }),
      'Item renamed',
      id,
    )
  const moveEntry = (entry: DriveEntry, parent: string) =>
    runOperation(
      () => updateDriveEntry(provider.id, entry.id, { parent }),
      'Item moved',
      entry.id,
      [entry.parentId, parent],
    )
  const downloadEntry = (entry: DriveEntry): void => {
    const link = document.createElement('a')
    link.href = getDriveContentUrl(entry, true)
    link.download = entry.name
    link.click()
  }
  return {
    provider,
    syncStatus:
      sync.status ??
      (data.parent === selectedDirectoryId ? (data.sync ?? null) : null),
    syncError: sync.error,
    rootNode,
    directoryPathList: data.parent === selectedDirectoryId ? data.path : [],
    selectedDirectoryId,
    expandedSet,
    visibleEntryList: data.parent === selectedDirectoryId ? data.entries : [],
    searchQuery,
    setSearchQuery,
    loading,
    busy,
    error,
    hasMore: Boolean(data.cursor),
    loadMore,
    refresh,
    toggleDirectory,
    selectDirectory,
    createFolder,
    deleteEntry,
    renameEntry,
    moveEntry,
    downloadEntry,
  }
}
export { useDriveView }
export type DriveView = ReturnType<typeof useDriveView>
