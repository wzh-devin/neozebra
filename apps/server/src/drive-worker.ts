import {
  startDriveSyncWorker,
  startDriveUploadWorker,
  startDrivePreviewWorker,
} from '@neozebra/assets'
import { closeDatabase } from './infrastructure/database/database-client.ts'
import { getAssetsDependencies } from './infrastructure/drive/assets-dependencies.ts'

const worker = await startDriveSyncWorker(getAssetsDependencies())
const uploadWorker = await startDriveUploadWorker(getAssetsDependencies())
const previewWorker = await startDrivePreviewWorker(getAssetsDependencies())
console.info('Drive metadata, upload and preview workers ready')
let stopping = false
const shutdownHandler = async () => {
  if (stopping) return
  stopping = true
  const deadline = setTimeout(() => process.exit(1), 30_000)
  deadline.unref()
  await worker.close()
  await uploadWorker.close()
  await previewWorker.close()
  await closeDatabase()
  clearTimeout(deadline)
}
process.on('SIGINT', () => {
  void shutdownHandler()
})
process.on('SIGTERM', () => {
  void shutdownHandler()
})
