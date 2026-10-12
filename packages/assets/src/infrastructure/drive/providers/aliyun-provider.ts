import { HTTPException } from 'hono/http-exception'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { z } from 'zod'
import {
  decodeEntryId,
  encodeEntryId,
  fetchDriveContent,
  matchesDriveFilter,
  providerError,
} from '../drive-utils.ts'
import type { DriveEntry, DriveProvider, ProviderContext } from '../types.ts'
import { getUploadPartCount } from '../upload-parts.ts'
import { createOAuthRequest } from './oauth-request.ts'

const fileDto = z
  .object({
    file_id: z.string().min(1),
    parent_file_id: z.string().optional(),
    name: z.string(),
    type: z.enum(['file', 'folder']),
    size: z.number().nonnegative().safe().optional(),
    updated_at: z.string().datetime({ offset: true }).optional(),
    mime_type: z.string().optional(),
  })
  .passthrough()
const emptyDto = z.object({}).passthrough()

/**
 * 使用阿里云盘官方接口，并通过父级链检查每次操作是否在绑定目录内。
 *
 * @param context - 已授权连接与凭据刷新操作
 * @returns 网盘操作适配器；connect 会填充解析后的根目录及 drive ID
 */
const createAliyunProvider = (context: ProviderContext): DriveProvider => {
  if (context.mount.providerId !== 'aliyun') throw providerError()
  const mount = context.mount
  const request = createOAuthRequest(context, 'aliyun')
  const fileMap = new Map<string, z.infer<typeof fileDto>>()
  const getId = (raw: string): string =>
    raw === mount.rootId ? 'root' : encodeEntryId(raw)
  const getRawId = (id: string): string =>
    id === 'root' ? (mount.rootId ?? '') : decodeEntryId(id)
  const getFile = async (raw: string) => {
    const cached = fileMap.get(raw)
    if (cached) return cached
    const file = await request(
      '/adrive/v1.0/openFile/get',
      { drive_id: mount.driveId, file_id: raw },
      fileDto,
    )
    fileMap.set(raw, file)
    return file
  }

  // 路径与移动目标都从上游父级链验证，不能凭浏览器提交的文件 ID 越界访问。
  const getPathList = async (
    raw: string,
  ): Promise<{ id: string; name: string }[]> => {
    const path: { id: string; name: string }[] = []
    const visited = new Set<string>()
    let current = raw
    while (current !== mount.rootId) {
      if (
        !current ||
        current === 'root' ||
        visited.has(current) ||
        visited.size >= 200
      )
        throw new HTTPException(400, {
          message: 'The item is outside the connected root folder.',
        })
      visited.add(current)
      const file = await getFile(current)
      path.unshift({ id: getId(current), name: file.name })
      current = file.parent_file_id ?? ''
    }
    return [{ id: 'root', name: '' }, ...path]
  }
  const mapEntry = (file: z.infer<typeof fileDto>): DriveEntry => ({
    id: getId(file.file_id),
    parentId: getId(file.parent_file_id ?? mount.rootId ?? ''),
    name: file.name,
    kind: file.type,
    sizeBytes: file.size ?? 0,
    updatedAt: file.updated_at ?? '',
    mimeType: file.mime_type,
  })
  const getEntry = async (id: string): Promise<DriveEntry> => {
    const raw = getRawId(id)
    await getPathList(raw)
    if (id === 'root')
      return {
        id,
        parentId: '',
        name: '',
        kind: 'folder',
        sizeBytes: 0,
        updatedAt: '',
      }
    if (raw === mount.rootId)
      throw new HTTPException(400, { message: 'Invalid file identifier.' })
    return mapEntry(await getFile(raw))
  }
  const getFolder = async (id: string): Promise<string> => {
    if ((await getEntry(id)).kind !== 'folder')
      throw new HTTPException(400, { message: 'Choose a folder.' })
    return getRawId(id)
  }
  const assertMutable = (id: string) => {
    if (id === 'root' || getRawId(id) === mount.rootId)
      throw new HTTPException(400, {
        message: 'The connected root cannot be changed.',
      })
  }
  return {
    connect: async () => {
      const info = await request(
        '/adrive/v1.0/user/getDriveInfo',
        {},
        z.object({
          default_drive_id: z.string(),
          resource_drive_id: z.string().optional(),
          backup_drive_id: z.string().optional(),
        }),
      )
      mount.driveId =
        mount.driveType === 'resource'
          ? (info.resource_drive_id ?? '')
          : mount.driveType === 'backup'
            ? (info.backup_drive_id ?? '')
            : info.default_drive_id
      if (!mount.driveId)
        throw new HTTPException(400, {
          message: 'This account does not have the selected Drive.',
        })
      if (mount.rootPath === '/') mount.rootId = 'root'
      else {
        const root = await request(
          '/adrive/v1.0/openFile/get_by_path',
          { drive_id: mount.driveId, file_path: mount.rootPath },
          fileDto,
        )
        if (root.type !== 'folder')
          throw new HTTPException(400, {
            message: 'The root path must be a folder.',
          })
        mount.rootId = root.file_id
      }
    },
    get: getEntry,
    list: async (filter) => {
      const parent = await getFolder(filter.parent)
      const entries: DriveEntry[] = []
      let marker = filter.cursor
      for (let batch = 0; batch < 10; batch++) {
        const page = await request(
          '/adrive/v1.0/openFile/list',
          {
            drive_id: mount.driveId,
            parent_file_id: parent,
            limit: 100 - entries.length,
            marker: marker || undefined,
            order_by: 'name',
            order_direction: 'ASC',
            type: filter.kind === 'folder' ? 'folder' : undefined,
          },
          z.object({
            items: z.array(fileDto).max(100),
            next_marker: z.string().optional(),
          }),
        )
        for (const file of page.items) {
          if (file.parent_file_id !== parent) throw providerError()
          fileMap.set(file.file_id, file)
        }
        entries.push(
          ...page.items
            .map(mapEntry)
            .filter((entry) => matchesDriveFilter(entry, filter)),
        )
        marker = page.next_marker ?? ''
        if (!marker || !filter.query.trim() || entries.length === 100) break
      }
      return {
        entries,
        nextCursor: marker || null,
        path: await getPathList(parent),
      }
    },
    createFolder: async (parent, name) => {
      const created = await request(
        '/adrive/v1.0/openFile/create',
        {
          drive_id: mount.driveId,
          parent_file_id: await getFolder(parent),
          name,
          type: 'folder',
          check_name_mode: 'refuse',
        },
        z.object({ file_id: z.string() }),
      )
      return getEntry(getId(created.file_id))
    },
    upload: async (parent, name, file) => {
      const parentId = await getFolder(parent)
      const checkpointDto = z.object({
        provider: z.literal('aliyun'),
        parentId: z.string(),
        name: z.string(),
        fileId: z.string(),
        uploadId: z.string(),
        partSize: z.number().int().positive(),
        uploaded: z.number().int().nonnegative(),
        completing: z.boolean().default(false),
      })
      let checkpoint = file.checkpoint
        ? checkpointDto.parse(file.checkpoint)
        : undefined
      if (
        checkpoint &&
        (checkpoint.parentId !== parentId || checkpoint.name !== name)
      )
        throw providerError(409)
      if (checkpoint?.completing) {
        const existing = await getFile(checkpoint.fileId)
        if (existing.status === 'available' && existing.size === file.size)
          return getEntry(getId(checkpoint.fileId))
      }
      if (!checkpoint) {
        const partSize = Math.max(
          4 * 1024 * 1024,
          Math.ceil(file.size / 10_000 / (1024 * 1024)) * 1024 * 1024,
        )
        await file.assertActive?.()
        const created = await request(
          '/adrive/v1.0/openFile/create',
          {
            drive_id: mount.driveId,
            parent_file_id: parentId,
            name,
            type: 'file',
            size: file.size,
            check_name_mode: 'refuse',
            part_info_list: [{ part_number: 1 }],
          },
          z.object({ file_id: z.string(), upload_id: z.string() }),
        )
        checkpoint = {
          provider: 'aliyun',
          parentId,
          name,
          fileId: created.file_id,
          uploadId: created.upload_id,
          partSize,
          uploaded: 0,
          completing: false,
        }
        await file.saveCheckpoint?.(checkpoint)
      }
      const count = getUploadPartCount(file, checkpoint.partSize)
      for (let part = checkpoint.uploaded + 1; part <= count; part++) {
        await file.assertActive?.()
        context.assertLease()
        const urls = await request(
          '/adrive/v1.0/openFile/getUploadUrl',
          {
            drive_id: mount.driveId,
            file_id: checkpoint.fileId,
            upload_id: checkpoint.uploadId,
            part_info_list: [{ part_number: part }],
          },
          z.object({
            part_info_list: z
              .array(
                z.object({
                  part_number: z.number().int(),
                  upload_url: z.string().url(),
                }),
              )
              .length(1),
          }),
        )
        if (urls.part_info_list[0].part_number !== part) throw providerError()
        const start = (part - 1) * checkpoint.partSize
        const size = Math.min(checkpoint.partSize, file.size - start)
        const stream = size
          ? createReadStream(file.path, { start, end: start + size - 1 })
          : null
        try {
          const response = await fetchDriveContent(
            urls.part_info_list[0].upload_url,
            'aliyun',
            {
              method: 'PUT',
              headers: { 'Content-Length': String(size) },
              body: stream ? Readable.toWeb(stream) : Buffer.alloc(0),
              duplex: 'half',
              signal: AbortSignal.timeout(300_000),
            } as RequestInit & { duplex: 'half' },
          )
          await response.body?.cancel()
        } finally {
          stream?.destroy()
        }
        checkpoint.uploaded = part
        await file.saveCheckpoint?.(checkpoint)
        await file.onProgress?.(Math.min(file.size, part * checkpoint.partSize))
      }
      await file.assertActive?.()
      context.assertLease()
      checkpoint.completing = true
      await file.saveCheckpoint?.(checkpoint)
      await request(
        '/adrive/v1.0/openFile/complete',
        {
          drive_id: mount.driveId,
          file_id: checkpoint.fileId,
          upload_id: checkpoint.uploadId,
        },
        emptyDto,
      )
      fileMap.delete(checkpoint.fileId)
      return getEntry(getId(checkpoint.fileId))
    },
    abortUpload: async (value) => {
      const checkpoint = z
        .object({ provider: z.literal('aliyun'), fileId: z.string() })
        .parse(value)
      try {
        await getPathList(checkpoint.fileId)
        const entry = await getFile(checkpoint.fileId)
        if (entry.status !== 'uploading') return
        context.assertLease()
        await request(
          '/adrive/v1.0/openFile/delete',
          { drive_id: mount.driveId, file_id: checkpoint.fileId },
          emptyDto,
        )
      } catch (error) {
        if (!(error instanceof HTTPException) || error.status !== 404)
          throw error
      }
    },
    update: async (id, patch) => {
      assertMutable(id)
      const entry = await getEntry(id)
      const parent = await getFolder(patch.parent ?? entry.parentId)
      const path = await getPathList(parent)
      if (entry.kind === 'folder' && path.some((part) => part.id === id))
        throw new HTTPException(400, {
          message: 'A folder cannot be moved inside itself.',
        })
      if (
        parent === getRawId(entry.parentId) &&
        (!patch.name || patch.name === entry.name)
      )
        return entry
      await request(
        patch.parent
          ? '/adrive/v1.0/openFile/move'
          : '/adrive/v1.0/openFile/update',
        patch.parent
          ? {
              drive_id: mount.driveId,
              file_id: getRawId(id),
              to_drive_id: mount.driveId,
              to_parent_file_id: parent,
              new_name: patch.name ?? entry.name,
              check_name_mode: 'refuse',
            }
          : {
              drive_id: mount.driveId,
              file_id: getRawId(id),
              name: patch.name,
              check_name_mode: 'refuse',
            },
        emptyDto,
      )
      fileMap.delete(getRawId(id))
      return getEntry(id)
    },
    remove: async (id) => {
      assertMutable(id)
      await getEntry(id)
      await request(
        '/adrive/v1.0/openFile/recyclebin/trash',
        { drive_id: mount.driveId, file_id: getRawId(id) },
        emptyDto,
      )
    },
    content: async (id, range) => {
      if ((await getEntry(id)).kind !== 'file')
        throw new HTTPException(400, {
          message: 'Only files can be downloaded.',
        })
      const result = await request(
        '/adrive/v1.0/openFile/getDownloadUrl',
        { drive_id: mount.driveId, file_id: getRawId(id), expire_sec: 900 },
        z.object({ url: z.string().url() }),
      )
      return fetchDriveContent(result.url, 'aliyun', {
        headers: range ? { Range: range } : {},
      })
    },
  }
}
export { createAliyunProvider }
