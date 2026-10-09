import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronRight,
  Clock3,
  GripVertical,
  MoreHorizontal,
  Pin,
  Sun,
  Tag,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { taskToastOptions } from '@/features/tasks/utils/task-toast'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  addDays,
  formatMinutes,
  formatTaskDate,
  priorityLabelRecord,
} from '@/features/tasks/data/task-planner'
import { useTaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'
import type { TaskCardDragHandlers } from '@/features/tasks/hooks/useTaskCardDrag'
import { TaskDeleteAlertDialog } from '@/features/tasks/components/items/TaskDeleteAlertDialog'
import { TaskProjectMark } from '@/features/tasks/components/projects/TaskProjectMark'
import { TaskSubtaskList } from '@/features/tasks/components/items/TaskSubtaskList'
import { restoreTaskFocusHandler } from '@/features/tasks/utils/task-focus'
import type { TaskItem, TaskSubtask } from '@/features/tasks/types'
import styles from '@/features/tasks/components/items/TaskRow.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

type Props = {
  task: TaskItem
  siblingIdList?: string[]
  expanded: boolean
  onExpandedChange: (open: boolean) => void
  dragHandlers?: TaskCardDragHandlers
  dragOffset?: number
  shiftOffset?: number
}

/** 展示可直接操作与展开的任务，保持编辑上下文。
 * @param props - 任务、排序组与分组控制的展开状态
 * @returns 任务插页 JSX
 */
export const TaskRow = ({
  task,
  siblingIdList = [],
  expanded,
  onExpandedChange,
  dragHandlers,
  dragOffset,
  shiftOffset,
}: Props) => {
  const {
    data,
    today,
    updateTaskHandler,
    toggleTaskHandler,
    deleteTaskHandler,
    moveTaskHandler,
  } = useTaskPlannerContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const project = data.projectList.find((entry) => entry.id === task.projectId)
  const isCompleted = task.status === 'completed'
  const completedStepCount = task.subtasks.filter(
    (step) => step.completed,
  ).length
  const index = siblingIdList.indexOf(task.id)
  const isOverdue =
    !isCompleted && task.deadlineDate !== null && task.deadlineDate < today

  /** 打开当前任务编辑。
   * @param 无参数
   * @returns 无返回值；更新 URL
   */
  const openHandler = (): void => {
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    next.set('task', task.id)
    setSearchParams(next)
  }
  /** 切换完成状态。
   * @param 无参数
   * @returns 无返回值；完成任务或请求确认
   */
  const completeHandler = (): void => {
    if (toggleTaskHandler(task.id)) restoreTaskFocusHandler()
  }
  /** 加入今天但保留截止日期。
   * @param 无参数
   * @returns 无返回值；更新安排
   */
  const todayHandler = (): void => {
    if (updateTaskHandler(task.id, { plannedDate: today }))
      restoreTaskFocusHandler()
  }
  /** 改期到明天。
   * @param 无参数
   * @returns 无返回值；更新安排
   */
  const tomorrowHandler = (): void => {
    if (updateTaskHandler(task.id, { plannedDate: addDays(today, 1) }))
      restoreTaskFocusHandler()
  }
  /** 取消安排。
   * @param 无参数
   * @returns 无返回值；清除计划日期
   */
  const unscheduleHandler = (): void => {
    if (updateTaskHandler(task.id, { plannedDate: null, isPinned: false }))
      restoreTaskFocusHandler()
  }
  /** 置顶为今日重点。
   * @param 无参数
   * @returns 无返回值；更新置顶与安排
   */
  const pinHandler = (): void => {
    if (
      updateTaskHandler(task.id, {
        isPinned: !task.isPinned,
        plannedDate: task.isPinned ? task.plannedDate : today,
      })
    )
      restoreTaskFocusHandler()
  }
  /** 设置进行中。
   * @param 无参数
   * @returns 无返回值；更新状态
   */
  const progressHandler = (): void => {
    updateTaskHandler(task.id, {
      status: task.status === 'inProgress' ? 'todo' : 'inProgress',
    })
  }
  /** 删除当前任务。
   * @param 无参数
   * @returns 无返回值；保存删除
   */
  const deleteHandler = (): void => {
    if (deleteTaskHandler(task.id)) restoreTaskFocusHandler()
  }
  /** 上移任务。
   * @param 无参数
   * @returns 无返回值；保存顺序
   */
  const upHandler = (): void => moveTaskHandler(siblingIdList, task.id, -1)
  /** 下移任务。
   * @param 无参数
   * @returns 无返回值；保存顺序
   */
  const downHandler = (): void => moveTaskHandler(siblingIdList, task.id, 1)
  /** 保存子任务并在需要时重新打开主任务。
   * @param steps - 新步骤
   * @returns 是否保存成功
   */
  const stepsChangeHandler = (steps: TaskSubtask[]): boolean => {
    const shouldReopen = isCompleted && steps.some((step) => !step.completed)
    const saved = updateTaskHandler(task.id, {
      subtasks: steps,
      ...(shouldReopen ? { status: 'todo', completedAt: null } : {}),
    })
    if (
      saved &&
      !isCompleted &&
      steps.length &&
      steps.every((step) => step.completed) &&
      task.subtasks.some((step) => !step.completed)
    )
      toast.success('所有步骤已完成，可以完成主任务了', {
        ...taskToastOptions,
        duration: 8000,
      })
    return saved
  }
  return (
    <Collapsible
      className={styles.row}
      open={expanded}
      onOpenChange={onExpandedChange}
      data-active={searchParams.get('task') === task.id}
      data-completed={isCompleted}
      data-color={project?.color ?? 'blue'}
      data-task-id={task.id}
      data-dragging={dragOffset !== undefined}
      data-shifting={shiftOffset !== undefined}
      data-draggable={Boolean(dragHandlers)}
      style={
        dragOffset === undefined && shiftOffset === undefined
          ? undefined
          : { transform: `translateY(${dragOffset ?? shiftOffset}px)` }
      }
    >
      <article className={styles.rowMain}>
        {dragHandlers ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={styles.dragHandle}
            aria-label={`拖动排序：${task.title}`}
            aria-description="按住上下拖动，或使用上下方向键调整顺序"
            data-task-drag-id={task.id}
            {...dragHandlers}
          >
            <GripVertical aria-hidden="true" />
          </Button>
        ) : null}
        <Checkbox
          className={styles.checkbox}
          checked={isCompleted}
          aria-label={`${isCompleted ? '重新打开' : '完成'}任务：${task.title}`}
          onCheckedChange={completeHandler}
        />
        <div className={styles.rowBody}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className={styles.title}>
              <span>{task.title}</span>
              <ChevronRight aria-hidden="true" className={styles.disclosure} />
            </Button>
          </CollapsibleTrigger>
        </div>
        <div className={styles.actions}>
          {task.isPinned ? (
            <Pin aria-label="已置顶" className={styles.pin} />
          ) : null}
          {task.subtasks.length ? (
            <span className={styles.stepCount} aria-label="已完成步骤数量">
              {completedStepCount}/{task.subtasks.length}
            </span>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`任务操作：${task.title}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={surfaceStyles.surface}>
              <DropdownMenuItem onSelect={openHandler}>
                编辑任务
              </DropdownMenuItem>
              {!isCompleted ? (
                <>
                  <DropdownMenuItem onSelect={todayHandler}>
                    加入今天
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={tomorrowHandler}>
                    安排到明天
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={unscheduleHandler}>
                    取消安排
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={pinHandler}>
                    {task.isPinned ? '取消重点标记' : '标记为重点'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={progressHandler}>
                    {task.status === 'inProgress' ? '设为待办' : '开始进行'}
                  </DropdownMenuItem>
                </>
              ) : null}
              {siblingIdList.length > 1 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={index <= 0} onSelect={upHandler}>
                    <ArrowUp aria-hidden="true" />
                    上移
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index < 0 || index === siblingIdList.length - 1}
                    onSelect={downHandler}
                  >
                    <ArrowDown aria-hidden="true" />
                    下移
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                优先级：{priorityLabelRecord[task.priority]}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TaskDeleteAlertDialog
            task={task}
            deleteTaskHandler={deleteHandler}
          />
        </div>
      </article>
      <CollapsibleContent
        forceMount
        className={styles.rowContent}
        inert={!expanded}
        aria-hidden={!expanded}
      >
        <div className={styles.contentClip}>
          <div className={styles.details}>
            <div className={styles.metadata}>
              {project ? (
                <span>
                  <TaskProjectMark project={project} small />
                  {project.name}
                </span>
              ) : (
                <span>
                  <Sun aria-hidden="true" />
                  个人事项
                </span>
              )}
              {task.status === 'inProgress' ? (
                <span className={styles.inProgress}>进行中</span>
              ) : null}
              {task.priority === 'high' ? (
                <span className={styles.high}>高优先级</span>
              ) : task.priority === 'low' ? (
                <span>低优先级</span>
              ) : null}
              {task.deadlineDate ? (
                <span data-overdue={isOverdue}>
                  <CalendarDays aria-hidden="true" />
                  {isOverdue ? '截止逾期 · ' : ''}
                  {formatTaskDate(task.deadlineDate, today)}截止
                </span>
              ) : null}
              {task.plannedDate && task.plannedDate !== today ? (
                <span>安排于{formatTaskDate(task.plannedDate, today)}</span>
              ) : null}
              {task.estimateMinutes ? (
                <span>
                  <Clock3 aria-hidden="true" />
                  {formatMinutes(task.estimateMinutes)}
                </span>
              ) : null}
              {task.labels.slice(0, 2).map((label) => (
                <span key={label} className={styles.label}>
                  <Tag aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>
            {task.description ? (
              <p className={styles.description}>{task.description}</p>
            ) : null}
            {task.subtasks.length ? (
              <Collapsible className={styles.steps}>
                <CollapsibleTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={styles.stepToggle}
                    aria-label={`展开 ${task.title} 的步骤`}
                  >
                    <ChevronRight aria-hidden="true" />
                    <span>
                      步骤 {completedStepCount}/{task.subtasks.length}
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className={styles.stepContent}>
                  <TaskSubtaskList
                    subtasks={task.subtasks}
                    onChange={stepsChangeHandler}
                  />
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
