export type DriveProviderId = 'baidu' | 'aliyun' | 'minio'
export type DriveEntryKind = 'folder' | 'file'

export type DriveProvider = {
  id: string
  providerId: DriveProviderId
  name: string
  description: string
  status: 'connected' | 'configured'
  lastSyncedAt: string
  options?: DriveMountOptions
}

export type DriveMountOptions =
  | {
      providerId: 'minio'
      endpoint: string
      bucket: string
      region: string
      prefix: string
    }
  | { providerId: 'baidu'; rootPath: string }
  | {
      providerId: 'aliyun'
      rootPath: string
      driveType: 'default' | 'resource' | 'backup'
    }

export type DriveConnectionDraft = { name: string } & (
  | {
      providerId: 'minio'
      endpoint: string
      bucket: string
      region: string
      prefix: string
      accessKey: string
      secretKey: string
      sessionToken: string
    }
  | {
      providerId: 'baidu'
      rootPath: string
      authMode: 'accessToken' | 'refreshToken'
      accessToken: string
      refreshToken: string
      clientId: string
      clientSecret: string
    }
  | {
      providerId: 'aliyun'
      rootPath: string
      driveType: 'default' | 'resource' | 'backup'
      authMode: 'accessToken' | 'refreshToken'
      accessToken: string
      refreshToken: string
      clientId: string
      clientSecret: string
    }
)

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
  localFile?: File
}
