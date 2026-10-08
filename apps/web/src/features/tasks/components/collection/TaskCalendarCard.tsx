import { CalendarDays, ChevronDown } from 'lucide-react'
import { zhCN } from 'date-fns/locale'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useSidebar } from '@/components/ui/sidebar'
import { getTaskDateCountMap } from '@/features/tasks/data/task-collection'
import {
  formatTaskDate,
  getLocalDate,
} from '@/features/tasks/data/task-planner'
import type { TaskItem } from '@/features/tasks/types'
import styles from '@/features/tasks/components/collection/TaskCalendarCard.module.css'
import panelStyles from '@/features/tasks/styles/task-panels.module.css'

type Props = {
  taskList: TaskItem[]
  selectedDate: string
  today: string
  onSelect: (date: string) => void
}

/** 用官方月历标记计划，提供所选日期的精简任务摘要。
 * @param props - 筛选后的任务、日期及日期选择回调
 * @returns 日历辅助卡片 JSX
 */
export const TaskCalendarCard = ({
  taskList,
  selectedDate,
  today,
  onSelect,
}: Props) => {
  const { isMobile } = useSidebar()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [month, setMonth] = useState(new Date(`${selectedDate}T12:00:00`))
  const [params, setParams] = useSearchParams()
  const dateCountMap = getTaskDateCountMap(taskList)
  const selectedTaskList = taskList.filter(
    (task) => task.plannedDate === selectedDate,
  )
  const plannedDateList = [...dateCountMap.keys()].map(
    (date) => new Date(`${date}T12:00:00`),
  )

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- URL 后退或视图切换时，将月历同步到外部选中日期。
    setMonth(new Date(`${selectedDate}T12:00:00`))
  }, [selectedDate])

  /** 选中日期并展示对应清单。
   * @param date - 官方 Calendar 的选中日期
   * @returns 无返回值；更新日期筛选和可见月份
   */
  const dateSelectHandler = (date: Date | undefined): void => {
    if (!date) return
    setMonth(date)
    onSelect(getLocalDate(date))
  }
  /** 回到今天并在窄屏展开日历。
   * @param 无参数
   * @returns 无返回值；更新日期与展开状态
   */
  const todayHandler = (): void => {
    dateSelectHandler(new Date(`${today}T12:00:00`))
    setCalendarOpen(true)
  }
  /** 查看当前日期的完整清单。
   * @param 无参数
   * @returns 无返回值；应用日期筛选
   */
  const viewDateHandler = (): void => onSelect(selectedDate)
  /** 为日期提供任务数量的可访问名称。
   * @param date - 月历日期
   * @returns 日期与任务数量文本
   */
  const getDayButtonLabel = (date: Date): string => {
    const label = new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(date)
    return `${label}，${dateCountMap.get(getLocalDate(date)) ?? 0}项任务`
  }
  /** 渲染可直接查看详情的日期任务摘要。
   * @param task - 所选日期任务
   * @returns 摘要按钮 JSX
   */
  const renderTask = (task: TaskItem) => {
    /** 打开任务详情，保留清单筛选与日期上下文。
     * @param 无参数
     * @returns 无返回值；更新详情查询参数
     */
    const openTaskHandler = (): void => {
      const next = new URLSearchParams(params)
      next.delete('new')
      next.set('task', task.id)
      setParams(next)
    }
    return (
      <li key={task.id}>
        <Button
          variant="ghost"
          className={styles.previewTask}
          data-status={task.status}
          onClick={openTaskHandler}
          aria-label={`查看任务：${task.title}`}
          title={task.title}
        >
          <span className={styles.statusDot} aria-hidden="true" />
          <span className={styles.taskTitle}>{task.title}</span>
        </Button>
      </li>
    )
  }
  return (
    <Collapsible
      open={!isMobile || calendarOpen}
      onOpenChange={setCalendarOpen}
      asChild
    >
      <Card className={`${panelStyles.panel} ${styles.card}`}>
        <header className={styles.heading}>
          <h2>
            <CalendarDays aria-hidden="true" />
            任务日历
          </h2>
          <div>
            <Button variant="ghost" size="sm" onClick={todayHandler}>
              今天
            </Button>
            {isMobile ? (
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="展开或收起任务日历"
                >
                  <ChevronDown aria-hidden="true" />
                </Button>
              </CollapsibleTrigger>
            ) : null}
          </div>
        </header>
        <CollapsibleContent>
          <Calendar
            className={styles.calendar}
            locale={zhCN}
            mode="single"
            required
            month={month}
            onMonthChange={setMonth}
            selected={new Date(`${selectedDate}T12:00:00`)}
            onSelect={dateSelectHandler}
            modifiers={{ planned: plannedDateList }}
            modifiersClassNames={{ planned: styles.hasTasks }}
            labels={{ labelDayButton: getDayButtonLabel }}
          />
          <p className={styles.legend}>
            <span aria-hidden="true" />
            有计划的日期
          </p>
          <section className={styles.preview} aria-label="所选日期任务">
            <div className={styles.previewHeading}>
              <h3>
                {formatTaskDate(selectedDate, today)}
                <span>{selectedTaskList.length}项</span>
              </h3>
              <Button variant="ghost" size="sm" onClick={viewDateHandler}>
                查看清单
              </Button>
            </div>
            {selectedTaskList.length ? (
              <ul>{selectedTaskList.slice(0, 4).map(renderTask)}</ul>
            ) : (
              <p className={styles.empty}>这一天还没有符合筛选条件的任务。</p>
            )}
            {selectedTaskList.length > 4 ? (
              <Button
                variant="ghost"
                size="sm"
                className={styles.more}
                onClick={viewDateHandler}
              >
                查看全部 {selectedTaskList.length} 项任务
              </Button>
            ) : null}
          </section>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
