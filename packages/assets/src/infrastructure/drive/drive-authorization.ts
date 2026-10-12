import { randomBytes } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import type {
  DriveConnectionDraft,
  DriveOAuthProvider,
  DriveOAuthStart,
} from '../../dto/drive/drive-dto.ts'
import { normalizeRootPath } from './drive-utils.ts'
import { exchangeDriveToken } from './oauth-token.ts'
import type { createDriveService } from './drive-service.ts'
import type { AssetsDependencies, DriveCredentials } from './types.ts'

type PendingAuthorization = {
  provider: DriveOAuthProvider
  draft: DriveConnectionDraft
  connectionId?: string
  credentials: DriveCredentials
  redirectUri: string
}

/**
 * 将官方浏览器授权绑定当前 Drive 会话；临时状态只保存在 Redis。
 *
 * @param dependencies - 网关注入的应用配置、基础设施与加密方法
 * @param service - 现有连接服务，负责锁、根目录验证及凭据持久化
 * @returns 授权发起与一次性回调操作
 */
const createDriveAuthorization = (
  dependencies: AssetsDependencies,
  service: ReturnType<typeof createDriveService>,
) => {
  /**
   * 校验挂载与应用配置，保存一次性授权上下文并构造固定官方地址。
   *
   * @param owner - 签名会话的归属标识
   * @param provider - 官方云盘类型
   * @param input - 新建或重新授权的挂载配置
   * @returns 官方登录地址；写入有时限的加密 Redis 状态
   */
  const startAuthorization = async (
    owner: string,
    provider: DriveOAuthProvider,
    input: DriveOAuthStart,
  ): Promise<string> => {
    const application = dependencies.getOAuthApplication?.(provider)
    if (!application?.clientId || !application.clientSecret)
      throw new HTTPException(503, {
        message: `Configure ${provider === 'baidu' ? 'BAIDU' : 'ALIYUN'}_DRIVE_CLIENT_ID and ${provider === 'baidu' ? 'BAIDU' : 'ALIYUN'}_DRIVE_CLIENT_SECRET in apps/server/.env before authorizing.`,
      })
    const common = {
      name: input.name,
      revision: input.revision,
      rootPath: normalizeRootPath(input.rootPath),
    }
    const draft: DriveConnectionDraft =
      provider === 'baidu'
        ? { ...common, providerId: 'baidu' }
        : { ...common, providerId: 'aliyun', driveType: input.driveType }
    if (input.connectionId)
      await service.validateConnection(owner, draft, input.connectionId)
    const db = dependencies.getInfrastructure()
    await db.connectRedis()
    const state = randomBytes(32).toString('hex')
    const redirectUri = `${db.origin}/api/assets/drive/oauth/${provider}/callback`
    const pending: PendingAuthorization = {
      provider,
      draft,
      connectionId: input.connectionId,
      credentials: application,
      redirectUri,
    }
    await db.redis.set(
      `drive:oauth:${owner}:${provider}:${state}`,
      dependencies.encryptCredentials(pending, db.key),
      { EX: 600 },
    )
    const url = new URL(
      provider === 'baidu'
        ? 'https://openapi.baidu.com/oauth/2.0/authorize'
        : 'https://openapi.alipan.com/oauth/authorize',
    )
    url.search = new URLSearchParams({
      client_id: application.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope:
        provider === 'baidu'
          ? 'basic,netdisk'
          : 'user:base,file:all:read,file:all:write',
      state,

      // 每次绑定明确选择账号，避免官方站点 Cookie 自动沿用上一个账号。
      ...(provider === 'baidu'
        ? { display: 'page', qrcode: '1', force_login: '1' }
        : { relogin: 'true' }),
    }).toString()
    return url.toString()
  }

  /**
   * 一次性消费同会话的授权状态，兑换并验证凭据后交给连接服务保存。
   *
   * @param owner - 原发起会话的归属标识
   * @param provider - 回调路径中的云盘类型
   * @param callback - 已校验的 state 和授权码或取消错误
   * @returns 成功或取消；删除 Redis 状态，成功时加密写入 PostgreSQL
   */
  const finishAuthorization = async (
    owner: string,
    provider: DriveOAuthProvider,
    callback: { state: string; code?: string; error?: string },
  ): Promise<'success' | 'cancelled'> => {
    const db = dependencies.getInfrastructure()
    await db.connectRedis()
    const encrypted = await db.redis.getDel(
      `drive:oauth:${owner}:${provider}:${callback.state}`,
    )
    if (!encrypted)
      throw new HTTPException(410, {
        message: 'Authorization expired. Start again from Drive.',
      })
    const pending = dependencies.decryptCredentials<PendingAuthorization>(
      encrypted,
      db.key,
    )
    if (pending.provider !== provider)
      throw new HTTPException(410, { message: 'Invalid authorization state.' })
    if (callback.error === 'access_denied') return 'cancelled'
    if (callback.error || !callback.code)
      throw new HTTPException(400, {
        message: 'Authorization was unsuccessful.',
      })
    if (pending.connectionId)
      await service.validateConnection(
        owner,
        pending.draft,
        pending.connectionId,
      )
    const authorization = await exchangeDriveToken(
      provider,
      pending.credentials,
      {
        grant_type: 'authorization_code',
        code: callback.code,
        redirect_uri: pending.redirectUri,
      },
    )
    await service.saveConnection(
      owner,
      pending.draft,
      pending.connectionId,
      authorization,
    )
    return 'success'
  }
  return { startAuthorization, finishAuthorization }
}
export { createDriveAuthorization }
