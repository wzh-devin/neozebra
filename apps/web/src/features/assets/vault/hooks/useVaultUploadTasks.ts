import { useEffect, useState, useSyncExternalStore } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getUploadPage } from '@/services/assets/vault'
import type { UploadSort, UploadStatus } from '@/features/assets/vault/types'
import {
  subscribeUploads,
  getUploadSnapshotList,
  mergeRemoteUpload,
} from '@/features/assets/vault/uploads/engine'
import { getVisibleUploadTaskList } from '@/features/assets/vault/uploads/upload-view'

/**
 * 按条件查询完整上传历史，与独立引擎进度合并；弹窗关闭时停止历史轮询。
 *
 * @param open - 是否显示任务弹窗
 * @returns 查询状态、筛选排序状态和可展示任务；不控制实际传输生命周期
 */
const useVaultUploadTasks = (open: boolean) => {
  const [status, setStatus] = useState<UploadStatus>('all')
  const [sort, setSort] = useState<UploadSort>('newest')
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const taskList = useSyncExternalStore(subscribeUploads, getUploadSnapshotList)
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  const filters = { status, sort, search: keyword }
  const query = useInfiniteQuery({
    queryKey: ['vault', 'uploads', status, sort, keyword],
    queryFn: ({ pageParam, signal }) =>
      getUploadPage(pageParam, signal, filters),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled: open,
    refetchInterval: open ? 3000 : false,
    retry: false,
  })
  useEffect(() => {
    for (const page of query.data?.pages ?? [])
      for (const upload of page.uploads) mergeRemoteUpload(upload)
  }, [query.data])
  const uploadList = query.isError
    ? []
    : (query.data?.pages.flatMap((page) => page.uploads) ?? [])
  const visibleTaskList = getVisibleUploadTaskList(
    taskList,
    uploadList,
    filters,
  )
  return {
    query,
    status,
    setStatus,
    sort,
    setSort,
    search,
    setSearch,
    visibleTaskList,
  }
}
export { useVaultUploadTasks }
