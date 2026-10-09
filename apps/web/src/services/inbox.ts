type Mailbox = {
  id: string
  provider: 'gmail' | 'qq'
  email: string
  isInitialSync: boolean
  lastSyncedAt: string | null
  error: string | null
}
type MailMessage = {
  id: string
  accountId: string
  kind: 'email'
  title: string
  summary: string
  sender: string
  receivedAt: string
  read: boolean
  archived: boolean
  body: string
  bodyFormat: 'html' | 'markdown'
}
type MailFilters = { tab: string; account: string; query: string }
type MailAccountResponse = {
  accountList: Mailbox[]
  unreadCount: number
}
type MailListResponse = { itemList: MailMessage[]; nextCursor: string | null }

/**
 * 请求同源 Inbox API，统一处理超时和安全错误响应。
 *
 * @param path - Inbox 路径
 * @param options - fetch 参数与取消信号
 * @returns 解析后的 API 数据；失败抛出可展示的错误
 */
const requestInbox = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  if (path !== '/accounts' && !isSessionReady) await getMailAccounts()
  const signal = AbortSignal.any([
    AbortSignal.timeout(path === '/sync' ? 180_000 : 60_000),
    ...(options.signal ? [options.signal] : []),
  ])
  let response: Response
  try {
    response = await fetch(`/api/inbox${path}`, {
      ...options,
      signal,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error('Inbox is unreachable. Check the API server and try again.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok || !data)
    throw new Error(
      data?.error?.message ?? 'Unable to complete the mailbox request.',
    )
  return data as T
}

let isSessionReady = false
let accountsRequest: Promise<MailAccountResponse> | null = null

// 首个账号请求共享一次会话初始化，避免并行请求生成不同的 HttpOnly 会话。
const getMailAccounts = (_signal?: AbortSignal) => {
  if (!accountsRequest) {
    accountsRequest = requestInbox<MailAccountResponse>('/accounts')
      .then((data) => {
        isSessionReady = true
        return data
      })
      .finally(() => {
        accountsRequest = null
      })
  }
  return accountsRequest
}
const getMailMessageList = (
  filters: MailFilters,
  before?: string,
  signal?: AbortSignal,
) => {
  const params = new URLSearchParams({
    ...filters,
    ...(before ? { before } : {}),
  })
  return requestInbox<MailListResponse>(`/messages?${params}`, { signal })
}
const getMailMessage = (id: string, signal?: AbortSignal) =>
  requestInbox<MailMessage>(`/messages/${encodeURIComponent(id)}`, { signal })
const getNewMailMessages = (after?: string, signal?: AbortSignal) =>
  requestInbox<{ itemList: MailMessage[]; cursor: string; hasMore: boolean }>(
    `/messages/new${after === undefined ? '' : `?after=${encodeURIComponent(after)}`}`,
    { signal },
  )
const syncMailboxes = (signal?: AbortSignal, force = false) =>
  requestInbox<{ statusList: { id: string; status: string }[] }>('/sync', {
    method: 'POST',
    signal,
    body: JSON.stringify({ force }),
  })
const updateMailMessage = (
  id: string,
  patch: { read?: boolean; archived?: boolean },
) =>
  requestInbox(`/messages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
const markAllMailRead = () => requestInbox('/read-all', { method: 'POST' })
const connectImapMailbox = (
  provider: 'gmail' | 'qq',
  email: string,
  password: string,
) =>
  requestInbox(`/accounts/${provider}`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
const disconnectMailbox = (id: string) =>
  requestInbox(`/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })

export {
  getMailAccounts,
  getMailMessageList,
  getMailMessage,
  getNewMailMessages,
  syncMailboxes,
  updateMailMessage,
  markAllMailRead,
  connectImapMailbox,
  disconnectMailbox,
}
export type { Mailbox, MailMessage }
