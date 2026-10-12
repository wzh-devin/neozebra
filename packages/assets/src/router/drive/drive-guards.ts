import { createHash, randomBytes } from 'node:crypto'
import type { ErrorHandler, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getSignedCookie, setSignedCookie } from 'hono/cookie'
import { z } from 'zod'
import type { DriveEnv } from '../../dto/drive/drive-dto.ts'
import type { AssetsDependencies } from '../../infrastructure/drive/types.ts'

// 不把上游 SDK 错误、凭据或临时签名地址传回浏览器，也不写入日志。
const driveErrorHandler: ErrorHandler = (error, context) => {
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
        ? 'Invalid Drive request. Check the fields and retry.'
        : 'Drive is unavailable. Check the storage connection, PostgreSQL and Redis.'
  return context.json({ error: { message } }, status)
}

/**
 * 使用独立签名会话隔离 Drive 配置，并验证所有写操作来自配置的前端。
 *
 * @param dependencies - 网关注入的会话密钥与前端来源
 * @returns 设置 owner 的中间件；首次读取签发 HttpOnly cookie
 */
const createDriveSessionGuard =
  (dependencies: AssetsDependencies): MiddlewareHandler<DriveEnv> =>
  async (context, next) => {
    context.header('Cache-Control', 'no-store')
    const db = dependencies.getInfrastructure()
    const origin = context.req.header('Origin')
    if (
      (origin && origin !== db.origin) ||
      (!['GET', 'HEAD'].includes(context.req.method) && origin !== db.origin)
    )
      throw new HTTPException(403, {
        message: 'Open Drive from the configured Neozebra application.',
      })
    let session = await getSignedCookie(
      context,
      db.key,
      'neozebra_drive_session',
    )
    if (!session) {
      if (/\/oauth\/[^/]+\/callback$/.test(context.req.path)) {
        context.header('Referrer-Policy', 'no-referrer')
        return context.redirect(
          `${db.origin}/assets/drive?authorization=expired`,
          303,
        )
      }
      if (!['GET', 'HEAD'].includes(context.req.method))
        throw new HTTPException(401, {
          message: 'The Drive session expired. Reload the page.',
        })
      session = randomBytes(32).toString('hex')
      await setSignedCookie(
        context,
        'neozebra_drive_session',
        session,
        db.key,
        {
          httpOnly: true,
          secure: db.origin.startsWith('https:'),
          sameSite: 'Lax',
          path: '/api/assets/drive',
          maxAge: 365 * 86400,
        },
      )
    }
    context.set('owner', createHash('sha256').update(session).digest('hex'))
    await next()
  }
export { driveErrorHandler, createDriveSessionGuard }
