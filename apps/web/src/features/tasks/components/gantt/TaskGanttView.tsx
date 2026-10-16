import { useI18n, getDateFnsLocale, t } from '@/lib/i18n'
import { addDays, differenceInCalendarDays } from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  GanttFeatureItem,
  GanttFeatureList,
  GanttFeatureListGroup,
  GanttHeader,
  GanttProvider,
  GanttSidebar,
  GanttSidebarGroup,
  GanttSidebarItem,
  GanttTimeline,
  type GanttFeature,
  type Range,
} from '@/components/kibo-ui/gantt'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TaskEmptyState } from '@/features/tasks/components/TaskEmptyState'
import {
  buildTaskGanttDatePatch,
  buildTaskGanttRecord,
  getTaskGanttGroupList,
  getTaskGanttVisibleTaskList,
  type TaskGanttEntry,
  type TaskGanttGroup,
} from '@/features/tasks/data/task-gantt'
import {
  formatTaskCalendarDate,
  getLocalDate,
  statusLabelRecord,
} from '@/features/tasks/data/task-planner'
import { useTaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'
import type { TaskItem, TaskProject, TaskStatus } from '@/features/tasks/types'
import styles from '@/features/tasks/components/gantt/TaskGanttView.module.css'
import panelStyles from '@/features/tasks/styles/task-panels.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

const statusColorRecord: Record<TaskStatus, string> = {
  todo: 'var(--muted-foreground)',
  inProgress: 'var(--project-blue)',
  completed: 'var(--project-green)',
}

/**
 * 将任务区间转换为 Kibo 的时间条属性。
 *
 * @param entry - 有效任务区间
 * @returns 时间条的标题、日期与真实状态
 */
const buildFeature = (entry: TaskGanttEntry): GanttFeature => ({
  id: entry.task.id,
  name: entry.task.title,
  startAt: entry.startAt,
  endAt: entry.endAt,
  status: {
    id: entry.task.status,
    name: t(statusLabelRecord[entry.task.status]),
    color: statusColorRecord[entry.task.status],
  },
})

/**
 * 展示可拖动的任务时间轴，日期保存仍由唯一 TaskPlanner 管理。
 *
 * @param 无参数
 * @returns 甘特图、项目筛选和未安排任务 JSX
 */
export const TaskGanttView = () => {
  const { t } = useI18n()

  const { data, today, rescheduleTaskHandler } = useTaskPlannerContext()
  const [params, setParams] = useSearchParams()
  const rangeParam = params.get('range')
  const range: Range =
    rangeParam === 'monthly' || rangeParam === 'weekly' ? rangeParam : 'daily'
  const projectId = params.get('project')
  const selectedProject =
    projectId === 'personal' ||
    data.projectList.some((project) => project.id === projectId)
      ? projectId!
      : 'all'
  const showCompleted = params.get('completed') === '1'
  const taskList = getTaskGanttVisibleTaskList(
    data.taskList,
    selectedProject,
    showCompleted,
  )
  const { entryList, unscheduledTaskList, invalidTaskList } =
    buildTaskGanttRecord(taskList)
  const groupList = getTaskGanttGroupList(entryList, data.projectList)
  const dateList = entryList.flatMap((entry) => [
    entry.startAt.getTime(),
    entry.endAt.getTime(),
  ])
  const initialDate = new Date(
    dateList.length ? Math.min(...dateList) : `${today}T00:00:00`,
  )
  const endDate = new Date(
    dateList.length ? Math.max(...dateList) : initialDate,
  )

  // 修改视图条件，并保留当前编辑弹窗参数。
  const filterChangeHandler = (key: string, value: string): void => {
    const next = new URLSearchParams(params)
    if (!value || value === 'all' || value === 'daily') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  // 切换已完成历史的显示，保留原始计划数据。
  const completedChangeHandler = (checked: boolean | 'indeterminate'): void =>
    filterChangeHandler('completed', checked === true ? '1' : '')

  // 切换项目。
  const projectChangeHandler = (value: string): void =>
    filterChangeHandler('project', value)

  // 切换到日尺度。
  const dailyHandler = (): void => filterChangeHandler('range', 'daily')

  // 切换到周尺度。
  const weeklyHandler = (): void => filterChangeHandler('range', 'weekly')

  // 切换到月尺度。
  const monthlyHandler = (): void => filterChangeHandler('range', 'monthly')

  // 从任意任务入口打开现有居中编辑弹窗。
  const taskSelectHandler = (id: string): void => {
    const next = new URLSearchParams(params)
    next.delete('new')
    next.set('task', id)
    setParams(next)
  }

  /**
   * 校验日期拖动，调用方结束预览后始终显示保存的真实日期。
   *
   * @param id - 任务标识
   * @param startAt - 预览起点
   * @param endAt - 预览排他终点
   * @returns 无返回值；保存可撤销日期或恢复原位置
   */
  const moveHandler = (id: string, startAt: Date, endAt: Date | null): void => {
    const patch = buildTaskGanttDatePatch(startAt, endAt)
    if (!patch) toast.error(t('截止日期不能早于计划日期，已恢复原位置。'))
    else rescheduleTaskHandler(id, patch)
  }

  /**
   * 渲染任务名称、日期与真实步骤进度。
   *
   * @param entry - 有效任务区间
   * @returns 左侧任务按钮 JSX
   */
  const renderSidebarEntry = (entry: TaskGanttEntry) => {
    const { task } = entry
    const start = getLocalDate(entry.startAt)
    const end = getLocalDate(addDays(entry.endAt, -1))
    const dateLabel =
      formatTaskCalendarDate(start, today) +
      (start === end ? '' : ` — ${formatTaskCalendarDate(end, today)}`)
    const completedSteps = task.subtasks.filter((step) => step.completed).length
    return (
      <GanttSidebarItem
        key={task.id}
        feature={buildFeature(entry)}
        className={styles.sidebarItem}
        title={`${task.title} · ${dateLabel} · ${t(statusLabelRecord[task.status])}`}
      >
        <span
          className={styles.statusDot}
          style={{ background: statusColorRecord[task.status] }}
        />
        <span className={styles.taskName}>{task.title}</span>
        <span className={styles.progress}>
          {task.subtasks.length
            ? `${completedSteps}/${task.subtasks.length}`
            : t(statusLabelRecord[task.status])}
        </span>
      </GanttSidebarItem>
    )
  }

  /**
   * 渲染受保存日期控制的任务区间，保留节点以完成释放归位动画。
   *
   * @param entry - 有效任务区间
   * @returns 可拖动时间条 JSX
   */
  const renderTimelineEntry = (entry: TaskGanttEntry) => (
    <GanttFeatureItem
      key={entry.task.id}
      {...buildFeature(entry)}
      onMove={moveHandler}
      onSelect={taskSelectHandler}
      className={styles.timelineItem}
    >
      <span className={styles.barName}>{entry.task.title}</span>
      <span className={styles.barDuration}>
        {t('{0} 天', differenceInCalendarDays(entry.endAt, entry.startAt))}
      </span>
    </GanttFeatureItem>
  )

  /**
   * 渲染项目名称与对应任务列。
   *
   * @param group - 非空项目组
   * @returns 侧栏组 JSX
   */
  const renderSidebarGroup = (group: TaskGanttGroup) => (
    <GanttSidebarGroup
      key={group.id}
      name={group.name}
      className={styles.sidebarGroup}
    >
      {group.entryList.map(renderSidebarEntry)}
    </GanttSidebarGroup>
  )

  /**
   * 渲染与侧栏严格对应的时间条组。
   *
   * @param group - 非空项目组
   * @returns 时间轴组 JSX
   */
  const renderTimelineGroup = (group: TaskGanttGroup) => (
    <GanttFeatureListGroup key={group.id}>
      {group.entryList.map(renderTimelineEntry)}
    </GanttFeatureListGroup>
  )

  /**
   * 渲染没有日期或需要调整日期的编辑入口。
   *
   * @param task - 任务
   * @returns 未绘制任务按钮 JSX
   */
  const renderUnscheduledTask = (task: TaskItem) => {
    // 编辑当前未绘制任务。
    const selectHandler = (): void => taskSelectHandler(task.id)
    return (
      <Button key={task.id} variant="ghost" size="sm" onClick={selectHandler}>
        {task.title}
      </Button>
    )
  }

  /**
   * 渲染已有项目筛选项。
   *
   * @param project - 项目
   * @returns 筛选项 JSX
   */
  const renderProjectOption = (project: TaskProject) => (
    <SelectItem key={project.id} value={project.id}>
      {project.name}
    </SelectItem>
  )

  return (
    <section
      className={`${panelStyles.panel} ${styles.workspace}`}
      aria-label={t('甘特图')}
    >
      <header className={styles.toolbar}>
        <h1>
          {t('甘特图')}
          <span>{entryList.length}</span>
        </h1>
        <div className={styles.controls}>
          <label className={styles.completedToggle}>
            <Checkbox
              checked={showCompleted}
              onCheckedChange={completedChangeHandler}
            />
            {t('显示已完成')}
          </label>
          <Select value={selectedProject} onValueChange={projectChangeHandler}>
            <SelectTrigger aria-label={t('筛选甘特图项目')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={surfaceStyles.surface}>
              <SelectItem value="all">{t('全部项目')}</SelectItem>
              <SelectItem value="personal">{t('个人任务')}</SelectItem>
              {data.projectList.map(renderProjectOption)}
            </SelectContent>
          </Select>
          <div className={styles.scale} role="group" aria-label={t('时间尺度')}>
            <Button
              size="sm"
              variant={range === 'daily' ? 'secondary' : 'ghost'}
              aria-pressed={range === 'daily'}
              onClick={dailyHandler}
            >
              {t('日')}
            </Button>
            <Button
              size="sm"
              variant={range === 'weekly' ? 'secondary' : 'ghost'}
              aria-pressed={range === 'weekly'}
              onClick={weeklyHandler}
            >
              {t('周')}
            </Button>
            <Button
              size="sm"
              variant={range === 'monthly' ? 'secondary' : 'ghost'}
              aria-pressed={range === 'monthly'}
              onClick={monthlyHandler}
            >
              {t('月')}
            </Button>
          </div>
        </div>
      </header>
      {entryList.length ? (
        <div className={styles.chart}>
          <GanttProvider
            key={`${selectedProject}-${range}-${initialDate.getFullYear()}-${endDate.getFullYear()}`}
            range={range}
            zoom={range === 'monthly' ? 180 : 100}
            initialDate={initialDate}
            endDate={endDate}
            locale={getDateFnsLocale()}
            className={styles.gantt}
          >
            <GanttSidebar
              className={styles.sidebar}
              header={
                <div className={styles.sidebarHeader}>
                  <span>{t('任务')}</span>
                  <span>{t('进度')}</span>
                </div>
              }
            >
              {groupList.map(renderSidebarGroup)}
            </GanttSidebar>
            <GanttTimeline>
              <GanttHeader />
              <GanttFeatureList>
                {groupList.map(renderTimelineGroup)}
              </GanttFeatureList>
            </GanttTimeline>
          </GanttProvider>
        </div>
      ) : (
        <div className={styles.empty}>
          <TaskEmptyState
            title={
              taskList.length
                ? t('还没有可展示的日期')
                : data.taskList.length
                  ? t('当前没有待展示的任务')
                  : t('还没有任务进度')
            }
            description={
              taskList.length
                ? t('为任务设置计划日期或截止日期，即可在时间轴查看和调整。')
                : data.taskList.length
                  ? t('可以切换项目或打开「显示已完成」查看历史进度。')
                  : t('添加任务并设置计划日期或截止日期。')
            }
          />
        </div>
      )}
      {unscheduledTaskList.length || invalidTaskList.length ? (
        <div className={styles.unplanned}>
          {invalidTaskList.length ? (
            <details open>
              <summary>
                {t('日期待调整 ·')} {invalidTaskList.length}
              </summary>
              <div>{invalidTaskList.map(renderUnscheduledTask)}</div>
            </details>
          ) : null}
          {unscheduledTaskList.length ? (
            <details>
              <summary>
                {t('未安排 ·')} {unscheduledTaskList.length}
              </summary>
              <div>{unscheduledTaskList.map(renderUnscheduledTask)}</div>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
