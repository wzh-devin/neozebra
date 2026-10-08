import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { TaskQuickAdd } from '@/features/tasks/components/items/TaskQuickAdd'
import { TaskRow } from '@/features/tasks/components/items/TaskRow'
import type { TaskItem } from '@/features/tasks/types'
import styles from '@/features/tasks/components/items/TaskRow.module.css'

type Props = {
  title: string
  taskList: TaskItem[]
  defaultOpen?: boolean
  quickAdd?: boolean
  plannedDate?: string | null
  projectId?: string | null
  sectionId?: string | null
  actions?: ReactNode
  reorder?: boolean
}

/** 组合可折叠的任务分组与上下文新增。
 * @param props - 组标题、任务与操作
 * @returns 分组 JSX
 */
export const TaskGroup = ({
  title,
  taskList,
  defaultOpen = true,
  quickAdd = false,
  plannedDate = null,
  projectId = null,
  sectionId = null,
  actions,
  reorder = true,
}: Props) => {
  const siblingIdList = reorder ? taskList.map((task) => task.id) : undefined
  return (
    <Collapsible defaultOpen={defaultOpen} className={styles.group}>
      <div className={styles.groupHeader}>
        <h2>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className={styles.groupTitle}>
              <ChevronDown aria-hidden="true" />
              <span className={styles.groupLabel}>{title}</span>
              <span>{taskList.length}</span>
            </Button>
          </CollapsibleTrigger>
        </h2>
        {actions}
      </div>
      <CollapsibleContent className={styles.groupContent}>
        {taskList.map((task) => (
          <TaskRow key={task.id} task={task} siblingIdList={siblingIdList} />
        ))}
        {!taskList.length ? (
          <p className={styles.groupEmpty}>
            这里还没有任务，留一点空间给接下来的计划。
          </p>
        ) : null}
        {quickAdd ? (
          <TaskQuickAdd
            plannedDate={plannedDate}
            projectId={projectId}
            sectionId={sectionId}
          />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}
