import type {
  TaskItem,
  TaskPlannerData,
  TaskProject,
} from '@/features/tasks/types'

export const projectColorList = [
  'purple',
  'blue',
  'teal',
  'green',
  'amber',
  'rose',
] as const
export const projectIconList = [
  'code',
  'sparkles',
  'book',
  'briefcase',
  'leaf',
  'rocket',
] as const
export const priorityLabelRecord = {
  high: '高优先级',
  medium: '中优先级',
  low: '低优先级',
}
export const statusLabelRecord = {
  todo: '待办',
  inProgress: '进行中',
  completed: '已完成',
}

/** 获取本地日期，避免 UTC 偏移。
 * @param date - 指定时间，默认当前时间
 * @returns YYYY-MM-DD 日期
 */
export const getLocalDate = (date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** 验证真实日历日期。
 * @param value - 待检查值
 * @returns 是否为有效日期或空日期
 */
export const isValidDate = (value: unknown): value is string | null => {
  if (value === null) return true
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const date = new Date(`${value}T12:00:00`)
  return !Number.isNaN(date.getTime()) && getLocalDate(date) === value
}

/** 按日历天偏移，避免夏令时问题。
 * @param date - 日期
 * @param offset - 日数偏移
 * @returns 新日期
 */
export const addDays = (date: string, offset: number): string => {
  const result = new Date(`${date}T12:00:00`)
  result.setDate(result.getDate() + offset)
  return getLocalDate(result)
}

/** 格式化清单日期。
 * @param date - 日期
 * @param today - 当前日期
 * @returns 日期文本
 */
export const formatTaskDate = (
  date: string,
  today = getLocalDate(),
): string => {
  if (date === today) return '今天'
  if (date === addDays(today, 1)) return '明天'
  if (date === addDays(today, -1)) return '昨天'
  return new Intl.DateTimeFormat('zh-CN', {
    year: date.slice(0, 4) !== today.slice(0, 4) ? 'numeric' : undefined,
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00`))
}

/** 格式化预计用时。
 * @param minutes - 分钟数
 * @returns 用时文本
 */
export const formatMinutes = (minutes: number): string =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
    : `${minutes}m`

/** 创建空的个人规划。
 * @param 无参数
 * @returns 空数据
 */
export const buildEmptyPlannerData = (): TaskPlannerData => ({
  version: 1,
  taskList: [],
  projectList: [],
  sectionList: [],
  isDemo: false,
})

// ponytail: 首版只保存到当前浏览器；需要跨设备或大量任务时迁移到服务端存储。
export const taskPlannerStorageKey = 'neozebra.task-planner.v1'

/** 从浏览器存储读取并校验计划；异常交给调用方保留原数据。
 * @param storage - 浏览器存储或测试替身
 * @returns 已校验的计划及用于并发检查的原文
 */
export const readPlannerStorage = (storage: Pick<Storage, 'getItem'>) => {
  const raw = storage.getItem(taskPlannerStorageKey)
  return {
    raw,
    data: raw === null ? buildEmptyPlannerData() : parsePlannerData(raw),
  }
}

/** 仅在原文未发生变化时写入，写入异常不提前更新界面。
 * @param storage - 浏览器存储或测试替身
 * @param previousRaw - 上次读取的原文
 * @param next - 调用方已校验的计划
 * @returns 保存的原文；存在并发修改时返回空值且不写入
 */
export const writePlannerStorage = (
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  previousRaw: string | null,
  next: TaskPlannerData,
): string | null => {
  if (storage.getItem(taskPlannerStorageKey) !== previousRaw) return null
  const raw = JSON.stringify(next)
  storage.setItem(taskPlannerStorageKey, raw)
  return raw
}

/** 构造带上下文的任务。
 * @param title - 标题
 * @param projectId - 项目
 * @param plannedDate - 安排日期
 * @param sectionId - 阶段
 * @returns 新任务
 */
export const buildTask = (
  title = '',
  projectId: string | null = null,
  plannedDate: string | null = null,
  sectionId: string | null = null,
): TaskItem => ({
  id: crypto.randomUUID(),
  title: title.trim(),
  description: '',
  status: 'todo',
  priority: 'medium',
  plannedDate,
  deadlineDate: null,
  projectId,
  sectionId,
  labels: [],
  estimateMinutes: null,
  isPinned: false,
  subtasks: [],
  source: 'Manual',
  createdAt: new Date().toISOString(),
  completedAt: null,
})

/** 判断是否为键值对象。
 * @param value - 不可信输入
 * @returns 是否为对象
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** 校验非空字符串。
 * @param value - 输入
 * @param maxLength - 长度上限
 * @returns 是否有效
 */
const isText = (value: unknown, maxLength = 200): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= maxLength

/** 校验可空关联标识。
 * @param value - 输入
 * @returns 是否有效
 */
const isNullableId = (value: unknown): boolean =>
  value === null || isText(value)

/** 校验时间戳。
 * @param value - 输入
 * @returns 是否有效
 */
const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value))

/** 校验任务与完成状态的一致性。
 * @param value - 不可信任务
 * @returns 是否有效
 */
const isTask = (value: unknown): value is TaskItem => {
  if (
    !isRecord(value) ||
    !isText(value.id) ||
    !isText(value.title) ||
    typeof value.description !== 'string' ||
    value.description.length > 10000
  )
    return false
  if (
    typeof value.status !== 'string' ||
    typeof value.priority !== 'string' ||
    !['todo', 'inProgress', 'completed'].includes(value.status) ||
    !['high', 'medium', 'low'].includes(value.priority)
  )
    return false
  if (
    !isValidDate(value.plannedDate) ||
    !isValidDate(value.deadlineDate) ||
    !isNullableId(value.projectId) ||
    !isNullableId(value.sectionId)
  )
    return false
  if (
    typeof value.isPinned !== 'boolean' ||
    !isText(value.source) ||
    !isTimestamp(value.createdAt)
  )
    return false
  if (
    value.status === 'completed'
      ? !isTimestamp(value.completedAt)
      : value.completedAt !== null
  )
    return false
  if (
    value.estimateMinutes !== null &&
    (typeof value.estimateMinutes !== 'number' ||
      !Number.isInteger(value.estimateMinutes) ||
      value.estimateMinutes < 1 ||
      value.estimateMinutes > 1440)
  )
    return false
  if (
    !Array.isArray(value.labels) ||
    value.labels.length > 20 ||
    !value.labels.every((label) => isText(label, 32))
  )
    return false
  if (
    !Array.isArray(value.subtasks) ||
    !value.subtasks.every(
      (step) =>
        isRecord(step) &&
        isText(step.id) &&
        isText(step.title) &&
        typeof step.completed === 'boolean',
    )
  )
    return false
  if (
    new Set(value.subtasks.map((step) => step.id)).size !==
    value.subtasks.length
  )
    return false
  return (
    value.status !== 'completed' ||
    value.subtasks.every((step) => step.completed)
  )
}

/** 校验项目字段。
 * @param value - 不可信项目
 * @returns 是否有效
 */
const isProject = (value: unknown): value is TaskProject =>
  isRecord(value) &&
  isText(value.id) &&
  isText(value.name, 80) &&
  typeof value.description === 'string' &&
  value.description.length <= 10000 &&
  projectColorList.some((color) => color === value.color) &&
  projectIconList.some((icon) => icon === value.icon) &&
  isValidDate(value.deadlineDate) &&
  typeof value.archived === 'boolean'

/** 校验存储与引用，拒绝损坏的数据。
 * @param value - 未知存储
 * @returns 是否为有效规划
 */
export const isPlannerData = (value: unknown): value is TaskPlannerData => {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.isDemo !== 'boolean' ||
    !Array.isArray(value.taskList) ||
    !Array.isArray(value.projectList) ||
    !Array.isArray(value.sectionList)
  )
    return false
  if (!value.taskList.every(isTask) || !value.projectList.every(isProject))
    return false
  if (
    !value.sectionList.every(
      (section) =>
        isRecord(section) &&
        isText(section.id) &&
        isText(section.projectId) &&
        isText(section.title, 80),
    )
  )
    return false
  const taskList = value.taskList as TaskItem[]
  const projectList = value.projectList as TaskProject[]
  const sectionList = value.sectionList as TaskPlannerData['sectionList']
  if (
    [taskList, projectList, sectionList].some(
      (collection) =>
        new Set(collection.map((entry) => entry.id)).size !== collection.length,
    )
  )
    return false
  const projectIdSet = new Set(projectList.map((project) => project.id))
  return (
    sectionList.every((section) => projectIdSet.has(section.projectId)) &&
    taskList.every(
      (task) =>
        (task.projectId === null || projectIdSet.has(task.projectId)) &&
        (task.sectionId === null ||
          sectionList.some(
            (section) =>
              section.id === task.sectionId &&
              section.projectId === task.projectId,
          )),
    )
  )
}

/** 解析本地保存的规划。
 * @param raw - 原始 JSON
 * @returns 规划；无效输入抛出错误
 */
export const parsePlannerData = (raw: string): TaskPlannerData => {
  const value: unknown = JSON.parse(raw)
  if (!isPlannerData(value))
    throw new Error('本地计划数据格式异常，原数据未被覆盖。')
  return value
}

/** 同步主任务与步骤的完成状态。
 * @param task - 当前任务
 * @param completed - 目标状态
 * @returns 更新后的任务
 */
export const updateTaskCompletion = (
  task: TaskItem,
  completed: boolean,
): TaskItem => ({
  ...task,
  status: completed ? 'completed' : 'todo',
  completedAt: completed ? new Date().toISOString() : null,
  subtasks: completed
    ? task.subtasks.map((step) => ({ ...step, completed: true }))
    : task.subtasks,
})

/** 在可见组内排序，不移动其他组。
 * @param taskList - 原集合
 * @param visibleIdList - 组内标识
 * @param id - 目标任务
 * @param direction - 方向
 * @returns 重排后的集合
 */
export const moveTaskList = (
  taskList: TaskItem[],
  visibleIdList: string[],
  id: string,
  direction: -1 | 1,
): TaskItem[] => {
  const visibleIdSet = new Set(visibleIdList)
  const visibleTaskList = taskList.filter((task) => visibleIdSet.has(task.id))
  const index = visibleTaskList.findIndex((task) => task.id === id)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= visibleTaskList.length)
    return taskList
  const moved = [...visibleTaskList]
  ;[moved[index], moved[nextIndex]] = [moved[nextIndex], moved[index]]
  let cursor = 0
  return taskList.map((task) =>
    visibleIdSet.has(task.id) ? moved[cursor++] : task,
  )
}

/** 删除项目并保留或删除任务。
 * @param data - 规划
 * @param projectId - 项目
 * @param deleteTasks - 是否删除任务
 * @returns 无悬空引用的新规划
 */
export const removeProject = (
  data: TaskPlannerData,
  projectId: string,
  deleteTasks: boolean,
): TaskPlannerData => ({
  ...data,
  projectList: data.projectList.filter((project) => project.id !== projectId),
  sectionList: data.sectionList.filter(
    (section) => section.projectId !== projectId,
  ),
  taskList: deleteTasks
    ? data.taskList.filter((task) => task.projectId !== projectId)
    : data.taskList.map((task) =>
        task.projectId === projectId
          ? { ...task, projectId: null, sectionId: null }
          : task,
      ),
})
