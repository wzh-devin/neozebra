import type { TaskItem, TaskPriority, TaskStatus } from '@/features/tasks/types'

export type TaskCollectionFilters = {
  query: string
  project: string
  status: TaskStatus | 'all'
  priority: TaskPriority | 'all'
  label: string | null
  schedule: 'all' | 'unscheduled'
  sort: 'manual' | 'priority' | 'deadline' | 'completed'
  date: string | null
}

const priorityRankRecord = { high: 0, medium: 1, low: 2 }

/** 按当前条件筛选清单，排序时不改变持久化任务顺序。
 * @param taskList - 原任务列表
 * @param filters - 搜索、项目、状态和日期等条件
 * @returns 匹配条件的任务列表
 */
export const getTaskCollectionList = (
  taskList: TaskItem[],
  filters: TaskCollectionFilters,
): TaskItem[] => {
  const query = filters.query.trim().toLowerCase()
  const result = taskList.filter(
    (task) =>
      `${task.title} ${task.description}`.toLowerCase().includes(query) &&
      (filters.project === 'all' ||
        (filters.project === 'personal'
          ? task.projectId === null
          : task.projectId === filters.project)) &&
      (filters.status === 'all' || task.status === filters.status) &&
      (filters.priority === 'all' || task.priority === filters.priority) &&
      (filters.label === null || task.labels.includes(filters.label)) &&
      (filters.schedule === 'all' || task.plannedDate === null) &&
      (filters.date === null || task.plannedDate === filters.date),
  )
  /** 比较当前排序下的两个任务。
   * @param left - 左任务
   * @param right - 右任务
   * @returns 排序值；相同条件保持原有顺序
   */
  const compareTasks = (left: TaskItem, right: TaskItem): number => {
    if (filters.sort === 'completed')
      return (right.completedAt ?? '').localeCompare(left.completedAt ?? '')
    if (filters.sort === 'priority')
      return (
        priorityRankRecord[left.priority] - priorityRankRecord[right.priority]
      )
    if (filters.sort === 'deadline')
      return (left.deadlineDate ?? '9999').localeCompare(
        right.deadlineDate ?? '9999',
      )
    return 0
  }
  return result.sort(compareTasks)
}

/** 统计每个计划日期的任务数量，截止日期不代替计划日期。
 * @param taskList - 已经过搜索及状态等条件筛选的任务
 * @returns 日期与任务数的映射
 */
export const getTaskDateCountMap = (
  taskList: TaskItem[],
): Map<string, number> => {
  const result = new Map<string, number>()
  for (const task of taskList) {
    if (task.plannedDate)
      result.set(task.plannedDate, (result.get(task.plannedDate) ?? 0) + 1)
  }
  return result
}
