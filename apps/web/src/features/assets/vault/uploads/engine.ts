import type { VaultUpload } from '@/features/assets/vault/types'
import {
  createVaultFolder,
  getUploadDetail,
  requestVault,
  VaultError,
  updateVaultUpload,
} from '@/services/assets/vault'
import { getPartSize, hashFile, putPart, waitForTransfer } from './transfer'
import { getRemoteUploadTask } from './upload-view'

type TransferTask = {
  key: string
  name: string
  size: number
  parentId: string
  file?: File
  upload?: VaultUpload
  state: string
  phase: string
  progress: number
  speed: number
  error: string
  needsSource: boolean
  offline: boolean
  local: boolean
  manifest?: { hashes: string[]; fingerprint: string }
}
let taskList: TransferTask[] = []
const listenerSet = new Set<() => void>()
const publishedListenerSet = new Set<(parentId: string) => void>()
const controllerMap = new Map<string, AbortController>()
let generation = 0
const notify = () => {
  taskList = [...taskList]
  for (const listener of listenerSet) listener()
}
const patchTask = (task: TransferTask, patch: Partial<TransferTask>) => {
  Object.assign(task, patch)
  notify()
}
const subscribeUploads = (listener: () => void) => {
  listenerSet.add(listener)
  return () => {
    listenerSet.delete(listener)
  }
}
const getUploadSnapshotList = () => taskList
const subscribePublished = (listener: (parentId: string) => void) => {
  publishedListenerSet.add(listener)
  return () => {
    publishedListenerSet.delete(listener)
  }
}
const rememberActiveUploads = () => {
  try {
    localStorage.setItem(
      'nm-storage-active',
      JSON.stringify(
        taskList
          .filter(
            (task) =>
              task.upload &&
              !['completed', 'cancelled', 'failed'].includes(task.state),
          )
          .map((task) => task.upload!.id),
      ),
    )
  } catch {
    /* Vault can be disabled by the browser. Server history remains available. */
  }
}
const mergeRemoteUpload = (upload: VaultUpload) => {
  let task = taskList.find(
    (item) =>
      item.upload?.id === upload.id || item.key === upload.idempotencyKey,
  )
  if (!task) {
    task = getRemoteUploadTask(upload)
    taskList = [...taskList, task]
  } else {
    const pendingAction =
      !task.upload && (task.state === 'cancelled' || task.state === 'paused')
        ? task.state
        : undefined
    task.upload = upload
    if (!task.local) {
      patchTask(task, {
        state: upload.state,
        phase: upload.state,
        error: upload.error ?? '',
        needsSource: ![
          'completed',
          'completing',
          'cancelled',
          'failed',
        ].includes(upload.state),
      })
    }
    if (
      pendingAction &&
      ['preparing', 'uploading', 'paused'].includes(upload.state)
    ) {
      const target = task
      void updateVaultUpload(
        upload.id,
        pendingAction === 'cancelled' ? 'cancel' : 'pause',
      )
        .then((result) => {
          patchTask(target, {
            upload: result,
            state: result.state,
            phase: result.state,
            error: '',
          })
        })
        .catch((error: unknown) =>
          patchTask(target, {
            state: 'error',
            error:
              error instanceof Error ? error.message : '任务状态未确认，请重试',
          }),
        )
    }
    if (upload.error || task.state === 'running')
      task.error = upload.error ?? ''
    if (
      ['completed', 'completing', 'cancelled', 'failed'].includes(upload.state)
    ) {
      const previous = task.state
      patchTask(task, {
        state: upload.state,
        phase: upload.state,
        error: upload.error ?? '',
        progress: upload.state === 'completed' ? 1 : task.progress,
        needsSource: false,
        file: upload.state === 'completed' ? undefined : task.file,
      })
      if (upload.state === 'completed' && previous !== 'completed')
        for (const listener of publishedListenerSet) listener(upload.parentId)
    }
  }
  notify()
  rememberActiveUploads()
}

/**
 * 服务就绪后从持久任务恢复当前浏览器的未结束上传；原文件需用户重新选择。
 *
 * @param signal - 页面请求生命周期信号
 * @returns 无返回值；填充上传任务快照
 */
const restoreUploadTasks = async (signal: AbortSignal) => {
  let ids: unknown = []
  try {
    ids = JSON.parse(localStorage.getItem('nm-storage-active') ?? '[]')
  } catch {
    ids = []
  }
  if (!Array.isArray(ids)) return
  for (const id of ids.slice(0, 100)) {
    if (typeof id !== 'string' || !/^\d+$/.test(id)) continue
    try {
      const detail = await getUploadDetail(id, signal)
      mergeRemoteUpload(detail.upload)
    } catch (error) {
      if (signal.aborted) return
      if (!(error instanceof VaultError) || error.status !== 404) throw error
    }
  }
}
const pollUpload = async (
  task: TransferTask,
  signal: AbortSignal,
  until: 'uploading' | 'completed',
) => {
  while (true) {
    signal.throwIfAborted()
    const detail = await getUploadDetail(task.upload!.id, signal)
    task.upload = detail.upload
    if (detail.upload.state === until || detail.upload.state === 'completed')
      return detail
    if (['cancelled', 'failed', 'paused'].includes(detail.upload.state))
      throw new Error(detail.upload.error ?? '上传任务已停止')
    patchTask(task, {
      phase: until === 'completed' ? 'completing' : 'preparing',
      state: until === 'completed' ? 'completing' : 'running',
    })
    await waitForTransfer(1500, signal)
  }
}

/**
 * 执行校验、准备、分片确认和最终发布；四条分片连接为全局上限。
 *
 * @param task - 持有原文件的独立上传任务
 * @param signal - 暂停、取消或退出时中断当前执行
 * @returns 无返回值；更新任务快照并通知目录刷新
 */
const runTransfer = async (task: TransferTask, signal: AbortSignal) => {
  const file = task.file!
  patchTask(task, {
    state: 'running',
    phase: 'hashing',
    error: '',
    speed: 0,
    needsSource: false,
  })
  if (!task.manifest)
    task.manifest = await hashFile(file, signal, (progress) =>
      patchTask(task, { progress }),
    )
  signal.throwIfAborted()
  if (task.upload) {
    if (task.manifest.fingerprint !== task.upload.fingerprint)
      throw new VaultError(
        '所选文件的内容与原文件不一致，请选择原文件',
        'SOURCE_MISMATCH',
        false,
        409,
      )
    task.upload = await updateVaultUpload(
      task.upload.id,
      'resume',
      task.manifest.fingerprint,
      signal,
    )
  } else {
    patchTask(task, { phase: 'preparing', progress: 0 })
    task.upload = await requestVault<VaultUpload>('/uploads', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        name: task.name,
        parentId: task.parentId,
        size: String(file.size),
        partSize: String(getPartSize(file.size)),
        hashes: task.manifest.hashes,
        mime: file.type,
        idempotencyKey: task.key,
      }),
    })
    rememberActiveUploads()
  }
  const detail = await pollUpload(task, signal, 'uploading')
  if (detail.upload.state === 'completed') {
    mergeRemoteUpload(detail.upload)
    return
  }
  patchTask(task, { phase: 'uploading', progress: 0 })
  const completed = new Map(
    detail.parts
      .filter((part) => part.etag)
      .map((part) => [part.number, Number(part.size)]),
  )
  const sending = new Map<number, number>()
  const pending = detail.parts.filter((part) => !part.etag)
  const start = performance.now()
  const initialBytes = [...completed.values()].reduce(
    (sum, value) => sum + value,
    0,
  )
  const updateProgress = () => {
    const bytes = [...completed.values(), ...sending.values()].reduce(
      (sum, value) => sum + value,
      0,
    )
    patchTask(task, {
      progress: file.size ? Math.min(1, bytes / file.size) : 1,
      speed:
        Math.max(0, bytes - initialBytes) /
        Math.max(1, (performance.now() - start) / 1000),
    })
  }
  updateProgress()
  let position = 0
  const lane = async () => {
    while (position < pending.length) {
      const part = pending[position++]
      const blob = file.slice(
        (part.number - 1) * Number(detail.upload.partSize),
        (part.number - 1) * Number(detail.upload.partSize) + Number(part.size),
      )
      for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted()
        try {
          const signed = await requestVault<{
            url: string
            headers: Record<string, string>
          }>(`/uploads/${task.upload!.id}/parts/${part.number}/sign`, {
            method: 'POST',
            signal,
          })
          await putPart(signed, blob, signal, (bytes) => {
            sending.set(part.number, bytes)
            updateProgress()
          })
          await requestVault(
            `/uploads/${task.upload!.id}/parts/${part.number}/confirm`,
            { method: 'POST', signal },
          )
          break
        } catch (error) {
          if (error instanceof VaultError && error.code === 'PART_CONFIRMED')
            break
          sending.delete(part.number)
          updateProgress()
          if (
            signal.aborted ||
            !(error instanceof VaultError) ||
            !error.retryable ||
            attempt >= 3
          )
            throw error
          await waitForTransfer(1000 * 2 ** attempt, signal)
        }
      }
      completed.set(part.number, Number(part.size))
      sending.delete(part.number)
      updateProgress()
    }
  }
  await Promise.all([lane(), lane()])
  task.upload = await requestVault<VaultUpload>(
    `/uploads/${task.upload!.id}/complete`,
    { method: 'POST', signal },
  )
  patchTask(task, {
    state: 'completing',
    phase: 'completing',
    progress: 1,
    speed: 0,
  })
  const published = await pollUpload(task, signal, 'completed')
  mergeRemoteUpload(published.upload)
}
const scheduleTransfers = () => {
  const currentGeneration = generation
  for (const task of taskList) {
    if (controllerMap.size >= 2) break
    if (task.state !== 'queued' || !task.file || controllerMap.has(task.key))
      continue
    const controller = new AbortController()
    controllerMap.set(task.key, controller)
    void runTransfer(task, controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted && currentGeneration === generation) {
          controller.abort()
          const mismatch =
            error instanceof VaultError &&
            (error.code === 'SOURCE_MISMATCH' ||
              error.code === 'SOURCE_UNREADABLE')
          patchTask(task, {
            state: 'error',
            error: error instanceof Error ? error.message : '上传失败，请重试',
            speed: 0,
            ...(mismatch
              ? { needsSource: true, file: undefined, manifest: undefined }
              : {}),
          })
        }
      })
      .finally(() => {
        if (controllerMap.get(task.key) === controller)
          controllerMap.delete(task.key)
        if (currentGeneration === generation) scheduleTransfers()
      })
  }
}
const enqueueFile = (file: File, parentId: string) => {
  taskList = [
    ...taskList,
    {
      key: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      parentId,
      file,
      state: 'queued',
      phase: 'queued',
      progress: 0,
      speed: 0,
      error: '',
      needsSource: false,
      offline: false,
      local: true,
    },
  ]
  notify()
  scheduleTransfers()
}

/**
 * 按选择文件的相对路径创建目录，再把文件交给独立传输队列。
 *
 * @param files - 原生文件或文件夹选择结果
 * @param parentId - 选择发生时的目标目录
 * @returns 无返回值；创建目录和上传任务，错误由调用者展示
 */
const enqueueFileList = async (files: File[], parentId: string) => {
  const folderMap = new Map<string, string>([['', parentId]])
  for (const file of files) {
    const segments = (file.webkitRelativePath ?? '')
      .split('/')
      .filter(Boolean)
      .slice(0, -1)
    let path = ''
    let target = parentId
    for (const segment of segments) {
      const next = path ? `${path}/${segment}` : segment
      if (!folderMap.has(next)) {
        const folder = await createVaultFolder(target, segment, true)
        folderMap.set(next, folder.id)
      }
      target = folderMap.get(next)!
      path = next
    }
    enqueueFile(file, target)
  }
}
const pauseTransfer = async (task: TransferTask, offline = false) => {
  controllerMap.get(task.key)?.abort()
  patchTask(task, { state: 'paused', speed: 0, offline, local: true })
  if (task.upload && !['completing', 'completed'].includes(task.upload.state)) {
    try {
      task.upload = await updateVaultUpload(task.upload.id, 'pause')
    } catch (error) {
      patchTask(task, {
        error: error instanceof Error ? error.message : '暂停确认失败',
      })
    }
  }
  rememberActiveUploads()
}
const resumeTransfer = (task: TransferTask, file?: File) => {
  if (task.upload?.state === 'failed') {
    const source = file ?? task.file
    if (source) {
      enqueueFile(source, task.parentId)
      patchTask(task, { file: undefined })
    }
    return
  }
  if (file) patchTask(task, { file, manifest: undefined, needsSource: false })
  if (!task.file) {
    patchTask(task, { needsSource: true })
    return
  }
  patchTask(task, { state: 'queued', error: '', offline: false, local: true })
  scheduleTransfers()
}
const cancelTransfer = async (task: TransferTask) => {
  controllerMap.get(task.key)?.abort()
  if (task.upload) await updateVaultUpload(task.upload.id, 'cancel')
  patchTask(task, {
    state: 'cancelled',
    local: true,
    phase: 'cancelled',
    file: undefined,
    speed: 0,
    needsSource: false,
  })
  rememberActiveUploads()
}
const resetTransfers = () => {
  rememberActiveUploads()
  generation++
  for (const controller of controllerMap.values()) controller.abort()
  controllerMap.clear()
  taskList = []
  notify()
}
const offlineHandler = () => {
  for (const task of taskList)
    if (['queued', 'running'].includes(task.state))
      void pauseTransfer(task, true)
}
const onlineHandler = () => {
  for (const task of taskList)
    if (task.offline && task.file) resumeTransfer(task)
}
if (typeof window !== 'undefined') {
  window.addEventListener('offline', offlineHandler)
  window.addEventListener('online', onlineHandler)
}

export {
  subscribeUploads,
  getUploadSnapshotList,
  subscribePublished,
  mergeRemoteUpload,
  restoreUploadTasks,
  enqueueFileList,
  pauseTransfer,
  resumeTransfer,
  cancelTransfer,
  resetTransfers,
}
export type { TransferTask }
