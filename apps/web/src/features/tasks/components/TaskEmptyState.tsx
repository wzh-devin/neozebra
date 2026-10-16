import { useI18n } from '@/lib/i18n'
import { ListTodo } from 'lucide-react'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

/**
 * 展示任务空状态。
 *
 * @param props - 标题与说明
 * @returns 空状态 JSX
 */
export const TaskEmptyState = ({
  title = '让计划从一件小事开始',
  description = '添加一个任务，开始安排你的计划。',
}: {
  title?: string
  description?: string
}) => {
  const { t } = useI18n()

  return (
    <Empty className="min-h-48">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListTodo aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t(title)}</EmptyTitle>
        <EmptyDescription>{t(description)}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
