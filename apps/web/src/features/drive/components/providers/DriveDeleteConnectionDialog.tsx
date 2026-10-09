import { useState, type MouseEvent } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import { useDriveConnections } from '@/features/drive/hooks/useDriveConnections'
import type { DriveProvider } from '@/features/drive/types'
import styles from '@/features/drive/components/providers/DriveDeleteConnectionDialog.module.css'
import overlayStyles from '@/features/drive/styles/drive-overlays.module.css'

type DriveDeleteConnectionDialogProps = {
  connection: DriveProvider | null
  onClose: (deleted: boolean) => void
  onCloseAutoFocus: (event: Event) => void
}

/**
 * 居中确认连接删除，存储失败时保留弹窗和原有数据。
 *
 * @param props - 待删除连接、关闭操作和焦点恢复操作
 * @returns 连接删除确认弹窗JSX
 */
const DriveDeleteConnectionDialog = ({
  connection,
  onClose,
  onCloseAutoFocus,
}: DriveDeleteConnectionDialogProps) => {
  const { deleteConnection } = useDriveConnections()
  const [error, setError] = useState<string | null>(null)

  // 关闭删除确认时清除错误，并恢复原入口焦点。
  const openChangeHandler = (open: boolean): void => {
    if (!open) {
      setError(null)
      onClose(false)
    }
  }

  /**
   * 成功写入删除配置后关闭；失败阻止默认关闭并提供重试。
   *
   * @param event - 删除确认点击事件
   * @returns 无返回值；删除连接或显示安全错误
   */
  const confirmDeleteHandler = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    if (!connection) return
    try {
      deleteConnection(connection.id)
      setError(null)
      onClose(true)
      toast('Drive deleted')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to delete this Drive. Try again.',
      )
    }
  }
  return (
    <AlertDialog open={Boolean(connection)} onOpenChange={openChangeHandler}>
      <AlertDialogContent
        className={`${surfaceStyles.surface} ${overlayStyles.dialog}`}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className={styles.title}>
            Delete {connection?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Remove this Drive’s configuration and files added in this session.
            Files in remote storage and on your computer will be kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={confirmDeleteHandler}
          >
            Delete Drive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { DriveDeleteConnectionDialog }
