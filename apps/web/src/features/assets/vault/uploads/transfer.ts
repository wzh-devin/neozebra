import { VaultError } from '@/services/assets/vault'

const getPartSize = (size: number) =>
  Math.max(
    8 * 1024 * 1024,
    Math.ceil(Math.ceil(size / 10_000) / 1024 / 1024) * 1024 * 1024,
  )
const waitForTransfer = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const abortHandler = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abortHandler)
      resolve()
    }, milliseconds)
    if (signal.aborted) abortHandler()
    else signal.addEventListener('abort', abortHandler, { once: true })
  })

/**
 * 在可终止的 Worker 中建立完整清单，避免大文件阻塞界面。
 *
 * @param file - 原始文件
 * @param signal - 任务取消信号
 * @param progress - 校验进度回调
 * @returns 分片哈希与严格续传指纹
 */
const hashFile = (
  file: File,
  signal: AbortSignal,
  progress: (value: number) => void,
) =>
  new Promise<{ hashes: string[]; fingerprint: string }>((resolve, reject) => {
    const worker = new Worker(new URL('./hash.worker.ts', import.meta.url), {
      type: 'module',
    })
    const cleanup = () => {
      worker.terminate()
      signal.removeEventListener('abort', abortHandler)
    }
    const abortHandler = () => {
      cleanup()
      reject(signal.reason)
    }
    const messageHandler = (
      event: MessageEvent<{
        hashes?: string[]
        fingerprint?: string
        progress?: number
        error?: string
      }>,
    ) => {
      if (event.data.error) {
        cleanup()
        reject(new VaultError(event.data.error, 'SOURCE_UNREADABLE', false, 0))
      } else if (event.data.hashes && event.data.fingerprint) {
        cleanup()
        resolve({
          hashes: event.data.hashes,
          fingerprint: event.data.fingerprint,
        })
      } else if (event.data.progress !== undefined)
        progress(event.data.progress)
    }
    const errorHandler = () => {
      cleanup()
      reject(new Error('文件校验进程未能启动，请重试'))
    }
    worker.onmessage = messageHandler
    worker.onerror = errorHandler
    if (signal.aborted) abortHandler()
    else {
      signal.addEventListener('abort', abortHandler, { once: true })
      worker.postMessage({ file, partSize: getPartSize(file.size) })
    }
  })

/**
 * 使用带进度、超时和取消处理的 XHR 直传已签名分片。
 *
 * @param signed - 服务端签名地址与校验请求头
 * @param blob - 当前分片
 * @param signal - 任务生命周期信号
 * @param progress - 已发送字节数回调
 * @returns 无返回值；完成传输，错误时抛出可重试错误
 */
const putPart = (
  signed: { url: string; headers: Record<string, string> },
  blob: Blob,
  signal: AbortSignal,
  progress: (bytes: number) => void,
) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const cleanup = () => signal.removeEventListener('abort', abortHandler)
    const abortHandler = () => xhr.abort()
    const failedHandler = () => {
      cleanup()
      reject(
        new VaultError(
          '分片传输中断，请检查网络后重试',
          'TRANSFER_INTERRUPTED',
          true,
          xhr.status,
        ),
      )
    }
    const loadHandler = () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else
        reject(
          new VaultError(
            '对象存储未接收分片，请重试',
            'TRANSFER_REJECTED',
            xhr.status === 403 ||
              xhr.status === 408 ||
              xhr.status === 429 ||
              xhr.status >= 500,
            xhr.status,
          ),
        )
    }
    const cancelledHandler = () => {
      cleanup()
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    xhr.open('PUT', signed.url)
    xhr.timeout = 15 * 60 * 1000
    for (const [key, value] of Object.entries(signed.headers))
      xhr.setRequestHeader(key, value)
    xhr.upload.onprogress = (event) => progress(event.loaded)
    xhr.onload = loadHandler
    xhr.onerror = failedHandler
    xhr.ontimeout = failedHandler
    xhr.onabort = cancelledHandler
    if (signal.aborted) cancelledHandler()
    else {
      signal.addEventListener('abort', abortHandler, { once: true })
      xhr.send(blob)
    }
  })
export { getPartSize, hashFile, putPart, waitForTransfer }
