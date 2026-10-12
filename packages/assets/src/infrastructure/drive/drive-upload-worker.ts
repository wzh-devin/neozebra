import { rm, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createNodeRedisClient, Worker, UnrecoverableError } from 'bullmq'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { DriveUploadTask } from '@neozebra/database'
import type { AssetsDependencies } from './types.ts'
import { createDriveService } from './drive-service.ts'
import { getUploadPath, uploadRetention } from './drive-upload-service.ts'
import { withDriveLease } from './drive-lease.ts'
import { entryNameDto } from '../../dto/drive/drive-dto.ts'
import {
  uploadQueueName,
  getDriveUploadQueue,
  enqueueDriveUpload,
} from './drive-upload-queue.ts'

class UploadStopped extends Error {}

/**
 * 从持久化文件传输到网盘，保留远端断点，只有完成确认后发布成功。
 *
 * @param dependencies - 基础设施与适配器能力
 * @param shouldStop - Worker关闭信号
 * @returns 上传执行、回收及补偿方法
 */
const createDriveUploadProcessor = (
  dependencies: AssetsDependencies,
  shouldStop = () => false,
) => {
  const db = dependencies.getInfrastructure()
  const service = createDriveService(dependencies)
  const getCheckpoint = (task: DriveUploadTask) =>
    task.encryptedCheckpoint
      ? z
          .record(z.unknown())
          .parse(
            dependencies.decryptCredentials(task.encryptedCheckpoint, db.key),
          )
      : undefined
  const cleanupTask = async (
    task: DriveUploadTask,
    assertLease: () => void,
  ) => {
    const connection = await db.store.driveConnection.findFirst({
      where: {
        id: task.connectionId,
        ownerId: task.ownerId,
        metadataVersion: task.connectionVersion,
      },
    })
    const checkpoint = getCheckpoint(task)
    if (task.status === 'cancelled' && connection && checkpoint) {
      await service.withRemoteProvider(
        task.ownerId,
        connection.publicId,
        async (provider) => {
          await provider.abortUpload?.(checkpoint)
        },
        true,
      )
    }
    assertLease()
    await rm(resolve(getUploadPath(dependencies, task), '..'), {
      recursive: true,
      force: true,
    })
    assertLease()
    await db.store.$transaction(async (tx) => {
      await tx.driveUploadPart.deleteMany({ where: { taskId: task.id } })
      await tx.driveUploadTask.update({
        where: { id: task.id },
        data: { encryptedCheckpoint: null, phase: 'cleaned' },
      })
    })
  }
  const processUpload = async (taskId: bigint) => {
    const initial = await db.store.driveUploadTask.findUnique({
      where: { id: taskId },
    })
    if (!initial || initial.phase === 'cleaned') return
    return withDriveLease(
      db,
      'drive:upload-worker:' + initial.connectionId,
      async (assertWorkerLease) => {
        let task = await db.store.driveUploadTask.findUniqueOrThrow({
          where: { id: taskId },
        })
        if (['completed', 'cancelled'].includes(task.status))
          return cleanupTask(task, assertWorkerLease)
        if (task.phase !== 'remote' || task.status === 'paused') return
        const connection = await db.store.driveConnection.findFirst({
          where: { id: task.connectionId, ownerId: task.ownerId },
        })
        if (
          !connection ||
          connection.metadataVersion !== task.connectionVersion
        ) {
          await db.store.driveUploadTask.update({
            where: { id: task.id },
            data: {
              status: 'failed',
              error:
                'This account or mounted folder changed. Start a new upload.',
            },
          })
          return
        }
        assertWorkerLease()
        const claimed = await db.store.driveUploadTask.updateMany({
          where: {
            id: task.id,
            revision: task.revision,
            status: { in: ['queued', 'transferring', 'failed'] },
          },
          data: { status: 'transferring', error: null },
        })
        if (!claimed.count) return
        const assertActive = async () => {
          assertWorkerLease()
          const latest = await db.store.driveUploadTask.findUniqueOrThrow({
            where: { id: task.id },
          })
          if (shouldStop() || latest.status !== 'transferring')
            throw new UploadStopped()
          if (latest.expiresAt.getTime() <= Date.now()) {
            await db.store.driveUploadTask.update({
              where: { id: task.id },
              data: { status: 'cancelled', error: 'This upload expired.' },
            })
            throw new UploadStopped()
          }
          const current = await db.store.driveConnection.findFirst({
            where: {
              id: connection.id,
              ownerId: task.ownerId,
              metadataVersion: task.connectionVersion,
            },
          })
          if (!current)
            throw new HTTPException(409, {
              message:
                'This account or mounted folder changed. Start a new upload.',
            })
        }
        try {
          await assertActive()
          const path = getUploadPath(dependencies, task)
          if (
            !getCheckpoint(task)?.completing &&
            (await stat(path)).size !== Number(task.sizeBytes)
          )
            throw new HTTPException(409, {
              message:
                'The persistent upload file is missing or incomplete. Restore storage or start a new upload.',
            })
          const directoryPathList = z
            .array(entryNameDto)
            .parse(task.directoryPath)
          if (directoryPathList.length && !task.resolvedParentRemoteId) {
            let parent = task.parentRemoteId
            for (const name of directoryPathList) {
              await assertActive()
              const folder = await service.ensureUploadFolder(
                task.ownerId,
                connection.publicId,
                parent,
                name,
                task.connectionVersion,
              )
              parent = folder.id
            }
            await assertActive()
            task = await db.store.driveUploadTask.update({
              where: { id: task.id },
              data: { resolvedParentRemoteId: parent },
            })
          }
          await service.upload(
            task.ownerId,
            connection.publicId,
            task.resolvedParentRemoteId ?? task.parentRemoteId,
            task.name,
            {
              path,
              size: Number(task.sizeBytes),
              name: task.name,
              mimeType: task.mimeType,
              taskId: task.publicId,
              checkpoint: getCheckpoint(task),
              assertActive,
              saveCheckpoint: async (checkpoint) => {
                assertWorkerLease()
                const persistCheckpoint = () =>
                  db.store.driveUploadTask.update({
                    where: { id: task.id },
                    data: {
                      encryptedCheckpoint: dependencies.encryptCredentials(
                        checkpoint,
                        db.key,
                      ),
                      expiresAt: new Date(Date.now() + uploadRetention),
                    },
                  })
                if (checkpoint.completing) {
                  await withDriveLease(
                    db,
                    'drive:upload:' + task.id,
                    async () => {
                      await assertActive()
                      await persistCheckpoint()
                    },
                  )
                } else await persistCheckpoint()
              },
              onProgress: async (bytes) => {
                assertWorkerLease()
                await db.store.driveUploadTask.update({
                  where: { id: task.id },
                  data: { transferredBytes: BigInt(bytes) },
                })
              },
            },
          )

          // 远端提交已成功时完成状态优先，取消不能撤回已经提交的用户文件。
          assertWorkerLease()
          task = await db.store.driveUploadTask.update({
            where: { id: task.id },
            data: {
              status: 'completed',
              transferredBytes: task.sizeBytes,
              completedAt: new Date(),
              expiresAt: new Date(Date.now() + uploadRetention),
              error: null,
            },
          })
          await cleanupTask(task, assertWorkerLease)
        } catch (error) {
          assertWorkerLease()
          const latest = await db.store.driveUploadTask.findUniqueOrThrow({
            where: { id: task.id },
          })
          if (latest.status === 'completed') return
          if (error instanceof UploadStopped) {
            if (latest.status === 'cancelled')
              await cleanupTask(latest, assertWorkerLease)
            else if (shouldStop() && latest.status === 'transferring')
              await db.store.driveUploadTask.update({
                where: { id: task.id },
                data: { status: 'queued' },
              })
            return
          }
          if (latest.status === 'paused' || latest.status === 'cancelled')
            return
          if (
            error instanceof HTTPException &&
            error.status === 410 &&
            !getCheckpoint(latest)?.completing
          ) {
            const checkpoint = getCheckpoint(latest)
            if (checkpoint)
              await service.withRemoteProvider(
                latest.ownerId,
                connection.publicId,
                async (provider) => {
                  await provider.abortUpload?.(checkpoint)
                },
                true,
              )
            assertWorkerLease()
            await db.store.driveUploadTask.update({
              where: { id: task.id },
              data: {
                encryptedCheckpoint: null,
                transferredBytes: 0,
                status: 'failed',
                error: error.message,
              },
            })
            throw error
          }
          await db.store.driveUploadTask.updateMany({
            where: { id: task.id, status: 'transferring' },
            data: {
              status: 'failed',
              error:
                error instanceof HTTPException
                  ? error.message
                  : 'Could not transfer this file to the Drive. The checkpoint is retained; retry.',
            },
          })
          if (
            error instanceof HTTPException &&
            [401, 403, 409].includes(error.status)
          )
            throw new UnrecoverableError(error.message)
          throw error
        }
      },
    )
  }
  const sweep = async () => {
    const expired = await db.store.driveUploadTask.findMany({
      where: {
        expiresAt: { lte: new Date() },
        status: { notIn: ['completed', 'cancelled'] },
      },
      take: 100,
    })
    for (const task of expired)
      await db.store.driveUploadTask.updateMany({
        where: { id: task.id, expiresAt: { lte: new Date() } },
        data: { status: 'cancelled', error: 'This upload expired.' },
      })
    const pending = await db.store.driveUploadTask.findMany({
      where: { status: { in: ['queued', 'transferring'] } },
      take: 100,
      orderBy: { id: 'asc' },
    })
    for (const task of pending) await enqueueDriveUpload(db, task.id)
    const cleanup = await db.store.driveUploadTask.findMany({
      where: {
        status: { in: ['completed', 'cancelled'] },
        phase: { not: 'cleaned' },
      },
      take: 20,
      orderBy: { id: 'asc' },
    })
    for (const task of cleanup)
      await processUpload(task.id).catch(() => undefined)
    const removed = await db.store.driveUploadTask.findMany({
      where: { phase: 'cleaned', expiresAt: { lte: new Date() } },
      take: 100,
    })
    for (const task of removed)
      await db.store.driveUploadTask.delete({ where: { id: task.id } })
  }
  return { processUpload, sweep }
}

/**
 * 启动独立上传Worker和PG补偿，关闭时在分片边界退出并保留任务。
 *
 * @param dependencies - 基础设施
 * @returns 可优雅关闭的Worker
 */
const startDriveUploadWorker = async (dependencies: AssetsDependencies) => {
  const db = dependencies.getInfrastructure()
  const queue = await getDriveUploadQueue(db)
  let stopping = false
  const processor = createDriveUploadProcessor(dependencies, () => stopping)
  const raw = db.redis.duplicate({
    socket: {
      reconnectStrategy: (retries) => Math.min(1000 * (retries + 1), 10_000),
    },
    disableOfflineQueue: false,
  })
  raw.on('error', () => console.error('Drive upload worker Redis unavailable'))
  const worker = new Worker(
    uploadQueueName,
    async (job) => {
      if (job.name === 'sweep') return processor.sweep()
      await processor.processUpload(BigInt(job.data.taskId))
    },
    {
      connection: createNodeRedisClient(raw),
      prefix: db.syncNamespace,
      concurrency: 2,
    },
  )
  worker.on('error', () => console.error('Drive upload worker unavailable'))
  worker.on('failed', () =>
    console.error('Drive upload failed; checkpoint retained'),
  )
  await worker.waitUntilReady()
  await queue.upsertJobScheduler(
    'upload-recovery',
    { every: 30_000 },
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
      stopping = true
      await worker.close()
      if (raw.isOpen) raw.destroy()
    },
  }
}

export { createDriveUploadProcessor, startDriveUploadWorker }
