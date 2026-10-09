import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { TaskQuickAdd } from '@/features/tasks/components/items/TaskQuickAdd'
import { TaskRow } from '@/features/tasks/components/items/TaskRow'
import { useTaskCardDrag } from '@/features/tasks/hooks/useTaskCardDrag'
import type { TaskItem } from '@/features/tasks/types'
import styles from '@/features/tasks/components/items/TaskRow.module.css'

type Props = {
  title?: string
  taskList: TaskItem[]
  defaultOpen?: boolean
  quickAdd?: boolean
  plannedDate?: string | null
  projectId?: string | null
  sectionId?: string | null
  actions?: ReactNode
  reorder?: boolean
}

/**
 * 组合任务分组与上下文新增，有标题时可折叠。
 *
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const siblingIdList = reorder ? taskList.map((task) => task.id) : undefined
  const { listRef, dragState, dragHandlers } = useTaskCardDrag(
    siblingIdList ?? [],
  )

  /**
   * 渲染共享展开选择的任务插页。
   *
   * @param task - 当前任务
   * @param index - 当前组内顺序
   * @returns 任务插页 JSX
   */
  const renderTaskRow = (task: TaskItem, index: number) => {
    const shiftOffset =
      dragState && index > dragState.fromIndex && index <= dragState.targetIndex
        ? -dragState.pitch
        : dragState &&
            index >= dragState.targetIndex &&
            index < dragState.fromIndex
          ? dragState.pitch
          : undefined

    // 切换当前插页并收回同组其他插页。
    const expandedChangeHandler = (open: boolean): void =>
      setSelectedTaskId(open ? task.id : null)
    return (
      <TaskRow
        key={task.id}
        task={task}
        siblingIdList={siblingIdList}
        expanded={selectedTaskId === task.id}
        onExpandedChange={expandedChangeHandler}
        dragHandlers={
          siblingIdList && siblingIdList.length > 1 ? dragHandlers : undefined
        }
        dragOffset={dragState?.id === task.id ? dragState.offset : undefined}
        shiftOffset={shiftOffset}
      />
    )
  }
  return (
    <Collapsible
      defaultOpen={title ? defaultOpen : true}
      className={styles.group}
    >
      {title ? (
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
      ) : null}
      <CollapsibleContent className={styles.groupContent}>
        <div ref={listRef} className={styles.insertList}>
          {taskList.map(renderTaskRow)}
        </div>
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
