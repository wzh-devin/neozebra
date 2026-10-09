import { HTTPException } from 'hono/http-exception'

const getInboxConfig = (env = process.env) => {
  const key = env.MAIL_ENCRYPTION_KEY ?? ''
  if (!env.DATABASE_URL || !env.REDIS_URL || !/^[a-f\d]{64}$/i.test(key)) {
    throw new HTTPException(503, {
      message:
        'Configure DATABASE_URL, REDIS_URL and MAIL_ENCRYPTION_KEY in apps/server/.env.',
    })
  }
  const origin = new URL(env.APP_ORIGIN ?? 'http://localhost:5174').origin
  return {
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    key,
    origin,
    redisPrefix: 'neozebra:inbox:',
  }
}

export { getInboxConfig }
