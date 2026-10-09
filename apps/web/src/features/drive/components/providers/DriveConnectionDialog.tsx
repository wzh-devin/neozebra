import { Plus, Settings2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import {
  EditorDialogContent,
  EditorField,
} from '@/components/shared/editor-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import formStyles from '@/components/shared/editor-dialog/EditorForm.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import { DriveConnectionFields } from '@/features/drive/components/providers/DriveConnectionFields'
import { isDriveProviderId } from '@/features/drive/data/drive-provider'
import { buildDriveConnectionDraft } from '@/features/drive/data/drive-connections'
import { useDriveConnections } from '@/features/drive/hooks/useDriveConnections'
import type { DriveProvider, DriveProviderId } from '@/features/drive/types'
import styles from '@/features/drive/components/providers/DriveConnectionDialog.module.css'

type DriveConnectionDialogProps = { connection?: DriveProvider }

/**
 * 使用共享居中表单创建或编辑独立Drive实例及Provider配置。
 * @param props - 编辑时的连接实例，创建时为空
 * @returns 连接卡片或编辑按钮及差异表单JSX
 */
const DriveConnectionDialog = ({ connection }: DriveConnectionDialogProps) => {
  const [open, setOpen] = useState(false)
  const [providerId, setProviderId] = useState<DriveProviderId>(
    connection?.providerId ?? 'baidu',
  )
  const [error, setError] = useState<string | null>(null)
  const { saveConnection, credentialsMap } = useDriveConnections()
  const initialValues: Record<string, string> = {
    ...connection?.options,
    ...credentialsMap[connection?.id ?? ''],
  }
  /** 切换Provider专属字段。
   * @param value - Provider类型
   * @returns 无返回值；更新类型并清除旧错误
   */
  const providerChangeHandler = (value: string): void => {
    if (isDriveProviderId(value)) setProviderId(value)
    setError(null)
  }
  /** 打开或关闭编辑界面。
   * @param nextOpen - 弹窗是否打开
   * @returns 无返回值；更新弹窗、重置类型和错误
   */
  const openChangeHandler = (nextOpen: boolean): void => {
    setOpen(nextOpen)
    if (nextOpen) setProviderId(connection?.providerId ?? 'baidu')
    setError(null)
  }
  /** 校验并保存独立连接，凭据只保留在会话内。
   * @param event - 表单提交事件
   * @returns 无返回值；保存成功更新卡片并关闭，失败保留输入并显示安全错误
   */
  const saveConnectionHandler = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    try {
      const draft = buildDriveConnectionDraft(
        providerId,
        new FormData(event.currentTarget),
      )
      saveConnection(draft, connection?.id)
      setOpen(false)
      setError(null)
      toast('Drive configuration saved')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to save this Drive. Try again.',
      )
    }
  }
  return (
    <Dialog open={open} onOpenChange={openChangeHandler}>
      <DialogTrigger asChild>
        {connection ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className={styles['edit-button']}
            aria-label={`Configure ${connection.name}`}
          >
            <Settings2 aria-hidden="true" />
          </Button>
        ) : (
          <Button variant="ghost" className={styles['connect-button']}>
            <Plus aria-hidden="true" />
            <span className={styles['connect-title']}>Connect provider</span>
            <span className={styles['connect-description']}>
              Add another storage connection
            </span>
          </Button>
        )}
      </DialogTrigger>
      <EditorDialogContent
        title={connection ? 'Configure Drive' : 'Add a Drive'}
        description="Name this Drive and enter the connection details for its provider."
      >
        <form className={formStyles.form} onSubmit={saveConnectionHandler}>
          <div className={formStyles.fields}>
            <EditorField id="drive-name" label="Drive name">
              <Input
                id="drive-name"
                name="name"
                required
                maxLength={100}
                defaultValue={connection?.name ?? ''}
                placeholder="e.g. Company MinIO"
                autoComplete="off"
              />
            </EditorField>
            <EditorField id="drive-provider" label="Provider">
              <Select
                value={providerId}
                onValueChange={providerChangeHandler}
                disabled={Boolean(connection)}
              >
                <SelectTrigger id="drive-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  className={surfaceStyles.surface}
                  position="popper"
                  align="start"
                  sideOffset={6}
                >
                  <SelectItem value="baidu">Baidu Drive</SelectItem>
                  <SelectItem value="aliyun">Aliyun Drive</SelectItem>
                  <SelectItem value="minio">MinIO</SelectItem>
                </SelectContent>
              </Select>
            </EditorField>
            <DriveConnectionFields
              key={providerId}
              providerId={providerId}
              initialValues={initialValues}
            />
          </div>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter className={formStyles.footer}>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Save connection</Button>
          </DialogFooter>
        </form>
      </EditorDialogContent>
    </Dialog>
  )
}

export { DriveConnectionDialog }
