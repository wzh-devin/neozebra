import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { DriveEnv } from '../../dto/drive/drive-dto.ts'
import { entryIdDto } from '../../dto/drive/drive-dto.ts'
import type { AssetsDependencies } from '../../infrastructure/drive/types.ts'
import {
  createDrivePreviewService,
  getPreviewPath,
} from '../../infrastructure/drive/drive-preview-service.ts'
import { isPreviewSourceAuthorized } from '../../infrastructure/drive/drive-office.ts'

/**
 * 暴露浏览器会话API与引擎专用只读源路由，票据不授予目录或其他文件权限。
 *
 * @param dependencies - 基础设施
 * @returns 创建、轮询和GET/HEAD/Range快照处理函数
 */
const createDrivePreviewController = (dependencies: AssetsDependencies) => {
  const service = createDrivePreviewService(dependencies)
  const createPreviewHandler = async (context: Context<DriveEnv>) =>
    context.json(
      await service.createTask(
        context.get('owner'),
        z.string().uuid().parse(context.req.param('id')),
        entryIdDto.parse(context.req.param('entryId')),
      ),
      202,
    )
  const getPreviewHandler = async (context: Context<DriveEnv>) =>
    context.json(
      await service.getSession(
        context.get('owner'),
        z.string().uuid().parse(context.req.param('id')),
        z.string().uuid().parse(context.req.param('previewId')),
      ),
    )
  const sourceHandler = async (context: Context<DriveEnv>) => {
    const publicId = z.string().uuid().parse(context.req.param('previewId'))
    const db = dependencies.getInfrastructure()
    if (
      !isPreviewSourceAuthorized(
        publicId,
        context.req.query('ticket') ?? '',
        db.key,
      )
    )
      throw new HTTPException(403, {
        message: 'This preview source ticket is invalid or expired.',
      })
    const task = await db.store.drivePreviewTask.findFirst({
      where: { publicId, status: 'ready' },
    })
    if (!task)
      throw new HTTPException(404, {
        message: 'This preview source is unavailable.',
      })
    await service.assertConnection(task)
    const path = getPreviewPath(dependencies, task)
    const file = await stat(path).catch(() => null)
    if (!file || BigInt(file.size) !== task.sizeBytes)
      throw new HTTPException(410, {
        message: 'This preview source expired. Reopen the file.',
      })
    let start = 0
    let end = file.size - 1
    const range = context.req.header('Range')
    const headers = new Headers({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition':
        "attachment; filename*=UTF-8''" + encodeURIComponent(task.name),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      ETag: '"' + task.contentHash + '"',
    })
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': 'bytes */' + file.size },
        })
      if (match[1]) {
        start = Number(match[1])
        end = match[2] ? Math.min(Number(match[2]), end) : end
      } else start = Math.max(0, file.size - Number(match[2]))
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= file.size
      )
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': 'bytes */' + file.size },
        })
      headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`)
    }
    headers.set('Content-Length', String(end - start + 1))
    return new Response(
      context.req.method === 'HEAD'
        ? null
        : (Readable.toWeb(
            createReadStream(path, { start, end }),
          ) as ReadableStream<Uint8Array>),
      { status: range ? 206 : 200, headers },
    )
  }
  return { createPreviewHandler, getPreviewHandler, sourceHandler }
}
export { createDrivePreviewController }
