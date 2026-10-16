import { useI18n, getLocale } from '@/lib/i18n'
import { Inbox, Mail, MailOpen } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { InboxView } from '@/features/inbox/hooks/useInboxView'
import type { InboxItem } from '@/features/inbox/types'

import styles from '@/features/inbox/components/InboxPageContent.module.css'

type InboxMessageRowProps = {
  item: InboxItem
  isSelected: boolean
  markReadHandler: (id: string) => void
}

/**
 * 渲染 Inbox 列表中的单条消息。
 *
 * @param props - 消息数据、选中状态和已读操作
 * @returns 消息列表项 JSX
 */
const InboxMessageRow = ({
  item,
  isSelected,
  markReadHandler,
}: InboxMessageRowProps) => {
  const { t } = useI18n()

  const location = useLocation()
  const ItemIcon = item.read ? MailOpen : Mail

  // 打开消息时将其标记为已读。
  const selectMessageHandler = (): void => {
    markReadHandler(item.id)
  }

  return (
    <Link
      aria-current={isSelected ? 'page' : undefined}
      className={styles['message-row']}
      data-read={item.read}
      onClick={selectMessageHandler}
      to={`/inbox/${item.id}${location.search}`}
    >
      <span className={styles['message-icon']}>
        <ItemIcon aria-hidden="true" />
      </span>
      <span className={styles['message-copy']}>
        <span className={styles['message-title-line']}>
          <strong>{item.title}</strong>
          <time dateTime={item.receivedAt}>
            {new Date(item.receivedAt).toLocaleDateString(getLocale(), {
              month: 'short',
              day: 'numeric',
            })}
          </time>
        </span>
        <span className={styles['message-summary']}>{item.summary}</span>
        <span className={styles['message-sender']}>
          {!item.read ? (
            <span aria-label={t('Unread')} className={styles['unread-dot']} />
          ) : null}
          {item.sender}
        </span>
      </span>
    </Link>
  )
}

type InboxMessageListProps = InboxView

/**
 * 渲染分页列表及未连接、加载、同步失败和空状态。
 *
 * @param props - 邮件、邮箱及请求状态
 * @returns 邮件列表面板 JSX
 */
const InboxMessageList = (props: InboxMessageListProps) => {
  const { t } = useI18n()

  const {
    visibleItemList,
    selectedItem,
    markReadHandler,
    resetFiltersHandler,
    accountList,
    isLoading,
    error,
    openAccountsHandler,
    nextCursor,
    loadMoreHandler,
  } = props
  const retryHandler = () => {
    void props.reloadHandler()
  }
  const failedCount = accountList.filter((account) => account.error).length
  return (
    <>
      {error ? (
        <div className={styles.status} role="alert">
          <span>{t(error)}</span>
          <Button onClick={retryHandler} size="sm" variant="ghost">
            {t('Retry')}
          </Button>
        </div>
      ) : failedCount ? (
        <div className={styles.status} role="alert">
          <span>
            {failedCount} {t('mailbox needs attention')}
          </span>
          <Button onClick={openAccountsHandler} size="sm" variant="ghost">
            {t('Manage')}
          </Button>
        </div>
      ) : null}
      <ScrollArea className={styles['message-scroll']} aria-busy={isLoading}>
        {visibleItemList.length ? (
          <div className={styles['message-list']}>
            {visibleItemList.map((item) => (
              <InboxMessageRow
                key={item.id}
                isSelected={selectedItem?.id === item.id}
                item={item}
                markReadHandler={markReadHandler}
              />
            ))}
            {nextCursor ? (
              <Button
                disabled={isLoading}
                onClick={loadMoreHandler}
                variant="ghost"
              >
                {isLoading ? t('Loading…') : t('Load more messages')}
              </Button>
            ) : null}
          </div>
        ) : (
          <Empty className={styles['empty-state']}>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                {isLoading
                  ? t('Loading inbox…')
                  : error
                    ? t('Inbox unavailable')
                    : !accountList.length
                      ? t('Connect your email')
                      : t('No messages here')}
              </EmptyTitle>
              <EmptyDescription>
                {isLoading
                  ? t('Getting your mailboxes and messages.')
                  : error
                    ? t('Retry when the API and storage are available.')
                    : !accountList.length
                      ? t('Bring Gmail and QQ mail together in one inbox.')
                      : t(
                          'New mail will appear after sync. You can also try another filter.',
                        )}
              </EmptyDescription>
            </EmptyHeader>
            {!isLoading && !error ? (
              <EmptyContent>
                <Button
                  onClick={
                    !accountList.length
                      ? openAccountsHandler
                      : resetFiltersHandler
                  }
                  size="sm"
                  variant="outline"
                >
                  {!accountList.length
                    ? t('Connect mailbox')
                    : t('Reset filters')}
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        )}
      </ScrollArea>
    </>
  )
}

export { InboxMessageList }
