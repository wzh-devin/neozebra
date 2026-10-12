import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import type {
  DriveConnection,
  DriveDirectory,
  DriveEntry as StoredEntry,
  Prisma,
} from '@neozebra/database'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { DriveListFilter } from '../../dto/drive/drive-dto.ts'
import type { DriveEntry, DriveInfrastructure } from './types.ts'

const cursorSchema = z.object({
  directory: z.string(),
  generation: z.string(),
  kind: z.string(),
  query: z.string(),
  name: z.string(),
  id: z.string().regex(/^\d+$/),
  at: z.number(),
})
const cursorLifetime = 300_000
const getDirectoryWhere = (row: DriveConnection) => ({
  connectionId: row.id,
  connectionVersion: row.metadataVersion,
})
const getSyncStatus = (directory?: DriveDirectory | null) => ({
  state: directory?.removedAt ? 'removed' : (directory?.state ?? 'pending'),
  hasSnapshot: Boolean(directory?.publishedGeneration),
  generation: directory?.publishedGeneration ?? null,
  asOf: directory?.lastSyncedAt?.toISOString() ?? null,
  error: directory?.error ?? null,
})
const getPathList = (
  directory: DriveDirectory | null,
  connection: DriveConnection,
) => {
  const path = z
    .array(z.object({ id: z.string(), name: z.string() }))
    .parse(directory?.path ?? [{ id: 'root', name: connection.name }])
  if (path[0]) path[0].name = connection.name
  return path
}
const getEntry = (entry: StoredEntry): DriveEntry => ({
  id: entry.remoteId,
  parentId: entry.parentRemoteId,
  name: entry.name,
  kind: entry.kind === 'folder' ? 'folder' : 'file',
  sizeBytes: Number(entry.sizeBytes),
  updatedAt: entry.remoteModifiedAt?.toISOString() ?? '',
  ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
})
const getEntryData = (entry: DriveEntry) => {
  const date = entry.updatedAt ? new Date(entry.updatedAt) : null
  return {
    remoteId: entry.id,
    parentRemoteId: entry.parentId,
    name: entry.name,
    kind: entry.kind,
    sizeBytes: BigInt(entry.sizeBytes),
    remoteModifiedAt: date && Number.isFinite(date.getTime()) ? date : null,
    mimeType: entry.mimeType ?? null,
  }
}

/**
 * 维护目录快照、同步意图和游标；网络与 Redis 不参与查询。
 *
 * @param db - Prisma 与游标签名密钥
 * @returns 元数据查询和同步状态操作
 */
const createDriveCatalog = (db: DriveInfrastructure) => {
  const getDirectory = (row: DriveConnection, remoteId: string) =>
    db.store.driveDirectory.findFirst({
      where: { ...getDirectoryWhere(row), remoteId },
    })
  const ensureDirectory = async (row: DriveConnection, remoteId: string) => {
    const previous = await getDirectory(row, remoteId)
    if (previous?.removedAt)
      throw new HTTPException(404, { message: 'This folder no longer exists.' })
    if (previous) return previous
    let parentRemoteId = 'root'
    let path = [{ id: 'root', name: row.name }]
    if (remoteId !== 'root') {
      const entry = await db.store.driveEntry.findFirst({
        where: { ...getDirectoryWhere(row), remoteId, kind: 'folder' },
        orderBy: { id: 'desc' },
      })
      if (!entry)
        throw new HTTPException(404, {
          message: 'This folder is not indexed yet. Open its parent first.',
        })
      parentRemoteId = entry.parentRemoteId
      const parent = await getDirectory(row, parentRemoteId)
      path = [...getPathList(parent, row), { id: remoteId, name: entry.name }]
    }
    return db.store.driveDirectory.create({
      data: { ...getDirectoryWhere(row), remoteId, parentRemoteId, path },
    })
  }
  const markDirty = async (row: DriveConnection, parent: string) => {
    const directory = await ensureDirectory(row, parent)
    return db.store.driveDirectory.update({
      where: { id: directory.id },
      data: {
        state: 'pending',
        requestedRevision: { increment: 1 },
        nextSyncAt: new Date(),
        error: null,
      },
    })
  }
  const signCursor = (body: string) =>
    createHmac('sha256', db.key).update(body).digest('base64url')
  const listEntries = async (row: DriveConnection, filter: DriveListFilter) => {
    const directory = await getDirectory(row, filter.parent)
    if (directory?.removedAt)
      throw new HTTPException(404, { message: 'This folder no longer exists.' })
    const sync = getSyncStatus(directory)
    if (!directory?.publishedGeneration)
      return {
        entries: [],
        nextCursor: null,
        path: getPathList(directory, row),
        sync,
      }
    let cursor: z.infer<typeof cursorSchema> | undefined
    let resetCursor = false
    if (filter.cursor) {
      try {
        const [body, signature] = filter.cursor.split('.')
        const expected = Buffer.from(signCursor(body ?? ''))
        const supplied = Buffer.from(signature ?? '')
        if (
          !body ||
          expected.length !== supplied.length ||
          !timingSafeEqual(expected, supplied)
        )
          throw new Error('cursor')
        cursor = cursorSchema.parse(
          JSON.parse(Buffer.from(body, 'base64url').toString()),
        )
        if (
          cursor.directory !== String(directory.id) ||
          cursor.kind !== filter.kind ||
          cursor.query !== filter.query ||
          cursor.at > Date.now() ||
          Date.now() - cursor.at > cursorLifetime
        )
          throw new Error('cursor')
      } catch {
        cursor = undefined
        resetCursor = true
      }
    }
    const generation = cursor?.generation ?? directory.publishedGeneration
    const where: Prisma.DriveEntryWhereInput = {
      directoryId: directory.id,
      generation,
      ...(filter.kind === 'folder' ? { kind: 'folder' } : {}),
      ...(filter.query
        ? { name: { contains: filter.query, mode: 'insensitive' } }
        : {}),
      ...(cursor
        ? {
            OR: [
              { name: { gt: cursor.name } },
              { name: cursor.name, id: { gt: BigInt(cursor.id) } },
            ],
          }
        : {}),
    }
    const entries = await db.store.driveEntry.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 101,
    })
    const last = entries[99]
    const body = last
      ? Buffer.from(
          JSON.stringify({
            directory: String(directory.id),
            generation,
            kind: filter.kind,
            query: filter.query,
            name: last.name,
            id: String(last.id),
            at: cursor?.at ?? Date.now(),
          }),
        ).toString('base64url')
      : ''
    return {
      entries: entries.slice(0, 100).map(getEntry),
      nextCursor: entries.length > 100 ? `${body}.${signCursor(body)}` : null,
      path: getPathList(directory, row),
      sync,
      resetCursor,
    }
  }
  const applyChange = async (
    row: DriveConnection,
    before: DriveEntry | undefined,
    after: DriveEntry | undefined,
  ) => {
    const parents = new Set(
      [before?.parentId, after?.parentId].filter((parent): parent is string =>
        Boolean(parent),
      ),
    )
    for (const parent of parents) {
      const directory = await ensureDirectory(row, parent)
      if (!directory.publishedGeneration) {
        // 记录写操作确认的条目供子目录初始化使用，完整列表仍等待扫描发布。
        await db.store.$transaction(async (tx) => {
          await tx.driveEntry.deleteMany({
            where: {
              directoryId: directory.id,
              generation: 'unpublished',
              remoteId: {
                in: [before?.id, after?.id].filter((id): id is string =>
                  Boolean(id),
                ),
              },
            },
          })
          if (after?.parentId === parent)
            await tx.driveEntry.create({
              data: {
                ...getDirectoryWhere(row),
                directoryId: directory.id,
                generation: 'unpublished',
                ...getEntryData(after),
              },
            })
        })
        continue
      }
      const entries = await db.store.driveEntry.findMany({
        where: {
          directoryId: directory.id,
          generation: directory.publishedGeneration,
        },
      })
      const generation = randomUUID()
      const data = entries
        .filter(
          (entry) =>
            entry.remoteId !== before?.id && entry.remoteId !== after?.id,
        )
        .map(
          ({
            id: _id,
            createdAt: _created,
            updatedAt: _updated,
            ...entry
          }) => ({ ...entry, generation }),
        )
      if (after?.parentId === parent)
        data.push({
          ...getDirectoryWhere(row),
          directoryId: directory.id,
          generation,
          ...getEntryData(after),
        })
      await db.store.$transaction(async (tx) => {
        for (let offset = 0; offset < data.length; offset += 500)
          await tx.driveEntry.createMany({
            data: data.slice(offset, offset + 500),
          })
        await tx.driveEntry.updateMany({
          where: {
            directoryId: directory.id,
            generation: directory.publishedGeneration!,
          },
          data: { updatedAt: new Date() },
        })
        await tx.driveDirectory.update({
          where: { id: directory.id },
          data: { publishedGeneration: generation },
        })
      })
    }
    if (
      before?.kind === 'folder' &&
      (before.id !== after?.id ||
        before.name !== after?.name ||
        before.parentId !== after?.parentId)
    )
      await retireSubtree(row, before.id)
    if (after?.kind === 'folder') {
      const previous = await getDirectory(row, after.id)
      if (previous?.removedAt) {
        await db.store.driveEntry.deleteMany({
          where: { directoryId: previous.id },
        })
        await db.store.driveDirectory.delete({ where: { id: previous.id } })
      }
      await ensureDirectory(row, after.id)
    }
  }
  const retireSubtree = async (
    row: DriveConnection,
    remoteId: string,
    store: Prisma.TransactionClient = db.store,
  ) => {
    let parents = [remoteId]
    while (parents.length) {
      const directories = await store.driveDirectory.findMany({
        where: {
          ...getDirectoryWhere(row),
          removedAt: null,
          OR: [
            { remoteId: { in: parents } },
            { parentRemoteId: { in: parents } },
          ],
        },
        select: { id: true, remoteId: true },
      })
      if (!directories.length) break
      const ids = directories.map((directory) => directory.id)
      await store.driveDirectory.updateMany({
        where: { id: { in: ids } },
        data: {
          removedAt: new Date(),
          state: 'removed',
          requestedRevision: { increment: 1 },
        },
      })
      parents = directories.map((directory) => directory.remoteId)
    }
  }
  return {
    getDirectory,
    ensureDirectory,
    markDirty,
    listEntries,
    retireSubtree,
    applyChange,
  }
}
export {
  createDriveCatalog,
  getDirectoryWhere,
  getSyncStatus,
  getPathList,
  getEntryData,
  cursorLifetime,
}
