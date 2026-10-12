import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { DriveEnv } from '../../dto/drive/drive-dto.ts'
import {
  uploadIdDto,
  uploadHashDto,
  uploadPartNumberDto,
  driveUploadDraftDto,
  driveUploadActionDto,
  driveUploadListDto,
} from '../../dto/drive/drive-upload-dto.ts'
import type { AssetsDependencies } from '../../infrastructure/drive/types.ts'
import {
  createDriveUploadService,
  uploadPartSize,
} from '../../infrastructure/drive/drive-upload-service.ts'

const connectionIdDto = z.string().uuid()
let receivingParts = 0
const getIds = (context: Context<DriveEnv>) => ({
  owner: context.get('owner'),
  id: connectionIdDto.parse(context.req.param('id')),
  uploadId: uploadIdDto.parse(context.req.param('uploadId')),
})

/**
 * 注册上传任务HTTP边界，每次只在内存接收一个有界分片。
 *
 * @param dependencies - 基础设施
 * @returns 上传任务处理函数
 */
const createDriveUploadController = (dependencies: AssetsDependencies) => {
  const getService = () => createDriveUploadService(dependencies)
  const createTaskHandler = async (context: Context<DriveEnv>) =>
    context.json(
      {
        task: await getService().createTask(
          context.get('owner'),
          connectionIdDto.parse(context.req.param('id')),
          driveUploadDraftDto.parse(await context.req.json()),
        ),
      },
      201,
    )
  const listTasksHandler = async (context: Context<DriveEnv>) => {
    const query = driveUploadListDto.parse(context.req.query())
    const service = getService()
    return context.json(
      query.page === undefined
        ? await service.listTasks(
            context.get('owner'),
            connectionIdDto.parse(context.req.param('id')),
            query.cursor,
          )
        : await service.getTaskPage(
            context.get('owner'),
            connectionIdDto.parse(context.req.param('id')),
            query.page,
          ),
    )
  }
  const getTaskHandler = async (context: Context<DriveEnv>) => {
    const { owner, id, uploadId } = getIds(context)
    const after = z.coerce
      .number()
      .int()
      .min(-1)
      .max(2147483647)
      .parse(context.req.query('after') ?? -1)
    return context.json(
      await getService().getTaskDetails(owner, id, uploadId, after),
    )
  }
  const updateTaskHandler = async (context: Context<DriveEnv>) => {
    const { owner, id, uploadId } = getIds(context)
    const { action, fingerprint } = driveUploadActionDto.parse(
      await context.req.json(),
    )
    return context.json({
      task: await getService().updateTask(
        owner,
        id,
        uploadId,
        action,
        fingerprint,
      ),
    })
  }
  const completeTaskHandler = async (context: Context<DriveEnv>) => {
    const { owner, id, uploadId } = getIds(context)
    return context.json(
      { task: await getService().completeTask(owner, id, uploadId) },
      202,
    )
  }
  const receivePartHandler = async (context: Context<DriveEnv>) => {
    const { owner, id, uploadId } = getIds(context)
    const part = uploadPartNumberDto.parse(context.req.param('partNumber'))
    const hash = uploadHashDto.parse(context.req.header('X-Part-SHA256'))
    await getService().assertReceiving(owner, id, uploadId, part)
    const declared = Number(context.req.header('Content-Length') ?? 0)
    if (declared > uploadPartSize)
      throw new HTTPException(413, {
        message: 'This upload part is too large.',
      })
    if (receivingParts >= 4)
      throw new HTTPException(429, {
        message: 'Upload slots are busy. Retry this part shortly.',
      })
    receivingParts++
    const reader = context.req.raw.body?.getReader()
    const deadline = Date.now() + 300_000
    const timeout = setTimeout(() => {
      void reader?.cancel().catch(() => undefined)
    }, 300_000)
    try {
      const chunks: Uint8Array[] = []
      let size = 0
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (Date.now() >= deadline)
            throw new HTTPException(408, {
              message: 'This part timed out. Resume the upload to retry it.',
            })
          if (done) break
          size += value.length
          if (size > uploadPartSize)
            throw new HTTPException(413, {
              message: 'This upload part is too large.',
            })
          chunks.push(value)
        }
      }
      if (context.req.raw.signal.aborted || (declared && declared !== size))
        throw new HTTPException(400, {
          message: 'This part was interrupted. Resume the upload.',
        })
      return context.json({
        task: await getService().receivePart(
          owner,
          id,
          uploadId,
          part,
          hash,
          Buffer.concat(chunks, size),
        ),
      })
    } finally {
      clearTimeout(timeout)
      await reader?.cancel().catch(() => undefined)
      receivingParts--
    }
  }
  return {
    createTaskHandler,
    listTasksHandler,
    getTaskHandler,
    updateTaskHandler,
    completeTaskHandler,
    receivePartHandler,
  }
}

export { createDriveUploadController }
