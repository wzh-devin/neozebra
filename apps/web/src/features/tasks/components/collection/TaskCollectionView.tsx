import { CalendarX } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { TaskCalendarCard } from '@/features/tasks/components/collection/TaskCalendarCard'
import { TaskCollectionFilters } from '@/features/tasks/components/collection/TaskCollectionFilters'
import { TaskEmptyState } from '@/features/tasks/components/TaskEmptyState'
import { TaskGroup } from '@/features/tasks/components/items/TaskGroup'
import { TaskQuickAdd } from '@/features/tasks/components/items/TaskQuickAdd'
import {
  getTaskCollectionList,
  type TaskCollectionFilters as FilterValues,
} from '@/features/tasks/data/task-collection'
import {
  formatTaskCalendarDate,
  getLocalDate,
  isValidDate,
} from '@/features/tasks/data/task-planner'
import { useTaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'
import styles from '@/features/tasks/components/collection/TaskCollectionView.module.css'
import panelStyles from '@/features/tasks/styles/task-panels.module.css'

/**
 * 组合左侧筛选清单与右侧日期任务月历。
 *
 * @param props - 是否展示待完成或已完成任务
 * @returns 任务与日期工作区 JSX
 */
export const TaskCollectionView = ({
  completed = false,
  pending = false,
}: {
  completed?: boolean
  pending?: boolean
}) => {
  const { data, today } = useTaskPlannerContext()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const rawDate = params.get('date')
  const date = rawDate && isValidDate(rawDate) ? rawDate : null
  const rawStatus = params.get('status')
  const rawPriority = params.get('priority')
  const rawSort = params.get('sort')
  const filters: FilterValues = {
    query: params.get('q') ?? '',
    project: data.projectList.some(
      (entry) => entry.id === params.get('project'),
    )
      ? params.get('project')!
      : 'all',
    status: completed
      ? 'completed'
      : rawStatus === 'todo' ||
          rawStatus === 'inProgress' ||
          rawStatus === 'completed'
        ? rawStatus
        : 'all',
    priority:
      rawPriority === 'high' ||
      rawPriority === 'medium' ||
      rawPriority === 'low'
        ? rawPriority
        : 'all',
    label: params.get('label'),
    schedule: params.get('schedule') === 'unscheduled' ? 'unscheduled' : 'all',
    sort: completed
      ? 'completed'
      : rawSort === 'priority' || rawSort === 'deadline'
        ? rawSort
        : 'manual',
    date,
  }
  const calendarTaskList = getTaskCollectionList(data.taskList, {
    ...filters,
    date: null,
  }).filter((task) => !pending || task.status !== 'completed')
  const visibleTaskList = getTaskCollectionList(data.taskList, filters).filter(
    (task) => !pending || task.status !== 'completed',
  )
  const labelList = [
    ...new Set(data.taskList.flatMap((task) => task.labels)),
  ].sort()
  const canQuickAdd =
    !completed &&
    !filters.query &&
    filters.priority === 'all' &&
    filters.label === null &&
    (filters.status === 'all' || filters.status === 'todo') &&
    (!date || filters.schedule === 'all')
  const projectId = filters.project === 'all' ? null : filters.project
  const completedDateList = [
    ...new Set(
      visibleTaskList
        .filter((task) => task.completedAt)
        .map((task) => getLocalDate(new Date(task.completedAt!))),
    ),
  ]
    .sort()
    .reverse()

  /**
   * 更新单个条件，保留详情上下文。
   *
   * @param key - URL 条件名
   * @param value - 新值
   * @returns 无返回值；替换当前筛选 URL
   */
  const filterChangeHandler = (key: string, value: string): void => {
    const next = new URLSearchParams(params)
    if (
      !value ||
      (key !== 'q' &&
        key !== 'label' &&
        (value === 'all' || value === 'manual'))
    )
      next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  /**
   * 选择日期并同步左侧清单。
   *
   * @param value - YYYY-MM-DD 日期
   * @returns 无返回值；更新日期路由，清除旧详情状态
   */
  const dateSelectHandler = (value: string): void => {
    const next = new URLSearchParams(params)
    next.set('date', value)
    next.delete('task')
    next.delete('new')
    navigate('/task/' + (completed ? 'completed' : 'all') + '?' + next)
  }

  /**
   * 清除日期限制，保留其他筛选。
   *
   * @param 无参数
   * @returns 无返回值；返回不限制日期的清单
   */
  const clearDateHandler = (): void => {
    const next = new URLSearchParams(params)
    next.delete('date')
    navigate(
      '/task/' +
        (completed ? 'completed' : 'all') +
        (next.size ? '?' + next : ''),
    )
  }

  /**
   * 重置当前视图的全部筛选。
   *
   * @param 无参数
   * @returns 无返回值；移除条件并保留任务详情参数
   */
  const resetHandler = (): void => {
    const next = new URLSearchParams(params)
    for (const key of [
      'q',
      'project',
      'status',
      'priority',
      'label',
      'schedule',
      'sort',
      'date',
    ])
      next.delete(key)
    setParams(next, { replace: true })
  }

  /**
   * 渲染完成日期分组。
   *
   * @param day - 完成日期
   * @returns 完成任务分组 JSX
   */
  const renderCompletedDay = (day: string) => (
    <TaskGroup
      key={day}
      title={formatTaskCalendarDate(day, today) + '完成'}
      taskList={visibleTaskList.filter(
        (task) =>
          task.completedAt && getLocalDate(new Date(task.completedAt)) === day,
      )}
      reorder={false}
    />
  )

  return (
    <div className={styles.workspace}>
      <Card
        className={`${panelStyles.panel} ${styles.mainColumn}`}
        role="region"
        aria-label="任务清单"
      >
        <header className={styles.heading}>
          <h1>
            {completed
              ? '已完成'
              : date
                ? formatTaskCalendarDate(date, today) + '的任务'
                : pending
                  ? '待完成'
                  : '全部任务'}
            <span>{visibleTaskList.length}</span>
          </h1>
          <div className={styles.actions}>
            {date ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={clearDateHandler}
                className={styles.clearDate}
                aria-label="清除日期筛选"
                title="清除日期筛选"
              >
                <CalendarX aria-hidden="true" />
              </Button>
            ) : null}
            <TaskCollectionFilters
              filters={filters}
              projectList={data.projectList}
              labelList={labelList}
              completed={completed}
              hasDateFilter={date !== null}
              onChange={filterChangeHandler}
              onReset={resetHandler}
            />
          </div>
        </header>
        <div
          className={styles.taskList}
          data-task-list-scroll
          role="region"
          aria-label="可滚动任务列表"
          tabIndex={0}
        >
          {visibleTaskList.length ? (
            completed ? (
              completedDateList.map(renderCompletedDay)
            ) : (
              <TaskGroup
                taskList={visibleTaskList}
                quickAdd={canQuickAdd}
                plannedDate={date}
                projectId={projectId}
                reorder={filters.sort === 'manual'}
              />
            )
          ) : (
            <>
              <TaskEmptyState
                title={
                  !data.taskList.length
                    ? '从一件小事开始'
                    : date
                      ? '这一天没有符合条件的任务'
                      : '没有符合条件的任务'
                }
                description={
                  !data.taskList.length
                    ? '记录第一件事，为计划留出空间。'
                    : '试试其他日期，或者清除筛选。'
                }
              />
              {canQuickAdd ? (
                <TaskQuickAdd plannedDate={date} projectId={projectId} />
              ) : null}
            </>
          )}
        </div>
      </Card>
      <aside className={styles.calendar} aria-label="日期任务">
        <TaskCalendarCard
          taskList={calendarTaskList}
          selectedDate={date ?? today}
          today={today}
          onSelect={dateSelectHandler}
        />
      </aside>
    </div>
  )
}
