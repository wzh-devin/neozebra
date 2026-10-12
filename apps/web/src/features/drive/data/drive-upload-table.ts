import type {
  DriveUploadTablePage,
  DriveUploadTask,
} from '@/features/drive/upload-types'

type UploadTablePageParams = {
  page: number
  data: DriveUploadTablePage | null
  localTasks: DriveUploadTask[]
  knownTotal?: number
}

/**
 * 合并服务端当前页、新登记任务和实时进度，历史页不混入其他页任务。
 *
 * @param params - 当前页、服务端快照及账号运行态
 * @returns 最多一页任务及分页数量；未知总数时仅统计可展示任务
 */
const buildDriveUploadTablePage = ({
  page,
  data,
  localTasks,
  knownTotal,
}: UploadTablePageParams) => {
  const localTaskMap = new Map(localTasks.map((task) => [task.id, task]))
  const taskMap = new Map<string, DriveUploadTask>()
  for (const task of data?.tasks ?? []) {
    const local = localTaskMap.get(task.id)
    taskMap.set(
      task.id,
      local && local.updatedAt >= task.updatedAt ? local : task,
    )
  }
  let addedCount = 0
  if (page === 1) {
    const newest = data?.tasks[0]?.createdAt
    for (const task of localTasks) {
      if (!taskMap.has(task.id) && (!newest || task.createdAt > newest)) {
        taskMap.set(task.id, task)
        addedCount++
      }
    }
  }
  const pageSize = data?.pageSize ?? 10
  const tasks = [...taskMap.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, pageSize)
  const total = data
    ? data.total + addedCount
    : Math.max(knownTotal ?? 0, tasks.length)
  return {
    tasks,
    total,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}
export { buildDriveUploadTablePage }
