'use client'

import { t } from '@/lib/i18n'

// Kibo UI Gantt: https://www.kibo-ui.com/r/gantt.json (MIT).
// Local integration: locale, responsive sidebar, calendar-accurate drag and cancellation.

import {
  DndContext,
  PointerSensor,
  type DragMoveEvent,
  useDraggable,
  useSensor,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import { useMouse, useThrottle, useWindowScroll } from '@uidotdev/usehooks'
import {
  addDays,
  addMonths,
  differenceInDays,
  differenceInMonths,
  format,
  formatDate,
  formatDistance,
  getDaysInMonth,
  isSameDay,
  type Locale,
} from 'date-fns'
import { atom, useAtom } from 'jotai'
import throttle from 'lodash.throttle'
import { PlusIcon, TrashIcon } from 'lucide-react'
import type { CSSProperties, FC, ReactNode, RefObject } from 'react'
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Card } from '@/components/ui/card'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import {
  getGanttDateAtOffset as getDateByMousePosition,
  getGanttDateOffset as getOffset,
  getGanttWidth as getWidth,
  getGanttWeekList,
  getGanttPreviewPosition,
} from '@/components/kibo-ui/gantt/calendar-math'

const draggingAtom = atom(false)
const scrollXAtom = atom(0)

/**
 * 读取 Kibo 共享拖动状态。
 *
 * @param 无参数
 * @returns 拖动状态与更新器
 */

// eslint-disable-next-line react-refresh/only-export-components -- Preserve the installed Kibo public hook API.
export const useGanttDragging = () => useAtom(draggingAtom)

/**
 * 读取 Kibo 共享横向滚动位置。
 *
 * @param 无参数
 * @returns 滚动位置与更新器
 */

// eslint-disable-next-line react-refresh/only-export-components -- Preserve the installed Kibo public hook API.
export const useGanttScrollX = () => useAtom(scrollXAtom)

export type GanttStatus = {
  id: string
  name: string
  color: string
}

export type GanttFeature = {
  id: string
  name: string
  startAt: Date
  endAt: Date
  status: GanttStatus
  lane?: string // Optional: features with the same lane will share a row
}

export type GanttMarkerProps = {
  id: string
  date: Date
  label: string
}

export type Range = 'daily' | 'weekly' | 'monthly' | 'quarterly'

export type TimelineData = {
  year: number
  quarters: {
    months: {
      days: number
    }[]
  }[]
}[]

export type GanttContextProps = {
  zoom: number
  range: Range
  columnWidth: number
  sidebarWidth: number
  headerHeight: number
  rowHeight: number
  onAddItem: ((date: Date) => void) | undefined
  placeholderLength: number
  locale?: Locale
  timelineData: TimelineData
  ref: RefObject<HTMLDivElement | null> | null
  scrollToFeature?: (feature: GanttFeature) => void
}

// 按时间尺度选取日期差函数。
const getDifferenceIn = (range: Range) =>
  range === 'daily' || range === 'weekly'
    ? differenceInDays
    : differenceInMonths

// 按时间尺度选取日期增量函数。
const getAddRange = (range: Range) =>
  range === 'daily' || range === 'weekly' ? addDays : addMonths

/**
 * 生成覆盖任务区间并预留前后一年余量的时间轴。
 *
 * @param today - 区间起点
 * @param endDate - 区间终点
 * @returns 包含真实月份天数的年份列表
 */
const buildInitialTimelineDataList = (today: Date, endDate = today) => {
  const data: TimelineData = []
  for (
    let year = today.getFullYear() - 1;
    year <= endDate.getFullYear() + 1;
    year++
  ) {
    data.push(buildTimelineYear(year))
  }
  return data
}

/**
 * 构建一个年份的季度与月份，复用于初始范围与边缘扩展。
 *
 * @param year - 年份
 * @returns 带真实月份天数的年份记录
 */
const buildTimelineYear = (year: number): TimelineData[number] => {
  const quarters: TimelineData[number]['quarters'] = []
  for (let quarter = 0; quarter < 4; quarter++) {
    const months: { days: number }[] = []
    for (let month = quarter * 3; month < quarter * 3 + 3; month++) {
      months.push({ days: getDaysInMonth(new Date(year, month, 1)) })
    }
    quarters.push({ months })
  }
  return { year, quarters }
}

// 计算日期在月份列内的像素偏移。
const calculateInnerOffset = (
  date: Date,
  range: Range,
  columnWidth: number,
) => {
  if (range === 'daily' || range === 'weekly') return 0
  return ((date.getDate() - 1) / getDaysInMonth(date)) * columnWidth
}

const GanttContext = createContext<GanttContextProps>({
  zoom: 100,
  range: 'monthly',
  columnWidth: 50,
  headerHeight: 60,
  sidebarWidth: 300,
  rowHeight: 36,
  onAddItem: undefined,
  placeholderLength: 2,
  timelineData: [],
  ref: null,
  scrollToFeature: undefined,
})

export type GanttContentHeaderProps = {
  renderHeaderItem: (index: number) => ReactNode
  title: string
  columns: number
}

/**
 * 渲染 Kibo ContentHeader 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttContentHeader: FC<GanttContentHeaderProps> = ({
  title,
  columns,
  renderHeaderItem,
}) => {
  const id = useId()

  /**
   * 渲染一个表头列。
   *
   * @param _value - 占位项
   * @param index - 列序号
   * @returns 表头列 JSX
   */
  const renderColumn = (_value: unknown, index: number) => (
    <div
      className="border-border/50 flex shrink-0 items-center justify-center border-b py-1 text-center text-xs"
      key={`${id}-${index}`}
    >
      {renderHeaderItem(index)}
    </div>
  )

  return (
    <div
      className="bg-backdrop/90 sticky top-0 z-20 grid w-full shrink-0 backdrop-blur-sm"
      style={{
        height: 'var(--gantt-header-height)',
        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
      }}
    >
      <div className="flex min-w-0 items-center">
        <div
          className="text-muted-foreground sticky inline-flex max-w-full px-3 text-xs whitespace-nowrap"
          style={{
            left: 'var(--gantt-sidebar-width)',
          }}
        >
          <p className="truncate">{title}</p>
        </div>
      </div>
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: `repeat(${columns}, var(--gantt-column-width))`,
        }}
      >
        {Array.from({ length: columns }).map(renderColumn)}
      </div>
    </div>
  )
}

/**
 * 渲染按日时间轴表头。
 *
 * @param 无参数
 * @returns 日期表头 JSX
 */
const DailyHeader: FC = () => {
  const gantt = useContext(GanttContext)

  /**
   * 渲染一年的月份列。
   *
   * @param year - 年份记录
   * @returns 月份列 JSX 列表
   */
  const renderYearList = (year: TimelineData[number]) => {
    /**
     * 渲染一个月份和日期网格。
     *
     * @param month - 月份记录
     * @param index - 零起算月份
     * @returns 月份 JSX
     */
    const renderMonth = (month: { days: number }, index: number) => {
      const start = new Date(year.year, index, 1)

      /**
       * 渲染日序号与星期。
       *
       * @param item - 日序号
       * @returns 日期 JSX
       */
      const renderDay = (item: number) => (
        <div className="flex items-center justify-center gap-1">
          <p>{format(addDays(start, item), 'd', { locale: gantt.locale })}</p>
          <p className="text-muted-foreground">
            {format(addDays(start, item), 'EEEEE', { locale: gantt.locale })}
          </p>
        </div>
      )

      // 判断日期是否为周末。
      const isWeekend = (item: number) =>
        [0, 6].includes(addDays(start, item).getDay())
      return (
        <div className="relative flex flex-col" key={`${year.year}-${index}`}>
          <GanttContentHeader
            columns={month.days}
            renderHeaderItem={renderDay}
            title={format(
              start,
              gantt.locale?.code === 'zh-CN' ? 'yyyy年M月' : 'MMMM yyyy',
              { locale: gantt.locale },
            )}
          />
          <GanttColumns columns={month.days} isColumnSecondary={isWeekend} />
        </div>
      )
    }
    return year.quarters.flatMap((quarter) => quarter.months).map(renderMonth)
  }
  return gantt.timelineData.map(renderYearList)
}

/**
 * 渲染按月时间轴表头。
 *
 * @param 无参数
 * @returns 月份表头 JSX
 */
const MonthlyHeader: FC = () => {
  const gantt = useContext(GanttContext)

  /**
   * 渲染一个年份的月份表头。
   *
   * @param year - 年份记录
   * @returns 年份 JSX
   */
  const renderYear = (year: TimelineData[number]) => {
    /**
     * 渲染本地化月份名称。
     *
     * @param item - 月序号
     * @returns 月份名称 JSX
     */
    const renderMonth = (item: number) => (
      <p>
        {format(new Date(year.year, item, 1), 'MMM', { locale: gantt.locale })}
      </p>
    )
    const columns = year.quarters.flatMap((quarter) => quarter.months).length
    return (
      <div className="relative flex flex-col" key={year.year}>
        <GanttContentHeader
          columns={columns}
          renderHeaderItem={renderMonth}
          title={`${year.year}`}
        />
        <GanttColumns columns={columns} />
      </div>
    )
  }
  return gantt.timelineData.map(renderYear)
}

/**
 * 渲染按季度时间轴表头。
 *
 * @param 无参数
 * @returns 季度表头 JSX
 */
const QuarterlyHeader: FC = () => {
  const gantt = useContext(GanttContext)

  /**
   * 渲染一年的季度。
   *
   * @param year - 年份记录
   * @returns 季度 JSX 列表
   */
  const renderYearList = (year: TimelineData[number]) => {
    /**
     * 渲染季度内的月份。
     *
     * @param quarter - 季度记录
     * @param index - 季度序号
     * @returns 季度 JSX
     */
    const renderQuarter = (
      quarter: TimelineData[number]['quarters'][number],
      index: number,
    ) => {
      /**
       * 渲染季度内月份名。
       *
       * @param item - 月序号
       * @returns 月份 JSX
       */
      const renderMonth = (item: number) => (
        <p>
          {format(new Date(year.year, index * 3 + item, 1), 'MMM', {
            locale: gantt.locale,
          })}
        </p>
      )
      return (
        <div className="relative flex flex-col" key={`${year.year}-${index}`}>
          <GanttContentHeader
            columns={quarter.months.length}
            renderHeaderItem={renderMonth}
            title={`Q${index + 1} ${year.year}`}
          />
          <GanttColumns columns={quarter.months.length} />
        </div>
      )
    }
    return year.quarters.map(renderQuarter)
  }
  return gantt.timelineData.map(renderYearList)
}

/**
 * 渲染按周分段的紧凑时间轴，仍保留逐日日期精度。
 *
 * @param 无参数
 * @returns 周表头 JSX
 */
const WeeklyHeader: FC = () => {
  const gantt = useContext(GanttContext)

  /**
   * 渲染一年的连续周分段。
   *
   * @param year - 年份记录
   * @returns 周表头 JSX 列表
   */
  const renderYearList = (year: TimelineData[number]) => {
    /**
     * 渲染一个实际周区间。
     *
     * @param week - 周起点与列数
     * @returns 周日期网格 JSX
     */
    const renderWeek = (week: { start: Date; days: number }) => {
      /**
       * 渲染周内日序号，并提供完整日期提示。
       *
       * @param item - 日偏移
       * @returns 日期 JSX
       */
      const renderDay = (item: number) => {
        const date = addDays(week.start, item)
        return (
          <p
            title={format(
              date,
              gantt.locale?.code === 'zh-CN' ? 'yyyy年M月d日 EEEE' : 'PPPP',
              { locale: gantt.locale },
            )}
          >
            {date.getDate()}
          </p>
        )
      }

      // 判断周内日期是否为周末。
      const isWeekend = (item: number) =>
        [0, 6].includes(addDays(week.start, item).getDay())
      const title = `${format(week.start, gantt.locale?.code === 'zh-CN' ? 'M月d日' : 'MMM d', { locale: gantt.locale })}—${format(addDays(week.start, week.days - 1), gantt.locale?.code === 'zh-CN' ? 'M月d日' : 'MMM d', { locale: gantt.locale })}`
      return (
        <div
          className="relative flex shrink-0 flex-col"
          style={{ width: `calc(var(--gantt-column-width) * ${week.days})` }}
          key={week.start.getTime()}
        >
          <GanttContentHeader
            columns={week.days}
            renderHeaderItem={renderDay}
            title={title}
          />
          <GanttColumns columns={week.days} isColumnSecondary={isWeekend} />
        </div>
      )
    }
    return getGanttWeekList(year.year).map(renderWeek)
  }
  return gantt.timelineData.map(renderYearList)
}

const headers: Record<Range, FC> = {
  daily: DailyHeader,
  weekly: WeeklyHeader,
  monthly: MonthlyHeader,
  quarterly: QuarterlyHeader,
}

export type GanttHeaderProps = {
  className?: string
}

/**
 * 渲染 Kibo Header 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttHeader: FC<GanttHeaderProps> = ({ className }) => {
  const gantt = useContext(GanttContext)
  const Header = headers[gantt.range]

  return (
    <div className={cn('flex h-full w-max', className)}>
      <Header />
    </div>
  )
}

export type GanttSidebarItemProps = {
  feature: GanttFeature
  onSelectItem?: (id: string) => void
  className?: string
  children?: ReactNode
  title?: string
}

/**
 * 渲染 Kibo SidebarItem 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttSidebarItem: FC<GanttSidebarItemProps> = ({
  feature,
  onSelectItem,
  className,
  children,
  title,
}) => {
  const gantt = useContext(GanttContext)
  const tempEndAt =
    feature.endAt && isSameDay(feature.startAt, feature.endAt)
      ? addDays(feature.endAt, 1)
      : feature.endAt
  const duration = formatDistance(feature.startAt, tempEndAt, {
    locale: gantt.locale,
  })

  // 平滑定位时间条，并通知调用方选择任务。
  const clickHandler = () => {
    gantt.scrollToFeature?.(feature)
    onSelectItem?.(feature.id)
  }

  return (
    <button
      type="button"
      className={cn(
        'hover:bg-secondary relative flex items-center gap-2.5 p-2.5 text-xs',
        className,
      )}
      key={feature.id}
      onClick={clickHandler}
      title={title}
      style={{
        height: 'var(--gantt-row-height)',
      }}
    >
      {children ?? (
        <>
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: feature.status.color }}
          />
          <span className="flex-1 truncate text-left font-medium">
            {feature.name}
          </span>
          <span className="text-muted-foreground">{duration}</span>
        </>
      )}
    </button>
  )
}

/**
 * 渲染 Kibo SidebarHeader 组件。
 *
 * @param 无参数
 * @returns 组件 JSX
 */
export const GanttSidebarHeader: FC = () => (
  <div
    className="border-border/50 bg-backdrop/90 text-muted-foreground sticky top-0 z-10 flex shrink-0 items-end justify-between gap-2.5 border-b p-2.5 text-xs font-medium backdrop-blur-sm"
    style={{ height: 'var(--gantt-header-height)' }}
  >
    {/* <Checkbox className="shrink-0" /> */}
    <p className="flex-1 truncate text-left">Issues</p>
    <p className="shrink-0">Duration</p>
  </div>
)

export type GanttSidebarGroupProps = {
  children: ReactNode
  name: string
  className?: string
}

/**
 * 渲染 Kibo SidebarGroup 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttSidebarGroup: FC<GanttSidebarGroupProps> = ({
  children,
  name,
  className,
}) => (
  <div className={className}>
    <p
      className="text-muted-foreground w-full truncate p-2.5 text-left text-xs font-medium"
      style={{ height: 'var(--gantt-row-height)' }}
    >
      {name}
    </p>
    <div className="divide-border/50 divide-y">{children}</div>
  </div>
)

export type GanttSidebarProps = {
  header?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * 渲染 Kibo Sidebar 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttSidebar: FC<GanttSidebarProps> = ({
  header,
  children,
  className,
}) => (
  <div
    className={cn(
      'border-border/50 bg-background/90 sticky left-0 z-30 h-max min-h-full overflow-clip border-r backdrop-blur-md',
      className,
    )}
    data-roadmap-ui="gantt-sidebar"
  >
    {header ?? <GanttSidebarHeader />}
    <div className="space-y-4">{children}</div>
  </div>
)

export type GanttAddFeatureHelperProps = {
  top: number
  className?: string
}

/**
 * 渲染 Kibo AddFeatureHelper 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttAddFeatureHelper: FC<GanttAddFeatureHelperProps> = ({
  top,
  className,
}) => {
  const [scrollX] = useGanttScrollX()
  const gantt = useContext(GanttContext)
  const [mousePosition, mouseRef] = useMouse<HTMLDivElement>()

  /**
   * 处理点击并触发当前组件的选择或添加回调。
   *
   * @param 无参数
   * @returns 无返回值；调用事件回调
   */
  const clickHandler = () => {
    const ganttRect = gantt.ref?.current?.getBoundingClientRect()
    const x =
      mousePosition.x - (ganttRect?.left ?? 0) + scrollX - gantt.sidebarWidth
    const currentDate = getDateByMousePosition(gantt, x)

    gantt.onAddItem?.(currentDate)
  }

  return (
    <div
      className={cn('absolute top-0 w-full px-0.5', className)}
      ref={mouseRef}
      style={{
        marginTop: -gantt.rowHeight / 2,
        transform: `translateY(${top}px)`,
      }}
    >
      <button
        className="flex h-full w-full items-center justify-center rounded-md border border-dashed p-2"
        onClick={clickHandler}
        type="button"
      >
        <PlusIcon
          className="text-muted-foreground pointer-events-none select-none"
          size={16}
        />
      </button>
    </div>
  )
}

export type GanttColumnProps = {
  index: number
  isColumnSecondary?: (item: number) => boolean
}

/**
 * 渲染 Kibo InteractiveColumn 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
const GanttInteractiveColumn: FC<GanttColumnProps> = ({
  index,
  isColumnSecondary,
}) => {
  const gantt = useContext(GanttContext)
  const [dragging] = useGanttDragging()
  const [mousePosition, mouseRef] = useMouse<HTMLDivElement>()
  const [hovering, setHovering] = useState(false)
  const [windowScroll] = useWindowScroll()

  // 显示列内添加入口。
  const mouseEnterHandler = () => setHovering(true)

  // 隐藏列内添加入口。
  const mouseLeaveHandler = () => setHovering(false)

  const [elementOffset, setElementOffset] = useState(0)
  useEffect(() => {
    const rect = mouseRef.current?.getBoundingClientRect()
    setElementOffset(rect?.y ?? 0)
  }, [mousePosition.y, mouseRef])

  const top = useThrottle(
    mousePosition.y - elementOffset - (windowScroll.y ?? 0),
    10,
  )

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: "This is a clickable column"
    // biome-ignore lint/nursery/noNoninteractiveElementInteractions: "This is a clickable column"
    <div
      className={cn(
        'group relative h-full overflow-hidden',
        isColumnSecondary?.(index) ? 'bg-secondary' : '',
      )}
      onMouseEnter={mouseEnterHandler}
      onMouseLeave={mouseLeaveHandler}
      ref={mouseRef}
    >
      {!dragging && hovering && gantt.onAddItem ? (
        <GanttAddFeatureHelper top={top} />
      ) : null}
    </div>
  )
}

/**
 * 渲染 Kibo Column 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttColumn: FC<GanttColumnProps> = (props) => {
  const gantt = useContext(GanttContext)
  return gantt.onAddItem ? (
    <GanttInteractiveColumn {...props} />
  ) : (
    <div
      className={cn(
        'relative h-full overflow-hidden',
        props.isColumnSecondary?.(props.index) && 'bg-secondary',
      )}
    />
  )
}

export type GanttColumnsProps = {
  columns: number
  isColumnSecondary?: (item: number) => boolean
}

/**
 * 渲染 Kibo Columns 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttColumns: FC<GanttColumnsProps> = ({
  columns,
  isColumnSecondary,
}) => {
  const id = useId()

  /**
   * 渲染一列日期背景。
   *
   * @param _value - 占位项
   * @param index - 列序号
   * @returns 背景列 JSX
   */
  const renderColumn = (_value: unknown, index: number) => (
    <GanttColumn
      index={index}
      isColumnSecondary={isColumnSecondary}
      key={`${id}-${index}`}
    />
  )

  return (
    <div
      className="divide divide-border/50 grid h-full w-full divide-x"
      style={{
        gridTemplateColumns: `repeat(${columns}, var(--gantt-column-width))`,
      }}
    >
      {Array.from({ length: columns }).map(renderColumn)}
    </div>
  )
}

export type GanttCreateMarkerTriggerProps = {
  onCreateMarker: (date: Date) => void
  className?: string
}

/**
 * 渲染 Kibo CreateMarkerTrigger 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttCreateMarkerTrigger: FC<GanttCreateMarkerTriggerProps> = ({
  onCreateMarker,
  className,
}) => {
  const gantt = useContext(GanttContext)
  const [mousePosition, mouseRef] = useMouse<HTMLDivElement>()
  const [windowScroll] = useWindowScroll()
  const [elementOffset, setElementOffset] = useState(0)
  useEffect(() => {
    const rect = mouseRef.current?.getBoundingClientRect()
    setElementOffset(rect?.x ?? 0)
  }, [mousePosition.x, mouseRef])

  const x = useThrottle(
    mousePosition.x - elementOffset - (windowScroll.x ?? 0),
    10,
  )

  const date = getDateByMousePosition(gantt, x)

  // 处理点击并触发当前组件的选择或添加回调。
  const clickHandler = () => onCreateMarker(date)

  return (
    <div
      className={cn(
        'group pointer-events-none absolute top-0 left-0 h-full w-full overflow-visible select-none',
        className,
      )}
      ref={mouseRef}
    >
      <div
        className="pointer-events-auto sticky top-6 z-20 -ml-2 flex w-4 flex-col items-center justify-center gap-1 overflow-visible opacity-0 group-hover:opacity-100"
        style={{ transform: `translateX(${x}px)` }}
      >
        <button
          className="bg-card z-50 inline-flex h-4 w-4 items-center justify-center rounded-full"
          onClick={clickHandler}
          type="button"
        >
          <PlusIcon className="text-muted-foreground" size={12} />
        </button>
        <div className="border-border/50 bg-background/90 text-foreground rounded-full border px-2 py-1 text-xs whitespace-nowrap backdrop-blur-lg">
          {formatDate(date, 'MMM dd, yyyy')}
        </div>
      </div>
    </div>
  )
}

export type GanttFeatureDragHelperProps = {
  featureId: GanttFeature['id']
  direction: 'left' | 'right'
  date: Date | null
}

/**
 * 渲染 Kibo FeatureDragHelper 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttFeatureDragHelper: FC<GanttFeatureDragHelperProps> = ({
  direction,
  featureId,
  date,
}) => {
  const gantt = useContext(GanttContext)
  const [, setDragging] = useGanttDragging()
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `feature-drag-helper-${featureId}`,
  })

  const isPressed = Boolean(attributes['aria-pressed'])

  useEffect(() => setDragging(isPressed), [isPressed, setDragging])

  return (
    <div
      className={cn(
        'group absolute top-1/2 z-[3] h-full w-4 -translate-y-1/2 !cursor-col-resize rounded-md outline-none',
        direction === 'left' ? '-left-2' : '-right-2',
      )}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={t(direction === 'left' ? '调整计划日期' : '调整截止日期')}
      tabIndex={-1}
      style={{ touchAction: 'none' }}
    >
      <div
        className={cn(
          'bg-muted-foreground absolute top-1/2 left-1/2 h-[80%] w-1 -translate-x-1/2 -translate-y-1/2 rounded-sm opacity-0 transition-opacity',
          'group-hover:opacity-100',
          isPressed && 'opacity-100',
        )}
      />
      {date && (
        <div
          className={cn(
            'border-border/50 bg-background/90 text-foreground absolute top-10 left-1/2 hidden -translate-x-1/2 rounded-lg border px-2 py-1 text-xs whitespace-nowrap backdrop-blur-lg group-hover:block',
            isPressed && 'block',
          )}
        >
          {format(
            direction === 'right' ? addDays(date, -1) : date,
            'yyyy年M月d日',
            { locale: gantt.locale },
          )}
        </div>
      )}
    </div>
  )
}

export type GanttFeatureItemCardProps = Pick<GanttFeature, 'id'> & {
  name?: string
  onSelect?: () => void
  children?: ReactNode
}

/**
 * 渲染 Kibo FeatureItemCard 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttFeatureItemCard: FC<GanttFeatureItemCardProps> = ({
  id,
  name,
  onSelect,
  children,
}) => {
  const [, setDragging] = useGanttDragging()
  const { attributes, listeners, setNodeRef } = useDraggable({ id })
  const isPressed = Boolean(attributes['aria-pressed'])

  useEffect(() => setDragging(isPressed), [isPressed, setDragging])

  return (
    <Card className="bg-background h-full w-full rounded-md p-2 text-xs shadow-sm">
      <button
        type="button"
        onClick={onSelect}
        aria-label={name ? t('编辑任务：{0}', name) : t('编辑任务')}
        className={cn(
          'flex h-full w-full items-center justify-between gap-2 text-left',
          isPressed && 'cursor-grabbing',
        )}
        {...attributes}
        {...listeners}
        aria-describedby={onSelect ? undefined : attributes['aria-describedby']}
        ref={setNodeRef}
      >
        {children}
      </button>
    </Card>
  )
}

export type GanttFeatureItemProps = GanttFeature & {
  onMove?: (id: string, startDate: Date, endDate: Date | null) => void
  onSelect?: (id: string) => void
  children?: ReactNode
  className?: string
}

/**
 * 渲染 Kibo FeatureItem 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttFeatureItem: FC<GanttFeatureItemProps> = ({
  onMove,
  onSelect,
  children,
  className,
  ...feature
}) => {
  const gantt = useContext(GanttContext)
  const timelineStartDate = useMemo(
    () => new Date(gantt.timelineData.at(0)?.year ?? 0, 0, 1),
    [gantt.timelineData],
  )
  const [dragPreview, setDragPreview] = useState<{
    part: 'move' | 'left' | 'right'
    delta: number
  } | null>(null)
  const [previewStartAt, setStartAt] = useState<Date>(feature.startAt)
  const [previewEndAt, setEndAt] = useState<Date | null>(feature.endAt)
  const startAt = dragPreview ? previewStartAt : feature.startAt
  const endAt = dragPreview ? previewEndAt : feature.endAt

  // Memoize expensive calculations
  const width = useMemo(
    () => getWidth(startAt, endAt, gantt),
    [startAt, endAt, gantt],
  )
  const offset = useMemo(
    () => getOffset(startAt, timelineStartDate, gantt),
    [startAt, timelineStartDate, gantt],
  )

  const addRange = useMemo(() => getAddRange(gantt.range), [gantt.range])
  const [previousStartAt, setPreviousStartAt] = useState(startAt)
  const [previousEndAt, setPreviousEndAt] = useState(endAt)
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  })

  /**
   * 保存拖动开始时的真实日期。
   *
   * @param 无参数
   * @returns 无返回值；更新拖动快照
   */
  const dragStartHandler = () => {
    setPreviousStartAt(feature.startAt)
    setPreviousEndAt(feature.endAt)
    setStartAt(feature.startAt)
    setEndAt(feature.endAt)
    setDragPreview({ part: 'move', delta: 0 })
  }

  /**
   * 按横向位移平移时间条，保留区间天数。
   *
   * @param event - 拖动或键盘事件
   * @returns 无返回值；更新日期预览
   */
  const itemDragMoveHandler = (event: DragMoveEvent) => {
    const originalOffset = getOffset(previousStartAt, timelineStartDate, gantt)
    const nextStart = getDateByMousePosition(
      gantt,
      originalOffset + event.delta.x,
    )
    const days = differenceInDays(nextStart, previousStartAt)
    setStartAt(nextStart)
    setEndAt(previousEndAt ? addDays(previousEndAt, days) : null)
    setDragPreview({ part: 'move', delta: event.delta.x })
  }

  // 通知调用方保存最终日期区间。
  const dragEndHandler = () => {
    onMove?.(feature.id, startAt, endAt)
    setDragPreview(null)
  }

  // 取消拖动并恢复开始时的日期。
  const dragCancelHandler = () => {
    setDragPreview(null)
  }

  /**
   * 按位移调整区间起点。
   *
   * @param event - 拖动或键盘事件
   * @returns 无返回值；更新起点预览
   */
  const leftDragMoveHandler = (event: DragMoveEvent) => {
    const originalOffset = getOffset(previousStartAt, timelineStartDate, gantt)
    setStartAt(getDateByMousePosition(gantt, originalOffset + event.delta.x))
    setDragPreview({ part: 'left', delta: event.delta.x })
  }

  /**
   * 按位移调整区间排他终点。
   *
   * @param event - 拖动或键盘事件
   * @returns 无返回值；更新终点预览
   */
  const rightDragMoveHandler = (event: DragMoveEvent) => {
    if (!previousEndAt) return
    const originalOffset = getOffset(previousEndAt, timelineStartDate, gantt)
    setEndAt(getDateByMousePosition(gantt, originalOffset + event.delta.x))
    setDragPreview({ part: 'right', delta: event.delta.x })
  }

  // 触发时间条的选择回调。
  const selectHandler = () => onSelect?.(feature.id)

  const position = dragPreview
    ? getGanttPreviewPosition(
        getOffset(previousStartAt, timelineStartDate, gantt),
        Math.max(24, getWidth(previousStartAt, previousEndAt, gantt)),
        dragPreview.part,
        dragPreview.delta,
      )
    : { offset, width: Math.max(24, width) }

  return (
    <div
      className={cn('relative flex w-max min-w-full py-0.5', className)}
      style={{ height: 'var(--gantt-row-height)' }}
    >
      <div
        className="pointer-events-auto absolute top-0.5"
        data-gantt-bar=""
        data-gantt-dragging={Boolean(dragPreview)}
        style={{
          height: 'calc(var(--gantt-row-height) - 4px)',

          // Short month-scale bars retain a center between the two resize handles.
          width: position.width,
          left: position.offset,
        }}
      >
        {onMove && (
          <DndContext
            modifiers={[restrictToHorizontalAxis]}
            onDragEnd={dragEndHandler}
            onDragStart={dragStartHandler}
            onDragCancel={dragCancelHandler}
            onDragMove={leftDragMoveHandler}
            sensors={[pointerSensor]}
          >
            <GanttFeatureDragHelper
              date={startAt}
              direction="left"
              featureId={feature.id}
            />
          </DndContext>
        )}
        <DndContext
          modifiers={[restrictToHorizontalAxis]}
          onDragEnd={dragEndHandler}
          onDragStart={dragStartHandler}
          onDragCancel={dragCancelHandler}
          onDragMove={itemDragMoveHandler}
          sensors={[pointerSensor]}
        >
          <GanttFeatureItemCard
            id={feature.id}
            name={feature.name}
            onSelect={selectHandler}
          >
            {children ?? (
              <p className="flex-1 truncate text-xs">{feature.name}</p>
            )}
          </GanttFeatureItemCard>
        </DndContext>
        {onMove && (
          <DndContext
            modifiers={[restrictToHorizontalAxis]}
            onDragEnd={dragEndHandler}
            onDragStart={dragStartHandler}
            onDragCancel={dragCancelHandler}
            onDragMove={rightDragMoveHandler}
            sensors={[pointerSensor]}
          >
            <GanttFeatureDragHelper
              date={endAt ?? addRange(startAt, 2)}
              direction="right"
              featureId={feature.id}
            />
          </DndContext>
        )}
      </div>
    </div>
  )
}

export type GanttFeatureListGroupProps = {
  children: ReactNode
  className?: string
}

/**
 * 渲染 Kibo FeatureListGroup 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttFeatureListGroup: FC<GanttFeatureListGroupProps> = ({
  children,
  className,
}) => (
  <div className={className} style={{ paddingTop: 'var(--gantt-row-height)' }}>
    {children}
  </div>
)

export type GanttFeatureRowProps = {
  features: GanttFeature[]
  onMove?: (id: string, startAt: Date, endAt: Date | null) => void
  children?: (feature: GanttFeature) => ReactNode
  className?: string
}

/**
 * 渲染 Kibo FeatureRow 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttFeatureRow: FC<GanttFeatureRowProps> = ({
  features,
  onMove,
  children,
  className,
}) => {
  // Sort features by start date to handle potential overlaps
  const sortedFeatures = [...features].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  )

  // Calculate sub-row positions for overlapping features using a proper algorithm
  const featureWithPositions = []
  const subRowEndTimes: Date[] = [] // Track when each sub-row becomes free

  for (const feature of sortedFeatures) {
    let subRow = 0

    // Find the first sub-row that's free (doesn't overlap)
    while (
      subRow < subRowEndTimes.length &&
      subRowEndTimes[subRow] > feature.startAt
    ) {
      subRow++
    }

    // Update the end time for this sub-row
    if (subRow === subRowEndTimes.length) {
      subRowEndTimes.push(feature.endAt)
    } else {
      subRowEndTimes[subRow] = feature.endAt
    }

    featureWithPositions.push({ ...feature, subRow })
  }

  const maxSubRows = Math.max(1, subRowEndTimes.length)
  const subRowHeight = 36 // Base row height

  /**
   * 渲染具有内部泳道位置的时间条。
   *
   * @param feature - 区间与泳道位置
   * @returns 时间条 JSX
   */
  const renderFeature = (feature: GanttFeature & { subRow: number }) => (
    <div
      className="absolute w-full"
      key={feature.id}
      style={{
        top: `${feature.subRow * subRowHeight}px`,
        height: `${subRowHeight}px`,
      }}
    >
      <GanttFeatureItem {...feature} onMove={onMove}>
        {children ? (
          children(feature)
        ) : (
          <p className="flex-1 truncate text-xs">{feature.name}</p>
        )}
      </GanttFeatureItem>
    </div>
  )

  return (
    <div
      className={cn('relative', className)}
      style={{
        height: `${maxSubRows * subRowHeight}px`,
        minHeight: 'var(--gantt-row-height)',
      }}
    >
      {featureWithPositions.map(renderFeature)}
    </div>
  )
}

export type GanttFeatureListProps = {
  className?: string
  children: ReactNode
}

/**
 * 渲染 Kibo FeatureList 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttFeatureList: FC<GanttFeatureListProps> = ({
  className,
  children,
}) => (
  <div
    className={cn('absolute top-0 left-0 h-full w-max space-y-4', className)}
    style={{ marginTop: 'var(--gantt-header-height)' }}
  >
    {children}
  </div>
)

/**
 * 渲染 Kibo Marker 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttMarker: FC<
  GanttMarkerProps & {
    onRemove?: (id: string) => void
    className?: string
  }
> = memo(({ label, date, id, onRemove, className }) => {
  const gantt = useContext(GanttContext)
  const differenceIn = useMemo(
    () => getDifferenceIn(gantt.range),
    [gantt.range],
  )
  const timelineStartDate = useMemo(
    () => new Date(gantt.timelineData.at(0)?.year ?? 0, 0, 1),
    [gantt.timelineData],
  )

  // Memoize expensive calculations
  const offset = useMemo(
    () => differenceIn(date, timelineStartDate),
    [differenceIn, date, timelineStartDate],
  )
  const innerOffset = useMemo(
    () =>
      calculateInnerOffset(
        date,
        gantt.range,
        (gantt.columnWidth * gantt.zoom) / 100,
      ),
    [date, gantt.range, gantt.columnWidth, gantt.zoom],
  )

  /**
   * 触发标记删除回调。
   *
   * @param 无参数
   * @returns 无返回值；通知调用方删除标记
   */
  const removeHandler = useCallback(() => onRemove?.(id), [onRemove, id])

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-20 flex h-full flex-col items-center justify-center overflow-visible select-none"
      style={{
        width: 0,
        transform: `translateX(calc(var(--gantt-column-width) * ${offset} + ${innerOffset}px))`,
      }}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              'group bg-card text-foreground pointer-events-auto sticky top-0 flex flex-col flex-nowrap items-center justify-center rounded-b-md px-2 py-1 text-xs whitespace-nowrap select-auto',
              className,
            )}
          >
            {label}
            <span className="max-h-[0] overflow-hidden opacity-80 transition-all group-hover:max-h-[2rem]">
              {formatDate(date, 'MMM dd, yyyy')}
            </span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {onRemove ? (
            <ContextMenuItem
              className="text-destructive flex items-center gap-2"
              onClick={removeHandler}
            >
              <TrashIcon size={16} />
              Remove marker
            </ContextMenuItem>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
      <div className={cn('bg-card h-full w-px', className)} />
    </div>
  )
})

GanttMarker.displayName = 'GanttMarker'

export type GanttProviderProps = {
  initialDate?: Date
  endDate?: Date
  locale?: Locale
  range?: Range
  zoom?: number
  onAddItem?: (date: Date) => void
  children: ReactNode
  className?: string
}

/**
 * 渲染 Kibo Provider 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttProvider: FC<GanttProviderProps> = ({
  initialDate,
  endDate,
  locale,
  zoom = 100,
  range = 'monthly',
  onAddItem,
  children,
  className,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prependOffsetRef = useRef<number | null>(null)
  const [anchorDate] = useState(() => initialDate ?? new Date())
  const [timelineData, setTimelineData] = useState<TimelineData>(
    buildInitialTimelineDataList(anchorDate, endDate ?? anchorDate),
  )
  const [, setScrollX] = useGanttScrollX()
  const [sidebarWidth, setSidebarWidth] = useState(0)

  const headerHeight = 60
  const rowHeight = 36
  let columnWidth = 50

  if (range === 'weekly') {
    columnWidth = 24
  } else if (range === 'monthly') {
    columnWidth = 150
  } else if (range === 'quarterly') {
    columnWidth = 100
  }

  // Memoize CSS variables to prevent unnecessary re-renders
  const cssVariables = useMemo(
    () =>
      ({
        '--gantt-zoom': `${zoom}`,
        '--gantt-column-width': `${(zoom / 100) * columnWidth}px`,
        '--gantt-header-height': `${headerHeight}px`,
        '--gantt-row-height': `${rowHeight}px`,
        '--gantt-sidebar-width': `${sidebarWidth}px`,
      }) as CSSProperties,
    [zoom, columnWidth, sidebarWidth],
  )

  const initialOffset = getOffset(
    anchorDate,
    new Date(anchorDate.getFullYear() - 1, 0, 1),
    { zoom, range, columnWidth },
  )
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = initialOffset
      setScrollX(scrollRef.current.scrollLeft)
    }
  }, [initialOffset, setScrollX])

  /**
   * 读取侧栏实际宽度并同步时间轴网格。
   *
   * @param 无参数
   * @returns 无返回值；更新侧栏宽度
   */
  const updateSidebarWidth = useCallback(() => {
    const sidebarElement = scrollRef.current?.querySelector(
      '[data-roadmap-ui="gantt-sidebar"]',
    )
    const newWidth = sidebarElement?.getBoundingClientRect().width ?? 0
    setSidebarWidth(newWidth)
  }, [])

  // Update sidebar width when DOM is ready or the viewport changes.
  useEffect(() => {
    // Update immediately
    updateSidebarWidth()

    // Also update on resize or when children change
    const observer = new ResizeObserver(updateSidebarWidth)
    const sidebarElement = scrollRef.current?.querySelector(
      '[data-roadmap-ui="gantt-sidebar"]',
    )
    if (sidebarElement) observer.observe(sidebarElement)
    window.addEventListener('resize', updateSidebarWidth)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateSidebarWidth)
    }
  }, [updateSidebarWidth])

  // Preserve the visible dates when a preceding year is inserted.
  useLayoutEffect(() => {
    if (scrollRef.current && prependOffsetRef.current !== null) {
      scrollRef.current.scrollLeft = prependOffsetRef.current
      setScrollX(scrollRef.current.scrollLeft)
      prependOffsetRef.current = null
    }
  }, [timelineData, setScrollX])

  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    /**
     * 同步滚动位置并在边缘补充时间轴年份。
     *
     * @param 无参数
     * @returns 无返回值；更新位置与时间轴
     */
    const scrollHandler = throttle(() => {
      const { scrollLeft, scrollWidth, clientWidth } = scrollElement
      setScrollX(scrollLeft)

      if (scrollLeft === 0) {
        // Extend timelineData to the past
        const firstYear = timelineData[0]?.year

        if (!firstYear) {
          return
        }

        const newTimelineData: TimelineData = [...timelineData]
        newTimelineData.unshift(buildTimelineYear(firstYear - 1))

        prependOffsetRef.current = getOffset(
          new Date(firstYear, 0, 1),
          new Date(firstYear - 1, 0, 1),
          { zoom, range, columnWidth },
        )
        setTimelineData(newTimelineData)
      } else if (scrollLeft + clientWidth >= scrollWidth) {
        // Extend timelineData to the future
        const lastYear = timelineData.at(-1)?.year

        if (!lastYear) {
          return
        }

        const newTimelineData: TimelineData = [...timelineData]
        newTimelineData.push(buildTimelineYear(lastYear + 1))

        setTimelineData(newTimelineData)

        // Scroll a bit back so it's not at the very end
        scrollElement.scrollLeft =
          scrollElement.scrollWidth - scrollElement.clientWidth
        setScrollX(scrollElement.scrollLeft)
      }
    }, 100)
    scrollElement.addEventListener('scroll', scrollHandler)
    return () => {
      scrollElement.removeEventListener('scroll', scrollHandler)
      scrollHandler.cancel()
    }
  }, [timelineData, setScrollX, zoom, range, columnWidth])

  /**
   * 将任务起点滚动到侧栏旁，遵循减少动态效果设置。
   *
   * @param feature - 目标任务区间
   * @returns 无返回值；滚动时间轴
   */
  const scrollToFeature = useCallback(
    (feature: GanttFeature) => {
      const scrollElement = scrollRef.current
      if (!scrollElement) {
        return
      }
      updateSidebarWidth()

      // Calculate timeline start date from timelineData
      const timelineStartDate = new Date(timelineData[0].year, 0, 1)

      // Calculate the horizontal offset for the feature's start date
      const offset = getOffset(feature.startAt, timelineStartDate, {
        zoom,
        range,
        columnWidth,
      })

      // Scroll to align the feature's start with the right side of the sidebar
      const targetScrollLeft = Math.max(0, offset)

      scrollElement.scrollTo({
        left: targetScrollLeft,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      })
    },
    [timelineData, zoom, range, columnWidth, updateSidebarWidth],
  )

  return (
    <GanttContext.Provider
      value={{
        zoom,
        range,
        locale,
        headerHeight,
        columnWidth,
        sidebarWidth,
        rowHeight,
        onAddItem,
        timelineData,
        placeholderLength: 2,
        ref: scrollRef,
        scrollToFeature,
      }}
    >
      <div
        className={cn(
          'gantt bg-secondary relative isolate grid h-full w-full flex-none overflow-auto rounded-sm select-none',
          range,
          className,
        )}
        ref={scrollRef}
        style={{
          ...cssVariables,
          gridTemplateColumns: 'var(--gantt-sidebar-width) 1fr',
        }}
      >
        {children}
      </div>
    </GanttContext.Provider>
  )
}

export type GanttTimelineProps = {
  children: ReactNode
  className?: string
}

/**
 * 渲染 Kibo Timeline 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttTimeline: FC<GanttTimelineProps> = ({
  children,
  className,
}) => (
  <div
    className={cn(
      'relative flex h-full w-max flex-none overflow-clip',
      className,
    )}
  >
    {children}
  </div>
)

export type GanttTodayProps = {
  className?: string
}

/**
 * 渲染 Kibo Today 组件。
 *
 * @param props - 组件属性与子内容
 * @returns 组件 JSX
 */
export const GanttToday: FC<GanttTodayProps> = ({ className }) => {
  const label = 'Today'
  const [date] = useState(() => new Date())
  const gantt = useContext(GanttContext)
  const differenceIn = useMemo(
    () => getDifferenceIn(gantt.range),
    [gantt.range],
  )
  const timelineStartDate = useMemo(
    () => new Date(gantt.timelineData.at(0)?.year ?? 0, 0, 1),
    [gantt.timelineData],
  )

  // Memoize expensive calculations
  const offset = useMemo(
    () => differenceIn(date, timelineStartDate),
    [differenceIn, date, timelineStartDate],
  )
  const innerOffset = useMemo(
    () =>
      calculateInnerOffset(
        date,
        gantt.range,
        (gantt.columnWidth * gantt.zoom) / 100,
      ),
    [date, gantt.range, gantt.columnWidth, gantt.zoom],
  )

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-20 flex h-full flex-col items-center justify-center overflow-visible select-none"
      style={{
        width: 0,
        transform: `translateX(calc(var(--gantt-column-width) * ${offset} + ${innerOffset}px))`,
      }}
    >
      <div
        className={cn(
          'group bg-card text-foreground pointer-events-auto sticky top-0 flex flex-col flex-nowrap items-center justify-center rounded-b-md px-2 py-1 text-xs whitespace-nowrap select-auto',
          className,
        )}
      >
        {label}
        <span className="max-h-[0] overflow-hidden opacity-80 transition-all group-hover:max-h-[2rem]">
          {formatDate(date, 'MMM dd, yyyy')}
        </span>
      </div>
      <div className={cn('bg-card h-full w-px', className)} />
    </div>
  )
}
