import { createHash, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import type { DrivePreviewTask } from '@neozebra/database'
import { HTTPException } from 'hono/http-exception'
import type { AssetsDependencies } from './types.ts'
import { createDriveService } from './drive-service.ts'
import { withDriveLease } from './drive-lease.ts'
import { enqueueDrivePreview } from './drive-preview-queue.ts'
import {
  getOfficeConfig,
  getOfficeType,
  signOfficeConfig,
  signPreviewSource,
} from './drive-office.ts'

const previewRetention = 3600_000

// API与worker必须挂载相同持久目录；命名空间隔离测试与不同数据库。
const getPreviewPath = (
  dependencies: AssetsDependencies,
  task: Pick<DrivePreviewTask, 'publicId'>,
) => {
  if (!/^[a-f0-9-]{36}$/.test(task.publicId))
    throw new Error('Invalid preview storage identifier')
  const db = dependencies.getInfrastructure()
  return resolve(
    db.previewDirectory ?? '.data/drive-previews',
    db.syncNamespace,
    task.publicId,
    'source',
  )
}

/**
 * 创建账号隔离的Office快照任务与只读会话，不查询远端目录。
 *
 * @param dependencies - 数据库、队列和引擎配置
 * @returns 任务创建、查询与源授权检查
 */
const createDrivePreviewService = (dependencies: AssetsDependencies) => {
  const service = createDriveService(dependencies)
  const getDb = () => dependencies.getInfrastructure()
  const assertConnection = async (task: DrivePreviewTask) => {
    if (task.expiresAt.getTime() <= Date.now())
      throw new HTTPException(410, {
        message: 'This preview expired. Reopen the file.',
      })
    const connection = await getDb().store.driveConnection.findFirst({
      where: {
        id: task.connectionId,
        ownerId: task.ownerId,
        metadataVersion: task.connectionVersion,
      },
    })
    if (!connection)
      throw new HTTPException(404, {
        message: 'This preview is no longer available.',
      })
    return connection
  }
  const getTask = async (
    owner: string,
    connectionId: string,
    publicId: string,
  ) => {
    const connection = await service.getConnection(owner, connectionId)
    const task = await getDb().store.drivePreviewTask.findFirst({
      where: {
        ownerId: owner,
        connectionId: connection.id,
        connectionVersion: connection.metadataVersion,
        publicId,
      },
    })
    if (!task)
      throw new HTTPException(404, {
        message: 'This preview is no longer available.',
      })
    await assertConnection(task)
    return task
  }
  const createTask = async (
    owner: string,
    connectionId: string,
    remoteId: string,
  ) => {
    getOfficeConfig(dependencies)
    const db = getDb()
    return withDriveLease(db, 'drive:preview-create:' + owner, async () => {
      const connection = await service.getConnection(owner, connectionId)
      const entry = await db.store.driveEntry.findFirst({
        where: {
          connectionId: connection.id,
          connectionVersion: connection.metadataVersion,
          remoteId,
          kind: 'file',
        },
        orderBy: { id: 'desc' },
      })
      const type = entry && getOfficeType(entry.name, entry.mimeType)
      if (!entry || !type)
        throw new HTTPException(415, {
          message: 'Office preview is unavailable for this file type.',
        })
      if (
        (await db.store.drivePreviewTask.count({
          where: {
            ownerId: owner,
            status: 'queued',
            expiresAt: { gt: new Date() },
          },
        })) >= 4
      )
        throw new HTTPException(429, {
          message: 'Your other previews are still loading. Retry shortly.',
        })
      const task = await db.store.drivePreviewTask.create({
        data: {
          ownerId: owner,
          connectionId: connection.id,
          connectionVersion: connection.metadataVersion,
          remoteId,
          name: entry.name,
          ...type,
          publicId: randomUUID(),
          expiresAt: new Date(Date.now() + previewRetention),
        },
      })
      await enqueueDrivePreview(db, task.id)
      return { id: task.publicId, status: task.status }
    })
  }
  const getSession = async (
    owner: string,
    connectionId: string,
    publicId: string,
  ) => {
    const task = await getTask(owner, connectionId, publicId)
    if (task.status !== 'ready')
      return { id: publicId, status: task.status, error: task.error }
    const office = getOfficeConfig(dependencies)
    const expires = Math.min(
      Math.floor(task.expiresAt.getTime() / 1000),
      Math.floor(Date.now() / 1000) + 900,
    )
    const ticket = signPreviewSource(task.publicId, expires, getDb().key)
    const config = {
      documentType: task.documentType,
      document: {
        ...(task.fileType === 'pdf' ? { isForm: false } : {}),
        title: task.name,
        fileType: task.fileType,
        key: createHash('sha256')
          .update(
            `${task.ownerId}:${task.connectionId}:${task.connectionVersion}:${task.remoteId}:${task.contentHash}:${task.fileType}:onlyoffice9.4-view`,
          )
          .digest('hex'),
        url: `${office.sourceOrigin.replace(/\/$/, '')}/api/assets/drive/previews/${task.publicId}/source?ticket=${ticket}`,
        permissions: {
          edit: false,
          review: false,
          comment: false,
          fillForms: false,
          copy: true,
          download: true,
          print: true,
        },
      },
      editorConfig: {
        mode: 'view',
        lang: 'zh-CN',
        user: {
          id: createHash('sha256').update(task.ownerId).digest('hex'),
          name: 'Neozebra',
        },
        coEditing: { mode: 'strict', change: false },
        customization: {
          plugins: false,
          macros: false,
          hideRightMenu: true,
          help: false,
          chat: false,
          comments: false,
          features: { featuresTips: false },
        },
      },
      type: 'desktop',
      width: '100%',
      height: '100%',
    }
    return {
      id: publicId,
      status: 'ready',
      apiUrl:
        office.url.replace(/\/$/, '') + '/web-apps/apps/api/documents/api.js',
      config: {
        ...config,
        token: signOfficeConfig({ ...config, exp: expires }, office.jwtSecret),
      },
    }
  }
  return { createTask, getTask, getSession, assertConnection }
}
export { createDrivePreviewService, getPreviewPath, previewRetention }
