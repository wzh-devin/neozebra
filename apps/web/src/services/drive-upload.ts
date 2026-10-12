import { requestDrive } from '@/services/drive'
import type {
  DriveUploadTask,
  DriveUploadAction,
  DriveUploadPage,
  DriveUploadTablePage,
  DriveUploadDetails,
} from '@/features/drive/upload-types'

const getUploadUrl = (connectionId: string, id?: string) =>
  '/' + connectionId + '/uploads' + (id ? '/' + id : '')

const getDriveUploadPage = (connectionId: string, cursor?: string) =>
  requestDrive<DriveUploadPage>(
    getUploadUrl(connectionId) + (cursor ? '?cursor=' + cursor : ''),
  )

/**
 * 查询账号任务表格页；翻页中止只影响读取，不影响上传队列。
 *
 * @param connectionId - 关联账号标识
 * @param page - 从1开始的页号
 * @param signal - 页切换中止信号
 * @returns 任务与总数、页号、每页条数
 */
const getDriveUploadTablePage = (
  connectionId: string,
  page: number,
  signal: AbortSignal,
) =>
  requestDrive<DriveUploadTablePage>(
    getUploadUrl(connectionId) + '?page=' + page,
    { signal },
  )
const getDriveUploadDetails = (connectionId: string, id: string, after = -1) =>
  requestDrive<DriveUploadDetails>(
    getUploadUrl(connectionId, id) + '?after=' + after,
  )
const createDriveUpload = async (
  connectionId: string,
  draft: Pick<
    DriveUploadTask,
    | 'id'
    | 'parent'
    | 'directoryPath'
    | 'name'
    | 'size'
    | 'mimeType'
    | 'fingerprint'
  >,
) =>
  (
    await requestDrive<{ task: DriveUploadTask }>(getUploadUrl(connectionId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
  ).task
const updateDriveUpload = async (
  connectionId: string,
  id: string,
  action: DriveUploadAction,
  fingerprint?: string,
) =>
  (
    await requestDrive<{ task: DriveUploadTask }>(
      getUploadUrl(connectionId, id),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, fingerprint }),
      },
    )
  ).task
const completeDriveUpload = async (connectionId: string, id: string) =>
  (
    await requestDrive<{ task: DriveUploadTask }>(
      getUploadUrl(connectionId, id) + '/complete',
      { method: 'POST' },
    )
  ).task

/**
 * 用原生XHR显示真实分片发送进度，取消只中断当前请求，服务端保留已确认分片。
 *
 * @param connectionId - 关联账号
 * @param id - 上传任务
 * @param part - 分片编号
 * @param blob - 本片内容
 * @param sha256 - 内容校验值
 * @param signal - 任务暂停/取消信号
 * @param onProgress - 已发送字节回调
 * @returns 服务端持久化后的任务状态
 */
const sendDriveUploadPart = (
  connectionId: string,
  id: string,
  part: number,
  blob: Blob,
  sha256: string,
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
): Promise<DriveUploadTask> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Upload paused', 'AbortError'))
      return
    }
    const xhr = new XMLHttpRequest()
    const abortHandler = () => xhr.abort()
    const cleanup = () => signal.removeEventListener('abort', abortHandler)
    xhr.open(
      'PUT',
      '/api/assets/drive/connections' +
        getUploadUrl(connectionId, id) +
        '/parts/' +
        part,
    )
    xhr.timeout = 300_000
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('X-Part-SHA256', sha256)
    xhr.upload.onprogress = (event) => onProgress(event.loaded)
    xhr.onload = () => {
      cleanup()
      try {
        const data = JSON.parse(xhr.responseText) as {
          task: DriveUploadTask
          error?: { message?: string }
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(
            new Error(
              data.error?.message ?? 'Could not upload this part. Retry.',
            ),
          )
          return
        }
        resolve(data.task)
      } catch {
        reject(new Error('The upload response was invalid. Retry.'))
      }
    }
    xhr.onerror = () => {
      cleanup()
      reject(
        new Error(
          'Upload connection was interrupted. Resume to retry missing parts.',
        ),
      )
    }
    xhr.ontimeout = () => {
      cleanup()
      reject(new Error('This part timed out. Resume the upload.'))
    }
    xhr.onabort = () => {
      cleanup()
      reject(new DOMException('Upload paused', 'AbortError'))
    }
    signal.addEventListener('abort', abortHandler, { once: true })
    xhr.send(blob)
  })

export {
  getDriveUploadPage,
  getDriveUploadTablePage,
  getDriveUploadDetails,
  createDriveUpload,
  updateDriveUpload,
  completeDriveUpload,
  sendDriveUploadPart,
}
