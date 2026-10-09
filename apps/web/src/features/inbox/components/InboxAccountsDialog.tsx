import { useState, type FormEvent } from 'react'
import {
  EditorDialogContent,
  EditorField,
} from '@/components/shared/editor-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InboxAccountRow } from '@/features/inbox/components/InboxAccountRow'
import type { InboxView } from '@/features/inbox/hooks/useInboxView'
import formStyles from '@/components/shared/editor-dialog/EditorForm.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import styles from '@/features/inbox/components/InboxAccountsDialog.module.css'

type InboxAccountsDialogProps = Pick<
  InboxView,
  | 'accountList'
  | 'isAccountsOpen'
  | 'setIsAccountsOpen'
  | 'connectMailboxHandler'
  | 'disconnectHandler'
>

/**
 * 连接 Gmail 应用密码或 QQ 授权码，并管理当前浏览器拥有的邮箱。
 *
 * @param props - 邮箱列表、连接状态及服务器操作
 * @returns 具有错误反馈和重复提交保护的邮箱管理弹窗 JSX
 */
const InboxAccountsDialog = (props: InboxAccountsDialogProps) => {
  const [provider, setProvider] = useState<'gmail' | 'qq'>('gmail')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const providerChangeHandler = (value: string) => {
    if (value !== 'gmail' && value !== 'qq') return
    setProvider(value)
    setError(null)
  }
  const openChangeHandler = (open: boolean) => {
    props.setIsAccountsOpen(open)
    setError(null)
  }
  const closeHandler = () => props.setIsAccountsOpen(false)
  const submitHandler = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isBusy) return
    const form = event.currentTarget
    const data = new FormData(form)
    setIsBusy(true)
    setError(null)
    try {
      await props.connectMailboxHandler(
        provider,
        String(data.get('email')),
        String(data.get('password')),
      )
      form.reset()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to connect mailbox.',
      )
    } finally {
      setIsBusy(false)
    }
  }
  return (
    <Dialog open={props.isAccountsOpen} onOpenChange={openChangeHandler}>
      <EditorDialogContent
        title="Manage mailboxes"
        description="Connect Gmail or QQ. Mail is read only; read and archive actions stay in Neozebra."
      >
        <div className={styles.accounts}>
          {props.accountList.length ? (
            props.accountList.map((account) => (
              <InboxAccountRow
                key={account.id}
                account={account}
                disconnectHandler={props.disconnectHandler}
              />
            ))
          ) : (
            <p className={styles.hint}>No mailboxes connected yet.</p>
          )}
        </div>
        <form className={formStyles.form} onSubmit={submitHandler}>
          <div className={formStyles.fields}>
            <EditorField
              id="mail-provider"
              label="Connect or reconnect mailbox"
            >
              <Select
                value={provider}
                onValueChange={providerChangeHandler}
                disabled={isBusy}
              >
                <SelectTrigger id="mail-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  className={surfaceStyles.surface}
                  position="popper"
                  align="start"
                  sideOffset={6}
                >
                  <SelectItem value="gmail">Gmail</SelectItem>
                  <SelectItem value="qq">QQ / Foxmail</SelectItem>
                </SelectContent>
              </Select>
            </EditorField>
            <EditorField
              id="mail-email"
              label={
                provider === 'gmail'
                  ? 'Gmail email address'
                  : 'QQ email address'
              }
            >
              <Input
                key={provider}
                id="mail-email"
                name="email"
                type="email"
                placeholder={
                  provider === 'gmail' ? 'you@gmail.com' : '123456@qq.com'
                }
                required
                maxLength={254}
                autoComplete="email"
                disabled={isBusy}
              />
            </EditorField>
            <EditorField
              id="mail-password"
              label={
                provider === 'gmail'
                  ? 'Google app password'
                  : 'IMAP authorization code'
              }
            >
              <Input
                key={provider}
                id="mail-password"
                name="password"
                type="password"
                required
                minLength={provider === 'gmail' ? 16 : 8}
                maxLength={128}
                autoComplete="off"
                disabled={isBusy}
              />
            </EditorField>
            <p className={styles.hint}>
              {provider === 'gmail' ? (
                <>
                  Enable two-step verification and generate a 16-character{' '}
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google app password
                  </a>
                  . Your Google account must allow app passwords. Use it here
                  instead of your Google sign-in password.
                </>
              ) : (
                'Enable IMAP in QQ Mail settings and generate an authorization code.'
              )}
            </p>
          </div>
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
          <DialogFooter className={formStyles.footer}>
            <Button type="button" variant="outline" onClick={closeHandler}>
              Done
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy
                ? 'Connecting…'
                : provider === 'gmail'
                  ? 'Connect Gmail'
                  : 'Connect QQ'}
            </Button>
          </DialogFooter>
        </form>
      </EditorDialogContent>
    </Dialog>
  )
}

export { InboxAccountsDialog }
