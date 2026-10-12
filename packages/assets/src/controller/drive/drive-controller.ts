import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import {
  driveConnectionDto,
  driveEntryPatchDto,
  driveFolderDto,
  driveSyncDto,
  driveListDto,
  entryIdDto,
  driveOAuthProviderDto,
  driveOAuthStartDto,
  driveOAuthCallbackDto,
} from '../../dto/drive/drive-dto.ts'
import type { DriveEnv } from '../../dto/drive/drive-dto.ts'
import { createDriveService } from '../../infrastructure/drive/drive-service.ts'
import { createDriveAuthorization } from '../../infrastructure/drive/drive-authorization.ts'
import type { AssetsDependencies } from '../../infrastructure/drive/types.ts'

const connectionIdDto = z.string().uuid()
const getId = (context: Context<DriveEnv>): string =>
  connectionIdDto.parse(context.req.param('id'))
const getEntryId = (context: Context<DriveEnv>): string =>
  entryIdDto.parse(context.req.param('entryId'))
const getJson = async (context: Context<DriveEnv>): Promise<unknown> => {
  const bytes = await context.req.raw.arrayBuffer()
  if (bytes.byteLength > 32 * 1024)
    throw new HTTPException(413, {
      message: 'Drive configuration is too large.',
    })
  return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown
}

/**
 * 将已校验的 HTTP 参数交给业务服务，文件内容流保持有界代理。
 *
 * @param dependencies - 网关注入的基础设施
 * @returns Drive 请求处理函数
 */
const createDriveController = (dependencies: AssetsDependencies) => {
  const service = createDriveService(dependencies)
  const authorization = createDriveAuthorization(dependencies, service)
  const startAuthorizationHandler = async (context: Context<DriveEnv>) =>
    context.json({
      url: await authorization.startAuthorization(
        context.get('owner'),
        driveOAuthProviderDto.parse(context.req.param('provider')),
        driveOAuthStartDto.parse(await getJson(context)),
      ),
    })
  const finishAuthorizationHandler = async (context: Context<DriveEnv>) => {
    context.header('Referrer-Policy', 'no-referrer')
    let result: string
    try {
      result = await authorization.finishAuthorization(
        context.get('owner'),
        driveOAuthProviderDto.parse(context.req.param('provider')),
        driveOAuthCallbackDto.parse(context.req.query()),
      )
    } catch (error) {
      result =
        error instanceof HTTPException && error.status === 410
          ? 'expired'
          : error instanceof HTTPException && error.status === 409
            ? 'conflict'
            : 'failed'
    }
    return context.redirect(
      `${dependencies.getInfrastructure().origin}/assets/drive?authorization=${result}`,
      303,
    )
  }
  const listConnectionsHandler = async (context: Context<DriveEnv>) =>
    context.json({
      connections: await service.listConnections(context.get('owner')),
    })
  const saveConnectionHandler = async (context: Context<DriveEnv>) =>
    context.json({
      connection: await service.saveConnection(
        context.get('owner'),
        driveConnectionDto.parse(await getJson(context)),
        context.req.method === 'PATCH' ? getId(context) : undefined,
      ),
    })
  const deleteConnectionHandler = async (context: Context<DriveEnv>) => {
    await service.deleteConnection(context.get('owner'), getId(context))
    return context.json({ ok: true })
  }
  const listEntriesHandler = async (context: Context<DriveEnv>) =>
    context.json(
      await service.listEntries(
        context.get('owner'),
        getId(context),
        driveListDto.parse(context.req.query()),
      ),
    )
  const syncHandler = async (context: Context<DriveEnv>) => {
    const value = driveSyncDto.parse(await getJson(context))
    return context.json(
      await service.requestSync(
        context.get('owner'),
        getId(context),
        value.parent,
        value.mode === 'refresh',
      ),
      202,
    )
  }
  const createFolderHandler = async (context: Context<DriveEnv>) => {
    const value = driveFolderDto.parse(await getJson(context))
    await service.createFolder(
      context.get('owner'),
      getId(context),
      value.parent,
      value.name,
    )
    return context.json({ ok: true })
  }
  const updateEntryHandler = async (context: Context<DriveEnv>) => {
    await service.updateEntry(
      context.get('owner'),
      getId(context),
      getEntryId(context),
      driveEntryPatchDto.parse(await getJson(context)),
    )
    return context.json({ ok: true })
  }
  const deleteEntryHandler = async (context: Context<DriveEnv>) => {
    await service.deleteEntry(
      context.get('owner'),
      getId(context),
      getEntryId(context),
    )
    return context.json({ ok: true })
  }
  const contentHandler = async (context: Context<DriveEnv>) => {
    const range = context.req.header('Range')
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))
      throw new HTTPException(400, { message: 'Use a single byte range.' })
    const { entry, response } = await service.getContent(
      context.get('owner'),
      getId(context),
      getEntryId(context),
      range,
    )
    const headers = new Headers({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Content-Disposition': `${context.req.query('download') === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(entry.name).replace(/['()*]/g, (value) => '%' + value.charCodeAt(0).toString(16))}`,
    })
    for (const key of [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
    ]) {
      const value = response.headers.get(key)
      if (value) headers.set(key, value)
    }
    const mime = headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    if (
      (!mime ||
        ['application/octet-stream', 'binary/octet-stream'].includes(mime)) &&
      (entry.mimeType?.toLowerCase().split(';')[0].trim() ===
        'application/pdf' ||
        /\.pdf$/i.test(entry.name))
    )
      headers.set('Content-Type', 'application/pdf')
    return new Response(response.body, { status: response.status, headers })
  }
  return {
    startAuthorizationHandler,
    finishAuthorizationHandler,
    listConnectionsHandler,
    saveConnectionHandler,
    deleteConnectionHandler,
    listEntriesHandler,
    syncHandler,
    createFolderHandler,
    updateEntryHandler,
    deleteEntryHandler,
    contentHandler,
  }
}
export { createDriveController }
