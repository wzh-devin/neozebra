import { atom, useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import {
  getDriveConnectionList,
  saveDriveConnection,
  deleteDriveConnection,
  startDriveAuthorization,
} from '@/services/drive'
import type {
  DriveConnectionDraft,
  DriveProvider,
} from '@/features/drive/types'

const connectionStateAtom = atom<{
  connectionList: DriveProvider[]
  loadError: string | null
  loading: boolean
  loaded: boolean
}>({ connectionList: [], loadError: null, loading: true, loaded: false })
let loadingRequest: Promise<DriveProvider[]> | undefined

/**
 * 共享服务端连接元数据，初始无示例数据，凭据不会回传或写入浏览器缓存。
 *
 * @param 无参数
 * @returns 连接读取、重试及异步保存删除操作
 */
const useDriveConnections = () => {
  const [state, setState] = useAtom(connectionStateAtom)
  const retryLoadHandler = useCallback(async (): Promise<void> => {
    setState((current) => ({ ...current, loading: true, loadError: null }))
    loadingRequest ??= getDriveConnectionList().finally(() => {
      loadingRequest = undefined
    })
    try {
      const connectionList = await loadingRequest
      setState({
        connectionList,
        loading: false,
        loaded: true,
        loadError: null,
      })
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        loaded: true,
        loadError:
          error instanceof Error ? error.message : 'Could not load drives.',
      }))
    }
  }, [setState])
  useEffect(() => {
    if (!state.loaded) void retryLoadHandler()
  }, [state.loaded, retryLoadHandler])
  const saveConnection = async (
    draft: DriveConnectionDraft,
    existingId?: string,
  ): Promise<DriveProvider> => {
    if (state.loadError || !state.loaded)
      throw new Error(state.loadError ?? 'Wait for drives to load.')
    const existing = state.connectionList.find(
      (connection) => connection.id === existingId,
    )
    if (existingId && !existing) throw new Error('This Drive no longer exists.')
    const connection = await saveDriveConnection(draft, existing)
    setState((current) => ({
      ...current,
      connectionList: [
        ...current.connectionList.filter((item) => item.id !== connection.id),
        connection,
      ],
    }))
    return connection
  }
  const deleteConnection = async (id: string): Promise<void> => {
    await deleteDriveConnection(id)
    setState((current) => ({
      ...current,
      connectionList: current.connectionList.filter(
        (connection) => connection.id !== id,
      ),
    }))
  }
  const authorizeConnection = async (
    draft: DriveConnectionDraft,
    existingId?: string,
  ): Promise<string> => {
    if (state.loadError || !state.loaded)
      throw new Error(state.loadError ?? 'Wait for drives to load.')
    const existing = state.connectionList.find((item) => item.id === existingId)
    if (existingId && !existing) throw new Error('This Drive no longer exists.')
    return startDriveAuthorization(draft, existing)
  }
  return {
    ...state,
    saveConnection,
    authorizeConnection,
    deleteConnection,
    retryLoadHandler,
  }
}
export { useDriveConnections }
