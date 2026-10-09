import { createServer } from 'node:http'
import { getRequestListener } from '@hono/node-server'

import { createApp } from './app.ts'
import { getServerConfig } from './infrastructure/config/server-config.ts'
import { closeDatabase } from './infrastructure/database/database-client.ts'

const app = createApp()
const config = getServerConfig(process.env)
const server = createServer(getRequestListener(app.fetch))

const listenHandler = () => {
  console.info(`Neozebra API listening on ${config.hostname}:${config.port}`)
}

const serverErrorHandler = (error: Error) => {
  console.error('Neozebra API server failed:', error)
  process.exitCode = 1
}

// 给在途请求留出关闭时间，并限制无法完成的请求对退出的阻塞。
const shutdownHandler = () => {
  const shutdownTimeout = setTimeout(() => {
    server.closeAllConnections()
  }, 10_000)
  shutdownTimeout.unref()

  const closeHandler = async (error?: Error) => {
    clearTimeout(shutdownTimeout)
    await closeDatabase()
    if (error) {
      serverErrorHandler(error)
    }
  }

  server.close(closeHandler)
}

server.once('listening', listenHandler)
server.once('error', serverErrorHandler)
process.once('SIGINT', shutdownHandler)
process.once('SIGTERM', shutdownHandler)
server.listen(config.port, config.hostname)
