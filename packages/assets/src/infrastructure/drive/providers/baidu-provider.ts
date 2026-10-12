import { createHash } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { createOAuthRequest, readProviderJson } from './oauth-request.ts'
import {
  decodeEntryId,
  encodeEntryId,
  fetchDriveContent,
  matchesDriveFilter,
  normalizeRootPath,
  providerError,
} from '../drive-utils.ts'
import { getUploadPartCount, readUploadPart } from '../upload-parts.ts'
import type { DriveEntry, DriveProvider, ProviderContext } from '../types.ts'

const fileDto = z
  .object({
    fs_id: z.string().regex(/^\d+$/),
    path: z.string(),
    server_filename: z.string(),
    size: z.number().nonnegative().safe(),
    server_mtime: z.number(),
    isdir: z.number(),
  })
  .passthrough()
const listDto = z.object({ list: z.array(fileDto).max(1000) })
const folderDto = fileDto.pick({ fs_id: true, path: true })
const folderListDto = z.object({ list: z.array(folderDto).max(1000) })
const successDto = z.object({ errno: z.literal(0) }).passthrough()
const manageDto = successDto.extend({
  info: z.array(z.object({ errno: z.number() })).optional(),
})

/**
 * 接入百度网盘官方目录、管理和分片上传接口，路径限制在授权根目录。
 *
 * @param context - 挂载根目录、凭据与刷新方法
 * @returns 百度网盘适配器
 */
const createBaiduProvider = (context: ProviderContext): DriveProvider => {
  const mount = context.mount
  if (mount.providerId !== 'baidu') throw providerError()
  const request = createOAuthRequest(context, 'baidu')
  const getPath = (id: string): string => {
    const path =
      id === 'root' ? mount.rootPath : normalizeRootPath(decodeEntryId(id))
    if (id !== 'root' && path === mount.rootPath)
      throw new HTTPException(400, { message: 'Invalid file identifier.' })
    if (
      mount.rootPath !== '/' &&
      path !== mount.rootPath &&
      !path.startsWith(mount.rootPath + '/')
    )
      throw new HTTPException(403, {
        message: 'This item is outside the mounted folder.',
      })
    return path
  }
  const getId = (path: string): string =>
    path === mount.rootPath ? 'root' : encodeEntryId(path)
  const getParent = (path: string): string =>
    path.slice(0, path.lastIndexOf('/')) || '/'
  const getPathList = (path: string) => {
    const result = [{ id: 'root', name: '' }]
    let current = mount.rootPath === '/' ? '' : mount.rootPath
    for (const part of path
      .slice(mount.rootPath === '/' ? 1 : mount.rootPath.length + 1)
      .split('/')
      .filter(Boolean)) {
      current += '/' + part
      result.push({ id: getId(current), name: part })
    }
    return result
  }
  const mapEntry = (file: z.infer<typeof fileDto>): DriveEntry => {
    const id = getId(file.path)
    getPath(id)
    return {
      id,
      parentId: getId(getParent(file.path)),
      name: file.server_filename,
      kind: file.isdir === 1 ? 'folder' : 'file',
      sizeBytes: file.size,
      updatedAt: new Date(file.server_mtime * 1000).toISOString(),
    }
  }

  // 百度 folder=1 只返回路径和标识；缺失的日期保持为空，不伪造文件元数据。
  const mapFolderEntry = (folder: z.infer<typeof folderDto>): DriveEntry => {
    const id = getId(folder.path)
    getPath(id)
    return {
      id,
      parentId: getId(getParent(folder.path)),
      name: folder.path.slice(folder.path.lastIndexOf('/') + 1),
      kind: 'folder',
      sizeBytes: 0,
      updatedAt: '',
    }
  }
  const findFile = async (path: string): Promise<z.infer<typeof fileDto>> => {
    for (let start = 0; start < 100_000; start += 1000) {
      const page = await request(
        '/rest/2.0/xpan/file?method=list',
        { dir: getParent(path), start, limit: 1000, order: 'name', desc: 0 },
        listDto,
        'GET',
      )
      const entry = page.list.find((item) => item.path === path)
      if (entry) return entry
      if (page.list.length < 1000) break
    }
    throw providerError(404)
  }
  const getEntry = async (id: string): Promise<DriveEntry> =>
    id === 'root'
      ? {
          id,
          parentId: 'root',
          name: '',
          kind: 'folder',
          sizeBytes: 0,
          updatedAt: '',
        }
      : mapEntry(await findFile(getPath(id)))
  const getFolder = async (id: string): Promise<string> => {
    if ((await getEntry(id)).kind !== 'folder')
      throw new HTTPException(400, { message: 'Choose a folder.' })
    return getPath(id)
  }
  const manage = async (opera: string, filelist: unknown): Promise<void> => {
    context.assertLease()
    const result = await request(
      `/rest/2.0/xpan/file?method=filemanager&opera=${opera}`,
      { async: 0, ondup: 'fail', filelist },
      manageDto,
    )
    if (result.info?.some((entry) => entry.errno !== 0))
      throw providerError(
        result.info.some((entry) => entry.errno === -8) ? 409 : 502,
      )
  }
  return {
    connect: async () => {
      await request(
        '/rest/2.0/xpan/file?method=list',
        { dir: mount.rootPath, start: 0, limit: 1 },
        listDto,
        'GET',
      )
    },
    get: getEntry,
    list: async (filter) => {
      const path = await getFolder(filter.parent)
      const start = filter.cursor ? Number(decodeEntryId(filter.cursor)) : 0
      if (!Number.isSafeInteger(start) || start < 0 || start > 100_000)
        throw new HTTPException(400, { message: 'Invalid folder cursor.' })
      const entries: DriveEntry[] = []
      const pageDto =
        filter.kind === 'folder'
          ? folderListDto.transform((page) => page.list.map(mapFolderEntry))
          : listDto.transform((page) => page.list.map(mapEntry))
      let offset = start
      let nextCursor: string | null = null
      for (let batch = 0; batch < 10; batch++) {
        const pageList = await request(
          '/rest/2.0/xpan/file?method=list',
          {
            dir: path,
            start: offset,
            limit: 100,
            order: 'name',
            desc: 0,
            folder: filter.kind === 'folder' ? 1 : undefined,
          },
          pageDto,
          'GET',
        )
        let consumed = 0
        for (const entry of pageList) {
          consumed++
          if (matchesDriveFilter(entry, filter)) entries.push(entry)
          if (entries.length === 100) break
        }
        offset += consumed
        nextCursor =
          consumed < pageList.length || pageList.length === 100
            ? encodeEntryId(String(offset))
            : null
        if (!nextCursor || !filter.query.trim() || entries.length === 100) break
      }
      return { entries, nextCursor, path: getPathList(path) }
    },
    createFolder: async (parent, name) => {
      const path = (await getFolder(parent)).replace(/\/$/, '') + '/' + name
      context.assertLease()
      await request(
        '/rest/2.0/xpan/file?method=create',
        { path, isdir: 1, rtype: 0 },
        successDto,
      )
      return getEntry(getId(path))
    },
    upload: async (parent, name, file) => {
      const path = (await getFolder(parent)).replace(/\/$/, '') + '/' + name
      const checkpointDto = z.object({
        provider: z.literal('baidu'),
        path: z.string(),
        uploadId: z.string(),
        blockList: z.array(z.string()),
        required: z.array(z.number().int().nonnegative()),
        uploaded: z.array(z.number().int().nonnegative()),
        md5: z.string(),
        completing: z.boolean().default(false),
      })
      let checkpoint = file.checkpoint
        ? checkpointDto.parse(file.checkpoint)
        : undefined
      if (checkpoint && checkpoint.path !== path) throw providerError(409)
      if (checkpoint?.completing) {
        try {
          const existing = await findFile(path)
          if (existing.size === file.size && existing.md5 === checkpoint.md5)
            return mapEntry(existing)
          throw providerError(409)
        } catch (error) {
          if (!(error instanceof HTTPException) || error.status !== 404)
            throw error
        }
      }
      if (!checkpoint) {
        const blockList: string[] = []
        const digest = createHash('md5')
        for (let part = 0; part < getUploadPartCount(file); part++) {
          await file.assertActive?.()
          const bytes = await readUploadPart(file, part)
          digest.update(bytes)
          blockList.push(createHash('md5').update(bytes).digest('hex'))
        }
        const precreate = await request(
          '/rest/2.0/xpan/file?method=precreate',
          {
            path,
            size: file.size,
            isdir: 0,
            rtype: 0,
            autoinit: 1,
            block_list: blockList,
          },
          z.object({
            uploadid: z.string().optional(),
            block_list: z.array(z.number().int()).optional(),
            return_type: z.number(),
          }),
        )
        if (precreate.return_type === 2) return getEntry(getId(path))
        if (!precreate.uploadid) throw providerError()
        checkpoint = {
          provider: 'baidu',
          path,
          uploadId: precreate.uploadid,
          blockList,
          required: precreate.block_list ?? blockList.map((_, index) => index),
          uploaded: [],
          md5: digest.digest('hex'),
          completing: false,
        }
        await file.saveCheckpoint?.(checkpoint)
      }
      for (const part of checkpoint.required) {
        if (part < 0 || part >= checkpoint.blockList.length)
          throw providerError()
        if (checkpoint.uploaded.includes(part)) continue
        await file.assertActive?.()
        context.assertLease()
        const credentials = await context.refreshCredentials()
        const url = new URL('https://d.pcs.baidu.com/rest/2.0/pcs/superfile2')
        url.search = new URLSearchParams({
          method: 'upload',
          type: 'tmpfile',
          path,
          uploadid: checkpoint.uploadId,
          partseq: String(part),
          access_token: credentials.accessToken!,
        }).toString()
        const form = new FormData()
        form.set('file', new Blob([await readUploadPart(file, part)]), name)
        const response = await fetchDriveContent(url.href, 'baidu', {
          method: 'POST',
          body: form,
        })
        const payload = await readProviderJson(response)
        const failure = z
          .object({
            error_msg: z.string().optional(),
            errmsg: z.string().optional(),
          })
          .safeParse(payload)
        const message = failure.success
          ? (failure.data.error_msg ?? failure.data.errmsg ?? '')
          : ''
        if (
          /upload.?id|上传.*标识/i.test(message) &&
          /expired|invalid|过期|失效/i.test(message)
        )
          throw new HTTPException(410, {
            message:
              'The remote upload session expired. The saved file can be uploaded again.',
          })
        const result = z
          .object({ errno: z.literal(0).optional(), md5: z.string() })
          .safeParse(payload)
        if (!result.success || result.data.md5 !== checkpoint.blockList[part])
          throw providerError()
        checkpoint.uploaded.push(part)
        await file.saveCheckpoint?.(checkpoint)
        const remaining = checkpoint.required
          .filter((item) => !checkpoint!.uploaded.includes(item))
          .reduce(
            (total, item) =>
              total +
              Math.max(
                0,
                Math.min(4 * 1024 * 1024, file.size - item * 4 * 1024 * 1024),
              ),
            0,
          )
        await file.onProgress?.(file.size - remaining)
      }
      await file.assertActive?.()
      context.assertLease()
      checkpoint.completing = true
      await file.saveCheckpoint?.(checkpoint)
      await request(
        '/rest/2.0/xpan/file?method=create',
        {
          path,
          size: file.size,
          isdir: 0,
          rtype: 0,
          uploadid: checkpoint.uploadId,
          block_list: checkpoint.blockList,
        },
        successDto,
      )
      return getEntry(getId(path))
    },
    update: async (id, patch) => {
      if (id === 'root')
        throw new HTTPException(400, {
          message: 'The mounted root cannot be changed.',
        })
      const entry = await getEntry(id)
      const path = getPath(id)
      const dest = patch.parent
        ? await getFolder(patch.parent)
        : getParent(path)
      if (
        entry.kind === 'folder' &&
        (dest === path || dest.startsWith(path + '/'))
      )
        throw new HTTPException(400, {
          message: 'A folder cannot move into itself.',
        })
      if (patch.parent)
        await manage('move', [
          { path, dest, newname: patch.name ?? entry.name, ondup: 'fail' },
        ])
      else await manage('rename', [{ path, newname: patch.name }])
      return getEntry(
        getId(dest.replace(/\/$/, '') + '/' + (patch.name ?? entry.name)),
      )
    },
    remove: async (id) => {
      if (id === 'root')
        throw new HTTPException(400, {
          message: 'The mounted root cannot be deleted.',
        })
      await getEntry(id)
      await manage('delete', [getPath(id)])
    },
    content: async (id, range) => {
      const file = await findFile(getPath(id))
      if (file.isdir)
        throw new HTTPException(400, { message: 'Choose a file.' })
      const result = await request(
        '/rest/2.0/xpan/multimedia?method=filemetas',
        { fsids: `[${file.fs_id}]`, dlink: 1 },
        z.object({
          list: z.array(z.object({ dlink: z.string().url() })).min(1),
        }),
        'GET',
      )
      const url = new URL(result.list[0].dlink)
      url.searchParams.set(
        'access_token',
        (await context.refreshCredentials()).accessToken!,
      )
      return fetchDriveContent(url.href, 'baidu', {
        headers: {
          'User-Agent': 'pan.baidu.com',
          ...(range ? { Range: range } : {}),
        },
      })
    },
  }
}

export { createBaiduProvider }
