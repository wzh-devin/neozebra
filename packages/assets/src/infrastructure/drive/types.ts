import type { PrismaClient } from '@neozebra/database'
import type { RedisClientType } from 'redis'
import type {
  DriveConnectionDraft,
  DriveListFilter,
  DriveOAuthProvider,
} from '../../dto/drive/drive-dto.ts'
import type { DriveMount } from './drive-mount.ts'

type DriveInfrastructure = {
  store: PrismaClient
  redis: RedisClientType
  connectRedis: () => Promise<void>
  key: string
  origin: string
  syncNamespace: string
  uploadDirectory?: string
  previewDirectory?: string
}
type AssetsDependencies = {
  getInfrastructure: () => DriveInfrastructure
  encryptCredentials: (value: unknown, key: string) => string
  decryptCredentials: <T>(value: string, key: string) => T
  getOAuthApplication?: (provider: DriveOAuthProvider) => {
    clientId: string
    clientSecret: string
  }
  getOfficeConfig?: () => {
    url: string
    sourceOrigin: string
    jwtSecret: string
  }
}
type DriveEntry = {
  id: string
  parentId: string
  name: string
  kind: 'folder' | 'file'
  sizeBytes: number
  updatedAt: string
  mimeType?: string
}
type DrivePage = {
  entries: DriveEntry[]
  nextCursor: string | null
  path: { id: string; name: string }[]
  sync?: {
    state: string
    hasSnapshot: boolean
    generation: string | null
    asOf: string | null
    error: string | null
  }
  resetCursor?: boolean
}
type DriveCredentials = {
  accessKey?: string
  secretKey?: string
  sessionToken?: string
  accessToken?: string
  refreshToken?: string
  clientId?: string
  clientSecret?: string
}
type DriveUpload = {
  path: string
  size: number
  name: string
  mimeType: string
  taskId?: string
  checkpoint?: Record<string, unknown>
  saveCheckpoint?: (checkpoint: Record<string, unknown>) => Promise<void>
  onProgress?: (bytes: number) => Promise<void>
  assertActive?: () => Promise<void>
}
type DriveProvider = {
  connect: () => Promise<void>
  list: (filter: DriveListFilter) => Promise<DrivePage>
  get: (id: string) => Promise<DriveEntry>
  createFolder: (parent: string, name: string) => Promise<DriveEntry>
  upload: (
    parent: string,
    name: string,
    file: DriveUpload,
  ) => Promise<DriveEntry>
  abortUpload?: (checkpoint: Record<string, unknown>) => Promise<void>
  update: (
    id: string,
    patch: { name?: string; parent?: string },
  ) => Promise<DriveEntry>
  remove: (id: string) => Promise<void>
  content: (id: string, range?: string) => Promise<Response>
}
type ProviderContext = {
  mount: DriveMount
  credentials: DriveCredentials
  assertLease: () => void
  refreshCredentials: (force?: boolean) => Promise<DriveCredentials>
}
type DriveDraft = DriveConnectionDraft

export type {
  DriveInfrastructure,
  AssetsDependencies,
  DriveEntry,
  DrivePage,
  DriveCredentials,
  DriveProvider,
  ProviderContext,
  DriveDraft,
  DriveUpload,
}
