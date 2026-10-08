import { Navigate, useParams } from 'react-router-dom'

import {
  DriveProviderPageContent,
  isDriveProviderId,
  useDriveView,
} from '@/features/drive'

/**
 * 组合指定 Drive Provider 的文件空间页面。
 *
 * @param 无参数
 * @returns Provider 文件空间 JSX
 */
const DriveProviderPage = () => {
  const { providerId } = useParams()
  const validProviderId = isDriveProviderId(providerId) ? providerId : 'baidu'
  const driveView = useDriveView(validProviderId)

  if (!isDriveProviderId(providerId)) {
    return <Navigate to="/assets/drive" replace />
  }

  return <DriveProviderPageContent {...driveView} />
}

export { DriveProviderPage }
