// oxlint-disable no-control-regex -- 路径与标识边界必须拒绝控制字符。

import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { Client, CopyConditions } from 'minio'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import {
  decodeEntryId,
  encodeEntryId,
  matchesDriveFilter,
  providerError,
} from '../drive-utils.ts'
import type { DriveEntry, DriveProvider, ProviderContext } from '../types.ts'

/**
 * 使用用户配置的MinIO端点和对象前缀，所有文件操作均限制在挂载范围。
 *
 * @param context - 已验证配置、密钥与操作锁检查
 * @returns MinIO真实文件适配器；目录移动先复制全部对象再删除源对象
 */
const createMinioProvider = (context: ProviderContext): DriveProvider => {
  const mount = context.mount
  if (mount.providerId !== 'minio') throw providerError()
  const endpoint = new URL(mount.endpoint)
  if (
    endpoint.pathname !== '/' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !['http:', 'https:'].includes(endpoint.protocol)
  )
    throw new HTTPException(400, {
      message: 'The endpoint must be an HTTP(S) origin.',
    })
  const client = new Client({
    endPoint: endpoint.hostname,
    port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
    useSSL: endpoint.protocol === 'https:',
    accessKey: context.credentials.accessKey,
    secretKey: context.credentials.secretKey,
    sessionToken: context.credentials.sessionToken || undefined,
    region: mount.region || 'us-east-1',
  })
  client.setRequestOptions({
    agent:
      endpoint.protocol === 'https:'
        ? new HttpsAgent({ timeout: 20_000 })
        : new HttpAgent({ timeout: 20_000 }),
  })
  const rootPrefix = mount.prefix
  const getKey = (id: string): string => {
    const key = id === 'root' ? rootPrefix : decodeEntryId(id)
    if (
      !key.startsWith(rootPrefix) ||
      key.split('/').some((part) => part === '.' || part === '..') ||
      key.includes('\\') ||
      (key === rootPrefix && id !== 'root') ||
      /[\x00-\x1f\x7f]/.test(key)
    )
      throw new HTTPException(403, {
        message: 'This item is outside the mounted folder.',
      })
    return key
  }
  const getId = (key: string): string =>
    key === rootPrefix ? 'root' : encodeEntryId(key)
  const getParentKey = (key: string): string =>
    key.replace(/\/$/, '').slice(0, key.replace(/\/$/, '').lastIndexOf('/') + 1)
  const getPathList = (key: string) => {
    const path = [{ id: 'root', name: '' }]
    let prefix = rootPrefix
    for (const part of key
      .slice(rootPrefix.length)
      .split('/')
      .filter(Boolean)) {
      prefix += part + '/'
      path.push({ id: getId(prefix), name: part })
    }
    return path
  }
  const isMissing = (error: unknown): boolean =>
    Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['NoSuchKey', 'NotFound', 'NoSuchObject'].includes(String(error.code)),
    )
  const hasKey = async (key: string): Promise<boolean> => {
    if (key.endsWith('/')) {
      for await (const object of client.listObjectsV2(mount.bucket, key, true))
        if (object.name) return true
      return false
    }
    try {
      await client.statObject(mount.bucket, key)
      return true
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  /**
   * 代理可能删除HEAD长度/ETag，仅在元数据无效时从精确对象列表补齐，保留任务标记。
   *
   * @param key - 挂载范围内的对象键
   * @returns 已核验的对象元数据；无法核验时抛错，不推测大小或任务成功
   */
  const getObjectStat = async (key: string) => {
    const stat = await client.statObject(mount.bucket, key)
    if (
      Number.isSafeInteger(stat.size) &&
      stat.size >= 0 &&
      stat.etag &&
      !stat.etag.startsWith('W/') &&
      Number.isFinite(stat.lastModified.getTime())
    )
      return stat
    for await (const object of client.listObjectsV2(mount.bucket, key, true)) {
      if (object.name !== key) break
      if (
        !Number.isSafeInteger(object.size) ||
        object.size < 0 ||
        !object.etag ||
        !Number.isFinite(object.lastModified.getTime())
      )
        break
      return {
        ...stat,
        size: object.size,
        etag: object.etag,
        lastModified: object.lastModified,
      }
    }
    throw new HTTPException(502, {
      message: 'Could not verify the stored file metadata. Retry.',
    })
  }
  const getEntry = async (id: string): Promise<DriveEntry> => {
    const key = getKey(id)
    if (id === 'root' || key.endsWith('/')) {
      if (id !== 'root' && !(await hasKey(key))) throw providerError(404)
      return {
        id,
        parentId: getId(getParentKey(key)),
        name:
          key.slice(rootPrefix.length).split('/').filter(Boolean).at(-1) ?? '',
        kind: 'folder',
        sizeBytes: 0,
        updatedAt: '',
      }
    }
    try {
      const stat = await getObjectStat(key)
      return {
        id,
        parentId: getId(getParentKey(key)),
        name: key.split('/').at(-1)!,
        kind: 'file',
        sizeBytes: stat.size,
        updatedAt: stat.lastModified.toISOString(),
        mimeType: String(
          stat.metaData['content-type'] ?? 'application/octet-stream',
        ),
      }
    } catch (error) {
      if (isMissing(error)) throw providerError(404)
      throw error
    }
  }
  const getFolderKey = async (id: string): Promise<string> => {
    if ((await getEntry(id)).kind !== 'folder')
      throw new HTTPException(400, { message: 'Choose a folder.' })
    return getKey(id)
  }
  const assertTargetAvailable = async (key: string): Promise<void> => {
    if (
      (await hasKey(key)) ||
      (await hasKey(key.endsWith('/') ? key.slice(0, -1) : key + '/'))
    )
      throw providerError(409)
  }
  const getObjectList = async (
    key: string,
  ): Promise<{ name: string; size: number; etag: string }[]> => {
    const result: { name: string; size: number; etag: string }[] = []
    for await (const item of client.listObjectsV2(mount.bucket, key, true)) {
      if (!item.name) continue
      if (result.length >= 10_000)
        throw new HTTPException(413, {
          message:
            'This folder has more than 10,000 objects. Operate on smaller folders.',
        })
      result.push({ name: item.name, size: item.size, etag: item.etag })
    }
    return result
  }
  return {
    connect: async () => {
      if (!(await client.bucketExists(mount.bucket))) throw providerError(404)
      for await (const _item of client.listObjectsV2(
        mount.bucket,
        rootPrefix,
        false,
      )) {
        break
      }
    },
    get: getEntry,
    list: async (filter) => {
      const prefix = await getFolderKey(filter.parent)
      const after = filter.cursor ? decodeEntryId(filter.cursor) : ''
      if (
        after &&
        (!after.startsWith(prefix) || getParentKey(after) !== prefix)
      )
        throw new HTTPException(400, { message: 'Invalid folder cursor.' })
      const entries: DriveEntry[] = []
      let scanned = 0
      let nextCursor: string | null = null
      for await (const object of client.listObjectsV2(
        mount.bucket,
        prefix,
        false,
        after,
      )) {
        const key = object.prefix || object.name
        if (!key || key === prefix) continue
        const entry: DriveEntry = {
          id: getId(key),
          parentId: filter.parent,
          name: key.slice(prefix.length).replace(/\/$/, ''),
          kind: object.prefix ? 'folder' : 'file',
          sizeBytes: object.size ?? 0,
          updatedAt: object.lastModified?.toISOString() ?? '',
        }
        if (matchesDriveFilter(entry, filter)) entries.push(entry)
        scanned++
        if (entries.length === 100 || scanned === 10_000) {
          nextCursor = encodeEntryId(key)
          break
        }
      }
      return { entries, nextCursor, path: getPathList(prefix) }
    },
    createFolder: async (parent, name) => {
      const key = (await getFolderKey(parent)) + name + '/'
      await assertTargetAvailable(key)
      context.assertLease()
      await client.putObject(mount.bucket, key, Buffer.alloc(0))
      return getEntry(getId(key))
    },
    upload: async (parent, name, file) => {
      const key = (await getFolderKey(parent)) + name
      const checkpointDto = z.object({
        provider: z.literal('minio'),
        key: z.string(),
        uploadId: z.string(),
        partSize: z.number().int().positive(),
        completing: z.boolean().default(false),
        parts: z
          .array(
            z.object({ part: z.number().int().positive(), etag: z.string() }),
          )
          .max(10_000),
      })
      let checkpoint = file.checkpoint
        ? checkpointDto.parse(file.checkpoint)
        : undefined
      if (checkpoint && checkpoint.key !== key) throw providerError(409)
      if (file.taskId) {
        try {
          const existing = await getObjectStat(key)
          if (
            existing.size === file.size &&
            existing.metaData['neozebra-upload'] === file.taskId
          )
            return getEntry(getId(key))
          throw providerError(409)
        } catch (error) {
          if (!isMissing(error)) throw error
        }
      }
      await assertTargetAvailable(key)
      context.assertLease()
      await file.assertActive?.()
      if (file.size === 0) {
        await file.saveCheckpoint?.({
          provider: 'minio',
          key,
          uploadId: '',
          partSize: 8 * 1024 * 1024,
          parts: [],
          completing: true,
        })
        await client.putObject(mount.bucket, key, Buffer.alloc(0), 0, {
          'Content-Type': file.mimeType,
          'X-Amz-Meta-Neozebra-Upload': file.taskId ?? '',
        })
        return getEntry(getId(key))
      }
      const createSession = async () => {
        const partSize = Math.max(
          8 * 1024 * 1024,
          Math.ceil(file.size / 10_000 / (1024 * 1024)) * 1024 * 1024,
        )
        const uploadId = await client.initiateNewMultipartUpload(
          mount.bucket,
          key,
          {
            'Content-Type': file.mimeType,
            'X-Amz-Meta-Neozebra-Upload': file.taskId ?? '',
          },
        )
        const session = {
          provider: 'minio' as const,
          key,
          uploadId,
          partSize,
          parts: [] as { part: number; etag: string }[],
          completing: false,
        }
        await file.saveCheckpoint?.(session)
        return session
      }
      checkpoint ??= await createSession()
      for (let reset = 0; reset < 2; reset++) {
        try {
          const count = Math.ceil(file.size / checkpoint.partSize)
          for (let part = 1; part <= count; part++) {
            await file.assertActive?.()
            context.assertLease()
            if (checkpoint.parts.some((item) => item.part === part)) continue
            const start = (part - 1) * checkpoint.partSize
            const size = Math.min(checkpoint.partSize, file.size - start)
            const url = await client.presignedUrl(
              'PUT',
              mount.bucket,
              key,
              900,
              { uploadId: checkpoint.uploadId, partNumber: String(part) },
            )
            const stream = createReadStream(file.path, {
              start,
              end: start + size - 1,
            })
            try {
              const response = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Length': String(size) },
                body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
                duplex: 'half',
                redirect: 'error',
                signal: AbortSignal.timeout(300_000),
              } as RequestInit & { duplex: 'half' })
              const etag = response.headers.get('etag')?.replace(/^"|"$/g, '')
              await response.body?.cancel()
              if (response.status === 404) {
                const error = new Error(
                  'Multipart session expired',
                ) as Error & { code: string }
                error.code = 'NoSuchUpload'
                throw error
              }
              if (!response.ok || !etag) throw providerError()
              checkpoint.parts.push({ part, etag })
              await file.saveCheckpoint?.(checkpoint)
              await file.onProgress?.(
                Math.min(
                  file.size,
                  checkpoint.parts.length * checkpoint.partSize,
                ),
              )
            } finally {
              stream.destroy()
            }
          }
          await file.assertActive?.()
          await assertTargetAvailable(key)
          checkpoint.completing = true
          await file.saveCheckpoint?.(checkpoint)
          context.assertLease()
          await client.completeMultipartUpload(
            mount.bucket,
            key,
            checkpoint.uploadId,
            checkpoint.parts.sort((a, b) => a.part - b.part),
          )
          break
        } catch (error) {
          if (
            reset === 0 &&
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'NoSuchUpload'
          ) {
            checkpoint = await createSession()
            continue
          }
          throw error
        }
      }
      return getEntry(getId(key))
    },
    abortUpload: async (value) => {
      const checkpoint = z
        .object({
          provider: z.literal('minio'),
          key: z.string(),
          uploadId: z.string(),
        })
        .parse(value)
      if (!checkpoint.uploadId) return
      getKey(getId(checkpoint.key))
      const url = await client.presignedUrl(
        'DELETE',
        mount.bucket,
        checkpoint.key,
        900,
        { uploadId: checkpoint.uploadId },
      )
      const response = await fetch(url, {
        method: 'DELETE',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      })
      await response.body?.cancel()
      if (!response.ok && response.status !== 404) throw providerError()
    },
    update: async (id, patch) => {
      if (id === 'root')
        throw new HTTPException(400, {
          message: 'The mounted root cannot be renamed or moved.',
        })
      const entry = await getEntry(id)
      const source = getKey(id)
      const parent = patch.parent
        ? await getFolderKey(patch.parent)
        : getParentKey(source)
      const target =
        parent +
        (patch.name ?? entry.name) +
        (entry.kind === 'folder' ? '/' : '')
      if (source === target) return entry
      if (entry.kind === 'folder' && target.startsWith(source))
        throw new HTTPException(400, {
          message: 'A folder cannot move into itself.',
        })
      await assertTargetAvailable(target)
      const objectList =
        entry.kind === 'folder'
          ? await getObjectList(source)
          : [
              {
                name: source,
                size: entry.sizeBytes,
                etag: (await getObjectStat(source)).etag,
              },
            ]
      for (const object of objectList) {
        context.assertLease()
        const destination =
          entry.kind === 'folder'
            ? target + object.name.slice(source.length)
            : target
        const condition = new CopyConditions()
        condition.setMatchETag(object.etag)
        await client.copyObject(
          mount.bucket,
          destination,
          '/' + mount.bucket + '/' + object.name,
          condition,
        )
        if ((await getObjectStat(destination)).size !== object.size)
          throw providerError()
      }

      // 复制完成后重新核验源对象；并发外部修改时保留源文件，不继续删除。
      const currentList =
        entry.kind === 'folder'
          ? await getObjectList(source)
          : [
              {
                name: source,
                ...(await getObjectStat(source)),
              },
            ]
      if (
        currentList.length !== objectList.length ||
        currentList.some(
          (item, index) =>
            item.name !== objectList[index].name ||
            item.etag !== objectList[index].etag,
        )
      )
        throw new HTTPException(409, {
          message:
            'The source changed while copying. Both copies were kept; refresh before retrying.',
        })
      context.assertLease()
      const errors = await client.removeObjects(
        mount.bucket,
        objectList.map((item) => item.name),
      )
      if (errors.length)
        throw new HTTPException(502, {
          message:
            'The copy completed but some source objects could not be removed. Refresh to review both locations.',
        })
      return getEntry(getId(target))
    },
    remove: async (id) => {
      if (id === 'root')
        throw new HTTPException(400, {
          message: 'The mounted root cannot be deleted.',
        })
      const entry = await getEntry(id)
      context.assertLease()
      if (entry.kind === 'folder') {
        const errors = await client.removeObjects(
          mount.bucket,
          (await getObjectList(getKey(id))).map((item) => item.name),
        )
        if (errors.length) throw providerError()
      } else await client.removeObject(mount.bucket, getKey(id))
    },
    content: async (id, range) => {
      const entry = await getEntry(id)
      let start = 0
      let end = entry.sizeBytes - 1
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!match || (!match[1] && !match[2]))
          throw new HTTPException(416, { message: 'Invalid byte range.' })
        start = match[1]
          ? Number(match[1])
          : Math.max(0, entry.sizeBytes - Number(match[2]))
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end
        if (start > end || start >= entry.sizeBytes)
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${entry.sizeBytes}` },
          })
      }
      const stream = range
        ? await client.getPartialObject(
            mount.bucket,
            getKey(id),
            start,
            end - start + 1,
          )
        : await client.getObject(mount.bucket, getKey(id))
      const headers = new Headers({
        'Content-Type': entry.mimeType ?? 'application/octet-stream',
        'Content-Length': String(Math.max(0, end - start + 1)),
        'Accept-Ranges': 'bytes',
      })
      if (range)
        headers.set('Content-Range', `bytes ${start}-${end}/${entry.sizeBytes}`)
      return new Response(
        Readable.toWeb(stream) as ReadableStream<Uint8Array>,
        { status: range ? 206 : 200, headers },
      )
    },
  }
}

export { createMinioProvider }
