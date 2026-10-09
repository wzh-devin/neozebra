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
          : 'Unable to disconnect mailbox.',
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
            ? `Synced ${new Date(account.lastSyncedAt).toLocaleTimeString()}`
            : 'Waiting for first sync'}
        </span>
        {account.error ? <p className={styles.error}>{account.error}</p> : null}
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost">
            Disconnect
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className={surfaceStyles.surface}>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {account.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes its cached mail and local read/archive state from
              Neozebra. Your original mailbox is unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBusy}
              onClick={disconnectClickHandler}
            >
              {isBusy ? 'Disconnecting…' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export { InboxAccountRow }
