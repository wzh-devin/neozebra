import type { DriveEntry } from '@/features/drive/types'
import { requestDrive } from '@/services/drive'

// 服务端只提供签名的只读配置；浏览器不接触网盘凭据或JWT密钥。
type DriveOfficePreview = {
  apiUrl: string
  config: {
    documentType: string
    document: {
      key: string
      title: string
      fileType: string
      url: string
      permissions: { edit: boolean }
    }
    editorConfig: { mode: 'view' }
    token: string
    type: string
    width: string
    height: string
  }
}
type OfficeSession = Partial<DriveOfficePreview> & {
  id: string
  status: string
  error?: string
}

/**
 * 创建后台源快照并只轮询当前弹窗，关闭立即取消等待。
 *
 * @param entry - 当前账号的远端Office或PDF文件
 * @param signal - 弹窗生命周期信号
 * @returns ONLYOFFICE只读预览会话
 */
const getDriveOfficePreview = async (
  entry: DriveEntry,
  signal: AbortSignal,
): Promise<DriveOfficePreview> => {
  const session = await requestDrive<OfficeSession>(
    `/${entry.connectionId}/entries/${entry.id}/preview`,
    { method: 'POST', signal },
  )
  const deadline = Date.now() + 600_000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const current = await requestDrive<OfficeSession>(
      `/${entry.connectionId}/previews/${session.id}`,
      { signal },
    )
    if (current.status === 'ready' && current.config && current.apiUrl)
      return { config: current.config, apiUrl: current.apiUrl }
    if (current.status === 'failed')
      throw new Error(current.error ?? 'Could not load this Office file.')
    await new Promise<void>((resolve, reject) => {
      const abortHandler = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abortHandler)
        resolve()
      }, 1000)
      signal.addEventListener('abort', abortHandler, { once: true })
    })
  }
  throw new Error(
    'Preparing this Office file took too long. Reopen the preview to retry.',
  )
}
export { getDriveOfficePreview }
export type { DriveOfficePreview }
