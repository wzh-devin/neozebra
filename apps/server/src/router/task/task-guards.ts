import { createHash, randomBytes } from 'node:crypto'
import type { ErrorHandler, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getSignedCookie, setSignedCookie } from 'hono/cookie'
import { z } from 'zod'
import { getDatabase } from '../../infrastructure/database/database-client.ts'
import type { TaskEnv } from '../../dto/task/task-dto.ts'

// 存储异常不向浏览器暴露数据库连接配置或原始请求。
const taskErrorHandler: ErrorHandler = (error, context) => {
  const status =
    error instanceof HTTPException
      ? error.status
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? 400
        : 503
  const message =
    error instanceof HTTPException
      ? error.message
      : status === 400
        ? '计划格式或关联无效，请检查后重试。'
        : '任务存储暂不可用，请检查 PostgreSQL、Redis 与数据库迁移。'
  return context.json({ error: { message } }, status)
}

/**
 * 隔离浏览器个人计划并校验写请求来源。
 *
 * @param context - 请求上下文
 * @param next - 后续路由
 * @returns 响应；签发独立的 Task 会话 cookie
 */
const taskSessionGuard: MiddlewareHandler<TaskEnv> = async (context, next) => {
  context.header('Cache-Control', 'no-store')
  const db = getDatabase()
  const origin = context.req.header('Origin')
  if (
    (origin && origin !== db.config.origin) ||
    (!['GET', 'HEAD'].includes(context.req.method) &&
      origin !== db.config.origin)
  )
    throw new HTTPException(403, {
      message: '请从配置的 Neozebra 页面访问任务。',
    })
  let session = await getSignedCookie(
    context,
    db.config.key,
    'neozebra_task_session',
  )
  if (!session) {
    if (context.req.method !== 'GET' && context.req.method !== 'HEAD')
      throw new HTTPException(401, {
        message: '任务会话已失效，请刷新页面后重试。',
      })
    session = randomBytes(32).toString('hex')
    await setSignedCookie(
      context,
      'neozebra_task_session',
      session,
      db.config.key,
      {
        httpOnly: true,
        secure: db.config.origin.startsWith('https:'),
        sameSite: 'Lax',
        path: '/api/task',
        maxAge: 365 * 24 * 60 * 60,
      },
    )
  }
  context.set('owner', createHash('sha256').update(session).digest('hex'))
  await next()
}

export { taskErrorHandler, taskSessionGuard }
