import type { TaskPlannerData } from '@/features/tasks/types'

type TaskPlannerResponse = { data: unknown; revision: number }
class TaskRequestError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * 读取或保存个人计划；只解包协议，计划结构由 feature 校验。
 *
 * @param input - 保存数据；省略时读取
 * @returns 服务端计划与版本；失败抛出安全错误
 */
const requestTaskPlanner = async (input?: {
  data: TaskPlannerData
  revision: number
}): Promise<TaskPlannerResponse> => {
  let response: Response
  try {
    response = await fetch('/api/task/planner', {
      method: input ? 'PUT' : 'GET',
      credentials: 'same-origin',
      headers: input ? { 'Content-Type': 'application/json' } : undefined,
      body: input ? JSON.stringify(input) : undefined,
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new TaskRequestError(
      '无法确认任务请求结果，请检查连接后重新读取计划。',
      0,
    )
  }
  const body = await response.json().catch(() => null)
  if (!response.ok)
    throw new TaskRequestError(
      typeof body?.error?.message === 'string'
        ? body.error.message
        : '任务请求失败，请稍后重试。',
      response.status,
    )
  if (
    !body ||
    !Number.isInteger(body.revision) ||
    body.revision < 0 ||
    body.revision > 2147483647 ||
    !('data' in body)
  )
    throw new TaskRequestError('任务响应格式无效，原计划已保留。', 0)
  return { data: body.data, revision: body.revision }
}

// 初次读取共享请求，避免多个挂载在 cookie 签发前创建不同工作区。
let readRequest: Promise<TaskPlannerResponse> | undefined
const getTaskPlanner = (): Promise<TaskPlannerResponse> => {
  readRequest ??= requestTaskPlanner().finally(() => {
    readRequest = undefined
  })
  return readRequest
}
const saveTaskPlanner = (
  data: TaskPlannerData,
  revision: number,
): Promise<TaskPlannerResponse> => requestTaskPlanner({ data, revision })

export { getTaskPlanner, saveTaskPlanner, TaskRequestError }
