import { useAtomValue } from 'jotai'
import { useEffect } from 'react'
import {
  driveUploadStateAtom,
  emptyUploadState,
  activeStatusSet,
  loadDriveUploads,
  addDriveUploadFiles,
  controlDriveUpload,
  hasUploadFile,
} from '@/features/drive/data/drive-uploads'

/**
 * 订阅一个关联账号的任务，任务执行独立于组件，只有可见账号轮询状态。
 *
 * @param connectionId - 账号标识
 * @param enabled - 是否需要加载任务
 * @returns 任务状态与上传、控制操作
 */
const useDriveUploads = (connectionId: string, enabled = true) => {
  const accountStateRecord = useAtomValue(driveUploadStateAtom)
  const state = accountStateRecord[connectionId] ?? emptyUploadState
  const activeCount = state.tasks.filter((task) =>
    activeStatusSet.has(task.status),
  ).length
  useEffect(() => {
    void loadDriveUploads(connectionId)
  }, [connectionId])
  useEffect(() => {
    if (!enabled && !activeCount) return
    const timer = setInterval(() => {
      void loadDriveUploads(connectionId)
    }, 2000)
    return () => clearInterval(timer)
  }, [connectionId, enabled, activeCount])
  return {
    ...state,
    activeCount,
    loadDriveUploads,
    addDriveUploadFiles,
    controlDriveUpload,
    hasUploadFile,
  }
}

export { useDriveUploads }
