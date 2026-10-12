import type { DriveConnection, DriveDirectory } from '@neozebra/database'
import type { AssetsDependencies } from './types.ts'
import { randomUUID } from 'node:crypto'
import { Worker, createNodeRedisClient } from 'bullmq'
import { HTTPException } from 'hono/http-exception'
import { createDriveService } from './drive-service.ts'
import {
  createDriveCatalog,
  getDirectoryWhere,
  getEntryData,
  getPathList,
  cursorLifetime,
} from './drive-catalog.ts'
import {
  enqueueDriveDirectory,
  getDriveQueue,
  queueName,
} from './drive-queue.ts'
import { withDriveLease } from './drive-lease.ts'
const getSafeSyncError = (error: unknown) =>
  error instanceof HTTPException
    ? error.message
    : 'Sync temporarily unavailable. Your previous file list is still available.'
/**
 * 执行可恢复的整目录扫描；每页提交，完整扫描才发布，所有提交复核连接与写操作版本。
 *
 * @param dependencies - 与 HTTP 服务共享的 Prisma、锁和 provider
 * @returns 扫描与数据库意图恢复操作，供队列和集成测试使用
 */
const createDriveSync = (dependencies: AssetsDependencies) => {
  const db = dependencies.getInfrastructure()
  const service = createDriveService(dependencies)
  const catalog = createDriveCatalog(db)
  const getConnection = (directory: DriveDirectory) =>
    db.store.driveConnection.findFirst({
      where: {
        id: directory.connectionId,
        metadataVersion: directory.connectionVersion,
      },
    })
  const publishDirectory = async (
    row: DriveConnection,
    directory: DriveDirectory,
  ) => {
    const folders = await db.store.driveEntry.findMany({
      where: {
        directoryId: directory.id,
        generation: directory.scanGeneration!,
        kind: 'folder',
      },
      select: { remoteId: true, name: true },
    })
    const previous = await db.store.driveDirectory.findMany({
      where: {
        ...getDirectoryWhere(row),
        parentRemoteId: directory.remoteId,
        remoteId: { not: directory.remoteId },
      },
    })
    const existingFolders: DriveDirectory[] = []
    for (let offset = 0; offset < folders.length; offset += 500)
      existingFolders.push(
        ...(await db.store.driveDirectory.findMany({
          where: {
            ...getDirectoryWhere(row),
            remoteId: {
              in: folders
                .slice(offset, offset + 500)
                .map((folder) => folder.remoteId),
            },
          },
        })),
      )
    await db.store.$transaction(async (tx) => {
      const folderMap = new Map(
        folders.map((folder) => [folder.remoteId, folder]),
      )
      for (const old of previous) {
        if (!folderMap.has(old.remoteId) && !old.removedAt)
          await catalog.retireSubtree(row, old.remoteId, tx)
      }
      const previousMap = new Map(
        existingFolders.map((child) => [child.remoteId, child]),
      )
      const path = getPathList(directory, row)
      const created = []
      for (const folder of folders) {
        const old = previousMap.get(folder.remoteId)
        const childPath = [...path, { id: folder.remoteId, name: folder.name }]
        if (!old)
          created.push({
            ...getDirectoryWhere(row),
            remoteId: folder.remoteId,
            parentRemoteId: directory.remoteId,
            path: childPath,
          })
        else if (
          old.removedAt ||
          JSON.stringify(getPathList(old, row)) !== JSON.stringify(childPath)
        ) {
          const moved =
            old.parentRemoteId !== directory.remoteId ||
            JSON.stringify(getPathList(old, row).slice(1)) !==
              JSON.stringify(childPath.slice(1))
          if (moved) await catalog.retireSubtree(row, old.remoteId, tx)
          await tx.driveDirectory.update({
            where: { id: old.id },
            data: {
              path: childPath,
              parentRemoteId: directory.remoteId,
              removedAt: null,
              ...(old.removedAt || moved
                ? {
                    publishedGeneration: null,
                    scanGeneration: null,
                    state: 'pending',
                    nextSyncAt: new Date(),
                  }
                : {}),
            },
          })
        }
      }
      for (let offset = 0; offset < created.length; offset += 500)
        await tx.driveDirectory.createMany({
          data: created.slice(offset, offset + 500),
        })
      if (directory.publishedGeneration)
        await tx.driveEntry.updateMany({
          where: {
            directoryId: directory.id,
            generation: directory.publishedGeneration,
          },
          data: { updatedAt: new Date() },
        })
      const published = await tx.driveDirectory.update({
        where: {
          id: directory.id,
          requestedRevision: directory.scanRevision,
          scanGeneration: directory.scanGeneration,
          removedAt: null,
        },
        data: {
          publishedGeneration: directory.scanGeneration,
          scanGeneration: null,
          scanCursor: null,
          state: 'ready',
          error: null,
          lastSyncedAt: new Date(),
        },
      })
      await tx.driveDirectory.update({
        where: { id: directory.id },
        data: {
          nextSyncAt: new Date(
            Date.now() +
              (published.activeUntil &&
              published.activeUntil.getTime() > Date.now()
                ? 60_000
                : 600_000),
          ),
        },
      })
    })
  }
  const syncDirectory = async (id: bigint) => {
    const initial = await db.store.driveDirectory.findUnique({ where: { id } })
    if (!initial || initial.removedAt || initial.state === 'blocked') return
    const row = await getConnection(initial)
    if (
      !row ||
      !row.syncActiveUntil ||
      row.syncActiveUntil.getTime() < Date.now()
    )
      return
    return withDriveLease(
      db,
      `${db.syncNamespace}:scan:${id}`,
      async (assertScanLease) => {
        try {
          for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
            const completed = await service.withRemoteProvider(
              row.ownerId,
              row.publicId,
              async (provider, current, assertProviderLease) => {
                assertScanLease()
                let directory = await db.store.driveDirectory.findUnique({
                  where: { id },
                })
                if (
                  !directory ||
                  directory.removedAt ||
                  current.metadataVersion !== directory.connectionVersion ||
                  directory.state === 'blocked'
                )
                  return true
                if (
                  !directory.scanGeneration &&
                  directory.state === 'ready' &&
                  directory.nextSyncAt.getTime() > Date.now()
                )
                  return true
                if (
                  !directory.scanGeneration ||
                  directory.scanRevision !== directory.requestedRevision
                )
                  directory = await db.store.driveDirectory.update({
                    where: { id },
                    data: {
                      state: 'syncing',
                      scanGeneration: randomUUID(),
                      scanCursor: null,
                      scanRevision: directory.requestedRevision,
                    },
                  })
                else if (directory.state !== 'syncing')
                  directory = await db.store.driveDirectory.update({
                    where: { id },
                    data: { state: 'syncing' },
                  })
                const page = await provider.list({
                  parent: directory.remoteId,
                  kind: 'all',
                  query: '',
                  cursor: directory.scanCursor ?? '',
                  refresh: '1',
                })
                assertScanLease()
                assertProviderLease()
                if (page.nextCursor && page.nextCursor === directory.scanCursor)
                  throw new HTTPException(502, {
                    message:
                      'The provider repeated a page cursor. Retry sync later.',
                  })
                const path = page.path.map((part, index) =>
                  index === 0 ? { ...part, name: current.name } : part,
                )
                await db.store.$transaction(async (tx) => {
                  await tx.driveDirectory.update({
                    where: {
                      id,
                      scanGeneration: directory.scanGeneration,
                      requestedRevision: directory.scanRevision,
                      removedAt: null,
                    },
                    data: { path, scanCursor: page.nextCursor },
                  })
                  await tx.driveEntry.deleteMany({
                    where: {
                      directoryId: id,
                      generation: directory.scanGeneration!,
                      remoteId: { in: page.entries.map((entry) => entry.id) },
                    },
                  })
                  if (page.entries.length)
                    await tx.driveEntry.createMany({
                      data: page.entries.map((entry) => ({
                        ...getDirectoryWhere(current),
                        directoryId: id,
                        generation: directory.scanGeneration!,
                        ...getEntryData(entry),
                      })),
                    })
                })
                if (page.nextCursor) return false
                await publishDirectory(current, { ...directory, path })
                return true
              },
            )
            if (completed) return
          }
          await db.store.driveDirectory.update({
            where: { id },
            data: { state: 'pending', nextSyncAt: new Date() },
          })
          await enqueueDriveDirectory(db, id)
        } catch (error) {
          if (error instanceof HTTPException && error.status === 409)
            throw new Error('Drive operation still in progress')
          if (
            error instanceof Error &&
            'code' in error &&
            error.code === 'P2025'
          )
            return
          const blocked =
            error instanceof HTTPException &&
            (error.status === 401 || error.status === 403)
          const removed = error instanceof HTTPException && error.status === 404
          await db.store.driveDirectory
            .update({
              where: {
                id,
                connectionVersion: row.metadataVersion,
                removedAt: null,
              },
              data: {
                state: blocked ? 'blocked' : removed ? 'removed' : 'error',
                error: getSafeSyncError(error),
                scanGeneration: null,
                scanCursor: null,
                nextSyncAt: new Date(Date.now() + 600_000),
                ...(removed ? { removedAt: new Date() } : {}),
              },
            })
            .catch(() => undefined)
          if (blocked)
            await db.store.driveDirectory.updateMany({
              where: { ...getDirectoryWhere(row), removedAt: null },
              data: { state: 'blocked', error: getSafeSyncError(error) },
            })
          if (!blocked && !removed)
            throw new Error('Drive metadata sync failed')
        }
      },
    )
  }
  let cleanupAfter = 0n
  const sweep = async () => {
    const connections = await db.store.driveConnection.findMany({
      where: { syncActiveUntil: { gt: new Date() } },
      select: { id: true, metadataVersion: true },
    })
    for (const row of connections) {
      const due = await db.store.driveDirectory.findMany({
        where: {
          connectionId: row.id,
          connectionVersion: row.metadataVersion,
          removedAt: null,
          state: { notIn: ['blocked', 'removed'] },
          nextSyncAt: { lte: new Date() },
        },
        orderBy: [{ nextSyncAt: 'asc' }, { id: 'asc' }],
        take: 100,
      })
      for (const directory of due)
        await enqueueDriveDirectory(
          db,
          directory.id,
          directory.activeUntil && directory.activeUntil.getTime() > Date.now()
            ? 1
            : 10,
        )
    }
    const old = await db.store.driveDirectory.findMany({
      where: { id: { gt: cleanupAfter } },
      orderBy: { id: 'asc' },
      take: 100,
    })
    cleanupAfter = old.at(-1)?.id ?? 0n
    for (const directory of old) {
      const current = await getConnection(directory)
      if (
        !current ||
        (directory.removedAt &&
          directory.removedAt.getTime() < Date.now() - cursorLifetime - 30_000)
      ) {
        await db.store.driveEntry.deleteMany({
          where: { directoryId: directory.id },
        })
        if (!current)
          await db.store.driveDirectory
            .delete({ where: { id: directory.id } })
            .catch(() => undefined)
      } else
        await db.store.driveEntry.deleteMany({
          where: {
            directoryId: directory.id,
            generation: {
              notIn: [
                directory.publishedGeneration ?? '',
                directory.scanGeneration ?? '',
              ],
            },
            updatedAt: { lt: new Date(Date.now() - cursorLifetime - 30_000) },
          },
        })
    }
  }
  return { syncDirectory, sweep }
}
/**
 * 启动独立 BullMQ 消费者；数据库补偿恢复 Redis 丢失或漏投的任务。
 *
 * @param dependencies - 现有连接与存储适配器
 * @returns 带优雅关闭方法的 Worker
 */
const startDriveSyncWorker = async (dependencies: AssetsDependencies) => {
  const db = dependencies.getInfrastructure()
  const queue = await getDriveQueue(db)
  const sync = createDriveSync(dependencies)
  const raw = db.redis.duplicate({
    socket: {
      reconnectStrategy: (retries) => Math.min(1000 * (retries + 1), 10_000),
    },
    disableOfflineQueue: false,
  })
  raw.on('error', () => console.error('Drive sync worker Redis unavailable'))
  const worker = new Worker(
    queueName,
    async (job) => {
      if (job.name === 'sweep') return sync.sweep()
      await sync.syncDirectory(BigInt(job.data.directoryId))
    },
    {
      connection: createNodeRedisClient(raw),
      prefix: db.syncNamespace,
      concurrency: 2,
      limiter: { max: 2, duration: 1000 },
    },
  )
  worker.on('error', () => console.error('Drive sync worker unavailable'))
  worker.on('failed', () =>
    console.error('Drive sync job failed; previous snapshot retained'),
  )
  await worker.waitUntilReady()
  await queue.upsertJobScheduler(
    'metadata-recovery',
    { every: 15_000 },
    {
      name: 'sweep',
      data: {},
      opts: { priority: 1, removeOnComplete: true, removeOnFail: 100 },
    },
  )
  await sync.sweep()
  return {
    worker,
    close: async () => {
      await worker.close()
      if (raw.isOpen) raw.destroy()
    },
  }
}
export { createDriveSync, startDriveSyncWorker }
