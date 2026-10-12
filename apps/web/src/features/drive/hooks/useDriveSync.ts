import { useEffect, useRef, useState } from 'react'
import { getDriveEntryPage, requestDriveSync } from '@/services/drive'
import type { DriveSyncStatus } from '@/services/drive'

/**
 * 可见时续租活跃目录并轮询本地同步状态，发布新快照后通知工作区。
 *
 * @param connectionId - 当前连接
 * @param parent - 正在浏览的目录
 * @param generation - 当前展示的快照；undefined 表示首次读取尚未完成
 * @param onSnapshotChange - 新快照发布后的本地重载
 * @returns 同步状态与可恢复错误
 */
const useDriveSync = (
  connectionId: string,
  parent: string,
  generation: string | null | undefined,
  onSnapshotChange: () => Promise<void>,
) => {
  const key = connectionId + ':' + parent
  const [status, setStatus] = useState<{
    key: string
    value: DriveSyncStatus
  } | null>(null)
  const [error, setError] = useState<{ key: string; value: string } | null>(
    null,
  )
  const currentRef = useRef({ generation, onSnapshotChange })
  useEffect(() => {
    currentRef.current = { generation, onSnapshotChange }
  }, [generation, onSnapshotChange])
  useEffect(() => {
    const controller = new AbortController()
    let polling = false
    const reportError = (cause: unknown) => {
      if (!controller.signal.aborted)
        setError({
          key,
          value:
            cause instanceof Error
              ? cause.message
              : 'Could not check sync status.',
        })
    }
    const activate = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        await requestDriveSync(
          connectionId,
          parent,
          'activate',
          controller.signal,
        )
        if (!controller.signal.aborted) setError(null)
      } catch (cause) {
        reportError(cause)
      }
    }
    const poll = async () => {
      if (polling || document.visibilityState !== 'visible') return
      polling = true
      try {
        const page = await getDriveEntryPage(connectionId, parent, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setStatus({ key, value: page.sync })
        if (
          currentRef.current.generation !== undefined &&
          page.sync.generation !== currentRef.current.generation
        )
          await currentRef.current.onSnapshotChange()
      } catch (cause) {
        reportError(cause)
      } finally {
        polling = false
      }
    }
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        void activate()
        void poll()
      }
    }
    void activate()
    void poll()
    const heartbeat = setInterval(() => {
      void activate()
    }, 60_000)
    const timer = setInterval(() => {
      void poll()
    }, 5000)
    document.addEventListener('visibilitychange', visibilityHandler)
    return () => {
      controller.abort()
      clearInterval(heartbeat)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visibilityHandler)
    }
  }, [connectionId, parent, key])
  return {
    status: status?.key === key ? status.value : null,
    error: error?.key === key ? error.value : null,
  }
}
export { useDriveSync }
