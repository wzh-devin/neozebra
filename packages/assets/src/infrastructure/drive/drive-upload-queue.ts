import { createNodeRedisClient, Queue } from 'bullmq'
import type { DriveInfrastructure } from './types.ts'

const uploadQueueName = 'drive-uploads'
const uploadQueueMap = new Map<DriveInfrastructure['redis'], Queue>()

/**
 * 获取独立上传队列，复用现有Redis连接与命名空间。
 *
 * @param db - 基础设施
 * @returns 上传队列
 */
const getDriveUploadQueue = async (db: DriveInfrastructure) => {
  await db.connectRedis()
  let queue = uploadQueueMap.get(db.redis)
  if (!queue) {
    queue = new Queue(uploadQueueName, {
      connection: createNodeRedisClient(db.redis),
      prefix: db.syncNamespace,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    })
    queue.on('error', () => console.error('Drive upload queue unavailable'))
    uploadQueueMap.set(db.redis, queue)
  }
  return queue
}

/**
 * 幂等唤醒上传任务，允许用户重试已耗尽自动重试的任务。
 *
 * @param db - 基础设施
 * @param taskId - 数据库任务标识
 * @returns 无返回值；写入队列
 */
const enqueueDriveUpload = async (db: DriveInfrastructure, taskId: bigint) => {
  const queue = await getDriveUploadQueue(db)
  const jobId = 'upload-' + taskId
  const previous = await queue.getJob(jobId)
  if (previous && (await previous.isFailed())) await previous.remove()
  await queue.add('upload', { taskId: String(taskId) }, { jobId })
}

/**
 * 关闭指定Redis连接的上传生产队列。
 *
 * @param redis - 需关闭的连接；省略则关闭所有
 * @returns 无返回值；释放队列
 */
const closeDriveUploadQueues = async (redis?: DriveInfrastructure['redis']) => {
  for (const [client, queue] of uploadQueueMap) {
    if (redis && redis !== client) continue
    await queue.close()
    uploadQueueMap.delete(client)
  }
}

export {
  uploadQueueName,
  getDriveUploadQueue,
  enqueueDriveUpload,
  closeDriveUploadQueues,
}
