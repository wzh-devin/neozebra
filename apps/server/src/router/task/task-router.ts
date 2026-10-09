import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { TaskEnv } from '../../dto/task/task-dto.ts'
import { createTaskController } from '../../controller/task/task-controller.ts'
import { taskErrorHandler, taskSessionGuard } from './task-guards.ts'

/**
 * 注册个人任务计划的读取、保存与信任边界。
 *
 * @param 无参数
 * @returns Task 路由
 */
const createTaskRouter = () => {
  const router = new Hono<TaskEnv>()
  const controller = createTaskController()
  router.onError(taskErrorHandler)
  router.use('*', bodyLimit({ maxSize: 2 * 1024 * 1024 }))
  router.use('*', taskSessionGuard)
  router.get('/planner', controller.getPlannerHandler)
  router.put('/planner', controller.savePlannerHandler)
  return router
}

export { createTaskRouter }
