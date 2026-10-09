import { useRef, useState } from 'react'

import { DriveWorkspace } from '@/features/drive/components/DriveWorkspace'
import { DriveConnectionDialog } from '@/features/drive/components/providers/DriveConnectionDialog'
import { DriveProviderCard } from '@/features/drive/components/providers/DriveProviderCard'
import { DriveDeleteConnectionDialog } from '@/features/drive/components/providers/DriveDeleteConnectionDialog'
import { useDriveConnections } from '@/features/drive/hooks/useDriveConnections'
import { Button } from '@/components/ui/button'
import type { DriveProvider } from '@/features/drive/types'

import styles from '@/features/drive/components/providers/DrivePageContent.module.css'

/**
 * 组合 Drive 存储管理工作区。
 *
 * @param 无参数
 * @returns Provider 总览 JSX
 */
const DrivePageContent = () => {
  const { connectionList, loadError, retryLoadHandler } = useDriveConnections()
  const [connectionToDelete, setConnectionToDelete] =
    useState<DriveProvider | null>(null)
  const connectTriggerRef = useRef<HTMLButtonElement>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null)

  // 选择待删除连接并记录原按钮，供取消后恢复焦点。
  const requestDeleteHandler = (
    connection: DriveProvider,
    trigger: HTMLButtonElement,
  ): void => {
    deleteTriggerRef.current = trigger
    setConnectionToDelete(connection)
  }

  // 关闭确认；删除成功后将焦点转向添加入口。
  const closeDeleteHandler = (deleted: boolean): void => {
    if (deleted) deleteTriggerRef.current = connectTriggerRef.current
    setConnectionToDelete(null)
  }

  // 恢复到原删除按钮，或删除成功后的添加入口。
  const restoreDeleteFocusHandler = (event: Event): void => {
    event.preventDefault()
    deleteTriggerRef.current?.focus()
  }

  // 渲染当前连接卡片。
  const renderProviderCard = (provider: DriveProvider) => (
    <li key={provider.id}>
      <DriveProviderCard provider={provider} onDelete={requestDeleteHandler} />
    </li>
  )
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
            <DriveConnectionDialog triggerRef={connectTriggerRef} />
          </li>
        </ul>
      </div>
      <DriveDeleteConnectionDialog
        connection={connectionToDelete}
        onClose={closeDeleteHandler}
        onCloseAutoFocus={restoreDeleteFocusHandler}
      />
    </DriveWorkspace>
  )
}

export { DrivePageContent }
