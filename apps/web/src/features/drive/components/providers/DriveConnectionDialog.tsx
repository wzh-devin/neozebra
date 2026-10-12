import { Plus, Settings2 } from 'lucide-react'
import { useState, type FormEvent, type Ref } from 'react'
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

type DriveConnectionDialogProps = {
  connection?: DriveProvider
  triggerRef?: Ref<HTMLButtonElement>
}

/**
 * 使用共享居中表单创建或编辑独立Drive实例及Provider配置。
 *
 * @param props - 编辑时的连接实例和创建入口焦点引用
 * @returns 连接卡片或编辑按钮及差异表单JSX
 */
const DriveConnectionDialog = ({
  connection,
  triggerRef,
}: DriveConnectionDialogProps) => {
  const [open, setOpen] = useState(false)
  const [providerId, setProviderId] = useState<DriveProviderId>(
    connection?.providerId ?? 'baidu',
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { saveConnection, authorizeConnection } = useDriveConnections()
  const initialValues: Record<string, string> = {
    ...connection?.options,
  }

  // 切换 Provider 专属字段并清除旧错误。
  const providerChangeHandler = (value: string): void => {
    if (isDriveProviderId(value)) setProviderId(value)
    setError(null)
  }

  // 切换弹窗状态，打开时恢复 Provider，并清除旧错误。
  const openChangeHandler = (nextOpen: boolean): void => {
    if (saving) return
    setOpen(nextOpen)
    if (nextOpen) setProviderId(connection?.providerId ?? 'baidu')
    setError(null)
  }

  /**
   * 校验并保存独立连接，凭据仅在服务端加密保存。
   *
   * @param event - 表单提交事件
   * @returns 无返回值；保存成功更新卡片并关闭，失败保留输入并显示安全错误
   */
  const saveConnectionHandler = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    let redirecting = false
    try {
      const draft = buildDriveConnectionDraft(
        providerId,
        new FormData(event.currentTarget),
        Boolean(connection),
      )
      const submitter = (event.nativeEvent as SubmitEvent).submitter
      if (
        providerId !== 'minio' &&
        (!connection || submitter?.getAttribute('value') === 'authorize')
      ) {
        const url = await authorizeConnection(draft, connection?.id)
        window.location.assign(url)
        redirecting = true
        return
      }
      await saveConnection(draft, connection?.id)
      setOpen(false)
      setError(null)
      toast('Drive configuration saved')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to save this Drive. Try again.',
      )
    } finally {
      if (!redirecting) setSaving(false)
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
          <Button
            ref={triggerRef}
            variant="ghost"
            className={styles['connect-button']}
          >
            <Plus aria-hidden="true" />
            <span className={styles['connect-title']}>Connect provider</span>
            <span className={styles['connect-description']}>
              Add another storage connection
            </span>
          </Button>
        )}
      </DialogTrigger>
      <EditorDialogContent
        title={
          providerId === 'minio'
            ? connection
              ? 'Configure Drive'
              : 'Add a Drive'
            : connection
              ? 'Configure account'
              : 'Connect an account'
        }
        description={
          providerId === 'minio'
            ? 'Name this Drive and enter its S3 connection details.'
            : connection
              ? 'Changes apply only to this account. Reauthorize to switch its login.'
              : 'Choose an account on the provider’s official page. Other connected accounts will be kept.'
        }
      >
        <form className={formStyles.form} onSubmit={saveConnectionHandler}>
          <div className={formStyles.fields}>
            <EditorField
              id="drive-name"
              label={providerId === 'minio' ? 'Drive name' : 'Account name'}
            >
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
              isEditing={Boolean(connection)}
            />
          </div>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter className={formStyles.footer}>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={saving}>
                Cancel
              </Button>
            </DialogClose>
            {connection && providerId !== 'minio' ? (
              <Button
                type="submit"
                value="authorize"
                variant="outline"
                disabled={saving}
              >
                Reauthorize
              </Button>
            ) : null}
            <Button type="submit" disabled={saving}>
              {saving
                ? 'Connecting…'
                : providerId !== 'minio' && !connection
                  ? providerId === 'baidu'
                    ? 'Continue with Baidu'
                    : 'Continue with Aliyun'
                  : 'Save connection'}
            </Button>
          </DialogFooter>
        </form>
      </EditorDialogContent>
    </Dialog>
  )
}

export { DriveConnectionDialog }
