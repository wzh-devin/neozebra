import type {
  DriveConnectionDraft,
  DriveEntry,
  DriveProvider,
} from '@/features/drive/types'
import { formatDriveFileSize } from '@/features/drive/data/drive-file-preview'

const baseUrl = '/api/assets/drive/connections'
type RemoteEntry = Omit<DriveEntry, 'size' | 'localFile'> & {
  sizeBytes: number
}
type DriveSyncStatus = {
  state: string
  hasSnapshot: boolean
  generation: string | null
  asOf: string | null
  error: string | null
}
type DrivePage = {
  entries: DriveEntry[]
  nextCursor: string | null
  path: { id: string; name: string }[]
  sync: DriveSyncStatus
  resetCursor?: boolean
}

/**
 * 请求同源 Drive API，统一超时与安全错误，保留服务器错误文案。
 *
 * @param path - 相对连接 API 的路径
 * @param init - 请求参数
 * @param root - 连接或授权 API 根地址
 * @returns 类型化 JSON 响应
 */
const requestDrive = async <T>(
  path = '',
  init: RequestInit = {},
  root = baseUrl,
): Promise<T> => {
  try {
    const response = await fetch(root + path, {
      credentials: 'same-origin',
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(180_000)])
        : AbortSignal.timeout(180_000),
    })
    const data = (await response.json()) as { error?: { message?: string } } & T
    if (!response.ok)
      throw new Error(data.error?.message ?? 'Drive request failed. Retry.')
    return data
  } catch (error) {
    if (
      error instanceof Error &&
      error.name !== 'TypeError' &&
      error.name !== 'TimeoutError' &&
      error.name !== 'SyntaxError'
    )
      throw error
    throw new Error(
      'Drive could not be reached. Check the connection and retry.',
    )
  }
}
const getDriveConnectionList = async (): Promise<DriveProvider[]> =>
  (await requestDrive<{ connections: DriveProvider[] }>()).connections
const saveDriveConnection = async (
  draft: DriveConnectionDraft,
  existing?: DriveProvider,
): Promise<DriveProvider> =>
  (
    await requestDrive<{ connection: DriveProvider }>(
      existing ? '/' + existing.id : '',
      {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, revision: existing?.revision }),
      },
    )
  ).connection
const deleteDriveConnection = (id: string): Promise<unknown> =>
  requestDrive('/' + id, { method: 'DELETE' })
const startDriveAuthorization = async (
  draft: DriveConnectionDraft,
  existing?: DriveProvider,
): Promise<string> => {
  if (draft.providerId === 'minio')
    throw new Error('MinIO uses S3 credentials.')
  const { url } = await requestDrive<{ url: string }>(
    `/oauth/${draft.providerId}/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: draft.name,
        rootPath: draft.rootPath,
        ...(draft.providerId === 'aliyun'
          ? { driveType: draft.driveType }
          : {}),
        connectionId: existing?.id,
        revision: existing?.revision,
      }),
    },
    '/api/assets/drive',
  )
  const destination = new URL(url)
  const expectedOrigin =
    draft.providerId === 'baidu'
      ? 'https://openapi.baidu.com'
      : 'https://openapi.alipan.com'
  if (destination.origin !== expectedOrigin)
    throw new Error('The authorization address is invalid. Retry from Drive.')
  return destination.toString()
}
const getDriveEntryPage = async (
  id: string,
  parent: string,
  options: {
    cursor?: string
    query?: string
    kind?: 'folder'
    refresh?: boolean
    signal?: AbortSignal
  } = {},
): Promise<DrivePage> => {
  const query = new URLSearchParams({
    parent,
    cursor: options.cursor ?? '',
    query: options.query ?? '',
    kind: options.kind ?? 'all',
    refresh: options.refresh ? '1' : '0',
  })
  const data = await requestDrive<{
    entries: RemoteEntry[]
    nextCursor: string | null
    path: DrivePage['path']
    sync: DriveSyncStatus
    resetCursor?: boolean
  }>(`/${id}/entries?${query}`, { signal: options.signal })
  return {
    ...data,
    entries: data.entries.map((entry) => ({
      ...entry,
      size:
        entry.kind === 'folder' ? '—' : formatDriveFileSize(entry.sizeBytes),
      updatedAt: entry.updatedAt
        ? new Date(entry.updatedAt).toLocaleString()
        : '—',
      connectionId: id,
    })),
  }
}
const requestDriveSync = (
  id: string,
  parent: string,
  mode: 'activate' | 'refresh',
  signal?: AbortSignal,
) =>
  requestDrive(`/${id}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent, mode }),
    signal,
  })
const createDriveFolder = (id: string, parent: string, name: string) =>
  requestDrive(`/${id}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent, name }),
  })
const updateDriveEntry = (
  id: string,
  entryId: string,
  patch: { name?: string; parent?: string },
) =>
  requestDrive(`/${id}/entries/${entryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
const deleteDriveEntry = (id: string, entryId: string) =>
  requestDrive(`/${id}/entries/${entryId}`, { method: 'DELETE' })
const getDriveContentUrl = (entry: DriveEntry, download = false): string =>
  `${baseUrl}/${entry.connectionId}/entries/${entry.id}/content${download ? '?download=1' : ''}`

/**
 * 获取有界远端预览正文，取消过大或已关闭弹窗的请求。
 *
 * @param entry - 带连接标识的远端文件
 * @param signal - 弹窗生命周期取消信号
 * @param maxBytes - 正文读取上限；文本为 1 MiB，图片默认为 50 MiB；文档与PDF使用统一ONLYOFFICE入口
 * @returns 可复用本地预览解析器的 File
 */
const getDrivePreviewFile = async (
  entry: DriveEntry,
  signal: AbortSignal,
  maxBytes = 50 * 1024 * 1024,
): Promise<File> => {
  const response = await fetch(getDriveContentUrl(entry), {
    signal,
    credentials: 'same-origin',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    throw new Error(data.error?.message ?? 'Could not load this file.')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('File content is unavailable.')
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes)
        throw new Error(
          `Preview is limited to ${maxBytes / 1024 / 1024} MiB. Download this file instead.`,
        )
      chunks.push(value as Uint8Array<ArrayBuffer>)
    }
    return new File(chunks, entry.name, {
      type: response.headers.get('Content-Type') ?? entry.mimeType ?? '',
    })
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

export {
  requestDrive,
  getDriveConnectionList,
  saveDriveConnection,
  startDriveAuthorization,
  deleteDriveConnection,
  getDriveEntryPage,
  requestDriveSync,
  createDriveFolder,
  updateDriveEntry,
  deleteDriveEntry,
  getDriveContentUrl,
  getDrivePreviewFile,
}
export type { DrivePage, DriveSyncStatus }
