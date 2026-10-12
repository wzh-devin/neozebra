import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { DriveWorkspace } from '@/features/drive/components/DriveWorkspace'
import { Navigate, useParams } from 'react-router-dom'

import { DriveProviderPageContent } from '@/features/drive/components/files/DriveProviderPageContent'
import { useDriveConnections } from '@/features/drive/hooks/useDriveConnections'
import { useDriveView } from '@/features/drive/hooks/useDriveView'
import type { DriveProvider } from '@/features/drive/types'

/**
 * 组合一个已存在实例的独立文件空间。
 *
 * @param props - 当前连接实例
 * @returns 文件空间JSX
 */
const DriveConnectionFiles = ({
  connection,
}: {
  connection: DriveProvider
}) => {
  const view = useDriveView(connection)
  return <DriveProviderPageContent {...view} />
}

/**
 * 解析稳定实例ID并处理未知连接路由。
 *
 * @param 无参数
 * @returns 实例文件空间或返回总览的导航
 */
const DriveProviderWorkspace = () => {
  const { connectionId } = useParams()
  const { connectionList, loading, loadError, retryLoadHandler } =
    useDriveConnections()
  const connection = connectionList.find((item) => item.id === connectionId)
  if (loading || loadError)
    return (
      <DriveWorkspace>
        <div className="p-6" role={loadError ? 'alert' : 'status'}>
          {loadError ?? (
            <>
              <Spinner />
              Loading Drive…
            </>
          )}
          {loadError ? <Button onClick={retryLoadHandler}>Retry</Button> : null}
        </div>
      </DriveWorkspace>
    )
  return connection ? (
    <DriveConnectionFiles key={connection.id} connection={connection} />
  ) : (
    <Navigate to="/assets/drive" replace />
  )
}

export { DriveProviderWorkspace }
