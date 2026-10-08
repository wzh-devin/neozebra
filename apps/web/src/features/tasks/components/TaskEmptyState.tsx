import { ListTodo } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useTaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'

/** 展示任务空状态和明确标注的可选示例。
 * @param props - 标题与说明
 * @returns 空状态 JSX
 */
export const TaskEmptyState = ({
  title = '让计划从一件小事开始',
  description = '添加一个任务，或者先看看示例里的项目与每日安排。',
}: {
  title?: string
  description?: string
}) => {
  const { data, loadDemoHandler, isReadError } = useTaskPlannerContext()
  return (
    <Empty className="min-h-48">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListTodo aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {!data.taskList.length && !data.projectList.length ? (
        <EmptyContent>
          <Button
            variant="outline"
            onClick={loadDemoHandler}
            disabled={isReadError}
          >
            加载示例计划
          </Button>
          <span className="text-muted-foreground text-xs">
            示例为 synthetic/local mock
          </span>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
