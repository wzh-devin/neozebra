import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createInboxController } from '../../controller/inbox/inbox-controller.ts'
import type { InboxEnv } from '../../dto/inbox/inbox-dto.ts'
import { inboxErrorHandler, inboxSessionGuard } from './inbox-guards.ts'

/**
 * 注册 Inbox 的路由与保护，业务逻辑交给 Controller。
 *
 * @param 无参数
 * @returns 独立的 Inbox 路由实例
 */
const createInboxRouter = () => {
  const router = new Hono<InboxEnv>()
  const controller = createInboxController()
  router.onError(inboxErrorHandler)
  router.use('*', bodyLimit({ maxSize: 16 * 1024 }))
  router.use('*', inboxSessionGuard)
  router.get('/messages', controller.listMessagesHandler)
  router.get('/messages/new', controller.listNewMessagesHandler)
  router.get('/accounts', controller.listAccountsHandler)
  router.post('/accounts/qq', controller.connectQqHandler)
  router.post('/accounts/gmail', controller.connectGmailHandler)
  router.delete('/accounts/:id', controller.deleteAccountHandler)
  router.post('/sync', controller.syncHandler)
  router.get('/messages/:id', controller.getMessageHandler)
  router.patch('/messages/:id', controller.patchMessageHandler)
  router.post('/read-all', controller.readAllHandler)
  return router
}

export { createInboxRouter }
