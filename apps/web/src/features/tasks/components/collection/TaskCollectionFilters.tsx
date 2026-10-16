import { useI18n } from '@/lib/i18n'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useRef, type ChangeEvent } from 'react'
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
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

type Props = {
  filters: FilterValues
  projectList: TaskProject[]
  labelList: string[]
  completed: boolean
  hasDateFilter: boolean
  onChange: (key: string, value: string) => void
  onReset: () => void
}

/**
 * 将搜索与全部筛选收进按需打开的官方 Popover。
 *
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
  const { t } = useI18n()

  const queryInputRef = useRef<HTMLInputElement>(null)
  const projectTriggerRef = useRef<HTMLButtonElement>(null)
  const filterCount =
    Number(filters.project !== 'all') +
    Number(!completed && filters.status !== 'all') +
    Number(filters.priority !== 'all') +
    Number(filters.label !== null) +
    Number(filters.schedule !== 'all') +
    Number(!completed && filters.sort !== 'manual') +
    Number(hasDateFilter)
  const hasFilters = !!filters.query || filterCount > 0

  // 更新任务搜索词。
  const queryChangeHandler = (event: ChangeEvent<HTMLInputElement>): void =>
    onChange('q', event.target.value)

  // 清除搜索词，保留其他筛选。
  const clearQueryHandler = (): void => {
    onChange('q', '')
    queryInputRef.current?.focus()
  }

  // 清除全部条件，让键盘焦点留在筛选面板。
  const resetFiltersHandler = (): void => {
    onReset()
    projectTriggerRef.current?.focus()
  }

  // 更新项目条件。
  const projectChangeHandler = (value: string): void =>
    onChange('project', value)

  // 更新状态条件。
  const statusChangeHandler = (value: string): void => onChange('status', value)

  // 更新优先级条件。
  const priorityChangeHandler = (value: string): void =>
    onChange('priority', value)

  // 更新标签条件，保留名为 all 的真实标签。
  const labelChangeHandler = (value: string): void =>
    onChange('label', value === 'all' ? '' : value.slice(6))

  // 更新安排条件。
  const scheduleChangeHandler = (value: string): void =>
    onChange('schedule', value)

  // 更新排序方式。
  const sortChangeHandler = (value: string): void => onChange('sort', value)
  return (
    <div className={styles.toolbar}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('搜索任务')}
            title={
              filters.query ? t('搜索任务：{0}', filters.query) : t('搜索任务')
            }
            data-active={!!filters.query}
          >
            <Search aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className={`${surfaceStyles.surface} ${styles.searchPopover}`}
          aria-label={t('搜索任务面板')}
        >
          <div className={styles.search}>
            <Search aria-hidden="true" />
            <Input
              ref={queryInputRef}
              type="search"
              placeholder={t('搜索任务…')}
              aria-label={t('搜索任务')}
              value={filters.query}
              onChange={queryChangeHandler}
            />
            {filters.query ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={clearQueryHandler}
                aria-label={t('清除搜索')}
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('筛选任务')}
            data-active={filterCount > 0}
          >
            <SlidersHorizontal aria-hidden="true" />
            {t('筛选')}
            {filterCount ? (
              <Badge variant="secondary">{filterCount}</Badge>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className={`${surfaceStyles.surface} ${styles.popover}`}
          aria-label={t('任务筛选')}
        >
          <div className={styles.field}>
            <Label htmlFor="task-project-filter">{t('项目')}</Label>
            <Select
              value={filters.project}
              onValueChange={projectChangeHandler}
            >
              <SelectTrigger
                ref={projectTriggerRef}
                id="task-project-filter"
                aria-label={t('筛选项目')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                className={surfaceStyles.surface}
                position="popper"
                align="start"
                sideOffset={6}
              >
                <SelectItem value="all">{t('全部项目')}</SelectItem>
                {projectList.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!completed ? (
            <div className={styles.field}>
              <Label htmlFor="task-status-filter">{t('状态')}</Label>
              <Select
                value={filters.status}
                onValueChange={statusChangeHandler}
              >
                <SelectTrigger
                  id="task-status-filter"
                  aria-label={t('筛选状态')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  className={surfaceStyles.surface}
                  position="popper"
                  align="start"
                  sideOffset={6}
                >
                  <SelectItem value="all">{t('全部状态')}</SelectItem>
                  {Object.entries(statusLabelRecord).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {t(label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className={styles.field}>
            <Label htmlFor="task-priority-filter">{t('优先级')}</Label>
            <Select
              value={filters.priority}
              onValueChange={priorityChangeHandler}
            >
              <SelectTrigger id="task-priority-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                className={surfaceStyles.surface}
                position="popper"
                align="start"
                sideOffset={6}
              >
                <SelectItem value="all">{t('全部优先级')}</SelectItem>
                {Object.entries(priorityLabelRecord).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {t(label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={styles.field}>
            <Label htmlFor="task-label-filter">{t('标签')}</Label>
            <Select
              value={filters.label === null ? 'all' : `label:${filters.label}`}
              onValueChange={labelChangeHandler}
            >
              <SelectTrigger id="task-label-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                className={surfaceStyles.surface}
                position="popper"
                align="start"
                sideOffset={6}
              >
                <SelectItem value="all">{t('全部标签')}</SelectItem>
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
                <Label htmlFor="task-schedule-filter">{t('安排')}</Label>
                <Select
                  value={filters.schedule}
                  onValueChange={scheduleChangeHandler}
                >
                  <SelectTrigger id="task-schedule-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className={surfaceStyles.surface}
                    position="popper"
                    align="start"
                    sideOffset={6}
                  >
                    <SelectItem value="all">{t('全部安排')}</SelectItem>
                    <SelectItem value="unscheduled">{t('尚未安排')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={styles.field}>
                <Label htmlFor="task-sort-filter">{t('排序')}</Label>
                <Select value={filters.sort} onValueChange={sortChangeHandler}>
                  <SelectTrigger id="task-sort-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className={surfaceStyles.surface}
                    position="popper"
                    align="start"
                    sideOffset={6}
                  >
                    <SelectItem value="manual">{t('手动顺序')}</SelectItem>
                    <SelectItem value="priority">{t('优先级')}</SelectItem>
                    <SelectItem value="deadline">{t('截止日期')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className={styles.reset}
              onClick={resetFiltersHandler}
              aria-label={t('清除全部筛选')}
            >
              <X aria-hidden="true" />
              {t('清除全部筛选')}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
