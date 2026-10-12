import { randomUUID } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import type { DriveInfrastructure } from './types.ts'

const leaseScript =
  'if redis.call("GET",KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE",KEYS[1],ARGV[2]) else return 0 end'
const releaseScript =
  'if redis.call("GET",KEYS[1]) == ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end'

/**
 * 用带续租与所有权检查的 Redis 锁串行化单连接操作，失去锁后禁止继续写入。
 *
 * @param db - Redis 与数据库基础设施
 * @param key - 连接或配置锁键
 * @param action - 接收锁检查函数的业务操作
 * @returns 操作结果；锁占用或 Redis 故障时保留现有远端数据
 */
const withDriveLease = async <T>(
  db: DriveInfrastructure,
  key: string,
  action: (assertLease: () => void) => Promise<T>,
): Promise<T> => {
  await db.connectRedis()
  const token = randomUUID()
  let acquired = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await db.redis.set(key, token, { NX: true, PX: 180_000 })) {
      acquired = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  if (!acquired)
    throw new HTTPException(409, {
      message: 'This Drive is busy. Wait for the current operation and retry.',
    })
  let valid = true
  let expiresAt = Date.now() + 180_000
  const timer = setInterval(() => {
    void db.redis
      .eval(leaseScript, { keys: [key], arguments: [token, '180000'] })
      .then((result) => {
        if (result !== 1) valid = false
        else expiresAt = Date.now() + 180_000
      })
      .catch(() => {
        valid = false
      })
  }, 30_000)
  timer.unref()
  const assertLease = () => {
    if (!valid || Date.now() >= expiresAt)
      throw new HTTPException(503, {
        message:
          'The storage operation lock was lost. Refresh the folder before retrying.',
      })
  }
  try {
    return await action(assertLease)
  } finally {
    clearInterval(timer)
    await db.redis
      .eval(releaseScript, { keys: [key], arguments: [token] })
      .catch(() => undefined)
  }
}
export { withDriveLease }
