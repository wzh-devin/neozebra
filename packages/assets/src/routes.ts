import { Hono } from 'hono'

const assetsRoutes = new Hono()

assetsRoutes.get('/health', (context) =>
  context.json({ status: 'ok', module: 'assets' }),
)

export { assetsRoutes }
