import type { ReactNode } from 'react'
import { EditorDialogContent } from '@/components/shared/editor-dialog'
import { Dialog } from '@/components/ui/dialog'
import { restoreTaskFocusHandler } from '@/features/tasks/utils/task-focus'

type Props = {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
}

/**
 * 用居中弹窗统一承载任务与项目的新建、编辑及焦点恢复。
 *
 * @param props - 编辑类型、标题、表单和关闭操作
 * @returns 编辑容器 JSX
 */
export const TaskEditorFrame = ({
  title,
  description,
  onClose,
  children,
}: Props) => {
  // 关闭当前编辑容器。
  const openChangeHandler = (open: boolean): void => {
    if (!open) onClose()
  }

  return (
    <Dialog open onOpenChange={openChangeHandler}>
      <EditorDialogContent
        title={title}
        description={description}
        onCloseAutoFocus={restoreTaskFocusHandler}
      >
        {children}
      </EditorDialogContent>
    </Dialog>
  )
}
