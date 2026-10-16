import { useInfiniteQuery } from '@tanstack/react-query'
import { getEntryPage, VaultError } from '@/services/assets/vault'

/**
 * 使用绑定目录的缓存与取消信号分页加载，失效游标显示重新加载入口。
 *
 * @param parentId - 稳定目录编号
 * @param trash - 是否查看回收站
 * @param search - 当前目录过滤条件
 * @param enabled - 是否展开或正在展示此目录
 * @returns 有界分页查询及目录条目
 */
const useVaultEntries = (
  parentId: string,
  trash = false,
  search = '',
  enabled = true,
) => {
  const query = useInfiniteQuery({
    queryKey: ['vault', 'entries', parentId, trash, search],
    queryFn: ({ pageParam, signal }) =>
      getEntryPage(parentId, trash, search, pageParam, signal),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled,
    staleTime: 15_000,
    retry: (count, error) =>
      count < 2 && error instanceof VaultError && error.retryable,
  })
  return {
    ...query,
    entries: query.isError
      ? []
      : (query.data?.pages.flatMap((page) => page.entries) ?? []),
    path: query.isError ? [] : (query.data?.pages[0]?.path ?? []),
  }
}
export { useVaultEntries }
