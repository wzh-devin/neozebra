type DriveUploadStatus =
  | 'waiting'
  | 'preparing'
  | 'receiving'
  | 'queued'
  | 'transferring'
  | 'paused'
  | 'failed'
  | 'completed'
  | 'cancelled'
type DriveUploadTask = {
  id: string
  parent: string
  directoryName: string
  directoryPath?: string[]
  name: string
  mimeType: string
  size: number
  fingerprint: string
  partSize: number
  partCount: number
  receivedBytes: number
  transferredBytes: number
  status: DriveUploadStatus
  phase: 'receiving' | 'remote'
  error: string | null
  revision: number
  createdAt: string
  updatedAt: string
  expiresAt: string
  preparedBytes?: number
  inFlightBytes?: number
  bytesPerSecond?: number
}
type DriveUploadAction = 'pause' | 'resume' | 'cancel' | 'retry'
type DriveUploadPage = { tasks: DriveUploadTask[]; nextCursor: string | null }
type DriveUploadTablePage = {
  tasks: DriveUploadTask[]
  total: number
  page: number
  pageSize: number
}
type DriveUploadDetails = {
  task: DriveUploadTask
  parts: { partNumber: number; sha256: string; sizeBytes: number }[]
  nextPart: number | null
}
export type {
  DriveUploadTask,
  DriveUploadAction,
  DriveUploadPage,
  DriveUploadTablePage,
  DriveUploadDetails,
}
