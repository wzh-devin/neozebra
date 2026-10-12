import { useState, type ChangeEvent, type FormEvent } from 'react'

import {
  EditorDialogContent,
  EditorField,
} from '@/components/shared/editor-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { DriveEntry } from '@/features/drive/types'
import { restoreDriveActionFocus } from '@/features/drive/lib/drive-focus'

import formStyles from '@/components/shared/editor-dialog/EditorForm.module.css'

type DriveRenameDialogProps = {
  entry: DriveEntry
  onClose: () => void
  onSave: (name: string) => Promise<void>
  title?: string
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
  title = 'Rename item',
}: DriveRenameDialogProps) => {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(entry.name)

  // 更新名称输入。
  const nameChangeHandler = (event: ChangeEvent<HTMLInputElement>): void =>
    setName(event.target.value)

  // 提交有效名称。
  const submitRenameHandler = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave(name)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save this name.',
      )
    } finally {
      setSaving(false)
    }
  }

  // 响应弹窗关闭。
  const openChangeHandler = (open: boolean): void => {
    if (!open && !saving) onClose()
  }

  // 将关闭后的焦点恢复到条目操作按钮。
  const restoreFocusHandler = (event: Event): void => {
    event.preventDefault()
    restoreDriveActionFocus(entry.id)
  }

  return (
    <Dialog open onOpenChange={openChangeHandler}>
      <EditorDialogContent
        title={title}
        description={
          title === 'New folder'
            ? 'Create a folder in the selected directory.'
            : `Update the name of ${entry.name}.`
        }
        onCloseAutoFocus={restoreFocusHandler}
      >
        <form onSubmit={submitRenameHandler} className={formStyles.form}>
          <EditorField id="drive-entry-name" label="Name">
            <Input
              id="drive-entry-name"
              autoFocus
              value={name}
              onChange={nameChangeHandler}
              maxLength={255}
              disabled={saving}
              required
            />
          </EditorField>
          {error ? <p role="alert">{error}</p> : null}
          <DialogFooter className={formStyles.footer}>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving
                ? 'Saving…'
                : title === 'New folder'
                  ? 'Create folder'
                  : 'Save name'}
            </Button>
          </DialogFooter>
        </form>
      </EditorDialogContent>
    </Dialog>
  )
}

export { DriveRenameDialog }
