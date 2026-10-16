import { useEffect } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { subscribePublished } from '@/features/assets/vault/uploads/engine'

/**
 * 页面切换期间仍接收发布事件，使已有目录缓存立即失效。
 *
 * @param queryClient - 应用生命周期内的请求缓存
 * @returns 无返回值；监听已发布文件并仅刷新其父目录，卸载移除监听
 */
const useVaultPublicationCache = (queryClient: QueryClient) => {
  useEffect(
    () =>
      subscribePublished((id) => {
        void queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === 'vault' &&
            query.queryKey[1] === 'entries' &&
            query.queryKey[2] === id,
        })
      }),
    [queryClient],
  )
}
export { useVaultPublicationCache }
