import { Hono } from 'hono'
import { createHealthController } from '../../controller/health/health-controller.ts'

const createHealthRouter = () =>
  new Hono().get('/', createHealthController().getHealthHandler)

export { createHealthRouter }
