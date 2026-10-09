import type { Context } from 'hono'

const createHealthController = () => ({
  getHealthHandler: (context: Context) =>
    context.json({ status: 'ok', service: 'neozebra-server' }),
})

export { createHealthController }
