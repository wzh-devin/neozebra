import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  buildEmptyPlannerData,
  getLocalDate,
  isPlannerData,
  moveTaskList,
  removeProject,
  updateTaskCompletion,
} from '@/features/tasks/data/task-planner'
import {
  getTaskPlanner,
  saveTaskPlanner,
  TaskRequestError,
} from '@/services/task'
import type {
  TaskItem,
  TaskPlannerData,
  TaskProject,
  TaskSection,
} from '@/features/tasks/types'

/**
 * 管理唯一规划状态、服务端保存与可撤销操作。
 *
 * @param 无参数
 * @returns 规划状态和业务操作
 */
export const useTaskPlanner = () => {
  const [data, setData] = useState<TaskPlannerData>(buildEmptyPlannerData)
  const dataRef = useRef(data)
  const revisionRef = useRef<number | null>(null)
  const loadedRef = useRef(false)
  const loadingRef = useRef(false)
  const savingRef = useRef(false)
  const activeRef = useRef(false)
  const generationRef = useRef(0)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isReadError, setIsReadError] = useState(false)
  const [error, setError] = useState('')
  const [today, setToday] = useState(getLocalDate)
  const [pendingCompletionId, setPendingCompletionId] = useState<string | null>(
    null,
  )

  /**
   * 读取服务端计划，不自动导入浏览器旧数据。
   *
   * @param 无参数
   * @returns 无返回值；更新状态，失败保留原数据
   */
  const loadHandler = async (): Promise<void> => {
    if (loadingRef.current || savingRef.current) return
    loadingRef.current = true
    if (!loadedRef.current) setIsLoading(true)
    const generation = ++generationRef.current
    try {
      const response = await getTaskPlanner()
      if (!isPlannerData(response.data))
        throw new Error('计划响应格式无效，原数据已保留。')
      if (!activeRef.current || generation !== generationRef.current) return
      if (revisionRef.current !== response.revision) {
        dataRef.current = response.data
        setData(response.data)
        revisionRef.current = response.revision
      }
      loadedRef.current = true
      setError('')
      setIsReadError(false)
    } catch (cause) {
      if (!activeRef.current || generation !== generationRef.current) return
      setIsReadError(!loadedRef.current)
      setError(
        cause instanceof Error
          ? cause.message
          : '无法读取计划，原数据已保留，请重试。',
      )
    } finally {
      if (activeRef.current && generation === generationRef.current) {
        loadingRef.current = false
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    activeRef.current = true
    loadingRef.current = false

    // oxlint-disable-next-line react/set-state-in-effect -- 挂载后读取服务端数据，异步请求不能在渲染期间执行。
    void loadHandler()
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel('neozebra.task-planner')
    channelRef.current = channel

    // 后台标签页保存后重新读取；忙碌时由版本校验阻止过期写入。
    const refreshHandler = (): void => {
      void loadHandler()
    }
    channel?.addEventListener('message', refreshHandler)
    window.addEventListener('focus', refreshHandler)
    return () => {
      activeRef.current = false
      channel?.close()
      channelRef.current = null
      window.removeEventListener('focus', refreshHandler)
    }
  }, [])

  useEffect(() => {
    // 跨日或恢复窗口时更新今天。
    const refreshDateHandler = (): void => setToday(getLocalDate())
    const timer = window.setInterval(refreshDateHandler, 60000)
    window.addEventListener('focus', refreshDateHandler)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshDateHandler)
    }
  }, [])

  /**
   * 先保存再更新界面，保存失败时让调用方保留输入。
   *
   * @param next - 下一份规划
   * @param message - 成功反馈
   * @param allowUndo - 是否允许撤销
   * @returns 是否保存成功
   */
  const commitHandler = async (
    next: TaskPlannerData,
    message: string,
    allowUndo = false,
  ): Promise<boolean> => {
    if (
      loadingRef.current ||
      savingRef.current ||
      revisionRef.current === null ||
      isReadError
    ) {
      toast.info('计划正在读取或保存，请稍后重试。')
      return false
    }
    if (!isPlannerData(next)) {
      toast.error('请检查标题、日期、预计用时和项目关联。')
      return false
    }
    const previous = dataRef.current
    savingRef.current = true
    setIsSaving(true)
    try {
      const response = await saveTaskPlanner(next, revisionRef.current)
      if (!isPlannerData(response.data))
        throw new Error('保存响应无效，请重新读取核对，草稿已保留。')
      revisionRef.current = response.revision
      dataRef.current = response.data
      if (!activeRef.current) return true
      setData(response.data)
      setError('')
      channelRef.current?.postMessage(response.revision)
      const savedData = response.data

      /**
       * 仅撤销最近更改，服务端版本检查保护其他页面的更新。
       *
       * @param 无参数
       * @returns 无返回值；恢复上次数据或提示无法撤销
       */
      const undoHandler = (): void => {
        if (dataRef.current !== savedData) {
          toast.info('已有后续更改，无法直接撤销这次操作。')
          return
        }
        void commitHandler(previous, '已撤销')
      }
      toast.success(message, {
        id: 'task-planner-change',
        duration: allowUndo ? 12000 : 4000,
        action: allowUndo ? { label: '撤销', onClick: undoHandler } : undefined,
      })
      return true
    } catch (cause) {
      if (!activeRef.current) return false
      const message =
        cause instanceof Error
          ? cause.message
          : '保存未确认，请重新读取核对；草稿已保留。'
      setError(message)
      toast.error(message)
      if (cause instanceof TaskRequestError && cause.status === 409) {
        savingRef.current = false
        await loadHandler()
      }
      return false
    } finally {
      savingRef.current = false
      if (activeRef.current) setIsSaving(false)
    }
  }

  /**
   * 保存新增或编辑任务。
   *
   * @param task - 完整任务
   * @returns 是否成功
   */
  const saveTaskHandler = (task: TaskItem): Promise<boolean> => {
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

  // 更新任务字段。
  const updateTaskHandler = async (
    id: string,
    patch: Partial<TaskItem>,
  ): Promise<boolean> => {
    const task = dataRef.current.taskList.find((entry) => entry.id === id)
    return task ? saveTaskHandler({ ...task, ...patch }) : false
  }

  /**
   * 保存甘特图日期调整，并允许撤销最近一次改动。
   *
   * @param id - 任务标识
   * @param dates - 校验后的本地计划与截止日期
   * @returns 是否成功；失败时保留原计划并显示现有错误提示
   */
  const rescheduleTaskHandler = async (
    id: string,
    dates: Pick<TaskItem, 'plannedDate' | 'deadlineDate'>,
  ): Promise<boolean> => {
    const current = dataRef.current
    const task = current.taskList.find((entry) => entry.id === id)
    if (!task) return false
    if (
      task.plannedDate === dates.plannedDate &&
      task.deadlineDate === dates.deadlineDate
    )
      return true
    return commitHandler(
      {
        ...current,
        taskList: current.taskList.map((entry) =>
          entry.id === id ? { ...entry, ...dates } : entry,
        ),
      },
      '任务日期已调整',
      true,
    )
  }

  /**
   * 完成或重新打开任务，未完成步骤须明确确认。
   *
   * @param id - 任务标识
   * @param includeSteps - 是否已确认完成所有步骤
   * @returns 是否成功或正在等待确认
   */
  const toggleTaskHandler = async (
    id: string,
    includeSteps = false,
  ): Promise<boolean> => {
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
    const saved = await commitHandler(
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

  /**
   * 删除任务并提供撤销。
   *
   * @param id - 标识
   * @returns 是否成功
   */
  const deleteTaskHandler = (id: string): Promise<boolean> =>
    commitHandler(
      {
        ...dataRef.current,
        taskList: dataRef.current.taskList.filter((task) => task.id !== id),
      },
      '任务已删除',
      true,
    )

  /**
   * 调整组内任务顺序。
   *
   * @param ids - 当前组
   * @param id - 目标
   * @param direction - 方向
   * @returns 是否保存成功；成功后更新顺序
   */
  const moveTaskHandler = async (
    ids: string[],
    id: string,
    direction: number,
  ): Promise<boolean> => {
    const next = moveTaskList(dataRef.current.taskList, ids, id, direction)
    if (next !== dataRef.current.taskList)
      return commitHandler(
        { ...dataRef.current, taskList: next },
        '顺序已调整',
        true,
      )
    return false
  }

  /**
   * 保存项目。
   *
   * @param project - 项目
   * @returns 是否成功
   */
  const saveProjectHandler = (project: TaskProject): Promise<boolean> => {
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

  /**
   * 删除项目，按明确选择处理任务。
   *
   * @param id - 项目
   * @param deleteTasks - 是否删除任务
   * @returns 是否成功
   */
  const deleteProjectHandler = (
    id: string,
    deleteTasks: boolean,
  ): Promise<boolean> =>
    commitHandler(
      removeProject(dataRef.current, id, deleteTasks),
      '项目已删除',
      true,
    )

  /**
   * 保存项目阶段。
   *
   * @param section - 阶段
   * @returns 是否成功
   */
  const saveSectionHandler = (section: TaskSection): Promise<boolean> => {
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

  /**
   * 调整同项目的阶段顺序。
   *
   * @param id - 阶段
   * @param direction - 方向
   * @returns 无返回值；保存阶段顺序
   */
  const moveSectionHandler = async (
    id: string,
    direction: -1 | 1,
  ): Promise<void> => {
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
    await commitHandler(
      { ...current, sectionList: next },
      '阶段顺序已调整',
      true,
    )
  }

  return {
    data,
    today,
    isLoading,
    isSaving,
    isReadError,
    error,
    pendingCompletionId,
    setPendingCompletionId,
    loadHandler,
    saveTaskHandler,
    updateTaskHandler,
    rescheduleTaskHandler,
    toggleTaskHandler,
    deleteTaskHandler,
    moveTaskHandler,
    saveProjectHandler,
    deleteProjectHandler,
    saveSectionHandler,
    moveSectionHandler,
  }
}

export type TaskPlanner = ReturnType<typeof useTaskPlanner>
