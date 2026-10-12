import { createNodeRedisClient, Queue } from 'bullmq'
import type { DriveInfrastructure } from './types.ts'

const queueName = 'drive-metadata'
const queues = new Map<DriveInfrastructure['redis'], Queue>()
const getDriveQueue = async (db: DriveInfrastructure) => {
  await db.connectRedis()
  let queue = queues.get(db.redis)
  if (!queue) {
    queue = new Queue(queueName, {
      connection: createNodeRedisClient(db.redis),
      prefix: db.syncNamespace,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    })
    queue.on('error', () => console.error('Drive sync queue unavailable'))
    queues.set(db.redis, queue)
  }
  return queue
}
const enqueueDriveDirectory = async (
  db: DriveInfrastructure,
  directoryId: bigint,
  priority = 10,
) => {
  const queue = await getDriveQueue(db)
  await queue.add(
    'directory',
    { directoryId: String(directoryId) },
    {
      priority,
      deduplication: { id: String(directoryId), keepLastIfActive: true },
    },
  )
}
const closeDriveQueues = async (redis?: DriveInfrastructure['redis']) => {
  for (const [client, queue] of queues) {
    if (redis && client !== redis) continue
    await queue.close()
    queues.delete(client)
  }
}
export { queueName, getDriveQueue, enqueueDriveDirectory, closeDriveQueues }
