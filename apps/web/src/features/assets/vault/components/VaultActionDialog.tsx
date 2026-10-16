import { useI18n } from '@/lib/i18n'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import type { VaultEntry } from '@/features/assets/vault/types'
import {
  createVaultFolder,
  editVaultEntry,
  requestVault,
} from '@/services/assets/vault'
import { VaultTree } from './VaultTree'
import type { FileAction } from '@/features/assets/vault/types'
import styles from './VaultActionDialog.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

type Action = {
  type: FileAction | 'create' | 'empty-trash'
  entry?: VaultEntry
  parentId?: string
}

/**
 * 编辑名称、选择移动目标或确认删除，失败保留用户输入。
 *
 * @param props - 操作、当前目录与关闭回调
 * @returns 居中操作弹窗 JSX
 */
const VaultActionDialog = ({
  action,
  parentId,
  onClose,
  onCloseAutoFocus,
}: {
  action: Action
  parentId: string
  onClose: () => void
  onCloseAutoFocus?: (event: Event) => void
}) => {
  const { t } = useI18n()

  const queryClient = useQueryClient()
  const [name, setName] = useState(action.entry?.name ?? '')
  const [targetId, setTargetId] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isPicker = action.type === 'move' || action.type === 'restore'
  const isDestructive = action.type === 'purge' || action.type === 'empty-trash'
  const titleRecord = {
    create: t('新建文件夹'),
    rename: t('重命名'),
    move: t('移动到'),
    trash: t('移入回收站'),
    restore: t('恢复到'),
    purge: t('永久删除'),
    'empty-trash': t('清空回收站'),
  }
  const selectHandler = (entry: VaultEntry | null) =>
    setTargetId(entry?.id ?? '0')
  const noopHandler = () => {}
  const nameHandler = (event: React.ChangeEvent<HTMLInputElement>) =>
    setName(event.target.value)
  const openHandler = (open: boolean) => {
    if (!open && !busy) onClose()
  }
  const submitHandler = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (action.type === 'create') await createVaultFolder(parentId, name)
      else if (action.type === 'rename')
        await editVaultEntry(action.entry!, { name })
      else if (action.type === 'move')
        await editVaultEntry(action.entry!, { parentId: targetId })
      else if (action.type === 'restore')
        await requestVault(`/entries/${action.entry!.id}/restore`, {
          method: 'POST',
          body: JSON.stringify({ parentId: targetId }),
        })
      else if (action.type === 'trash')
        await requestVault(`/entries/${action.entry!.id}`, {
          method: 'DELETE',
        })
      else if (action.type === 'empty-trash') {
        const result = await requestVault<{ queuedCount: number }>(
          '/trash/empty',
          {
            method: 'POST',
            body: JSON.stringify({ confirm: true }),
          },
        )
        toast.success(
          result.queuedCount
            ? t('已提交清空，后台正在删除文件')
            : t('回收站已为空'),
        )
      } else
        await requestVault(`/entries/${action.entry!.id}/purge`, {
          method: 'POST',
        })
      await queryClient.invalidateQueries({ queryKey: ['vault', 'entries'] })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('操作失败，请重试'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={openHandler}>
      <DialogContent
        className={`${styles.dialog} ${surfaceStyles.surface}`}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <form onSubmit={submitHandler}>
          <DialogHeader>
            <DialogTitle>{titleRecord[action.type]}</DialogTitle>
            <DialogDescription>
              {action.type === 'empty-trash'
                ? t(
                    '永久删除回收站中的全部文件和文件夹，包括当前搜索未显示的内容。此操作无法恢复。',
                  )
                : action.type === 'purge'
                  ? t(
                      '永久删除「{0}」及其内容，删除后无法恢复。',
                      action.entry?.name,
                    )
                  : isPicker
                    ? t('为「{0}」选择目标文件夹。', action.entry?.name)
                    : action.type === 'trash'
                      ? t(
                          '「{0}」将移入回收站，可以稍后恢复。',
                          action.entry?.name,
                        )
                      : t('名称在当前文件夹内必须唯一。')}
            </DialogDescription>
          </DialogHeader>
          {action.type === 'create' || action.type === 'rename' ? (
            <div className={styles.field}>
              <Label htmlFor="vault-entry-name">{t('名称')}</Label>
              <Input
                id="vault-entry-name"
                value={name}
                onChange={nameHandler}
                autoFocus
                maxLength={255}
                required
                disabled={busy}
              />
            </div>
          ) : null}
          {isPicker ? (
            <div className={styles.picker}>
              <VaultTree
                foldersOnly
                busy={busy}
                selectedId={targetId}
                path={[]}
                onSelect={selectHandler}
                onTrash={noopHandler}
                onPreview={noopHandler}
              />
            </div>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {t(error)}
            </p>
          ) : null}
          <DialogFooter className={styles.footer}>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              {t('取消')}
            </Button>
            <Button
              type="submit"
              variant={isDestructive ? 'destructive' : 'default'}
              disabled={
                busy ||
                ((action.type === 'create' || action.type === 'rename') &&
                  !name.trim())
              }
            >
              {busy ? <Spinner /> : null}
              {busy
                ? t('处理中…')
                : isDestructive
                  ? titleRecord[action.type]
                  : t('确认')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
export { VaultActionDialog }
export type { Action }
