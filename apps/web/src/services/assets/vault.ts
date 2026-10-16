import type {
  EntryPage,
  VaultEntry,
  VaultUpload,
  UploadDetail,
  UploadFilter,
  UploadPage,
} from '@/features/assets/vault/types'

const vaultBase = '/api/assets/vault'
class VaultError extends Error {
  code: string
  retryable: boolean
  status: number
  constructor(
    message: string,
    code: string,
    retryable: boolean,
    status: number,
  ) {
    super(message)
    this.code = code
    this.retryable = retryable
    this.status = status
  }
}

/**
 * 发起私有文件库请求，传递取消信号并保留服务端错误语义。
 *
 * @param path - 服务内相对路径
 * @param init - 请求选项
 * @returns 解码后的响应；失败时抛出可识别的错误
 */
const requestVault = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  let response: Response
  try {
    response = await fetch(vaultBase + path, {
      ...init,
      credentials: 'omit',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new VaultError('网络连接中断，请重试', 'NETWORK_ERROR', true, 0)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new VaultError(
      body.error?.message ?? '文件服务暂时不可用',
      body.error?.code ?? 'UNAVAILABLE',
      body.error?.retryable ?? response.status >= 500,
      response.status,
    )
  }
  if (response.status === 204) return undefined as T
  try {
    return (await response.json()) as T
  } catch {
    throw new VaultError(
      '文件服务响应无效，请重试',
      'INVALID_RESPONSE',
      true,
      response.status,
    )
  }
}
const getEntryPage = (
  parentId: string,
  trash: boolean,
  search: string,
  cursor: string,
  signal: AbortSignal,
) => {
  const params = new URLSearchParams({
    parentId,
    trash: String(trash),
    search,
    cursor,
    limit: '100',
  })
  return requestVault<EntryPage>('/entries?' + params, { signal })
}
const createVaultFolder = (parentId: string, name: string, reuse = false) =>
  requestVault<VaultEntry>('/folders', {
    method: 'POST',
    body: JSON.stringify({ parentId, name, reuse }),
  })
const editVaultEntry = (
  entry: VaultEntry,
  update: { name?: string; parentId?: string },
) =>
  requestVault<VaultEntry>(`/entries/${entry.id}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
const getUploadDetail = (id: string, signal?: AbortSignal) =>
  requestVault<UploadDetail>(`/uploads/${id}`, { signal })
const getUploadPage = (
  cursor: string,
  signal: AbortSignal,
  filters: UploadFilter,
) =>
  requestVault<UploadPage>(
    '/uploads?' + new URLSearchParams({ cursor, ...filters }),
    { signal },
  )
const updateVaultUpload = (
  id: string,
  action: string,
  fingerprint = '',
  signal?: AbortSignal,
) =>
  requestVault<VaultUpload>(`/uploads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action, fingerprint }),
    signal,
  })
const getVaultContentUrl = (id: string, inline = false) =>
  `${vaultBase}/entries/${id}/content${inline ? '?inline=true' : ''}`

export {
  VaultError,
  requestVault,
  getEntryPage,
  createVaultFolder,
  editVaultEntry,
  getUploadDetail,
  getUploadPage,
  updateVaultUpload,
  getVaultContentUrl,
}
