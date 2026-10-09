import { InboxToolbar } from '@/features/inbox/components/InboxToolbar'
import { InboxMessageList } from '@/features/inbox/components/InboxMessageList'
import { InboxReader } from '@/features/inbox/components/InboxReader'
import { InboxAccountsDialog } from '@/features/inbox/components/InboxAccountsDialog'
import type { InboxView } from '@/features/inbox/hooks/useInboxView'
import styles from '@/features/inbox/components/InboxPageContent.module.css'

/**
 * 组合真实邮箱列表、阅读区和账号管理弹窗。
 *
 * @param props - Inbox 的加载、筛选和操作状态
 * @returns Inbox 分栏页面 JSX
 */
const InboxPageContent = (props: InboxView) => (
  <main
    className={styles['inbox-shell']}
    data-has-detail={props.hasDetailRoute}
  >
    <section className={styles['message-pane']} aria-label="Inbox messages">
      <InboxToolbar {...props} />
      <InboxMessageList {...props} />
    </section>
    <section className={styles['reader-pane']} aria-label="Message reader">
      <InboxReader {...props} />
    </section>
    <InboxAccountsDialog {...props} />
  </main>
)

export { InboxPageContent }
