import { createHash, randomBytes } from 'node:crypto'
import type { ErrorHandler, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getSignedCookie, setSignedCookie } from 'hono/cookie'
import { z } from 'zod'
import { getDatabase } from '../../infrastructure/database/database-client.ts'
import type { InboxEnv } from '../../dto/inbox/inbox-dto.ts'

// 上游异常可能携带令牌，仅返回固定错误且不记录原始异常。
const inboxErrorHandler: ErrorHandler = (error, context) => {
  const status =
    error instanceof HTTPException
      ? error.status
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? 400
        : 503
  const message =
    error instanceof HTTPException
      ? error.message
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? 'Invalid mailbox request.'
        : 'Inbox storage unavailable. Check PostgreSQL, Redis and run the database migration.'
  return context.json({ error: { message } }, status)
}

/**
 * 绑定签名会话并限制来源，邮箱和邮件始终按该会话查询。
 *
 * @param context - Hono 请求上下文
 * @param next - 后续路由
 * @returns 后续响应；会话 cookie 仅由服务端签发
 */
const inboxSessionGuard: MiddlewareHandler<InboxEnv> = async (
  context,
  next,
) => {
  context.header('Cache-Control', 'no-store')
  try {
    const db = getDatabase()
    const origin = context.req.header('Origin')
    if (
      (origin && origin !== db.config.origin) ||
      (context.req.method !== 'GET' &&
        context.req.method !== 'HEAD' &&
        origin !== db.config.origin)
    )
      throw new HTTPException(403, {
        message: 'Use the configured Neozebra origin for mailbox requests.',
      })
    let session = await getSignedCookie(
      context,
      db.config.key,
      'neozebra_mail_session',
    )
    if (!session) {
      session = randomBytes(32).toString('hex')
      await setSignedCookie(
        context,
        'neozebra_mail_session',
        session,
        db.config.key,
        {
          httpOnly: true,
          secure: db.config.origin.startsWith('https:'),
          sameSite: 'Lax',
          path: '/api/inbox',
          maxAge: 365 * 24 * 60 * 60,
        },
      )
    }
    context.set('owner', createHash('sha256').update(session).digest('hex'))
    await next()
  } catch (error) {
    return inboxErrorHandler(error as Error, context)
  }
}

export { inboxErrorHandler, inboxSessionGuard }
