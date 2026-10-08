import { Archive, ArrowLeft, Inbox, Mail, MailOpen, Send } from 'lucide-react'
import { Link } from 'react-router-dom'

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
import { InboxToolbar } from '@/features/inbox/components/InboxToolbar'
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
  const ItemIcon = item.kind === 'email' ? Mail : Send

  /**
   * 打开消息时将其标记为已读。
   *
   * @param 无参数
   * @returns 无返回值；更新消息的本地已读状态
   */
  const selectMessageHandler = (): void => {
    markReadHandler(item.id)
  }

  return (
    <Link
      aria-current={isSelected ? 'page' : undefined}
      className={styles['message-row']}
      data-read={item.read}
      onClick={selectMessageHandler}
      to={`/inbox/${item.id}`}
    >
      <span className={styles['message-icon']}>
        <ItemIcon aria-hidden="true" />
      </span>
      <span className={styles['message-copy']}>
        <span className={styles['message-title-line']}>
          <strong>{item.title}</strong>
          <time>{item.receivedAt}</time>
        </span>
        <span className={styles['message-summary']}>{item.summary}</span>
        <span className={styles['message-sender']}>
          {!item.read ? (
            <span aria-label="Unread" className={styles['unread-dot']} />
          ) : null}
          {item.sender}
        </span>
      </span>
    </Link>
  )
}

type InboxMessageListProps = Pick<
  InboxView,
  'visibleItemList' | 'selectedItem' | 'markReadHandler' | 'resetFiltersHandler'
>

/**
 * 渲染可滚动的 Inbox 消息列表和空状态。
 *
 * @param props - 可见消息、当前选择和列表操作
 * @returns 消息列表面板 JSX
 */
const InboxMessageList = ({
  visibleItemList,
  selectedItem,
  markReadHandler,
  resetFiltersHandler,
}: InboxMessageListProps) => (
  <ScrollArea className={styles['message-scroll']}>
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
      </div>
    ) : (
      <Empty className={styles['empty-state']}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No messages here</EmptyTitle>
          <EmptyDescription>
            Try another filter or search term.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={resetFiltersHandler} size="sm" variant="outline">
            Reset filters
          </Button>
        </EmptyContent>
      </Empty>
    )}
  </ScrollArea>
)

type InboxReaderProps = Pick<
  InboxView,
  | 'selectedItem'
  | 'isMissingItem'
  | 'toggleReadHandler'
  | 'toggleArchiveHandler'
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
}: InboxReaderProps) => {
  if (!selectedItem) {
    return (
      <Empty className={styles['reader-empty']}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            {isMissingItem ? 'Message not found' : 'Nothing selected'}
          </EmptyTitle>
          <EmptyDescription>
            {isMissingItem
              ? 'This message may have been removed.'
              : 'Choose a message from the inbox to read it.'}
          </EmptyDescription>
        </EmptyHeader>
        {isMissingItem ? (
          <EmptyContent>
            <Button asChild size="sm" variant="outline">
              <Link to="/inbox">Back to inbox</Link>
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    )
  }

  const ItemIcon = selectedItem.kind === 'email' ? Mail : Send

  return (
    <>
      <header className={styles['reader-toolbar']}>
        <Button
          asChild
          className={styles['reader-back']}
          size="icon-sm"
          variant="ghost"
        >
          <Link aria-label="Back to inbox" to="/inbox">
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>
        <div className={styles['reader-actions']}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={
                  selectedItem.read ? 'Mark as unread' : 'Mark as read'
                }
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
              {selectedItem.read ? 'Mark as unread' : 'Mark as read'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={
                  selectedItem.archived ? 'Move to inbox' : 'Archive message'
                }
                onClick={toggleArchiveHandler}
                size="icon-sm"
                variant="ghost"
              >
                <Archive aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {selectedItem.archived ? 'Move to inbox' : 'Archive message'}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>
      <ScrollArea className={styles['reader-scroll']}>
        <article className={styles['reader-content']}>
          <div className={styles['reader-mark']}>
            <ItemIcon aria-hidden="true" />
          </div>
          <p className={styles['reader-meta']}>
            {selectedItem.sender} · {selectedItem.receivedAt}
          </p>
          <h2>{selectedItem.title}</h2>
          <p className={styles['reader-summary']}>{selectedItem.summary}</p>
          <div className={styles['reader-body']}>
            {selectedItem.body.split('\n\n').map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          {selectedItem.resourceList?.length ? (
            <section
              className={styles['resources']}
              aria-labelledby="inbox-resources-title"
            >
              <h3 id="inbox-resources-title">Resources</h3>
              <ul>
                {selectedItem.resourceList.map((resource) => (
                  <li key={resource.path}>
                    <Link to={resource.path}>{resource.title}</Link>
                    <p>{resource.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      </ScrollArea>
    </>
  )
}

/**
 * 组合 Inbox 的消息列表与右侧阅读区。
 *
 * @param props - Inbox 视图状态和操作
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
  </main>
)

export { InboxPageContent }
