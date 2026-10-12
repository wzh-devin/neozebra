import { createHash } from 'node:crypto'
import { mkdir, open, rm, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { HTTPException } from 'hono/http-exception'
import type { DriveUploadTask } from '@neozebra/database'
import type { DriveUploadDraft } from '../../dto/drive/drive-upload-dto.ts'
import type { AssetsDependencies } from './types.ts'
import { withDriveLease } from './drive-lease.ts'
import { createDriveService } from './drive-service.ts'
import { enqueueDriveUpload } from './drive-upload-queue.ts'

const uploadPartSize = 8 * 1024 * 1024
const uploadRetention = 7 * 86400_000
const terminalStatusSet = new Set(['completed', 'cancelled'])
const getUploadExpiry = () => new Date(Date.now() + uploadRetention)
const getUploadPath = (
  dependencies: AssetsDependencies,
  task: DriveUploadTask,
) =>
  join(
    resolve(
      dependencies.getInfrastructure().uploadDirectory ?? '.data/drive-uploads',
    ),
    dependencies.getInfrastructure().syncNamespace,
    String(task.id),
    'content',
  )
const getPublicUpload = (task: DriveUploadTask) => ({
  id: task.publicId,
  parent: task.resolvedParentRemoteId ?? task.parentRemoteId,
  directoryPath: task.directoryPath as string[],
  directoryName: task.directoryName,
  name: task.name,
  mimeType: task.mimeType,
  size: Number(task.sizeBytes),
  fingerprint: task.fingerprint,
  partSize: task.partSize,
  partCount: task.partCount,
  receivedBytes: Number(task.receivedBytes),
  transferredBytes: Number(task.transferredBytes),
  status: task.status,
  phase: task.phase === 'receiving' ? 'receiving' : 'remote',
  error: task.error,
  revision: task.revision,
  createdAt: task.createdAt.toISOString(),
  updatedAt: task.updatedAt.toISOString(),
  expiresAt: task.expiresAt.toISOString(),
})

/**
 * 管理账号上传任务及有界分片；字节先落盘再确认，断点以PG为准。
 *
 * @param dependencies - 数据库、租约和凭据能力
 * @returns 上传任务的创建、查询、分片及状态操作
 */
const createDriveUploadService = (dependencies: AssetsDependencies) => {
  const db = dependencies.getInfrastructure()
  const service = createDriveService(dependencies)
  const withTaskLease = <T>(
    taskId: bigint,
    action: (assertLease: () => void) => Promise<T>,
  ) => withDriveLease(db, 'drive:upload:' + taskId, action)
  const getTask = async (
    owner: string,
    connectionId: string,
    uploadId: string,
  ) => {
    const connection = await service.getConnection(owner, connectionId)
    const task = await db.store.driveUploadTask.findFirst({
      where: {
        ownerId: owner,
        connectionId: connection.id,
        publicId: uploadId,
      },
    })
    if (!task)
      throw new HTTPException(404, {
        message: 'This upload task no longer exists.',
      })
    return { task, connection }
  }
  const assertCurrentTask = (task: DriveUploadTask, version: number) => {
    if (task.expiresAt.getTime() <= Date.now())
      throw new HTTPException(410, {
        message: 'This upload expired. Select the file to start a new task.',
      })
    if (task.connectionVersion !== version)
      throw new HTTPException(409, {
        message: 'This account or mounted folder changed. Start a new upload.',
      })
  }
  const createTask = async (
    owner: string,
    id: string,
    draft: DriveUploadDraft,
  ) => {
    const connection = await service.getConnection(owner, id)
    return withDriveLease(
      db,
      'drive:upload-create:' + connection.id + ':' + draft.id,
      async (assertLease) => {
        const previous = await db.store.driveUploadTask.findFirst({
          where: {
            ownerId: owner,
            connectionId: connection.id,
            publicId: draft.id,
          },
        })
        if (previous) {
          if (
            (previous.fingerprint &&
              draft.fingerprint &&
              previous.fingerprint !== draft.fingerprint) ||
            Number(previous.sizeBytes) !== draft.size ||
            previous.name !== draft.name ||
            previous.parentRemoteId !== draft.parent ||
            JSON.stringify(previous.directoryPath) !==
              JSON.stringify(draft.directoryPath ?? [])
          )
            throw new HTTPException(409, {
              message: 'This upload identifier belongs to another file.',
            })
          return getPublicUpload(previous)
        }
        const parent =
          draft.parent === 'root'
            ? null
            : await db.store.driveDirectory.findFirst({
                where: {
                  connectionId: connection.id,
                  connectionVersion: connection.metadataVersion,
                  remoteId: draft.parent,
                  removedAt: null,
                },
              })
        if (draft.parent !== 'root' && !parent)
          throw new HTTPException(404, {
            message: 'This destination folder no longer exists.',
          })
        const latest = await service.getConnection(owner, id)
        if (latest.metadataVersion !== connection.metadataVersion)
          throw new HTTPException(409, {
            message: 'This account changed. Select the file again.',
          })
        assertLease()
        const task = await db.store.driveUploadTask.create({
          data: {
            ownerId: owner,
            connectionId: connection.id,
            connectionVersion: connection.metadataVersion,
            publicId: draft.id,
            parentRemoteId: draft.parent,
            directoryPath: draft.directoryPath ?? [],
            directoryName: [
              parent && Array.isArray(parent.path)
                ? parent.path
                    .map((entry) =>
                      String((entry as { name?: string })?.name ?? ''),
                    )
                    .filter(Boolean)
                    .join(' / ')
                : connection.name,
              ...(draft.directoryPath ?? []),
            ].join(' / '),
            name: draft.name,
            mimeType: draft.mimeType,
            sizeBytes: BigInt(draft.size),
            fingerprint: draft.fingerprint,
            status: draft.fingerprint ? 'receiving' : 'preparing',
            partSize: uploadPartSize,
            partCount: Math.max(1, Math.ceil(draft.size / uploadPartSize)),
            expiresAt: getUploadExpiry(),
          },
        })
        try {
          const path = getUploadPath(dependencies, task)
          await mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 })
          const handle = await open(path, 'wx', 0o600)
          await handle.close()
        } catch {
          assertLease()
          await db.store.driveUploadTask.update({
            where: { id: task.id },
            data: {
              status: 'paused',
              error:
                'Upload storage is unavailable. Check the persistent disk and retry.',
            },
          })
          throw new HTTPException(503, {
            message:
              'Upload storage is unavailable. Check the persistent disk and retry.',
          })
        }
        return getPublicUpload(task)
      },
    )
  }
  const listTasks = async (owner: string, id: string, cursor?: string) => {
    const connection = await service.getConnection(owner, id)
    const tasks = await db.store.driveUploadTask.findMany({
      where: {
        ownerId: owner,
        connectionId: connection.id,
        ...(cursor ? { id: { lt: BigInt(cursor) } } : {}),
      },
      orderBy: { id: 'desc' },
      take: 51,
    })
    return {
      tasks: tasks.slice(0, 50).map(getPublicUpload),
      nextCursor: tasks.length > 50 ? String(tasks[49].id) : null,
    }
  }

  /**
   * 以同一只读快照查询账号任务总数和指定表格页，上传运行态不受翻页影响。
   *
   * @param owner - 当前会话归属
   * @param id - 公开账号标识
   * @param page - 从1开始的页号
   * @returns 最多10条任务及分页元数据
   */
  const getTaskPage = async (owner: string, id: string, page: number) => {
    const connection = await service.getConnection(owner, id)
    const pageSize = 10
    const where = { ownerId: owner, connectionId: connection.id }
    const [total, tasks] = await db.store.$transaction(
      [
        db.store.driveUploadTask.count({ where }),
        db.store.driveUploadTask.findMany({
          where,
          orderBy: { id: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    )
    return { tasks: tasks.map(getPublicUpload), total, page, pageSize }
  }
  const getTaskDetails = async (
    owner: string,
    id: string,
    uploadId: string,
    after = -1,
  ) => {
    const { task } = await getTask(owner, id, uploadId)
    const parts = await db.store.driveUploadPart.findMany({
      where: { taskId: task.id, partNumber: { gt: after } },
      orderBy: { partNumber: 'asc' },
      take: 1001,
      select: { partNumber: true, sha256: true, sizeBytes: true },
    })
    return {
      task: getPublicUpload(task),
      parts: parts.slice(0, 1000),
      nextPart: parts.length > 1000 ? parts[999].partNumber : null,
    }
  }
  const assertReceiving = async (
    owner: string,
    id: string,
    uploadId: string,
    part: number,
  ) => {
    const result = await getTask(owner, id, uploadId)
    assertCurrentTask(result.task, result.connection.metadataVersion)
    if (
      result.task.status !== 'receiving' ||
      result.task.phase !== 'receiving' ||
      !result.task.fingerprint
    )
      throw new HTTPException(409, {
        message: 'Resume this upload before sending more parts.',
      })
    if (part >= result.task.partCount)
      throw new HTTPException(400, { message: 'Invalid upload part.' })
    return result.task
  }

  /**
   * 校验单片后在短租约内写入正确偏移，重复确认不重复计算进度。
   *
   * @param owner - 当前会话
   * @param id - 关联账号
   * @param uploadId - 上传标识
   * @param part - 从0开始的片号
   * @param hash - 客户端SHA256
   * @param bytes - 不超过单片边界的正文
   * @returns 已持久化的公开任务
   */
  const receivePart = async (
    owner: string,
    id: string,
    uploadId: string,
    part: number,
    hash: string,
    bytes: Buffer,
  ) => {
    const initial = await assertReceiving(owner, id, uploadId, part)
    const expectedSize = Math.max(
      0,
      Math.min(
        initial.partSize,
        Number(initial.sizeBytes) - part * initial.partSize,
      ),
    )
    if (
      bytes.length !== expectedSize ||
      createHash('sha256').update(bytes).digest('hex') !== hash
    )
      throw new HTTPException(400, {
        message:
          'Upload part size or checksum does not match. Retry this part.',
      })
    return withTaskLease(initial.id, async (assertLease) => {
      const task = await assertReceiving(owner, id, uploadId, part)
      const previous = await db.store.driveUploadPart.findFirst({
        where: { taskId: task.id, partNumber: part },
      })
      if (previous) {
        if (previous.sha256 !== hash)
          throw new HTTPException(409, {
            message: 'This part belongs to a different file.',
          })
        return getPublicUpload(task)
      }
      const path = getUploadPath(dependencies, task)
      try {
        const handle = await open(path, 'r+')
        try {
          let offset = 0
          while (offset < bytes.length) {
            const { bytesWritten } = await handle.write(
              bytes,
              offset,
              bytes.length - offset,
              part * task.partSize + offset,
            )
            if (!bytesWritten) throw new Error('Disk write did not advance')
            offset += bytesWritten
          }
          await handle.sync()
        } finally {
          await handle.close()
        }
      } catch {
        assertLease()
        await db.store.driveUploadTask.update({
          where: { id: task.id },
          data: {
            status: 'paused',
            error:
              'Upload disk is full or unavailable. Existing parts are retained; restore storage and resume.',
          },
        })
        throw new HTTPException(507, {
          message:
            'Upload disk is full or unavailable. Existing parts are retained; restore storage and resume.',
        })
      }
      assertLease()
      const saved = await db.store.$transaction(async (tx) => {
        await tx.driveUploadPart.create({
          data: {
            taskId: task.id,
            partNumber: part,
            sizeBytes: bytes.length,
            sha256: hash,
          },
        })
        return tx.driveUploadTask.update({
          where: { id: task.id },
          data: {
            receivedBytes: { increment: BigInt(bytes.length) },
            expiresAt: getUploadExpiry(),
            error: null,
          },
        })
      })
      return getPublicUpload(saved)
    })
  }
  const completeTask = async (owner: string, id: string, uploadId: string) => {
    const { task: initial } = await getTask(owner, id, uploadId)
    const task = await withTaskLease(initial.id, async (assertLease) => {
      const { task, connection } = await getTask(owner, id, uploadId)
      assertCurrentTask(task, connection.metadataVersion)
      if (task.phase === 'remote' || task.status === 'completed') return task
      if (task.status !== 'receiving')
        throw new HTTPException(409, { message: 'Resume the upload first.' })
      const digest = createHash('sha256')
      let after = -1
      let count = 0
      let size = 0n
      while (true) {
        const parts = await db.store.driveUploadPart.findMany({
          where: { taskId: task.id, partNumber: { gt: after } },
          orderBy: { partNumber: 'asc' },
          take: 1000,
        })
        for (const part of parts) {
          if (part.partNumber !== count++)
            throw new HTTPException(409, {
              message: 'Upload is incomplete. Resume the missing parts.',
            })
          digest.update(part.sha256)
          size += BigInt(part.sizeBytes)
          after = part.partNumber
        }
        if (parts.length < 1000) break
      }
      if (
        count !== task.partCount ||
        size !== task.sizeBytes ||
        digest.digest('hex') !== task.fingerprint
      )
        throw new HTTPException(409, {
          message:
            'Upload is incomplete or the file changed. Resume with the original file.',
        })
      assertLease()
      return db.store.driveUploadTask.update({
        where: { id: task.id },
        data: {
          status: 'queued',
          phase: 'remote',
          error: null,
          revision: { increment: 1 },
          expiresAt: getUploadExpiry(),
        },
      })
    })
    if (task.status === 'queued' || task.status === 'transferring')
      await enqueueDriveUpload(db, task.id)
    return getPublicUpload(task)
  }
  const updateTask = async (
    owner: string,
    id: string,
    uploadId: string,
    action: 'pause' | 'resume' | 'cancel' | 'retry',
    fingerprint?: string,
  ) => {
    const { task: initial } = await getTask(owner, id, uploadId)
    const task = await withTaskLease(initial.id, async (assertLease) => {
      const { task, connection } = await getTask(owner, id, uploadId)
      if (terminalStatusSet.has(task.status)) return task
      if (action !== 'cancel')
        assertCurrentTask(task, connection.metadataVersion)
      if (fingerprint && task.fingerprint && fingerprint !== task.fingerprint)
        throw new HTTPException(409, {
          message: 'This file does not match the original upload.',
        })
      if (fingerprint && !task.fingerprint && task.receivedBytes > 0n)
        throw new HTTPException(409, {
          message: 'This upload has unverified parts. Start a new task.',
        })
      const isFinalizing = task.encryptedCheckpoint
        ? dependencies.decryptCredentials<Record<string, unknown>>(
            task.encryptedCheckpoint,
            db.key,
          ).completing === true
        : false
      if (
        ['pause', 'cancel'].includes(action) &&
        task.status === 'transferring' &&
        isFinalizing
      )
        throw new HTTPException(409, {
          message:
            'This file is being finalized. Wait for the completion result.',
        })
      const status =
        action === 'cancel'
          ? 'cancelled'
          : action === 'pause'
            ? 'paused'
            : task.phase === 'remote'
              ? 'queued'
              : 'receiving'
      if ((action === 'resume' || action === 'retry') && !isFinalizing) {
        const path = getUploadPath(dependencies, task)
        let exists = true
        try {
          await stat(path)
        } catch {
          exists = false
        }
        if (!exists) {
          await mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 })
          const handle = await open(path, 'wx', 0o600)
          await handle.close()
          assertLease()
          await db.store.driveUploadPart.deleteMany({
            where: { taskId: task.id },
          })
          return db.store.driveUploadTask.update({
            where: { id: task.id },
            data: {
              status: 'receiving',
              phase: 'receiving',
              ...(fingerprint ? { fingerprint } : {}),
              receivedBytes: 0,
              error:
                'The temporary file is missing. Select the original file to restore it.',
              revision: { increment: 1 },
              expiresAt: getUploadExpiry(),
            },
          })
        }
      }
      assertLease()
      return db.store.driveUploadTask.update({
        where: { id: task.id },
        data: {
          status,
          ...(fingerprint ? { fingerprint } : {}),
          error: null,
          revision: { increment: 1 },
          expiresAt: getUploadExpiry(),
        },
      })
    })
    if (task.status === 'cancelled' && task.phase === 'receiving') {
      await rm(resolve(getUploadPath(dependencies, task), '..'), {
        recursive: true,
        force: true,
      })
      await db.store.driveUploadPart.deleteMany({ where: { taskId: task.id } })
      await db.store.driveUploadTask.update({
        where: { id: task.id },
        data: { phase: 'cleaned' },
      })
    }
    if (
      task.phase === 'remote' &&
      ['queued', 'cancelled'].includes(task.status)
    )
      await enqueueDriveUpload(db, task.id)
    return getPublicUpload(task)
  }
  return {
    createTask,
    listTasks,
    getTaskPage,
    getTaskDetails,
    assertReceiving,
    receivePart,
    completeTask,
    updateTask,
  }
}

export {
  uploadPartSize,
  uploadRetention,
  getUploadPath,
  getPublicUpload,
  createDriveUploadService,
}
