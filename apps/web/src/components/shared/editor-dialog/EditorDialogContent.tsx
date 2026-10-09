import type { ComponentProps, ReactNode } from 'react'

import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import styles from '@/components/shared/editor-dialog/EditorDialogContent.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

type EditorDialogContentProps = Pick<
  ComponentProps<typeof DialogContent>,
  'onCloseAutoFocus'
> & {
  title: string
  description: string
  children: ReactNode
}

/**
 * 为工作台编辑表单提供统一的居中弹窗、标题和控件主题。
 *
 * @param props - 标题、说明、表单内容及焦点恢复操作
 * @returns 编辑弹窗内容 JSX
 */
const EditorDialogContent = ({
  title,
  description,
  children,
  onCloseAutoFocus,
}: EditorDialogContentProps) => (
  <DialogContent
    className={`${surfaceStyles.surface} ${styles.dialog}`}
    onCloseAutoFocus={onCloseAutoFocus}
  >
    <DialogHeader className={styles.header}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
    {children}
  </DialogContent>
)

export { EditorDialogContent }
