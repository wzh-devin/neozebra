import type { Context } from 'hono'
import { plannerSaveSchema, type TaskEnv } from '../../dto/task/task-dto.ts'
import { getDatabase } from '../../infrastructure/database/database-client.ts'
import {
  getTaskPlanner,
  saveTaskPlanner,
} from '../../infrastructure/task/task-repository.ts'

/**
 * 将个人计划请求交给 ORM 事务，创建时不连接外部服务。
 *
 * @param 无参数
 * @returns Task HTTP Controller
 */
const createTaskController = () => {
  const getPlannerHandler = async (context: Context<TaskEnv>) =>
    context.json(await getTaskPlanner(getDatabase(), context.get('owner')))
  const savePlannerHandler = async (context: Context<TaskEnv>) =>
    context.json(
      await saveTaskPlanner(
        getDatabase(),
        context.get('owner'),
        plannerSaveSchema.parse(await context.req.json()),
      ),
    )
  return { getPlannerHandler, savePlannerHandler }
}

export { createTaskController }
