import { randomUUID } from 'node:crypto'
import type { DriveConnection } from '@neozebra/database'
import { HTTPException } from 'hono/http-exception'
import { withDriveLease } from './drive-lease.ts'
import { createDriveCatalog } from './drive-catalog.ts'
import { enqueueDriveDirectory } from './drive-queue.ts'
import { driveMountSchema } from './drive-mount.ts'
import type { DriveMount } from './drive-mount.ts'
import type { DriveListFilter } from '../../dto/drive/drive-dto.ts'
import type {
  AssetsDependencies,
  DriveCredentials,
  DriveEntry,
  DriveDraft,
  DrivePage,
  DriveProvider,
  DriveUpload,
} from './types.ts'
import { normalizeRootPath } from './drive-utils.ts'
import { createMinioProvider } from './providers/minio-provider.ts'
import { createBaiduProvider } from './providers/baidu-provider.ts'
import { createAliyunProvider } from './providers/aliyun-provider.ts'
import { exchangeDriveToken } from './oauth-token.ts'
import type { DriveAuthorization } from './oauth-token.ts'

const getPublicConnection = (row: DriveConnection) => {
  const { providerId, ...options } = driveMountSchema.parse(row.mountOptions)
  const {
    driveId: _driveId,
    rootId: _rootId,
    ...publicOptions
  } = {
    driveId: undefined as string | undefined,
    rootId: undefined as string | undefined,
    ...options,
  }
  return {
    id: row.publicId,
    providerId,
    name: row.name,
    description:
      providerId === 'minio'
        ? 'S3 compatible object storage'
        : providerId === 'baidu'
          ? 'Baidu Netdisk'
          : 'Aliyun Drive',
    status: 'connected' as const,
    lastSyncedAt: row.lastCheckedAt.toISOString(),
    revision: row.revision,
    options: { providerId, ...publicOptions },
  }
}

/**
 * 将连接表、凭据加密、缓存和三种存储适配器组合为 Assets 业务操作。
 *
 * @param dependencies - 网关注入的现有数据库、Redis 与加密方法
 * @returns Drive 的连接、目录、写操作和下载服务
 */
const createDriveService = (dependencies: AssetsDependencies) => {
  const getStore = () => dependencies.getInfrastructure().store
  const getConnection = async (
    owner: string,
    id: string,
  ): Promise<DriveConnection> => {
    const row = await getStore().driveConnection.findFirst({
      where: { ownerId: owner, publicId: id },
    })
    if (!row)
      throw new HTTPException(404, {
        message: 'This Drive connection no longer exists.',
      })
    return row
  }
  const getLockKey = (owner: string, id: string) =>
    `drive:operation:${owner}:${id}`
  const getCredentials = (row: DriveConnection) =>
    dependencies.decryptCredentials<DriveCredentials>(
      row.encryptedCredentials,
      dependencies.getInfrastructure().key,
    )
  const getPublic = getPublicConnection
  const getProvider = (
    mount: DriveMount,
    credentials: DriveCredentials,
    assertLease: () => void,
    refreshCredentials: (force?: boolean) => Promise<DriveCredentials>,
  ) => {
    const context = { mount, credentials, assertLease, refreshCredentials }
    return mount.providerId === 'minio'
      ? createMinioProvider(context)
      : mount.providerId === 'baidu'
        ? createBaiduProvider(context)
        : createAliyunProvider(context)
  }
  const refreshToken = async (
    mount: DriveMount,
    credentials: DriveCredentials,
  ) => {
    if (mount.providerId === 'minio') return { credentials, expiresAt: null }
    return exchangeDriveToken(mount.providerId, credentials, {
      grant_type: 'refresh_token',
    })
  }
  const withProvider = async <T>(
    owner: string,
    id: string,
    action: (
      provider: DriveProvider,
      row: DriveConnection,
      assertLease: () => void,
    ) => Promise<T>,
    isWrite = false,
  ): Promise<T> => {
    const db = dependencies.getInfrastructure()
    return withDriveLease(db, getLockKey(owner, id), async (assertLease) => {
      const row = await getConnection(owner, id)
      const mount = driveMountSchema.parse(row.mountOptions)
      const runAction = async (assertResourceLease: () => void = () => {}) => {
        const assertOperationLease = () => {
          assertLease()
          assertResourceLease()
        }
        let credentials = getCredentials(row)
        const refreshCredentials = async (force = false) => {
          if (
            mount.providerId === 'minio' ||
            (!force &&
              credentials.accessToken &&
              (!row.tokenExpiresAt ||
                row.tokenExpiresAt.getTime() > Date.now() + 60_000))
          )
            return credentials
          const refreshed = await refreshToken(mount, credentials)
          assertOperationLease()
          credentials = refreshed.credentials
          await getStore().driveConnection.update({
            where: { id: row.id },
            data: {
              encryptedCredentials: dependencies.encryptCredentials(
                credentials,
                db.key,
              ),
              tokenExpiresAt: refreshed.expiresAt,
            },
          })
          row.tokenExpiresAt = refreshed.expiresAt
          return credentials
        }
        await refreshCredentials()
        const provider = getProvider(
          mount,
          credentials,
          assertOperationLease,
          refreshCredentials,
        )
        const result = await action(provider, row, assertOperationLease)
        assertOperationLease()
        return result
      }
      if (isWrite && mount.providerId === 'minio') {
        // 多个连接可能挂载同一桶；桶级写锁阻止同时校验通过后覆盖同名对象。
        return withDriveLease(
          db,
          `drive:bucket-write:${mount.bucket}`,
          runAction,
        )
      }
      return runAction()
    })
  }
  const getCatalog = () => createDriveCatalog(dependencies.getInfrastructure())
  const mutate = async (
    owner: string,
    id: string,
    action: (
      provider: DriveProvider,
      parents: Set<string>,
    ) => Promise<{ before?: DriveEntry; after?: DriveEntry }>,
  ) => {
    const directories: bigint[] = []
    try {
      return await withProvider(
        owner,
        id,
        async (provider, row, assertLease) => {
          const parents = new Set<string>()
          const catalog = getCatalog()
          let failure: unknown
          let failed = false
          try {
            const result = await action(provider, parents)
            assertLease()
            await catalog.applyChange(row, result.before, result.after)
          } catch (error) {
            failure = error
            failed = true
          }
          assertLease()
          if (!parents.size) parents.add('root')
          for (const parent of parents) {
            try {
              let directory
              try {
                directory = await catalog.markDirty(row, parent)
              } catch (error) {
                if (!(error instanceof HTTPException) || error.status !== 404)
                  throw error
                directory = await catalog.markDirty(row, 'root')
              }
              directories.push(directory.id)
            } catch (error) {
              if (!failed) {
                failure = error
                failed = true
              }
            }
          }
          if (failed) throw failure
        },
        true,
      )
    } finally {
      for (const directoryId of directories)
        await enqueueDriveDirectory(
          dependencies.getInfrastructure(),
          directoryId,
          1,
        ).catch(() => undefined)
    }
  }
  const requestSync = async (
    owner: string,
    id: string,
    parent: string,
    refresh = false,
  ) => {
    const db = dependencies.getInfrastructure()
    const row = await getConnection(owner, id)
    const catalog = getCatalog()

    /**
     * 在短事务内续租活跃目录，避免心跳与远端扫描争用连接锁。
     *
     * @param connection - 当前元数据版本的连接
     * @returns 更新后的目录；写入活跃期限并缩短下一次同步时间
     */
    const activateDirectory = async (connection: DriveConnection) => {
      const directory = refresh
        ? await catalog.markDirty(connection, parent)
        : await catalog.ensureDirectory(connection, parent)
      const activeUntil = new Date(Date.now() + 150_000)
      await db.store.driveConnection.update({
        where: {
          id: connection.id,
          metadataVersion: connection.metadataVersion,
        },
        data: { syncActiveUntil: activeUntil },
      })
      return db.store.$transaction(async (tx) => {
        const activated = await tx.driveDirectory.update({
          where: { id: directory.id, removedAt: null },
          data: { activeUntil },
        })
        const nextSyncAt = new Date(Date.now() + 60_000)
        return activated.nextSyncAt > nextSyncAt
          ? tx.driveDirectory.update({
              where: { id: directory.id },
              data: { nextSyncAt },
            })
          : activated
      })
    }

    // 已索引目录只写同步意图；仅首次创建目录记录需要与扫描串行，避免重复创建。
    const directory = (await catalog.getDirectory(row, parent))
      ? await activateDirectory(row)
      : await withDriveLease(db, getLockKey(owner, id), async () =>
          activateDirectory(await getConnection(owner, id)),
        )
    if (
      refresh ||
      !directory.publishedGeneration ||
      directory.nextSyncAt.getTime() <= Date.now()
    )
      await enqueueDriveDirectory(db, directory.id, 1).catch(() => undefined)
    return { ok: true }
  }
  const listConnections = async (owner: string) =>
    (
      await getStore().driveConnection.findMany({
        where: { ownerId: owner },
        orderBy: { id: 'asc' },
      })
    ).map(getPublic)
  /**
   * 授权前检查已有连接归属、类型与版本；保存时仍在锁内复核。
   *
   * @param owner - 当前会话归属
   * @param draft - 预期类型和版本
   * @param id - 已有连接标识
   * @returns 无返回值；失效或版本冲突抛出安全错误
   */
  const validateConnection = async (
    owner: string,
    draft: DriveDraft,
    id: string,
  ) => {
    const row = await getConnection(owner, id)
    if (row.provider !== draft.providerId || row.revision !== draft.revision)
      throw new HTTPException(409, {
        message: 'This connection changed. Reload it before authorizing again.',
      })
  }
  const saveConnection = async (
    owner: string,
    draft: DriveDraft,
    id?: string,
    authorization?: DriveAuthorization,
  ) => {
    const db = dependencies.getInfrastructure()
    const publicId = id ?? randomUUID()
    return withDriveLease(
      db,
      getLockKey(owner, publicId),
      async (assertLease) => {
        const previous = id ? await getConnection(owner, id) : undefined
        if (
          previous &&
          (draft.providerId !== previous.provider ||
            draft.revision !== previous.revision)
        )
          throw new HTTPException(409, {
            message: 'This connection changed. Reload it before saving.',
          })
        const oldCredentials = previous ? getCredentials(previous) : {}
        const credentials: DriveCredentials = { ...oldCredentials }
        let mount: DriveMount
        if (draft.providerId === 'minio') {
          const url = new URL(draft.endpoint)
          if (
            !/^(?!\d+\.\d+\.\d+\.\d+$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(
              draft.bucket,
            ) ||
            draft.bucket.includes('..') ||
            draft.bucket.includes('.-') ||
            draft.bucket.includes('-.')
          )
            throw new HTTPException(400, {
              message: 'Use a valid S3 bucket name.',
            })
          const prefix = draft.prefix.replace(/^\/+|\/+$/g, '')
          if (
            prefix.split('/').some((part) => part === '.' || part === '..') ||
            prefix.includes('\\')
          )
            throw new HTTPException(400, {
              message: 'Use an object prefix without dot segments.',
            })
          mount = {
            providerId: 'minio',
            endpoint: url.origin,
            bucket: draft.bucket,
            prefix: prefix ? prefix + '/' : '',
            region: draft.region || 'us-east-1',
          }
          if (
            url.pathname !== '/' ||
            url.search ||
            url.hash ||
            url.username ||
            url.password
          )
            throw new HTTPException(400, {
              message: 'The endpoint must be an HTTP(S) origin.',
            })
          for (const key of ['accessKey', 'secretKey', 'sessionToken'] as const)
            if (draft[key]) credentials[key] = draft[key]
          if (!credentials.accessKey || !credentials.secretKey)
            throw new HTTPException(400, {
              message: 'Enter the Access Key and Secret Key.',
            })
        } else {
          mount =
            draft.providerId === 'baidu'
              ? {
                  providerId: 'baidu',
                  rootPath: normalizeRootPath(draft.rootPath),
                }
              : {
                  providerId: 'aliyun',
                  rootPath: normalizeRootPath(draft.rootPath),
                  driveType: draft.driveType,
                  driveId: '',
                  rootId: '',
                }
          if (!previous && !authorization)
            throw new HTTPException(400, {
              message:
                'Connect this provider using its official authorization login.',
            })
          if (authorization)
            Object.assign(credentials, authorization.credentials)
          if (
            !credentials.refreshToken ||
            !credentials.clientId ||
            !credentials.clientSecret
          )
            throw new HTTPException(401, {
              message: 'Authorize this Drive account again.',
            })
        }
        let current = credentials
        let expiresAt =
          authorization?.expiresAt ?? previous?.tokenExpiresAt ?? null
        const refreshCredentials = async (force = false) => {
          if (
            mount.providerId === 'minio' ||
            (!force &&
              current.accessToken &&
              (!expiresAt || expiresAt.getTime() > Date.now() + 60_000))
          )
            return current
          const refreshed = await refreshToken(mount, current)
          assertLease()

          // 原 refresh token 轮换后立即持久化，目录验证失败也不能丢失新凭据。
          if (
            previous &&
            current.refreshToken === oldCredentials.refreshToken &&
            current.clientId === oldCredentials.clientId &&
            current.clientSecret === oldCredentials.clientSecret
          ) {
            await getStore().driveConnection.update({
              where: { id: previous.id },
              data: {
                encryptedCredentials: dependencies.encryptCredentials(
                  refreshed.credentials,
                  db.key,
                ),
                tokenExpiresAt: refreshed.expiresAt,
              },
            })
          }
          current = refreshed.credentials
          expiresAt = refreshed.expiresAt
          return current
        }
        await refreshCredentials()
        await getProvider(
          mount,
          current,
          assertLease,
          refreshCredentials,
        ).connect()
        assertLease()
        const values = {
          name: draft.name,
          provider: draft.providerId,
          mountOptions: mount,
          encryptedCredentials: dependencies.encryptCredentials(
            current,
            db.key,
          ),
          tokenExpiresAt: expiresAt,
          lastCheckedAt: new Date(),
        }
        const saved = previous
          ? await getStore().driveConnection.update({
              where: { id: previous.id },
              data: {
                ...values,
                revision: previous.revision + 1,
                ...(authorization ||
                JSON.stringify(
                  driveMountSchema.parse(previous.mountOptions),
                ) !== JSON.stringify(mount) ||
                (draft.providerId === 'minio' &&
                  (draft.accessKey || draft.secretKey || draft.sessionToken))
                  ? { metadataVersion: { increment: 1 } }
                  : {}),
              },
            })
          : await getStore().driveConnection.create({
              data: { ...values, ownerId: owner, publicId },
            })
        return getPublic(saved)
      },
    )
  }
  const deleteConnection = async (owner: string, id: string) =>
    withDriveLease(
      dependencies.getInfrastructure(),
      getLockKey(owner, id),
      async () => {
        const row = await getConnection(owner, id)
        await getStore().driveConnection.delete({ where: { id: row.id } })
        await getStore().driveEntry.deleteMany({
          where: { connectionId: row.id },
        })
        await getStore().driveDirectory.deleteMany({
          where: { connectionId: row.id },
        })
      },
    )
  const listEntries = async (
    owner: string,
    id: string,
    filter: DriveListFilter,
  ): Promise<DrivePage> =>
    getCatalog().listEntries(await getConnection(owner, id), filter)
  const getContent = async (
    owner: string,
    id: string,
    entryId: string,
    range?: string,
  ) =>
    withProvider(owner, id, async (provider) => {
      const entry = await provider.get(entryId)
      if (entry.kind !== 'file')
        throw new HTTPException(400, {
          message: 'Only files can be downloaded.',
        })
      return { entry, response: await provider.content(entryId, range) }
    })
  return {
    getConnection,
    listConnections,
    validateConnection,
    saveConnection,
    deleteConnection,
    listEntries,
    requestSync,
    withRemoteProvider: withProvider,
    getContent,
    createFolder: (owner: string, id: string, parent: string, name: string) =>
      mutate(owner, id, async (provider, parents) => {
        parents.add(parent)
        return { after: await provider.createFolder(parent, name) }
      }),
    ensureUploadFolder: (
      owner: string,
      id: string,
      parent: string,
      name: string,
      connectionVersion: number,
    ) =>
      withProvider(
        owner,
        id,
        async (provider, connection, assertLease) => {
          if (connection.metadataVersion !== connectionVersion)
            throw new HTTPException(409, {
              message:
                'This account or mounted folder changed. Start a new upload.',
            })
          let cursor = ''
          const cursorSet = new Set<string>()
          const catalog = getCatalog()
          while (true) {
            if (cursorSet.has(cursor))
              throw new HTTPException(503, {
                message: 'Could not read the destination folder. Retry.',
              })
            cursorSet.add(cursor)
            const page = await provider.list({
              parent,
              cursor,
              query: name,
              kind: 'all',
              refresh: '0',
            })
            const existing = page.entries.find((entry) => entry.name === name)
            if (existing) {
              if (existing.kind !== 'folder')
                throw new HTTPException(409, {
                  message:
                    'A file already uses this destination folder name. Rename it or choose another location.',
                })
              assertLease()
              const directory = await catalog.getDirectory(
                connection,
                existing.id,
              )
              if (!directory || directory.removedAt)
                await catalog.applyChange(connection, undefined, existing)
              return existing
            }
            if (!page.nextCursor) break
            cursor = page.nextCursor
          }
          const folder = await provider.createFolder(parent, name)
          assertLease()
          await catalog.applyChange(connection, undefined, folder)
          const directory = await catalog.markDirty(connection, parent)
          await enqueueDriveDirectory(
            dependencies.getInfrastructure(),
            directory.id,
            1,
          ).catch(() => undefined)
          return folder
        },
        true,
      ),
    upload: (
      owner: string,
      id: string,
      parent: string,
      name: string,
      file: DriveUpload,
    ) =>
      mutate(owner, id, async (provider, parents) => {
        parents.add(parent)
        return { after: await provider.upload(parent, name, file) }
      }),
    updateEntry: (
      owner: string,
      id: string,
      entryId: string,
      patch: { name?: string; parent?: string },
    ) =>
      mutate(owner, id, async (provider, parents) => {
        const before = await provider.get(entryId)
        parents.add(before.parentId)
        if (patch.parent) parents.add(patch.parent)
        return { before, after: await provider.update(entryId, patch) }
      }),
    deleteEntry: (owner: string, id: string, entryId: string) =>
      mutate(owner, id, async (provider, parents) => {
        const before = await provider.get(entryId)
        parents.add(before.parentId)
        await provider.remove(entryId)
        return { before }
      }),
  }
}
export { createDriveService, withDriveLease }
