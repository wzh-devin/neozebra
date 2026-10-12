import { createHash } from 'node:crypto'
import {
  closeDriveQueues,
  closeDriveUploadQueues,
  closeDrivePreviewQueues,
} from '@neozebra/assets'
import { Pool } from 'pg'
import { createClient } from 'redis'
import { PrismaClient } from '@neozebra/database'
import { PrismaPg } from '@prisma/adapter-pg'

import { getInboxConfig } from '../config/inbox-config.ts'

const createDatabase = () => {
  const config = getInboxConfig()
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    options: '-c timezone=UTC',
    connectionTimeoutMillis: 5000,
    statement_timeout: 10_000,
  })
  const redis = createClient({
    url: config.redisUrl,
    socket: { connectTimeout: 5000, reconnectStrategy: false },
    disableOfflineQueue: true,
  })

  // 日志不包含连接串、邮箱地址或上游凭据。
  pool.on('error', () => console.error('PostgreSQL connection unavailable'))
  redis.on('error', () => console.error('Redis connection unavailable'))
  let connecting: Promise<unknown> | undefined
  const connectRedis = async () => {
    if (redis.isReady) return
    connecting ??= redis.connect().finally(() => {
      connecting = undefined
    })
    await connecting
  }
  const close = async () => {
    await closeDriveQueues(redis)
    await closeDriveUploadQueues(redis)
    await closeDrivePreviewQueues(redis)
    if (redis.isOpen) redis.destroy()
    await store.$disconnect()
    await pool.end()
  }
  const schema =
    new URL(config.databaseUrl).searchParams.get('schema') ?? 'public'
  const store = new PrismaClient({
    adapter: new PrismaPg(pool, { schema }),
    transactionOptions: { maxWait: 5000, timeout: 30_000 },
  })
  const url = new URL(config.databaseUrl)
  const syncNamespace =
    'neozebra-' +
    createHash('sha256')
      .update(`${url.hostname}:${url.port}${url.pathname}:${schema}`)
      .digest('hex')
      .slice(0, 16)
  return { pool, store, redis, config, connectRedis, close, syncNamespace }
}

type Database = ReturnType<typeof createDatabase>
let database: Database | undefined
const getDatabase = (): Database => (database ??= createDatabase())
const closeDatabase = async () => {
  await database?.close()
  database = undefined
}

export { createDatabase, getDatabase, closeDatabase }
export type { Database }
