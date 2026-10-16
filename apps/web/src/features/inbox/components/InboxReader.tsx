import { useI18n, getLocale } from '@/lib/i18n'
import { Archive, ArrowLeft, Inbox, Mail, MailOpen } from 'lucide-react'
import { lazy, Suspense } from 'react'
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { InboxView } from '@/features/inbox/hooks/useInboxView'

const InboxMessageBody = lazy(() =>
  import('@/features/inbox/components/InboxMessageBody').then((module) => ({
    default: module.InboxMessageBody,
  })),
)

import styles from '@/features/inbox/components/InboxPageContent.module.css'

type InboxReaderProps = Pick<
  InboxView,
  | 'selectedItem'
  | 'isMissingItem'
  | 'toggleReadHandler'
  | 'toggleArchiveHandler'
  | 'isBodyLoading'
  | 'bodyError'
  | 'retryBodyHandler'
  | 'isMutating'
>

/**
 * 渲染选中消息的阅读内容和处理操作。
 *
 * @param props - 当前消息、错误状态和消息操作
 * @returns 阅读区 JSX
 */
const InboxReader = ({
  selectedItem,
  isMissingItem,
  toggleReadHandler,
  toggleArchiveHandler,
  isBodyLoading,
  bodyError,
  retryBodyHandler,
  isMutating,
}: InboxReaderProps) => {
  const { t } = useI18n()

  const location = useLocation()
  const inboxPath = `/inbox${location.search}`
  if (!selectedItem) {
    return (
      <Empty className={styles['reader-empty']}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            {isBodyLoading
              ? t('Loading message…')
              : isMissingItem
                ? t('Message not found')
                : t('Nothing selected')}
          </EmptyTitle>
          <EmptyDescription>
            {isMissingItem
              ? t(bodyError ?? 'This message may have been removed.')
              : t('Choose a message from the inbox to read it.')}
          </EmptyDescription>
        </EmptyHeader>
        {isMissingItem ? (
          <EmptyContent>
            <Button asChild size="sm" variant="outline">
              <Link to={inboxPath}>{t('Back to inbox')}</Link>
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    )
  }

  const ItemIcon = selectedItem.read ? MailOpen : Mail

  return (
    <>
      <header className={styles['reader-toolbar']}>
        <Button
          asChild
          className={styles['reader-back']}
          size="icon-sm"
          variant="ghost"
        >
          <Link aria-label={t('Back to inbox')} to={inboxPath}>
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>
        <div className={styles['reader-actions']}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={
                  selectedItem.read ? t('Mark as unread') : t('Mark as read')
                }
                disabled={isMutating}
                onClick={toggleReadHandler}
                size="icon-sm"
                variant="ghost"
              >
                {selectedItem.read ? (
                  <Mail aria-hidden="true" />
                ) : (
                  <MailOpen aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {selectedItem.read ? t('Mark as unread') : t('Mark as read')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={
                  selectedItem.archived
                    ? t('Move to inbox')
                    : t('Archive message')
                }
                disabled={isMutating}
                onClick={toggleArchiveHandler}
                size="icon-sm"
                variant="ghost"
              >
                <Archive aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {selectedItem.archived
                ? t('Move to inbox')
                : t('Archive message')}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>
      <ScrollArea className={styles['reader-scroll']}>
        <article className={styles['reader-content']}>
          <header>
            <div className={styles['reader-heading']}>
              <ItemIcon aria-hidden="true" />
              <h2>{selectedItem.title}</h2>
            </div>
            <p className={styles['reader-meta']}>
              {selectedItem.sender} ·{' '}
              {new Date(selectedItem.receivedAt).toLocaleString(getLocale())}
            </p>
          </header>
          <div className={styles['reader-body']}>
            {isBodyLoading ? (
              <p role="status">{t('Loading message…')}</p>
            ) : bodyError ? (
              <div role="alert">
                <p>{t(bodyError)}</p>
                <Button onClick={retryBodyHandler} size="sm" variant="outline">
                  {t('Retry')}
                </Button>
              </div>
            ) : (
              <Suspense fallback={<p role="status">{t('Loading message…')}</p>}>
                <InboxMessageBody
                  key={selectedItem.id}
                  body={selectedItem.body}
                  format={selectedItem.bodyFormat}
                />
              </Suspense>
            )}
          </div>
        </article>
      </ScrollArea>
    </>
  )
}

export { InboxReader }
