import { Hono } from 'hono'
import { createDriveRouter } from './router/drive/drive-router.ts'
import type { AssetsDependencies } from './infrastructure/drive/types.ts'

// 非默认菜单业务独立于网关，通过依赖注入复用现有基础设施。
const createAssetsRouter = (dependencies: AssetsDependencies) =>
  new Hono()
    .get('/health', (context) =>
      context.json({ status: 'ok', module: 'assets' }),
    )
    .route('/drive', createDriveRouter(dependencies))
export { createAssetsRouter }
