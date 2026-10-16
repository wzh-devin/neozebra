import { t } from '@/lib/i18n'
import {
  addDays,
  getLocalDate,
  isValidDate,
} from '@/features/tasks/data/task-planner'
import type { TaskItem, TaskProject } from '@/features/tasks/types'

export type TaskGanttEntry = {
  task: TaskItem
  startAt: Date
  endAt: Date
}
export type TaskGanttGroup = {
  id: string
  name: string
  entryList: TaskGanttEntry[]
}

/**
 * 将任务日历日期转为包含末日的时间轴区间，分离未安排及倒置日期。
 *
 * @param taskList - 当前筛选后的任务
 * @returns 可展示区间、未安排任务与日期待调整任务
 */
export const buildTaskGanttRecord = (taskList: TaskItem[]) => {
  const entryList: TaskGanttEntry[] = []
  const unscheduledTaskList: TaskItem[] = []
  const invalidTaskList: TaskItem[] = []
  for (const task of taskList) {
    const start = task.plannedDate ?? task.deadlineDate
    const end = task.deadlineDate ?? task.plannedDate
    if (!start || !end) {
      unscheduledTaskList.push(task)
    } else if (!isValidDate(start) || !isValidDate(end) || start > end) {
      invalidTaskList.push(task)
    } else {
      entryList.push({
        task,
        startAt: new Date(`${start}T00:00:00`),
        endAt: new Date(`${addDays(end, 1)}T00:00:00`),
      })
    }
  }
  return { entryList, unscheduledTaskList, invalidTaskList }
}

/**
 * 按现有项目顺序分组，保留每组任务的既有顺序。
 *
 * @param entryList - 有效时间轴区间
 * @param projectList - 当前项目
 * @returns 非空项目组和个人任务组
 */
export const getTaskGanttGroupList = (
  entryList: TaskGanttEntry[],
  projectList: TaskProject[],
): TaskGanttGroup[] =>
  [
    ...projectList.map((project) => ({
      id: project.id,
      name: project.name + (project.archived ? ' ' + t('· 已归档') : ''),
      entryList: entryList.filter(
        (entry) => entry.task.projectId === project.id,
      ),
    })),
    {
      id: 'personal',
      name: t('个人任务'),
      entryList: entryList.filter((entry) => !entry.task.projectId),
    },
  ].filter((group) => group.entryList.length > 0)

/**
 * 校验拖动区间并还原为本地计划日期及包含末日的截止日期。
 *
 * @param startAt - 时间轴起点
 * @param endAt - 时间轴排他终点
 * @returns 可保存的日期字段，非法或倒置区间返回空值
 */
export const buildTaskGanttDatePatch = (
  startAt: Date,
  endAt: Date | null,
): Pick<TaskItem, 'plannedDate' | 'deadlineDate'> | null => {
  if (
    !endAt ||
    !Number.isFinite(startAt.getTime()) ||
    !Number.isFinite(endAt.getTime())
  )
    return null
  const plannedDate = getLocalDate(startAt)
  const exclusiveEnd = getLocalDate(endAt)
  if (!isValidDate(plannedDate) || !isValidDate(exclusiveEnd)) return null
  const deadlineDate = addDays(exclusiveEnd, -1)
  if (!isValidDate(deadlineDate) || plannedDate > deadlineDate) return null
  return { plannedDate, deadlineDate }
}

/**
 * 筛选甘特图任务，默认排除已完成历史，状态与项目条件共同生效。
 *
 * @param taskList - 现有任务
 * @param projectId - 全部、个人或具体项目标识
 * @param showCompleted - 是否同时显示已完成任务
 * @returns 满足条件的任务列表，不改变原数据
 */
export const getTaskGanttVisibleTaskList = (
  taskList: TaskItem[],
  projectId: string,
  showCompleted: boolean,
): TaskItem[] =>
  taskList.filter(
    (task) =>
      (showCompleted || task.status !== 'completed') &&
      (projectId === 'all' ||
        (projectId === 'personal'
          ? !task.projectId
          : task.projectId === projectId)),
  )
