import type { ReactNode } from 'react'

import { Label } from '@/components/ui/label'
import styles from '@/components/shared/editor-dialog/EditorForm.module.css'

type EditorFieldProps = {
  id: string
  label: string
  children: ReactNode
}

/**
 * 统一编辑表单的标签关联、字段间距和输入控件布局。
 *
 * @param props - 控件标识、标签和输入控件
 * @returns 带关联标签的表单字段 JSX
 */
const EditorField = ({ id, label, children }: EditorFieldProps) => (
  <div className={styles.field}>
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
)

export { EditorField }
