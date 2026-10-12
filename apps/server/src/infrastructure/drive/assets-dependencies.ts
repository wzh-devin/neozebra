import type { AssetsDependencies } from '@neozebra/assets'
import { getDatabase } from '../database/database-client.ts'
import {
  encryptCredentials,
  decryptCredentials,
} from '../security/credentials.ts'

const getAssetsDependencies = (): AssetsDependencies => ({
  getInfrastructure: () => {
    const db = getDatabase()
    return {
      store: db.store,
      redis: db.redis,
      connectRedis: db.connectRedis,
      key: db.config.key,
      origin: db.config.origin,
      syncNamespace: db.syncNamespace,
      uploadDirectory: process.env.DRIVE_UPLOAD_DIRECTORY,
      previewDirectory: process.env.DRIVE_PREVIEW_DIRECTORY,
    }
  },
  encryptCredentials,
  decryptCredentials,
  getOfficeConfig: () => ({
    url: process.env.OFFICE_PUBLIC_URL ?? '',
    sourceOrigin: process.env.OFFICE_SOURCE_ORIGIN ?? '',
    jwtSecret: process.env.OFFICE_JWT_SECRET ?? '',
  }),
  getOAuthApplication: (provider) => {
    const prefix = provider === 'baidu' ? 'BAIDU' : 'ALIYUN'
    return {
      clientId: process.env[`${prefix}_DRIVE_CLIENT_ID`] ?? '',
      clientSecret: process.env[`${prefix}_DRIVE_CLIENT_SECRET`] ?? '',
    }
  },
})
export { getAssetsDependencies }
