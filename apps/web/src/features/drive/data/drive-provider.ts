import type { DriveProviderId } from '@/features/drive/types'

const providerIdList: DriveProviderId[] = ['baidu', 'aliyun', 'minio']

/**
 * 判断参数是否是受支持的 Drive Provider。
 *
 * @param value - 路由参数
 * @returns 是否为有效 Provider 标识
 */
const isDriveProviderId = (
  value: string | undefined,
): value is DriveProviderId =>
  Boolean(value && providerIdList.includes(value as DriveProviderId))

export { isDriveProviderId }
