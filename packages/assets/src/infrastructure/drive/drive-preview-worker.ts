import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createNodeRedisClient, Worker } from 'bullmq'
import { HTTPException } from 'hono/http-exception'
import type { AssetsDependencies } from './types.ts'
import { createDriveService } from './drive-service.ts'
import {
  createDrivePreviewService,
  getPreviewPath,
} from './drive-preview-service.ts'
import { getOfficeType } from './drive-office.ts'
import { withDriveLease } from './drive-lease.ts'
import {
  getDrivePreviewQueue,
  previewQueueName,
  enqueueDrivePreview,
} from './drive-preview-queue.ts'

/**
 * 流式暂存Office源并计算内容版本，发布前确认连接归属；回收过期快照。
 *
 * @param dependencies - 共享持久目录、Prisma与Provider
 * @returns 单任务执行及补偿回收方法
 */
const createDrivePreviewProcessor = (
  dependencies: AssetsDependencies,
  signal?: AbortSignal,
) => {
  const db = dependencies.getInfrastructure()
  const service = createDriveService(dependencies)
  const previews = createDrivePreviewService(dependencies)
  const processPreview = async (taskId: bigint, isLastAttempt = true) =>
    withDriveLease(db, 'drive:preview:' + taskId, async (assertLease) => {
      const task = await db.store.drivePreviewTask.findUnique({
        where: { id: taskId },
      })
      if (!task || task.status !== 'queued') return
      const path = getPreviewPath(dependencies, task)
      try {
        const connection = await previews.assertConnection(task)
        await mkdir(dirname(path), { recursive: true, mode: 0o700 })
        await service.withRemoteProvider(
          task.ownerId,
          connection.publicId,
          async (provider, current, assertRemoteLease) => {
            if (current.metadataVersion !== task.connectionVersion)
              throw new Error('Connection changed')
            const entry = await provider.get(task.remoteId)
            const type = getOfficeType(entry.name, entry.mimeType)
            if (entry.kind !== 'file' || !type)
              throw new HTTPException(415, {
                message: 'Office preview is unavailable for this file type.',
              })
            const response = await provider.content(task.remoteId)
            if (!response.ok || !response.body)
              throw new Error('Source unavailable')
            const hash = createHash('sha256')
            let size = 0
            const digest = new Transform({
              transform(chunk: Buffer, _encoding, callback) {
                try {
                  assertLease()
                  assertRemoteLease()
                  size += chunk.length
                  hash.update(chunk)
                  callback(null, chunk)
                } catch (error) {
                  callback(
                    error instanceof Error
                      ? error
                      : new Error('Preview stopped'),
                  )
                }
              },
            })
            await pipeline(
              Readable.fromWeb(
                response.body as import('node:stream/web').ReadableStream,
              ),
              digest,
              createWriteStream(path + '.partial', { mode: 0o600 }),
              {
                signal: signal
                  ? AbortSignal.any([signal, AbortSignal.timeout(600_000)])
                  : AbortSignal.timeout(600_000),
              },
            )
            if (!size)
              throw new HTTPException(422, {
                message: 'This Office file is empty.',
              })
            const expected = response.headers.get('content-length')
            if (expected && BigInt(expected) !== BigInt(size))
              throw new Error('Incomplete source')
            await previews.assertConnection(task)
            assertLease()
            assertRemoteLease()
            await rename(path + '.partial', path)
            await db.store.drivePreviewTask.update({
              where: { id: task.id },
              data: {
                status: 'ready',
                name: entry.name,
                ...type,
                contentHash: hash.digest('hex'),
                sizeBytes: BigInt(size),
                error: null,
              },
            })
          },
        )
      } catch (error) {
        await rm(path + '.partial', { force: true })
        if (
          isLastAttempt ||
          (error instanceof HTTPException &&
            [404, 410, 415, 422].includes(error.status))
        ) {
          await db.store.drivePreviewTask.updateMany({
            where: { id: task.id, status: 'queued' },
            data: {
              status: 'failed',
              error:
                error instanceof HTTPException && error.status !== 409
                  ? error.message
                  : 'Could not prepare this Office file. Reopen the preview to retry.',
            },
          })
        }
        throw error
      }
    })
  const sweep = async () => {
    const expired = await db.store.drivePreviewTask.findMany({
      where: { expiresAt: { lte: new Date() } },
      take: 100,
    })
    for (const task of expired)
      await withDriveLease(db, 'drive:preview:' + task.id, async () => {
        await rm(dirname(getPreviewPath(dependencies, task)), {
          recursive: true,
          force: true,
        })
        await db.store.drivePreviewTask.deleteMany({
          where: { id: task.id, expiresAt: { lte: new Date() } },
        })
      }).catch(() => undefined)
    const pending = await db.store.drivePreviewTask.findMany({
      where: { status: 'queued', expiresAt: { gt: new Date() } },
      take: 100,
      orderBy: { id: 'asc' },
    })
    for (const task of pending) await enqueueDrivePreview(db, task.id)
  }
  return { processPreview, sweep }
}

/**
 * 启动源快照队列及过期回收，转换与版式处理由ONLYOFFICE负责。
 *
 * @param dependencies - 基础设施
 * @returns 可优雅关闭的worker
 */
const startDrivePreviewWorker = async (dependencies: AssetsDependencies) => {
  const db = dependencies.getInfrastructure()
  const queue = await getDrivePreviewQueue(db)
  const shutdown = new AbortController()
  const processor = createDrivePreviewProcessor(dependencies, shutdown.signal)
  const raw = db.redis.duplicate({
    socket: {
      reconnectStrategy: (retries) => Math.min(1000 * (retries + 1), 10_000),
    },
    disableOfflineQueue: false,
  })
  raw.on('error', () => console.error('Drive preview worker Redis unavailable'))
  const worker = new Worker(
    previewQueueName,
    async (job) => {
      if (job.name === 'sweep') return processor.sweep()
      const taskId = BigInt(job.data.taskId)
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
      try {
        return await processor.processPreview(taskId, lastAttempt)
      } catch (error) {
        // 包含未取得连接锁的最终失败，避免弹窗持续等待已耗尽重试的任务。
        if (lastAttempt)
          await db.store.drivePreviewTask.updateMany({
            where: { id: taskId, status: 'queued' },
            data: {
              status: 'failed',
              error:
                'Could not prepare this Office file. Reopen the preview to retry.',
            },
          })
        throw error
      }
    },
    {
      connection: createNodeRedisClient(raw),
      prefix: db.syncNamespace,
      concurrency: 2,
    },
  )
  worker.on('error', () => console.error('Drive preview worker unavailable'))
  worker.on('failed', () =>
    console.error('Drive preview source preparation failed'),
  )
  await worker.waitUntilReady()
  await queue.upsertJobScheduler(
    'preview-cleanup',
    { every: 60_000 },
    {
      name: 'sweep',
      data: {},
      opts: { priority: 1, removeOnComplete: true, removeOnFail: 100 },
    },
  )
  await processor.sweep()
  return {
    worker,
    close: async () => {
      shutdown.abort()
      await worker.close()
      if (raw.isOpen) raw.destroy()
    },
  }
}
export { createDrivePreviewProcessor, startDrivePreviewWorker }
