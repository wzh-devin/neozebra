import { useEffect, useState } from 'react'
import { getDriveUploadTablePage } from '@/services/drive-upload'
import type { DriveUploadTablePage } from '@/features/drive/upload-types'

/**
 * 轮询当前账号的任务表格页，中止旧页请求并保留同页数据，上传队列独立运行。
 *
 * @param connectionId - 当前账号标识
 * @param latestTaskId - 新选任务标识，变更时及时刷新当前页
 * @returns 分页数据、加载/错误状态及翻页和重试操作
 */
const useDriveUploadTaskPage = (
  connectionId: string,
  latestTaskId?: string,
) => {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<DriveUploadTablePage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const loadPage = async () => {
      setLoading(true)
      try {
        const result = await getDriveUploadTablePage(
          connectionId,
          page,
          controller.signal,
        )
        if (controller.signal.aborted) return
        const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize))
        if (page > lastPage) {
          setPage(lastPage)
          return
        }
        setData(result)
        setError(null)
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load upload tasks.',
          )
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          timer = setTimeout(loadPage, 2000)
        }
      }
    }
    void loadPage()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [connectionId, page, latestTaskId, retry])
  const retryHandler = () => setRetry((value) => value + 1)
  return {
    page,
    setPage,
    data: data?.page === page ? data : null,
    total: data?.total,
    loading,
    error,
    retryHandler,
  }
}
export { useDriveUploadTaskPage }
