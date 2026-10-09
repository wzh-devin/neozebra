import { atom, useAtomValue, useSetAtom, type Getter, type Setter } from 'jotai'

import {
  buildDriveConnection,
  parseSavedDriveConnectionList,
} from '@/features/drive/data/drive-connections'
import { driveProviderList } from '@/features/drive/data/mockDrive'
import type {
  DriveConnectionDraft,
  DriveProvider,
} from '@/features/drive/types'

const storageKey = 'neozebra.drive.connections.v1'
type DriveConnectionState = {
  connectionList: DriveProvider[]
  savedConnectionList: DriveProvider[]
  loadError: string | null
}

/**
 * 恢复非敏感连接配置并保留旧路由，损坏或受限缓存不被覆盖。
 * @param 无参数
 * @returns 连接状态及安全加载错误
 */
const readDriveConnectionState = (): DriveConnectionState => {
  try {
    const savedConnectionList =
      typeof window === 'undefined'
        ? []
        : parseSavedDriveConnectionList(window.localStorage.getItem(storageKey))
    const connectionMap = new Map(
      driveProviderList.map((item) => [item.id, item]),
    )
    for (const connection of savedConnectionList)
      connectionMap.set(connection.id, connection)
    return {
      connectionList: [...connectionMap.values()],
      savedConnectionList,
      loadError: null,
    }
  } catch {
    return {
      connectionList: driveProviderList,
      savedConnectionList: [],
      loadError:
        'Saved drives could not be loaded. Retry before saving changes.',
    }
  }
}

const connectionStateAtom = atom(readDriveConnectionState())
const credentialsMapAtom = atom<Record<string, DriveConnectionDraft>>({})
/**
 * 先写入白名单元数据，成功后才更新实例与内存凭据。
 * @param get - Atom读取方法
 * @param set - Atom写入方法
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
      JSON.stringify({ version: 1, connections: savedConnectionList }),
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
 * 共享多连接实例及当前会话凭据，持久化内容不含密钥或Token。
 * @param 无参数
 * @returns 总览、编辑与文件空间需要的实例状态和保存操作
 */
const useDriveConnections = () => {
  const state = useAtomValue(connectionStateAtom)
  const credentialsMap = useAtomValue(credentialsMapAtom)
  const setState = useSetAtom(connectionStateAtom)
  const saveConnection = useSetAtom(saveConnectionAtom)
  /** 重试读取本地配置。
   * @param 无参数
   * @returns 无返回值；更新加载状态，不删除或覆盖缓存
   */
  const retryLoadHandler = (): void => setState(readDriveConnectionState())
  return { ...state, credentialsMap, saveConnection, retryLoadHandler }
}

export { useDriveConnections }
