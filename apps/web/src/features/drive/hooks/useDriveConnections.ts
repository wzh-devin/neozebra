import { atom, useAtomValue, useSetAtom, type Getter, type Setter } from 'jotai'

import {
  buildDriveConnection,
  parseSavedDriveConnectionRecord,
} from '@/features/drive/data/drive-connections'
import { fileStateMapAtom } from '@/features/drive/data/drive-file-state'
import { driveProviderList } from '@/features/drive/data/mockDrive'
import type {
  DriveConnectionDraft,
  DriveProvider,
  DriveProviderId,
} from '@/features/drive/types'

const storageKey = 'neozebra.drive.connections.v1'
type DriveConnectionState = {
  connectionList: DriveProvider[]
  savedConnectionList: DriveProvider[]
  removedDefaultIds: DriveProviderId[]
  loadError: string | null
}

/**
 * 恢复非敏感连接配置并保留旧路由，损坏或受限缓存不被覆盖。
 *
 * @param 无参数
 * @returns 连接状态及安全加载错误
 */
const readDriveConnectionState = (): DriveConnectionState => {
  try {
    const { connectionList: savedConnectionList, removedDefaultIds } =
      parseSavedDriveConnectionRecord(
        typeof window === 'undefined'
          ? null
          : window.localStorage.getItem(storageKey),
      )
    const connectionMap = new Map(
      driveProviderList
        .filter((item) => !removedDefaultIds.includes(item.providerId))
        .map((item) => [item.id, item]),
    )
    for (const connection of savedConnectionList)
      connectionMap.set(connection.id, connection)
    return {
      connectionList: [...connectionMap.values()],
      savedConnectionList,
      removedDefaultIds,
      loadError: null,
    }
  } catch {
    return {
      connectionList: driveProviderList,
      savedConnectionList: [],
      removedDefaultIds: [],
      loadError:
        'Saved drives could not be loaded. Retry before saving changes.',
    }
  }
}

const connectionStateAtom = atom(readDriveConnectionState())
const credentialsMapAtom = atom<Record<string, DriveConnectionDraft>>({})

/**
 * 先写入白名单元数据，成功后才更新实例与内存凭据。
 *
 * @param get - Atom读取方法
 * @param set - Atom写入方法
 *
 * @param draft - 已校验的连接草稿
 * @param existingId - 编辑中的稳定实例ID
 * @returns 已保存实例；存储失败保留原状态并抛出安全错误
 */
const saveDriveConnection = (
  get: Getter,
  set: Setter,
  draft: DriveConnectionDraft,
  existingId?: string,
): DriveProvider => {
  const state = get(connectionStateAtom)
  if (state.loadError) throw new Error(state.loadError)
  if (
    existingId &&
    !state.connectionList.some(
      (item) => item.id === existingId && item.providerId === draft.providerId,
    )
  )
    throw new Error('This Drive is no longer available.')
  const connection = buildDriveConnection(
    draft,
    existingId ?? crypto.randomUUID(),
  )
  const savedConnectionList = [
    ...state.savedConnectionList.filter((item) => item.id !== connection.id),
    connection,
  ]
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 1,
        connections: savedConnectionList,
        removedDefaultIds: state.removedDefaultIds,
      }),
    )
  } catch {
    throw new Error(
      'Unable to save this Drive. Check browser storage and try again.',
    )
  }
  const connectionMap = new Map(
    state.connectionList.map((item) => [item.id, item]),
  )
  connectionMap.set(connection.id, connection)
  set(connectionStateAtom, {
    connectionList: [...connectionMap.values()],
    savedConnectionList,
    removedDefaultIds: state.removedDefaultIds,
    loadError: null,
  })
  set(credentialsMapAtom, {
    ...get(credentialsMapAtom),
    [connection.id]: draft,
  })
  return connection
}
const saveConnectionAtom = atom(null, saveDriveConnection)

/**
 * 先持久化删除，再移除连接、会话凭据和文件引用，写入失败保持原状态。
 *
 * @param get - Atom读取方法
 * @param set - Atom写入方法
 *
 * @param id - 待删除的连接实例ID
 * @returns 无返回值；成功清理本地状态，失败抛出安全错误
 */
const deleteDriveConnection = (get: Getter, set: Setter, id: string): void => {
  const state = get(connectionStateAtom)
  if (state.loadError) throw new Error(state.loadError)
  const connection = state.connectionList.find((item) => item.id === id)
  if (!connection) throw new Error('This Drive is no longer available.')
  const savedConnectionList = state.savedConnectionList.filter(
    (item) => item.id !== id,
  )
  const removedDefaultIds =
    id === connection.providerId
      ? [...state.removedDefaultIds, connection.providerId]
      : state.removedDefaultIds
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 1,
        connections: savedConnectionList,
        removedDefaultIds,
      }),
    )
  } catch {
    throw new Error(
      'Unable to delete this Drive. Check browser storage and try again.',
    )
  }
  const credentialsMap = { ...get(credentialsMapAtom) }
  const fileStateMap = { ...get(fileStateMapAtom) }
  delete credentialsMap[id]
  delete fileStateMap[id]
  set(connectionStateAtom, {
    connectionList: state.connectionList.filter((item) => item.id !== id),
    savedConnectionList,
    removedDefaultIds,
    loadError: null,
  })
  set(credentialsMapAtom, credentialsMap)
  set(fileStateMapAtom, fileStateMap)
}
const deleteConnectionAtom = atom(null, deleteDriveConnection)

/**
 * 共享多连接实例及当前会话凭据，持久化内容不含密钥或Token。
 *
 * @param 无参数
 * @returns 总览、编辑与文件空间需要的实例状态和保存操作
 */
const useDriveConnections = () => {
  const state = useAtomValue(connectionStateAtom)
  const credentialsMap = useAtomValue(credentialsMapAtom)
  const setState = useSetAtom(connectionStateAtom)
  const saveConnection = useSetAtom(saveConnectionAtom)
  const deleteConnection = useSetAtom(deleteConnectionAtom)

  // 重试读取本地连接配置，不覆盖缓存。
  const retryLoadHandler = (): void => setState(readDriveConnectionState())
  return {
    ...state,
    credentialsMap,
    saveConnection,
    deleteConnection,
    retryLoadHandler,
  }
}

export { useDriveConnections }
