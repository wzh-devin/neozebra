import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import { providerError } from '../drive-utils.ts'
import type { ProviderContext } from '../types.ts'

/**
 * 读取有界JSON响应，保留百度64位文件标识，拒绝异常或过大的上游正文。
 *
 * @param response - 上游HTTP响应
 * @returns 待按接口schema验证的数据
 */
const readProviderJson = async (response: Response): Promise<unknown> => {
  const reader = response.body?.getReader()
  if (!reader) throw providerError()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 2 * 1024 * 1024) throw providerError()
      chunks.push(value)
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    return JSON.parse(
      raw.replace(/("(?:fs_id|taskid)"\s*:\s*)(\d+)(?=[,\s}])/g, '$1"$2"'),
    ) as unknown
  } catch {
    throw providerError()
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}
const errorDto = z
  .object({
    errno: z.number().optional(),
    code: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough()

/**
 * 使用官方固定API地址，授权失效仅刷新一次，不自动重试不确定的写操作。
 *
 * @param context - 凭据、锁检查及持久化刷新操作
 * @param provider - 网盘服务类型
 * @returns 类型化HTTP请求方法
 */
const createOAuthRequest = (
  context: ProviderContext,
  provider: 'baidu' | 'aliyun',
) => {
  let credentials = context.credentials
  const request = async <T>(
    path: string,
    parameters: Record<string, unknown>,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<T> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      context.assertLease()
      const url = new URL(
        path,
        provider === 'baidu'
          ? 'https://pan.baidu.com'
          : 'https://openapi.alipan.com',
      )
      const headers = new Headers()
      let body: string | URLSearchParams | undefined
      if (provider === 'baidu') {
        url.searchParams.set('access_token', credentials.accessToken ?? '')
        const values = new URLSearchParams()
        for (const [key, value] of Object.entries(parameters))
          if (value !== undefined)
            values.set(
              key,
              typeof value === 'string'
                ? value
                : typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value),
            )
        if (method === 'GET')
          for (const [key, value] of values) url.searchParams.set(key, value)
        else body = values
      } else {
        headers.set('Authorization', `Bearer ${credentials.accessToken}`)
        headers.set('Content-Type', 'application/json')
        if (method === 'POST') body = JSON.stringify(parameters)
      }
      const response = await fetch(url, {
        method,
        headers,
        ...(method === 'POST' ? { body } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      })
      const payload = await readProviderJson(response)
      const error = errorDto.safeParse(payload)
      const errno = error.success ? error.data.errno : undefined
      const code = error.success
        ? (error.data.code ?? error.data.error)
        : undefined
      const expired =
        response.status === 401 ||
        [110, 111, 20016, 20017, 31045, -6].includes(errno ?? 0) ||
        [
          'AccessTokenExpired',
          'AccessTokenInvalid',
          'InvalidAccessToken',
          'InvalidToken',
        ].includes(code ?? '')
      if (
        code &&
        /upload.?id|upload.?session/i.test(code) &&
        /expired|invalid|notfound/i.test(code)
      )
        throw new HTTPException(410, {
          message:
            'The remote upload session expired. The saved file can be uploaded again.',
        })
      if (expired && !attempt && credentials.refreshToken) {
        credentials = await context.refreshCredentials(true)
        continue
      }
      if (
        expired ||
        !response.ok ||
        (errno !== undefined && errno !== 0) ||
        code
      )
        throw providerError(
          expired
            ? 401
            : errno === -9 || code === 'NotFound.File'
              ? 404
              : errno === -8 || code === 'AlreadyExist.File'
                ? 409
                : response.status,
        )
      const result = schema.safeParse(payload)
      if (!result.success) throw providerError()
      return result.data
    }
    throw providerError(401)
  }
  return request
}

export { createOAuthRequest, readProviderJson }
