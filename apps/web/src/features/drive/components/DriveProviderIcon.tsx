import baiduIcon from '@/assets/drive/baidu-netdisk.png'
import aliyunIcon from '@/assets/drive/aliyun-drive.png'
import minioIcon from '@/assets/drive/minio.png'
import type { DriveProviderId } from '@/features/drive/types'

const providerIconMap: Record<DriveProviderId, string> = {
  baidu: baiduIcon,
  aliyun: aliyunIcon,
  minio: minioIcon,
}

type DriveProviderIconProps = {
  providerId: DriveProviderId
  className: string
}

/**
 * 展示与存储服务对应的官方品牌图标。
 *
 * @param props - Provider 标识与所在组件的尺寸样式
 * @returns 装饰性品牌图片 JSX；名称由相邻文字提供
 */
const DriveProviderIcon = ({
  providerId,
  className,
}: DriveProviderIconProps) => (
  <img
    src={providerIconMap[providerId]}
    alt=""
    aria-hidden="true"
    className={className}
    data-provider={providerId}
  />
)

export { DriveProviderIcon }
