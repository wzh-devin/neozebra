import { Search, SlidersHorizontal, X } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  priorityLabelRecord,
  statusLabelRecord,
} from '@/features/tasks/data/task-planner'
import type { TaskCollectionFilters as FilterValues } from '@/features/tasks/data/task-collection'
import type { TaskProject } from '@/features/tasks/types'
import styles from '@/features/tasks/components/collection/TaskCollectionFilters.module.css'

type Props = {
  filters: FilterValues
  projectList: TaskProject[]
  labelList: string[]
  completed: boolean
  hasDateFilter: boolean
  onChange: (key: string, value: string) => void
  onReset: () => void
}

/** 常驻常用条件，将较少使用的条件收进官方 Popover。
 * @param props - 条件、选项与 URL 更新回调
 * @returns 清单筛选栏 JSX
 */
export const TaskCollectionFilters = ({
  filters,
  projectList,
  labelList,
  completed,
  hasDateFilter,
  onChange,
  onReset,
}: Props) => {
  const advancedCount =
    Number(filters.priority !== 'all') +
    Number(filters.label !== null) +
    Number(filters.schedule !== 'all') +
    Number(!completed && filters.sort !== 'manual')
  const hasFilters =
    !!filters.query ||
    filters.project !== 'all' ||
    (!completed && filters.status !== 'all') ||
    advancedCount > 0 ||
    hasDateFilter

  /** 更新任务搜索词。
   * @param event - 输入事件
   * @returns 无返回值；更新 URL 条件
   */
  const queryChangeHandler = (event: ChangeEvent<HTMLInputElement>): void =>
    onChange('q', event.target.value)
  /** 更新项目条件。
   * @param value - 项目 ID 或内置选项
   * @returns 无返回值；更新 URL 条件
   */
  const projectChangeHandler = (value: string): void =>
    onChange('project', value)
  /** 更新状态条件。
   * @param value - 任务状态
   * @returns 无返回值；更新 URL 条件
   */
  const statusChangeHandler = (value: string): void => onChange('status', value)
  /** 更新优先级条件。
   * @param value - 优先级
   * @returns 无返回值；更新 URL 条件
   */
  const priorityChangeHandler = (value: string): void =>
    onChange('priority', value)
  /** 更新标签条件，保留名为 all 的真实标签。
   * @param value - 标签选项
   * @returns 无返回值；更新 URL 条件
   */
  const labelChangeHandler = (value: string): void =>
    onChange('label', value === 'all' ? '' : value.slice(6))
  /** 更新安排条件。
   * @param value - 安排状态
   * @returns 无返回值；更新 URL 条件
   */
  const scheduleChangeHandler = (value: string): void =>
    onChange('schedule', value)
  /** 更新排序方式。
   * @param value - 排序选项
   * @returns 无返回值；更新 URL 条件
   */
  const sortChangeHandler = (value: string): void => onChange('sort', value)
  return (
    <div className={styles.toolbar}>
      <div className={styles.search}>
        <Search aria-hidden="true" />
        <Input
          type="search"
          placeholder="搜索任务…"
          aria-label="搜索任务"
          value={filters.query}
          onChange={queryChangeHandler}
        />
      </div>
      <div className={styles.conditions}>
        <Select value={filters.project} onValueChange={projectChangeHandler}>
          <SelectTrigger aria-label="筛选项目">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部项目</SelectItem>
            <SelectItem value="personal">个人事项</SelectItem>
            {projectList.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!completed ? (
          <Select value={filters.status} onValueChange={statusChangeHandler}>
            <SelectTrigger aria-label="筛选状态">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {Object.entries(statusLabelRecord).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal aria-hidden="true" />
              筛选
              {advancedCount ? (
                <Badge variant="secondary">{advancedCount}</Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className={styles.popover}>
            <div className={styles.field}>
              <Label htmlFor="task-priority-filter">优先级</Label>
              <Select
                value={filters.priority}
                onValueChange={priorityChangeHandler}
              >
                <SelectTrigger id="task-priority-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部优先级</SelectItem>
                  {Object.entries(priorityLabelRecord).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={styles.field}>
              <Label htmlFor="task-label-filter">标签</Label>
              <Select
                value={
                  filters.label === null ? 'all' : `label:${filters.label}`
                }
                onValueChange={labelChangeHandler}
              >
                <SelectTrigger id="task-label-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部标签</SelectItem>
                  {labelList.map((label) => (
                    <SelectItem key={label} value={`label:${label}`}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!completed ? (
              <>
                <div className={styles.field}>
                  <Label htmlFor="task-schedule-filter">安排</Label>
                  <Select
                    value={filters.schedule}
                    onValueChange={scheduleChangeHandler}
                  >
                    <SelectTrigger id="task-schedule-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部安排</SelectItem>
                      <SelectItem value="unscheduled">尚未安排</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={styles.field}>
                  <Label htmlFor="task-sort-filter">排序</Label>
                  <Select
                    value={filters.sort}
                    onValueChange={sortChangeHandler}
                  >
                    <SelectTrigger id="task-sort-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">手动顺序</SelectItem>
                      <SelectItem value="priority">优先级</SelectItem>
                      <SelectItem value="deadline">截止日期</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
          </PopoverContent>
        </Popover>
        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            aria-label="清除全部筛选"
          >
            <X aria-hidden="true" />
            清除
          </Button>
        ) : null}
      </div>
    </div>
  )
}
