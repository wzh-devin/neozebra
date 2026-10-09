import { Pool } from 'pg'
import { createClient } from 'redis'

import { getInboxConfig } from '../config/inbox-config.ts'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.ts'

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
    if (redis.isOpen) redis.destroy()
    await pool.end()
  }
  const store = drizzle({ client: pool, schema })
  return { store, redis, config, connectRedis, close }
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
