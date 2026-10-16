import type { TransferTask } from './engine'
import type {
  VaultUpload,
  UploadFilter,
  UploadStatus,
} from '@/features/assets/vault/types'

/**
 * 将持久化上传记录转为可展示、可重新选择源文件的任务快照。
 *
 * @param upload - 服务端任务记录
 * @returns 不持有原文件的远端任务
 */
const getRemoteUploadTask = (upload: VaultUpload): TransferTask => ({
  key: 'remote-' + upload.id,
  name: upload.name,
  size: Number(upload.size),
  parentId: upload.parentId,
  upload,
  state: upload.state,
  phase: upload.state,
  progress: upload.state === 'completed' ? 1 : 0,
  speed: 0,
  error: upload.error ?? '',
  needsSource: !['completed', 'completing', 'cancelled', 'failed'].includes(
    upload.state,
  ),
  offline: false,
  local: false,
})

const getTaskStatus = (task: TransferTask): UploadStatus => {
  if (['failed', 'error'].includes(task.state)) return 'failed'
  if (['paused', 'completed', 'cancelled'].includes(task.state))
    return task.state as UploadStatus
  return 'active'
}

/**
 * 合并本次查询的历史与本地实时任务，去重并按状态、文件名、注册顺序或大小展示。
 *
 * @param taskList - 当前浏览器任务快照
 * @param uploadList - 当前筛选下已加载的服务端历史
 * @param filters - 状态、搜索与排序条件
 * @returns 筛选排序后的任务列表；不改变传输或原始快照
 */
const getVisibleUploadTaskList = (
  taskList: TransferTask[],
  uploadList: VaultUpload[],
  filters: UploadFilter,
): TransferTask[] => {
  const taskMap = new Map(
    taskList
      .filter((task) => task.upload)
      .map((task) => [task.upload!.id, task]),
  )
  const positionMap = new Map(taskList.map((task, index) => [task.key, index]))
  const visibleMap = new Map<string, TransferTask>()
  for (const upload of uploadList)
    visibleMap.set(
      'upload-' + upload.id,
      taskMap.get(upload.id) ?? getRemoteUploadTask(upload),
    )
  for (const task of taskList)
    if (task.local)
      visibleMap.set(task.upload ? 'upload-' + task.upload.id : task.key, task)
  const matchesFilter = (task: TransferTask) =>
    (filters.status === 'all' || getTaskStatus(task) === filters.status) &&
    (!task.local ||
      task.name.toLowerCase().includes(filters.search.toLowerCase()))
  const compareTasks = (left: TransferTask, right: TransferTask) => {
    let comparison = 0
    if (filters.sort.startsWith('size-')) comparison = left.size - right.size
    if (!comparison) {
      if (left.upload && right.upload) {
        const leftId = BigInt(left.upload.id)
        const rightId = BigInt(right.upload.id)
        comparison = leftId < rightId ? -1 : leftId > rightId ? 1 : 0
      } else if (left.upload || right.upload) comparison = left.upload ? -1 : 1
      else
        comparison =
          (positionMap.get(left.key) ?? 0) - (positionMap.get(right.key) ?? 0)
    }
    return filters.sort === 'oldest' || filters.sort === 'size-asc'
      ? comparison
      : -comparison
  }
  return [...visibleMap.values()].filter(matchesFilter).sort(compareTasks)
}
export { getRemoteUploadTask, getVisibleUploadTaskList }
