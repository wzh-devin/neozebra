import { FileWarning } from 'lucide-react'
import { useRef } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { DriveEntryIcon } from '@/features/drive/components/files/DriveEntryIcon'
import { DriveFilePreviewContent } from '@/features/drive/components/files/DriveFilePreviewContent'
import { restoreDriveActionFocus } from '@/features/drive/lib/drive-focus'
import { useDriveFilePreview } from '@/features/drive/hooks/useDriveFilePreview'
import type { DriveEntry } from '@/features/drive/types'

import styles from '@/features/drive/components/files/DriveFilePreviewDialog.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

type DriveFilePreviewDialogProps = {
  entry: DriveEntry
  onClose: () => void
}

/**
 * 使用统一工作台主题打开居中文件预览。
 *
 * @param props - 当前文件和关闭操作
 * @returns 带加载、失败、空内容及焦点恢复的弹窗 JSX
 */
const DriveFilePreviewDialog = ({
  entry,
  onClose,
}: DriveFilePreviewDialogProps) => {
  const state = useDriveFilePreview(entry)
  const triggerRef = useRef(document.activeElement)

  // 响应 Esc、关闭按钮和遮罩关闭。
  const openChangeHandler = (open: boolean): void => {
    if (!open) onClose()
  }

  // 将关闭后的键盘焦点恢复到文件按钮。
  const restoreFocusHandler = (event: Event): void => {
    event.preventDefault()
    if (
      triggerRef.current instanceof HTMLElement &&
      triggerRef.current.isConnected
    )
      triggerRef.current.focus()
    else {
      const trigger = document.getElementById(`drive-entry-${entry.id}`)
      if (trigger) trigger.focus()
      else restoreDriveActionFocus(entry.id)
    }
  }

  const message =
    state.status === 'error'
      ? state.message
      : state.status === 'unavailable'
        ? 'File content is unavailable for this item.'
        : 'Preview is unavailable for this file type.'

  return (
    <Dialog open onOpenChange={openChangeHandler}>
      <DialogContent
        className={`${surfaceStyles.surface} ${styles.dialog}`}
        onCloseAutoFocus={restoreFocusHandler}
      >
        <DialogHeader className={styles.header}>
          <DialogTitle className={styles.title}>
            <DriveEntryIcon entry={entry} />
            {entry.name}
          </DialogTitle>
          <DialogDescription>
            {entry.size} · {entry.updatedAt}
          </DialogDescription>
        </DialogHeader>
        <div className={styles.body}>
          {state.status === 'loading' ? (
            <div className={styles.loading}>
              <Spinner />
              Loading preview…
            </div>
          ) : state.status === 'ready' ? (
            <DriveFilePreviewContent
              preview={state.preview}
              name={entry.name}
            />
          ) : (
            <Empty
              className={styles.empty}
              role={state.status === 'error' ? 'alert' : 'status'}
            >
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileWarning aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>
                  {state.status === 'error'
                    ? 'Could not load preview'
                    : 'Preview unavailable'}
                </EmptyTitle>
                <EmptyDescription>{message}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { DriveFilePreviewDialog }
