import { Hono } from 'hono'
import type { ErrorHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { createApiRouter } from './router/index.ts'

// 未知异常只记录在服务端，避免将内部信息写入 API 响应。
const errorHandler: ErrorHandler = (error, context) => {
  if (error instanceof HTTPException) {
    return error.getResponse()
  }

  console.error(error)
  return context.json(
    {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    },
    500,
  )
}

const notFoundHandler: NotFoundHandler = (context) =>
  context.json(
    { error: { code: 'NOT_FOUND', message: 'Route not found' } },
    404,
  )

/**
 * 创建 API 网关并挂载默认路由和独立菜单组模块，不启动网络监听。
 *
 * @param 无参数
 * @returns 已注册路由和错误处理的 Hono 应用
 */
const createApp = () => {
  const app = new Hono()

  app.onError(errorHandler)
  app.notFound(notFoundHandler)
  app.route('/api', createApiRouter())

  return app
}

export { createApp }
