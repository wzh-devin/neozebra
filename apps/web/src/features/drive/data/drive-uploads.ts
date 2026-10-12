import { atom, getDefaultStore } from 'jotai'
import { getDriveUploadDirectoryPathList } from '@/features/drive/data/drive-upload-path'
import {
  getDriveUploadPage,
  getDriveUploadDetails,
  createDriveUpload,
  updateDriveUpload,
  completeDriveUpload,
  sendDriveUploadPart,
} from '@/services/drive-upload'
import type {
  DriveUploadTask,
  DriveUploadAction,
} from '@/features/drive/upload-types'

type UploadAccountState = {
  tasks: DriveUploadTask[]
  loading: boolean
  loaded: boolean
  error: string | null
  nextCursor: string | null
}
type UploadRuntime = {
  id: string
  connectionId: string
  file: File
  hashes?: string[]
  persisted: boolean
  registration?: Promise<DriveUploadTask>
  controller?: AbortController
  flightMap: Map<number, number>
  started: number
  startBytes: number
}
const driveUploadStateAtom = atom<Record<string, UploadAccountState>>({})
const uploadRuntimeMap = new Map<string, UploadRuntime>()
const uploadRequestMap = new Map<string, Promise<void>>()
const runningAccountSet = new Set<string>()
const store = getDefaultStore()
const partSize = 8 * 1024 * 1024
const emptyUploadState: UploadAccountState = {
  tasks: [],
  loading: false,
  loaded: false,
  error: null,
  nextCursor: null,
}
const activeStatusSet = new Set([
  'waiting',
  'preparing',
  'receiving',
  'queued',
  'transferring',
])
const getAccountState = (id: string) =>
  store.get(driveUploadStateAtom)[id] ?? emptyUploadState
const getTask = (connectionId: string, id: string) =>
  getAccountState(connectionId).tasks.find((task) => task.id === id)
const setAccountState = (
  id: string,
  update: (current: UploadAccountState) => UploadAccountState,
) =>
  store.set(driveUploadStateAtom, (current) => ({
    ...current,
    [id]: update(current[id] ?? emptyUploadState),
  }))
const mergeTask = (connectionId: string, task: DriveUploadTask) =>
  setAccountState(connectionId, (current) => ({
    ...current,
    tasks: [task, ...current.tasks.filter((item) => item.id !== task.id)].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    ),
  }))
const updateLocalTask = (
  connectionId: string,
  id: string,
  values: Partial<DriveUploadTask>,
) => {
  const previous = getTask(connectionId, id)
  if (previous) mergeTask(connectionId, { ...previous, ...values })
}
const getRuntimeKey = (connectionId: string, id: string) =>
  connectionId + ':' + id
const hasUploadFile = (connectionId: string, id: string) =>
  uploadRuntimeMap.has(getRuntimeKey(connectionId, id))
const hashUploadBytes = async (bytes: ArrayBuffer): Promise<string> => {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * 加载账号任务，保留本地排队项，远端完成只通知其目标目录。
 *
 * @param connectionId - 关联账号标识
 * @param more - 是否追加下一页
 * @returns 无返回值；更新共享任务状态
 */
const loadDriveUploads = (
  connectionId: string,
  more = false,
): Promise<void> => {
  const existing = uploadRequestMap.get(connectionId)
  if (existing) return existing
  const request = (async () => {
    const before = getAccountState(connectionId)
    setAccountState(connectionId, (current) => ({
      ...current,
      loading: true,
      error: null,
    }))
    try {
      const page = await getDriveUploadPage(
        connectionId,
        more ? (before.nextCursor ?? undefined) : undefined,
      )
      setAccountState(connectionId, (current) => {
        const previousMap = new Map(
          current.tasks.map((task) => [task.id, task]),
        )
        const taskMap = new Map(
          current.tasks
            .filter(
              (task) =>
                hasUploadFile(connectionId, task.id) ||
                Date.parse(task.expiresAt) > Date.now(),
            )
            .map((task) => [task.id, task]),
        )
        for (const task of page.tasks) {
          const previous = previousMap.get(task.id)
          const runtime = uploadRuntimeMap.get(
            getRuntimeKey(connectionId, task.id),
          )
          const speed =
            previous?.phase === 'remote' &&
            previous.updatedAt !== task.updatedAt
              ? Math.max(0, task.transferredBytes - previous.transferredBytes) /
                Math.max(
                  1,
                  (Date.parse(task.updatedAt) -
                    Date.parse(previous.updatedAt)) /
                    1000,
                )
              : previous?.bytesPerSecond
          taskMap.set(task.id, {
            ...task,
            status:
              runtime &&
              (previous?.status === 'waiting' ||
                (runtime.controller && previous?.status === 'preparing')) &&
              task.phase === 'receiving' &&
              ['preparing', 'receiving'].includes(task.status)
                ? previous!.status
                : task.status,
            error:
              task.error ??
              (task.status === 'paused' ? (previous?.error ?? null) : null),
            preparedBytes: previous?.preparedBytes,
            inFlightBytes: runtime?.controller ? previous?.inFlightBytes : 0,
            bytesPerSecond: speed,
          })
          if (
            previous &&
            previous.status !== 'completed' &&
            task.status === 'completed'
          )
            window.dispatchEvent(
              new CustomEvent('drive-upload-completed', {
                detail: { connectionId, parent: task.parent },
              }),
            )
        }
        return {
          tasks: [...taskMap.values()].sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          ),
          loading: false,
          loaded: true,
          error: null,
          nextCursor: page.nextCursor,
        }
      })
    } catch (error) {
      setAccountState(connectionId, (current) => ({
        ...current,
        loading: false,
        loaded: true,
        error:
          error instanceof Error
            ? error.message
            : 'Could not load upload tasks.',
      }))
    }
  })().finally(() => uploadRequestMap.delete(connectionId))
  uploadRequestMap.set(connectionId, request)
  return request
}

/**
 * 选择文件后立即保存任务元数据，暂停/取消发生在创建响应之前时补偿服务端状态。
 *
 * @param id - 本地任务标识
 * @param runtime - 文件及账号
 * @param task - 待登记元数据；内容指纹在发送首片前绑定
 * @returns 服务端任务；不上传文件内容
 */
const registerUploadTask = (
  id: string,
  runtime: UploadRuntime,
  task: DriveUploadTask,
) => {
  const request = Promise.resolve()
    .then(() =>
      createDriveUpload(runtime.connectionId, {
        id,
        parent: task.parent,
        directoryPath:
          task.directoryPath ?? getDriveUploadDirectoryPathList(runtime.file),
        name: task.name,
        size: task.size,
        mimeType: task.mimeType,
        fingerprint: '',
      }),
    )
    .then(async (saved) => {
      runtime.persisted = true
      const current = getTask(runtime.connectionId, id)
      if (
        uploadRuntimeMap.get(getRuntimeKey(runtime.connectionId, id)) !==
          runtime ||
        current?.status === 'cancelled'
      )
        saved = await updateDriveUpload(runtime.connectionId, id, 'cancel')
      else if (current?.status === 'paused')
        saved = await updateDriveUpload(runtime.connectionId, id, 'pause')
      const latest = getTask(runtime.connectionId, id)
      mergeTask(runtime.connectionId, {
        ...saved,
        status:
          latest &&
          ['waiting', 'preparing'].includes(latest.status) &&
          saved.phase === 'receiving'
            ? latest.status
            : saved.status,
        preparedBytes: latest?.preparedBytes,
      })
      return saved
    })
  runtime.registration = request
  void request.catch((error: unknown) => {
    if (
      uploadRuntimeMap.get(getRuntimeKey(runtime.connectionId, id)) === runtime
    )
      updateLocalTask(runtime.connectionId, id, {
        status: 'paused',
        error:
          error instanceof Error
            ? error.message
            : 'Could not register this upload. Retry.',
      })
  })
  return request
}

/**
 * 校验原文件、恢复已收分片并有界发送缺失片，交给后台后释放File引用。
 *
 * @param id - 任务标识
 * @param runtime - 当前浏览器仍可读取的原文件
 * @returns 无返回值；更新任务、发送分片或保留失败断点
 */
const runUpload = async (id: string, runtime: UploadRuntime) => {
  const connectionId = runtime.connectionId
  const controller = new AbortController()
  runtime.controller = controller
  runtime.started = performance.now()
  const signal = controller.signal
  try {
    updateLocalTask(connectionId, id, {
      status: 'preparing',
      error: null,
      preparedBytes: 0,
    })
    let task = runtime.registration
      ? await runtime.registration
      : runtime.persisted
        ? (await getDriveUploadDetails(connectionId, id)).task
        : await registerUploadTask(id, runtime, getTask(connectionId, id)!)
    signal.throwIfAborted()
    if (
      task.phase === 'remote' ||
      ['completed', 'cancelled'].includes(task.status)
    ) {
      mergeTask(connectionId, task)
      uploadRuntimeMap.delete(getRuntimeKey(connectionId, id))
      return
    }
    if (!runtime.hashes) {
      const count = Math.max(1, Math.ceil(runtime.file.size / partSize))
      const hashes: string[] = []
      for (let part = 0; part < count; part++) {
        signal.throwIfAborted()
        hashes.push(
          await hashUploadBytes(
            await runtime.file
              .slice(part * partSize, (part + 1) * partSize)
              .arrayBuffer(),
          ),
        )
        updateLocalTask(connectionId, id, {
          preparedBytes: Math.min(runtime.file.size, (part + 1) * partSize),
        })
      }
      runtime.hashes = hashes
    }
    signal.throwIfAborted()
    const fingerprint = await hashUploadBytes(
      new TextEncoder().encode(runtime.hashes.join('')).buffer,
    )
    if (task.fingerprint && task.fingerprint !== fingerprint) {
      uploadRuntimeMap.delete(getRuntimeKey(connectionId, id))
      throw new Error(
        'This file does not match the original upload. Select the original file.',
      )
    }
    task = await updateDriveUpload(connectionId, id, 'resume', fingerprint)
    signal.throwIfAborted()
    if (
      task.phase === 'remote' ||
      ['completed', 'cancelled'].includes(task.status)
    ) {
      mergeTask(connectionId, task)
      uploadRuntimeMap.delete(getRuntimeKey(connectionId, id))
      return
    }
    mergeTask(connectionId, { ...task, inFlightBytes: 0 })
    const receivedPartSet = new Set<number>()
    let after = -1
    while (true) {
      signal.throwIfAborted()
      const details = await getDriveUploadDetails(connectionId, id, after)
      for (const part of details.parts) {
        if (part.sha256 !== runtime.hashes[part.partNumber]) {
          uploadRuntimeMap.delete(getRuntimeKey(connectionId, id))
          throw new Error(
            'This file does not match the confirmed upload parts.',
          )
        }
        receivedPartSet.add(part.partNumber)
      }
      if (details.nextPart === null) break
      after = details.nextPart
    }
    runtime.startBytes = task.receivedBytes
    runtime.started = performance.now()
    let next = 0
    const sendMissingParts = async () => {
      while (next < task.partCount) {
        signal.throwIfAborted()
        const part = next++
        if (receivedPartSet.has(part)) continue
        const blob = runtime.file.slice(
          part * task.partSize,
          (part + 1) * task.partSize,
        )
        let confirmed = false
        for (let attempt = 0; attempt < 3 && !confirmed; attempt++) {
          signal.throwIfAborted()
          try {
            const updated = await sendDriveUploadPart(
              connectionId,
              id,
              part,
              blob,
              runtime.hashes![part],
              signal,
              (bytes) => {
                runtime.flightMap.set(part, bytes)
                const inFlightBytes = [...runtime.flightMap.values()].reduce(
                  (total, value) => total + value,
                  0,
                )
                const current = getTask(connectionId, id)!
                const sent = Math.max(
                  0,
                  current.receivedBytes + inFlightBytes - runtime.startBytes,
                )
                updateLocalTask(connectionId, id, {
                  inFlightBytes,
                  bytesPerSecond:
                    sent /
                    Math.max(0.1, (performance.now() - runtime.started) / 1000),
                })
              },
            )
            signal.throwIfAborted()
            runtime.flightMap.delete(part)
            const current = getTask(connectionId, id)!
            mergeTask(connectionId, {
              ...updated,
              receivedBytes: Math.max(
                current.receivedBytes,
                updated.receivedBytes,
              ),
              inFlightBytes: [...runtime.flightMap.values()].reduce(
                (sum, value) => sum + value,
                0,
              ),
              bytesPerSecond: current.bytesPerSecond,
            })
            confirmed = true
          } catch (error) {
            runtime.flightMap.delete(part)
            if (signal.aborted || attempt === 2) throw error
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * (attempt + 1)),
            )
          }
        }
      }
    }
    await Promise.all([sendMissingParts(), sendMissingParts()])
    signal.throwIfAborted()
    mergeTask(connectionId, await completeDriveUpload(connectionId, id))
    uploadRuntimeMap.delete(getRuntimeKey(connectionId, id))
  } catch (error) {
    runtime.registration = undefined
    controller.abort()
    if (error instanceof DOMException && error.name === 'AbortError') return
    if (getTask(connectionId, id)?.status === 'cancelled') return
    const message =
      error instanceof Error
        ? error.message
        : 'Could not upload this file. Resume to retry.'
    if (!runtime.persisted) {
      try {
        await getDriveUploadDetails(connectionId, id)
        runtime.persisted = true
      } catch {
        // 创建失败尚无服务端任务时，原文件仍留在当前浏览器等待重试。
      }
    }
    if (runtime.persisted) {
      try {
        mergeTask(
          connectionId,
          await updateDriveUpload(connectionId, id, 'pause'),
        )
      } catch {
        /* 服务端不可达时本地保留文件和断点，下一次查询恢复真实状态。 */
      }
    }
    updateLocalTask(connectionId, id, {
      status: 'paused',
      error: message,
      inFlightBytes: 0,
      bytesPerSecond: 0,
    })
  } finally {
    runtime.controller = undefined
    runtime.flightMap.clear()
  }
}

/**
 * 每账号顺序读取文件，最多两个账号同时向系统传片；生命周期独立于路由。
 *
 * @param 无参数
 * @returns 无返回值；启动可运行任务
 */
const pumpDriveUploads = () => {
  for (const runtime of uploadRuntimeMap.values()) {
    const id = runtime.id
    if (runningAccountSet.size >= 2) break
    if (
      runningAccountSet.has(runtime.connectionId) ||
      getTask(runtime.connectionId, id)?.status !== 'waiting'
    )
      continue
    runningAccountSet.add(runtime.connectionId)
    void runUpload(id, runtime).finally(() => {
      runningAccountSet.delete(runtime.connectionId)
      pumpDriveUploads()
    })
  }
}

/**
 * 将选中文件加入指定账号/目录，支持已有任务的原文件续传。
 *
 * @param connectionId - 关联账号
 * @param parent - 目标目录
 * @param directoryName - 目标目录名称
 * @param files - 选中文件
 * @param existing - 待恢复任务
 * @returns 无返回值；创建本地任务并启动队列
 */
const addDriveUploadFiles = (
  connectionId: string,
  parent: string,
  directoryName: string,
  files: File[],
  existing?: DriveUploadTask,
) => {
  for (const file of files) {
    if (
      existing &&
      (file.size !== existing.size ||
        (!existing.fingerprint && file.name !== existing.name))
    ) {
      updateLocalTask(connectionId, existing.id, {
        error: 'This file size does not match. Select the original file.',
      })
      return
    }
    const id = existing?.id ?? crypto.randomUUID()
    if (uploadRuntimeMap.get(getRuntimeKey(connectionId, id))?.controller)
      return
    const now = new Date().toISOString()
    const task: DriveUploadTask = existing ?? {
      id,
      parent,
      directoryName: file.webkitRelativePath
        ? [
            directoryName,
            ...file.webkitRelativePath.split('/').slice(0, -1),
          ].join(' / ')
        : directoryName,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      fingerprint: '',
      partSize,
      partCount: Math.max(1, Math.ceil(file.size / partSize)),
      receivedBytes: 0,
      transferredBytes: 0,
      status: 'waiting',
      phase: 'receiving',
      error: null,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    }
    const runtime: UploadRuntime = {
      id,
      connectionId,
      file,
      persisted: Boolean(existing),
      flightMap: new Map(),
      started: 0,
      startBytes: 0,
    }
    uploadRuntimeMap.set(getRuntimeKey(connectionId, id), runtime)
    mergeTask(connectionId, { ...task, status: 'waiting', error: null })
    if (!existing) registerUploadTask(id, runtime, task)
    if (existing) break
  }
  pumpDriveUploads()
}

/**
 * 执行任务控制，浏览器暂停释放当前请求，远端控制由后台在分片边界生效。
 *
 * @param connectionId - 关联账号
 * @param task - 任务
 * @param action - 操作
 * @returns 无返回值；更新任务状态，失败保留任务并显示原因
 */
const controlDriveUpload = async (
  connectionId: string,
  task: DriveUploadTask,
  action: DriveUploadAction,
) => {
  if (!getTask(connectionId, task.id)) mergeTask(connectionId, task)
  const runtime = uploadRuntimeMap.get(getRuntimeKey(connectionId, task.id))
  if (action === 'pause' || action === 'cancel') runtime?.controller?.abort()
  try {
    if (
      (action === 'resume' || action === 'retry') &&
      runtime &&
      !runtime.persisted
    )
      runtime.registration = undefined
    if (!runtime || runtime.persisted)
      mergeTask(
        connectionId,
        await updateDriveUpload(connectionId, task.id, action),
      )
    else
      updateLocalTask(connectionId, task.id, {
        status:
          action === 'cancel'
            ? 'cancelled'
            : action === 'pause'
              ? 'paused'
              : 'waiting',
        error: null,
      })
    if (action === 'cancel')
      uploadRuntimeMap.delete(getRuntimeKey(connectionId, task.id))
    if (
      (action === 'resume' || action === 'retry') &&
      runtime &&
      task.phase === 'receiving'
    ) {
      updateLocalTask(connectionId, task.id, { status: 'waiting' })
      pumpDriveUploads()
    }
  } catch (error) {
    updateLocalTask(connectionId, task.id, {
      error:
        error instanceof Error
          ? error.message
          : 'Could not update this upload. Retry.',
    })
  }
}

export {
  driveUploadStateAtom,
  emptyUploadState,
  activeStatusSet,
  loadDriveUploads,
  addDriveUploadFiles,
  controlDriveUpload,
  hasUploadFile,
}
