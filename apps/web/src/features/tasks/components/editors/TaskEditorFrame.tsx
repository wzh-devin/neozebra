import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { restoreTaskFocusHandler } from '@/features/tasks/utils/task-focus'
import styles from '@/features/tasks/components/editors/TaskEditorFrame.module.css'
import surfaceStyles from '@/features/tasks/styles/task-surfaces.module.css'

type Props = {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
}

/** 用居中弹窗统一承载任务与项目的新建、编辑及焦点恢复。
 * @param props - 编辑类型、标题、表单和关闭操作
 * @returns 编辑容器 JSX
 */
export const TaskEditorFrame = ({
  title,
  description,
  onClose,
  children,
}: Props) => {
  /** 关闭当前编辑容器。
   * @param open - 打开状态
   * @returns 无返回值；按需调用关闭操作
   */
  const openChangeHandler = (open: boolean): void => {
    if (!open) onClose()
  }

  return (
    <Dialog open onOpenChange={openChangeHandler}>
      <DialogContent
        className={`${surfaceStyles.surface} ${styles.dialog}`}
        onCloseAutoFocus={restoreTaskFocusHandler}
      >
        <DialogHeader className={styles.header}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
