import { useState, type ChangeEvent, type FormEvent } from 'react'

import {
  EditorDialogContent,
  EditorField,
} from '@/components/shared/editor-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { DriveEntry } from '@/features/drive/types'

import formStyles from '@/components/shared/editor-dialog/EditorForm.module.css'

type DriveRenameDialogProps = {
  entry: DriveEntry
  onClose: () => void
  onSave: (name: string) => void
}

/**
 * 使用工作台表单编辑条目名称。
 *
 * @param props - 当前条目与关闭、保存操作
 * @returns 名称编辑弹窗 JSX
 */
const DriveRenameDialog = ({
  entry,
  onClose,
  onSave,
}: DriveRenameDialogProps) => {
  const [name, setName] = useState(entry.name)

  // 更新名称输入。
  const nameChangeHandler = (event: ChangeEvent<HTMLInputElement>): void =>
    setName(event.target.value)

  // 提交有效名称。
  const submitRenameHandler = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (name.trim()) onSave(name)
  }

  // 响应弹窗关闭。
  const openChangeHandler = (open: boolean): void => {
    if (!open) onClose()
  }

  // 将关闭后的焦点恢复到条目操作按钮。
  const restoreFocusHandler = (event: Event): void => {
    event.preventDefault()
    document.getElementById(`drive-actions-${entry.id}`)?.focus()
  }

  return (
    <Dialog open onOpenChange={openChangeHandler}>
      <EditorDialogContent
        title="Rename item"
        description={`Update the name of ${entry.name}.`}
        onCloseAutoFocus={restoreFocusHandler}
      >
        <form onSubmit={submitRenameHandler} className={formStyles.form}>
          <EditorField id="drive-entry-name" label="Name">
            <Input
              id="drive-entry-name"
              autoFocus
              value={name}
              onChange={nameChangeHandler}
              required
            />
          </EditorField>
          <DialogFooter className={formStyles.footer}>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Save name
            </Button>
          </DialogFooter>
        </form>
      </EditorDialogContent>
    </Dialog>
  )
}

export { DriveRenameDialog }
