import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createDriveController } from '../../controller/drive/drive-controller.ts'
import { createDriveUploadController } from '../../controller/drive/drive-upload-controller.ts'
import { createDrivePreviewController } from '../../controller/drive/drive-preview-controller.ts'
import type { DriveEnv } from '../../dto/drive/drive-dto.ts'
import type { AssetsDependencies } from '../../infrastructure/drive/types.ts'
import { createDriveSessionGuard, driveErrorHandler } from './drive-guards.ts'

/**
 * 注册独立 Assets 模块的 Drive 路由与身份、请求大小边界。
 *
 * @param dependencies - 网关注入的基础设施与加密方法
 * @returns Drive 路由
 */
const createDriveRouter = (dependencies: AssetsDependencies) => {
  const router = new Hono<DriveEnv>()
  const controller = createDriveController(dependencies)
  const uploads = createDriveUploadController(dependencies)
  const previews = createDrivePreviewController(dependencies)
  router.onError(driveErrorHandler)
  const sessionGuard = createDriveSessionGuard(dependencies)
  router.use('*', (context, next) =>
    /\/drive\/(?:connections|oauth)(?:\/|$)/.test(context.req.path)
      ? sessionGuard(context, next)
      : next(),
  )
  const configurationLimit = bodyLimit({
    maxSize: 32 * 1024,
    onError: (context) =>
      context.json(
        { error: { message: 'Drive configuration is too large.' } },
        413,
      ),
  })
  router.use('*', async (context, next) => {
    if (
      context.req.method === 'PUT' &&
      /\/connections\/[^/]+\/uploads\/[^/]+\/parts\/\d+$/.test(context.req.path)
    )
      return next()
    return configurationLimit(context, next)
  })
  router.get('/connections', controller.listConnectionsHandler)
  router.post('/oauth/:provider/start', controller.startAuthorizationHandler)
  router.get('/oauth/:provider/callback', controller.finishAuthorizationHandler)
  router.post('/connections', controller.saveConnectionHandler)
  router.patch('/connections/:id', controller.saveConnectionHandler)
  router.delete('/connections/:id', controller.deleteConnectionHandler)
  router.post('/connections/:id/sync', controller.syncHandler)
  router.get('/connections/:id/entries', controller.listEntriesHandler)
  router.post(
    '/connections/:id/entries/:entryId/preview',
    previews.createPreviewHandler,
  )
  router.get('/connections/:id/previews/:previewId', previews.getPreviewHandler)
  router.on(
    ['GET', 'HEAD'],
    '/previews/:previewId/source',
    previews.sourceHandler,
  )
  router.get('/connections/:id/uploads', uploads.listTasksHandler)
  router.post('/connections/:id/uploads', uploads.createTaskHandler)
  router.get('/connections/:id/uploads/:uploadId', uploads.getTaskHandler)
  router.patch('/connections/:id/uploads/:uploadId', uploads.updateTaskHandler)
  router.post(
    '/connections/:id/uploads/:uploadId/complete',
    uploads.completeTaskHandler,
  )
  router.put(
    '/connections/:id/uploads/:uploadId/parts/:partNumber',
    uploads.receivePartHandler,
  )
  router.post('/connections/:id/folders', controller.createFolderHandler)
  router.patch(
    '/connections/:id/entries/:entryId',
    controller.updateEntryHandler,
  )
  router.delete(
    '/connections/:id/entries/:entryId',
    controller.deleteEntryHandler,
  )
  router.get(
    '/connections/:id/entries/:entryId/content',
    controller.contentHandler,
  )
  return router
}
export { createDriveRouter }
