import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { buildDemoPlannerData } from '@/features/tasks/data/demo-planner'
import {
  buildEmptyPlannerData,
  getLocalDate,
  isPlannerData,
  moveTaskList,
  readPlannerStorage,
  removeProject,
  taskPlannerStorageKey,
  updateTaskCompletion,
  writePlannerStorage,
} from '@/features/tasks/data/task-planner'
import type {
  TaskItem,
  TaskPlannerData,
  TaskProject,
  TaskSection,
} from '@/features/tasks/types'

/** 管理唯一规划状态、本地保存与可撤销操作。
 * @param 无参数
 * @returns 规划状态和业务操作
 */
export const useTaskPlanner = () => {
  const [data, setData] = useState<TaskPlannerData>(buildEmptyPlannerData)
  const dataRef = useRef(data)
  const rawRef = useRef<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isReadError, setIsReadError] = useState(false)
  const [error, setError] = useState('')
  const [today, setToday] = useState(getLocalDate)
  const [pendingCompletionId, setPendingCompletionId] = useState<string | null>(
    null,
  )

  /** 读取并校验存储，异常时保留原数据。
   * @param 无参数
   * @returns 无返回值；更新状态与错误提示
   */
  const loadHandler = (): void => {
    try {
      const { raw, data: next } = readPlannerStorage(localStorage)
      rawRef.current = raw
      dataRef.current = next
      setData(next)
      setError('')
      setIsReadError(false)
    } catch {
      setIsReadError(true)
      setError('无法读取本地计划，原数据未被覆盖。请检查浏览器存储后重试。')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- 挂载后同步浏览器存储及读取错误，不在渲染期间执行持久化副作用。
    loadHandler()
    /** 同步其他标签页，避免写入过时状态。
     * @param event - 存储变化
     * @returns 无返回值；重新读取规划
     */
    const storageChangeHandler = (event: StorageEvent): void => {
      if (event.key === taskPlannerStorageKey || event.key === null)
        loadHandler()
    }
    window.addEventListener('storage', storageChangeHandler)
    return () => window.removeEventListener('storage', storageChangeHandler)
  }, [])

  useEffect(() => {
    /** 跨日或恢复窗口时更新今天。
     * @param 无参数
     * @returns 无返回值；更新本地日期
     */
    const refreshDateHandler = (): void => setToday(getLocalDate())
    const timer = window.setInterval(refreshDateHandler, 60000)
    window.addEventListener('focus', refreshDateHandler)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshDateHandler)
    }
  }, [])

  /** 先保存再更新界面，保存失败时让调用方保留输入。
   * @param next - 下一份规划
   * @param message - 成功反馈
   * @param allowUndo - 是否允许撤销
   * @returns 是否保存成功
   */
  const commitHandler = (
    next: TaskPlannerData,
    message: string,
    allowUndo = false,
  ): boolean => {
    if (isLoading || isReadError) return false
    if (!isPlannerData(next)) {
      toast.error('请检查标题、日期、预计用时和项目关联。')
      return false
    }
    const previous = dataRef.current
    try {
      const raw = writePlannerStorage(localStorage, rawRef.current, next)
      if (raw === null) {
        loadHandler()
        toast.error('计划已在其他标签页更新，请核对后重新保存。')
        return false
      }
      rawRef.current = raw
      dataRef.current = next
      setData(next)
      setError('')
      /** 仅撤销最近更改，避免覆盖后续编辑。
       * @param 无参数
       * @returns 无返回值；恢复上次数据或提示无法撤销
       */
      const undoHandler = (): void => {
        if (dataRef.current !== next) {
          toast.info('已有后续更改，无法直接撤销这次操作。')
          return
        }
        commitHandler(previous, '已撤销')
      }
      toast.success(message, {
        id: 'task-planner-change',
        duration: allowUndo ? 12000 : 4000,
        action: allowUndo ? { label: '撤销', onClick: undoHandler } : undefined,
      })
      return true
    } catch {
      setError(
        '本地保存失败，改动尚未保存。输入已保留，请释放存储空间后重试刚才的操作。',
      )
      toast.error('保存失败，请重试；原计划未改变。')
      return false
    }
  }

  /** 保存新增或编辑任务。
   * @param task - 完整任务
   * @returns 是否成功
   */
  const saveTaskHandler = (task: TaskItem): boolean => {
    const current = dataRef.current
    const exists = current.taskList.some((entry) => entry.id === task.id)
    return commitHandler(
      {
        ...current,
        taskList: exists
          ? current.taskList.map((entry) =>
              entry.id === task.id ? task : entry,
            )
          : [...current.taskList, task],
      },
      exists ? '任务已保存' : '任务已添加',
    )
  }

  /** 更新任务字段。
   * @param id - 任务标识
   * @param patch - 修改字段
   * @returns 是否成功
   */
  const updateTaskHandler = (id: string, patch: Partial<TaskItem>): boolean => {
    const task = dataRef.current.taskList.find((entry) => entry.id === id)
    return task ? saveTaskHandler({ ...task, ...patch }) : false
  }

  /** 完成或重新打开任务，未完成步骤须明确确认。
   * @param id - 任务标识
   * @param includeSteps - 是否已确认完成所有步骤
   * @returns 是否成功或正在等待确认
   */
  const toggleTaskHandler = (id: string, includeSteps = false): boolean => {
    const current = dataRef.current
    const task = current.taskList.find((entry) => entry.id === id)
    if (!task) return false
    if (
      task.status !== 'completed' &&
      task.subtasks.some((step) => !step.completed) &&
      !includeSteps
    ) {
      setPendingCompletionId(id)
      return false
    }
    const next = updateTaskCompletion(task, task.status !== 'completed')
    const saved = commitHandler(
      {
        ...current,
        taskList: current.taskList.map((entry) =>
          entry.id === id ? next : entry,
        ),
      },
      next.status === 'completed' ? '做得好，又完成了一项' : '任务已重新打开',
      true,
    )
    if (saved) setPendingCompletionId(null)
    return saved
  }

  /** 删除任务并提供撤销。
   * @param id - 标识
   * @returns 是否成功
   */
  const deleteTaskHandler = (id: string): boolean =>
    commitHandler(
      {
        ...dataRef.current,
        taskList: dataRef.current.taskList.filter((task) => task.id !== id),
      },
      '任务已删除',
      true,
    )

  /** 调整组内任务顺序。
   * @param ids - 当前组
   * @param id - 目标
   * @param direction - 方向
   * @returns 无返回值；保存顺序
   */
  const moveTaskHandler = (
    ids: string[],
    id: string,
    direction: number,
  ): void => {
    const next = moveTaskList(dataRef.current.taskList, ids, id, direction)
    if (next !== dataRef.current.taskList)
      commitHandler({ ...dataRef.current, taskList: next }, '顺序已调整', true)
  }

  /** 保存项目。
   * @param project - 项目
   * @returns 是否成功
   */
  const saveProjectHandler = (project: TaskProject): boolean => {
    const current = dataRef.current
    const exists = current.projectList.some((entry) => entry.id === project.id)
    return commitHandler(
      {
        ...current,
        projectList: exists
          ? current.projectList.map((entry) =>
              entry.id === project.id ? project : entry,
            )
          : [...current.projectList, project],
      },
      '项目已保存',
    )
  }

  /** 删除项目，按明确选择处理任务。
   * @param id - 项目
   * @param deleteTasks - 是否删除任务
   * @returns 是否成功
   */
  const deleteProjectHandler = (id: string, deleteTasks: boolean): boolean =>
    commitHandler(
      removeProject(dataRef.current, id, deleteTasks),
      '项目已删除',
      true,
    )

  /** 保存项目阶段。
   * @param section - 阶段
   * @returns 是否成功
   */
  const saveSectionHandler = (section: TaskSection): boolean => {
    const current = dataRef.current
    const exists = current.sectionList.some((entry) => entry.id === section.id)
    return commitHandler(
      {
        ...current,
        sectionList: exists
          ? current.sectionList.map((entry) =>
              entry.id === section.id ? section : entry,
            )
          : [...current.sectionList, section],
      },
      '阶段已保存',
    )
  }

  /** 调整同项目的阶段顺序。
   * @param id - 阶段
   * @param direction - 方向
   * @returns 无返回值；保存阶段顺序
   */
  const moveSectionHandler = (id: string, direction: -1 | 1): void => {
    const current = dataRef.current
    const section = current.sectionList.find((entry) => entry.id === id)
    if (!section) return
    const positions = current.sectionList.flatMap((entry, index) =>
      entry.projectId === section.projectId ? [index] : [],
    )
    const position = positions.findIndex(
      (index) => current.sectionList[index].id === id,
    )
    const target = positions[position + direction]
    if (target === undefined) return
    const next = [...current.sectionList]
    ;[next[positions[position]], next[target]] = [
      next[target],
      next[positions[position]],
    ]
    commitHandler({ ...current, sectionList: next }, '阶段顺序已调整', true)
  }

  /** 主动加载标注的本地示例，仅用于空工作区。
   * @param 无参数
   * @returns 无返回值；保存示例
   */
  const loadDemoHandler = (): void => {
    if (!dataRef.current.taskList.length && !dataRef.current.projectList.length)
      commitHandler(buildDemoPlannerData(today), '已加载本地示例计划')
  }

  /** 将演示计划保留为自己的计划。
   * @param 无参数
   * @returns 无返回值；更新示例标识，不删除任务
   */
  const keepDemoHandler = (): void => {
    commitHandler({ ...dataRef.current, isDemo: false }, '已保留为你的计划')
  }

  return {
    data,
    today,
    isLoading,
    isReadError,
    error,
    pendingCompletionId,
    setPendingCompletionId,
    loadHandler,
    saveTaskHandler,
    updateTaskHandler,
    toggleTaskHandler,
    deleteTaskHandler,
    moveTaskHandler,
    saveProjectHandler,
    deleteProjectHandler,
    saveSectionHandler,
    moveSectionHandler,
    loadDemoHandler,
    keepDemoHandler,
  }
}

export type TaskPlanner = ReturnType<typeof useTaskPlanner>
