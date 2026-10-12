import { z } from 'zod'
import type { DriveOAuthProvider } from '../../dto/drive/drive-dto.ts'
import { providerError } from './drive-utils.ts'
import { readProviderJson } from './providers/oauth-request.ts'
import type { DriveCredentials } from './types.ts'

type DriveAuthorization = {
  credentials: DriveCredentials
  expiresAt: Date
}
type TokenGrant =
  | { grant_type: 'authorization_code'; code: string; redirect_uri: string }
  | { grant_type: 'refresh_token' }

/**
 * 使用固定官方接口兑换或续期令牌，不将凭据和上游错误暴露给浏览器。
 *
 * @param provider - 百度或阿里云盘
 * @param credentials - 仅服务端持有的应用凭据和现有令牌
 * @param grant - 授权码及原回调，或刷新令牌请求
 * @returns 新凭据及到期时间；调用方负责加密持久化
 */
const exchangeDriveToken = async (
  provider: DriveOAuthProvider,
  credentials: DriveCredentials,
  grant: TokenGrant,
): Promise<DriveAuthorization> => {
  const parameters: Record<string, string> = {
    client_id: credentials.clientId ?? '',
    client_secret: credentials.clientSecret ?? '',
    ...grant,
  }
  if (grant.grant_type === 'refresh_token')
    parameters.refresh_token = credentials.refreshToken ?? ''
  const url = new URL(
    provider === 'baidu'
      ? 'https://openapi.baidu.com/oauth/2.0/token'
      : 'https://openapi.alipan.com/oauth/access_token',
  )
  const init: RequestInit = {
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  }
  if (provider === 'baidu') {
    url.search = new URLSearchParams(parameters).toString()
    init.method = 'GET'
  } else {
    // 阿里服务端兑换接口不接收 redirect_uri，回调由发起授权时固定。
    delete parameters.redirect_uri
    init.method = 'POST'
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(parameters)
  }
  const response = await fetch(url, init)
  const result = z
    .object({
      access_token: z.string().min(1).max(8192),
      refresh_token: z.string().min(1).max(8192),
      expires_in: z
        .number()
        .positive()
        .max(366 * 86400),
    })
    .safeParse(await readProviderJson(response))
  if (!response.ok || !result.success) throw providerError(401)
  return {
    credentials: {
      ...credentials,
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token,
    },
    expiresAt: new Date(Date.now() + result.data.expires_in * 1000),
  }
}
export { exchangeDriveToken }
export type { DriveAuthorization }
