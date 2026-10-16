import { useI18n } from '@/lib/i18n'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { useSidebar } from '@/components/ui/sidebar'
import { toast } from 'sonner'
import { useVaultEntries } from './useVaultEntries'
import type {
  VaultEntry,
  VaultEntryLocation,
  VaultViewMode,
} from '@/features/assets/vault/types'
import { editVaultEntry, requestVault } from '@/services/assets/vault'
import {
  enqueueFileList,
  getUploadSnapshotList,
  restoreUploadTasks,
  subscribeUploads,
} from '@/features/assets/vault/uploads/engine'
import { collectDropFileList } from '@/features/assets/vault/uploads/drop-files'
import { canMoveVaultEntry } from '@/features/assets/vault/vault-drag'
import type { FileAction } from '@/features/assets/vault/types'
import type { Action } from '@/features/assets/vault/components/VaultActionDialog'

/**
 * 管理文件库请求、路由、目录操作和上传生命周期；保留明确的失败与取消处理。
 *
 * @param 无参数
 * @returns 文件库视图状态和事件回调；通过 API 执行用户操作
 */
const useVaultWorkspace = () => {
  const { t } = useI18n()

  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { folderId } = useParams()
  const parentId = folderId && /^\d+$/.test(folderId) ? folderId : '0'
  const { isMobile, state } = useSidebar()
  const routeKey = parentId
  const [searchState, setSearchState] = useState({ key: routeKey, text: '' })
  const [filterState, setFilterState] = useState({ key: routeKey, text: '' })
  const search = searchState.key === routeKey ? searchState.text : ''
  const filter = filterState.key === routeKey ? filterState.text : ''
  const [action, setAction] = useState<Action>()
  const [preview, setPreview] = useState<VaultEntry>()
  const [location, setLocation] = useState<VaultEntryLocation>()
  const locatedEntry = location?.parentId === parentId ? location : undefined
  const [uploadsOpen, setUploadsOpen] = useState(false)
  const [treeOpen, setTreeOpen] = useState(false)
  const [isTrashOpen, setIsTrashOpen] = useState(false)
  const trashOpen = folderId === 'trash' || isTrashOpen
  const [mutating, setMutating] = useState(false)
  const [adding, setAdding] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [viewMode, setViewMode] = useState<VaultViewMode>('list')
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const uploadTargetRef = useRef(parentId)
  const service = useQuery({
    queryKey: ['vault', 'health'],
    queryFn: ({ signal }) =>
      requestVault<{ status: string; vaultConfigured: boolean }>('/health', {
        signal,
      }),
    retry: false,
    refetchOnWindowFocus: true,
  })
  const isServiceReady = service.isSuccess
  const entries = useVaultEntries(parentId, false, filter, isServiceReady)
  const tasks = useSyncExternalStore(subscribeUploads, getUploadSnapshotList)
  const activeCount = tasks.filter(
    (task) => !['completed', 'cancelled', 'failed'].includes(task.state),
  ).length
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )
  useEffect(() => {
    const timer = setTimeout(
      () => setFilterState({ key: routeKey, text: search.trim() }),
      250,
    )
    return () => clearTimeout(timer)
  }, [search, routeKey])
  useEffect(() => {
    if (!isServiceReady) return
    const controller = new AbortController()
    void restoreUploadTasks(controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted)
        toast.error(
          error instanceof Error ? t(error.message) : t('未能恢复任务'),
        )
    })
    return () => {
      controller.abort()
    }
  }, [isServiceReady, t])
  const selectFolderHandler = (entry: VaultEntry | null) => {
    setLocation(undefined)
    navigate('/assets/vault' + (entry ? '/' + entry.id : ''))
    setTreeOpen(false)
  }

  /**
   * 单击树中的文件时展示其父目录，清除筛选并复用树已加载的分页定位文件。
   *
   * @param entry - 树中选中的文件、文件夹或根目录
   * @returns 无返回值；更新路由、筛选和定位状态，不移动键盘焦点
   */
  const selectTreeEntryHandler = (entry: VaultEntry | null) => {
    if (!entry || entry.kind === 'folder') {
      selectFolderHandler(entry)
      return
    }
    setSearchState({ key: entry.parentId, text: '' })
    setFilterState({ key: entry.parentId, text: '' })
    setLocation({ id: entry.id, parentId: entry.parentId })
    navigate(
      '/assets/vault' + (entry.parentId === '0' ? '' : '/' + entry.parentId),
    )
  }
  const trashHandler = () => {
    setIsTrashOpen(true)
    setTreeOpen(false)
  }
  const closeTrashHandler = () => {
    setIsTrashOpen(false)
    if (folderId === 'trash') navigate('/assets/vault', { replace: true })
  }
  const openEntryHandler = (entry: VaultEntry) => {
    if (entry.kind === 'folder') selectFolderHandler(entry)
    else {
      setTreeOpen(false)
      setPreview(entry)
    }
  }
  const actionHandler = (entry: VaultEntry, type: FileAction) =>
    setAction({ entry, type })
  const createHandler = () => setAction({ type: 'create' })
  const createInFolderHandler = (entry: VaultEntry | null) =>
    setAction({ type: 'create', parentId: entry?.id ?? '0' })
  const closeActionHandler = () => setAction(undefined)
  const closePreviewHandler = () => setPreview(undefined)
  const showTasksHandler = () => setUploadsOpen(true)
  const showTreeHandler = () => setTreeOpen(true)
  const searchHandler = (event: ChangeEvent<HTMLInputElement>) => {
    setLocation(undefined)
    setSearchState({ key: routeKey, text: event.target.value })
  }
  const refreshHandler = () => {
    queryClient.removeQueries({
      queryKey: ['vault', 'entries', parentId, false, filter],
      exact: true,
    })
    void queryClient.invalidateQueries({ queryKey: ['vault', 'health'] })
  }
  const serviceRetryHandler = () => {
    void service.refetch()
  }
  const loadMoreHandler = () => {
    void entries.fetchNextPage()
  }
  const chooseFilesHandler = () => {
    uploadTargetRef.current = parentId
    fileRef.current?.click()
  }
  const chooseFolderHandler = () => {
    uploadTargetRef.current = parentId
    folderRef.current?.click()
  }
  const addFileList = async (files: File[], target: string) => {
    setAdding(true)
    setUploadsOpen(true)
    try {
      await enqueueFileList(files, target)
      await queryClient.invalidateQueries({ queryKey: ['vault', 'entries'] })
    } catch (error) {
      toast.error(
        error instanceof Error ? t(error.message) : t('无法创建上传任务'),
      )
    } finally {
      setAdding(false)
    }
  }
  const fileSelectionHandler = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length) void addFileList(files, uploadTargetRef.current)
    else if (event.target === folderRef.current)
      toast.message(t('所选文件夹没有可上传的文件'))
  }
  const dragOverHandler = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault()
      setDropActive(true)
    }
  }
  const dragLeaveHandler = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null))
      setDropActive(false)
  }
  const dropHandler = async (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    setDropActive(false)
    const transfer = event.dataTransfer
    const target = parentId
    try {
      const files = await collectDropFileList(transfer)
      if (files.length) await addFileList(files, target)
      else toast.message(t('所选文件夹没有可上传的文件'))
    } catch {
      toast.error(t('无法读取拖入的文件，请重新选择'))
    }
  }
  const crumbHandler = (event: React.MouseEvent<HTMLButtonElement>) => {
    const id = event.currentTarget.dataset.folderId
    if (id) {
      setLocation(undefined)
      navigate('/assets/vault/' + id)
      setTreeOpen(false)
    }
  }
  const dragEndHandler = async (event: DragEndEvent) => {
    const entry = event.active.data.current?.entry as VaultEntry | undefined
    const target = event.over?.data.current?.parentId as string | undefined
    if (!entry || !canMoveVaultEntry(entry, target) || mutating) return
    setMutating(true)
    const toastId = toast.loading(t('正在移动') + ' ' + entry.name)
    try {
      await editVaultEntry(entry, { parentId: target })
      await queryClient.invalidateQueries({ queryKey: ['vault', 'entries'] })
      toast.success(t('已移动') + ' ' + entry.name, { id: toastId })
    } catch (error) {
      toast.error(error instanceof Error ? t(error.message) : t('移动失败'), {
        id: toastId,
      })
    } finally {
      setMutating(false)
    }
  }
  const taskNavigateHandler = (id: string) => {
    setUploadsOpen(false)
    setLocation(undefined)
    navigate('/assets/vault' + (id !== '0' ? '/' + id : ''))
  }
  const rootHandler = () => selectFolderHandler(null)
  return {
    parentId,
    trashOpen,
    isMobile,
    state,
    search,
    filter,
    action,
    preview,
    locatedEntry,
    uploadsOpen,
    setUploadsOpen,
    treeOpen,
    setTreeOpen,
    mutating,
    adding,
    dropActive,
    viewMode,
    setViewMode,
    fileRef,
    folderRef,
    service,
    isServiceReady,
    entries,
    activeCount,
    sensors,
    selectFolderHandler,
    selectTreeEntryHandler,
    trashHandler,
    closeTrashHandler,
    openEntryHandler,
    actionHandler,
    createHandler,
    createInFolderHandler,
    closeActionHandler,
    closePreviewHandler,
    showTasksHandler,
    showTreeHandler,
    searchHandler,
    refreshHandler,
    serviceRetryHandler,
    loadMoreHandler,
    chooseFilesHandler,
    chooseFolderHandler,
    fileSelectionHandler,
    dragOverHandler,
    dragLeaveHandler,
    dropHandler,
    crumbHandler,
    dragEndHandler,
    taskNavigateHandler,
    rootHandler,
  }
}
export { useVaultWorkspace }
export type VaultController = ReturnType<typeof useVaultWorkspace>
