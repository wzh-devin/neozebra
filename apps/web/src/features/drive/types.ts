export type DriveProviderId = 'baidu' | 'aliyun' | 'minio'
export type DriveEntryKind = 'folder' | 'file'

export type DriveProvider = {
  id: DriveProviderId
  name: string
  description: string
  status: 'connected' | 'notConnected'
  lastSyncedAt: string
}

export type DriveTreeNode = {
  id: string
  name: string
  kind: 'folder'
  hasChildren: boolean
  children?: DriveTreeNode[]
}

export type DriveEntry = {
  id: string
  name: string
  kind: DriveEntryKind
  size: string
  updatedAt: string
  parentId: string
}
