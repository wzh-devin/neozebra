import { DriveWorkspace } from '@/features/drive/components/DriveWorkspace'
import { DriveConnectionDialog } from '@/features/drive/components/providers/DriveConnectionDialog'
import { DriveProviderCard } from '@/features/drive/components/providers/DriveProviderCard'
import { useDriveConnections } from '@/features/drive/hooks/useDriveConnections'
import { Button } from '@/components/ui/button'
import type { DriveProvider } from '@/features/drive/types'

import styles from '@/features/drive/components/providers/DrivePageContent.module.css'

/**
 * 渲染一个存储 Provider 卡片。
 *
 * @param provider - 本地 mock Provider 数据
 * @returns Provider 卡片列表项 JSX
 */
const renderProviderCard = (provider: DriveProvider) => (
  <li key={provider.id}>
    <DriveProviderCard provider={provider} />
  </li>
)

/**
 * 组合 Drive 存储管理工作区。
 *
 * @param 无参数
 * @returns Provider 总览 JSX
 */
const DrivePageContent = () => {
  const { connectionList, loadError, retryLoadHandler } = useDriveConnections()
  return (
    <DriveWorkspace>
      <div className={styles.overview}>
        {loadError ? (
          <div className={styles.error} role="alert">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={retryLoadHandler}>
              Retry
            </Button>
          </div>
        ) : null}
        <ul className={styles.grid} aria-label="Storage providers">
          {connectionList.map(renderProviderCard)}
          <li>
            <DriveConnectionDialog />
          </li>
        </ul>
      </div>
    </DriveWorkspace>
  )
}

export { DrivePageContent }
