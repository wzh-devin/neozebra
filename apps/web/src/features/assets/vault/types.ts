type VaultEntry = {
  id: string
  parentId: string
  name: string
  kind: 'file' | 'folder'
  state: string
  size: string
  mime: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}
type EntryPage = {
  entries: VaultEntry[]
  path: VaultEntry[]
  nextCursor: string
  revision: string
}
type VaultEntryLocation = Pick<VaultEntry, 'id' | 'parentId'>
type VaultUpload = {
  idempotencyKey?: string
  id: string
  entryId: string
  parentId: string
  name: string
  size: string
  partSize: string
  partCount: number
  fingerprint: string
  state:
    | 'preparing'
    | 'uploading'
    | 'paused'
    | 'completing'
    | 'completed'
    | 'cancelled'
    | 'failed'
  error?: string
  expiresAt: string
}
type FileAction = 'rename' | 'move' | 'trash' | 'restore' | 'purge'
type VaultViewMode = 'list' | 'thumbnail'
type UploadStatus =
  'all' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled'
type UploadSort = 'newest' | 'oldest' | 'size-desc' | 'size-asc'
type UploadFilter = { status: UploadStatus; sort: UploadSort; search: string }
type UploadPage = { uploads: VaultUpload[]; nextCursor: string }
type UploadPart = {
  number: number
  sha256: string
  size: string
  etag?: string
}
type UploadDetail = { upload: VaultUpload; parts: UploadPart[] }
export type {
  VaultEntry,
  VaultEntryLocation,
  EntryPage,
  VaultUpload,
  UploadPart,
  UploadDetail,
  FileAction,
  VaultViewMode,
  UploadStatus,
  UploadSort,
  UploadFilter,
  UploadPage,
}
