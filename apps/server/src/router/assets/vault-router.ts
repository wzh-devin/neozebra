import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { proxy } from 'hono/proxy'

/**
 * 将 Vault 路由转发给内部 Go 模块，保持请求和响应流。
 *
 * @param environment - 网关监听的内部模块地址
 * @returns 挂载于 /api/assets/vault 的网关路由
 */
const createVaultRouter = (environment: NodeJS.ProcessEnv = process.env) => {
  const target = new URL(
    environment.VAULT_API_TARGET ?? 'http://127.0.0.1:3001',
  )
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  ) {
    throw new Error('VAULT_API_TARGET must be an HTTP origin')
  }
  const forwardRequestHandler = async (context: Context) => {
    const source = new URL(context.req.url)
    const headers = new Headers(context.req.raw.headers)
    headers.delete('host')
    try {
      return await proxy(target.origin + source.pathname + source.search, {
        raw: new Request(context.req.raw, { headers }),
        redirect: 'manual',
      })
    } catch (error) {
      if (context.req.raw.signal.aborted) throw error
      const requestId = randomUUID()
      return context.json(
        {
          error: {
            code: 'VAULT_UNAVAILABLE',
            message: '文件库暂时不可用，请重试',
            retryable: true,
            requestId,
          },
        },
        503,
        { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' },
      )
    }
  }
  return new Hono().all('*', forwardRequestHandler)
}

export { createVaultRouter }
