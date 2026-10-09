import { Hono } from 'hono'
import { createHealthRouter } from './health/health-router.ts'
import { createInboxRouter } from './inbox/inbox-router.ts'
import { createTaskRouter } from './task/task-router.ts'

// 默认菜单 API 在此聚合，非默认菜单仍由独立 workspace 暴露路由。
const createApiRouter = () =>
  new Hono()
    .route('/health', createHealthRouter())
    .route('/inbox', createInboxRouter())
    .route('/task', createTaskRouter())

export { createApiRouter }
