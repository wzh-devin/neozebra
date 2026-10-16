import { useI18n, getLocale } from '@/lib/i18n'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { Mailbox } from '@/services/inbox'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import styles from '@/features/inbox/components/InboxAccountsDialog.module.css'

/**
 * 显示账号同步状态，并确认删除当前应用中的邮箱和缓存。
 *
 * @param props - 邮箱公开字段与断开连接操作
 * @returns 账号状态行与确认弹窗 JSX
 */
const InboxAccountRow = ({
  account,
  disconnectHandler,
}: {
  account: Mailbox
  disconnectHandler: (id: string) => Promise<void>
}) => {
  const { t } = useI18n()

  const [open, setOpen] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const disconnectClickHandler = async (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault()
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      await disconnectHandler(account.id)
      setOpen(false)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Unable to disconnect mailbox.'),
      )
    } finally {
      setIsBusy(false)
    }
  }
  return (
    <div className={styles.account}>
      <div className={styles.copy}>
        <strong>{account.email}</strong>
        <span>
          {account.provider === 'gmail' ? 'Gmail' : 'QQ'} ·{' '}
          {account.lastSyncedAt
            ? t(
                'Synced {0}',
                new Date(account.lastSyncedAt).toLocaleTimeString(getLocale()),
              )
            : t('Waiting for first sync')}
        </span>
        {account.error ? (
          <p className={styles.error}>{t(account.error)}</p>
        ) : null}
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost">
            {t('Disconnect')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className={surfaceStyles.surface}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Disconnect')} {account.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                '这将移除 Neozebra 中缓存的邮件和本地已读／归档状态，原邮箱不会改变。',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p role="alert" className={styles.error}>
              {t(error)}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isBusy}
              onClick={disconnectClickHandler}
            >
              {isBusy ? t('Disconnecting…') : t('Disconnect')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export { InboxAccountRow }
