import { createNodeRedisClient, Queue } from 'bullmq'
import type { DriveInfrastructure } from './types.ts'

const previewQueueName = 'drive-previews'
const previewQueueMap = new Map<DriveInfrastructure['redis'], Queue>()

// 复用项目Redis连接；文档引擎负责转换，队列只暂存私有源。
const getDrivePreviewQueue = async (db: DriveInfrastructure) => {
  await db.connectRedis()
  let queue = previewQueueMap.get(db.redis)
  if (!queue) {
    queue = new Queue(previewQueueName, {
      connection: createNodeRedisClient(db.redis),
      prefix: db.syncNamespace,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    })
    queue.on('error', () => console.error('Drive preview queue unavailable'))
    previewQueueMap.set(db.redis, queue)
  }
  return queue
}
const enqueueDrivePreview = async (db: DriveInfrastructure, taskId: bigint) =>
  (await getDrivePreviewQueue(db)).add(
    'source',
    { taskId: String(taskId) },
    { jobId: 'preview-' + taskId },
  )
const closeDrivePreviewQueues = async (
  redis?: DriveInfrastructure['redis'],
) => {
  for (const [client, queue] of previewQueueMap) {
    if (redis && redis !== client) continue
    await queue.close()
    previewQueueMap.delete(client)
  }
}
export {
  previewQueueName,
  getDrivePreviewQueue,
  enqueueDrivePreview,
  closeDrivePreviewQueues,
}
