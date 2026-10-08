import { createContext, useContext } from 'react'
import type { TaskPlanner } from '@/features/tasks/hooks/useTaskPlanner'

export const TaskPlannerContext = createContext<TaskPlanner | null>(null)

/** 读取当前 Task 工作区的唯一状态。
 * @param 无参数
 * @returns 规划状态和操作
 */
export const useTaskPlannerContext = (): TaskPlanner => {
  const context = useContext(TaskPlannerContext)
  if (!context) throw new Error('Task 组件必须位于规划工作区内')
  return context
}
