import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  getDaysInMonth,
  isSameDay,
  startOfMonth,
} from 'date-fns'

type GanttScale = {
  range: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  columnWidth: number
  zoom: number
}
type GanttTimelineScale = GanttScale & { timelineData: { year: number }[] }

/** 将时间轴像素转换为本地日历日期，月尺度按实际天数换算。
 * @param context - 时间尺度与起始年
 * @param mouseX - 时间轴内横向像素，已扣除侧栏和页面位置
 * @returns 对应日期
 */
export const getGanttDateAtOffset = (
  context: GanttTimelineScale,
  mouseX: number,
): Date => {
  const origin = new Date(context.timelineData[0].year, 0, 1)
  const columnWidth = (context.columnWidth * context.zoom) / 100
  // Avoid moving a boundary date back one day at fractional zoom levels.
  const offset = Math.floor(mouseX / columnWidth + 0.000001)
  if (context.range === 'daily' || context.range === 'weekly')
    return addDays(origin, offset)
  const month = addMonths(origin, offset)
  const dayOffset = Math.floor(
    (mouseX / columnWidth - offset) * getDaysInMonth(month) + 0.000001,
  )
  return addDays(month, dayOffset)
}

/** 将本地日历日期转换为时间轴位置，月初从零偏移起算。
 * @param date - 日期
 * @param origin - 时间轴原点
 * @param context - 时间尺度
 * @returns 横向像素偏移
 */
export const getGanttDateOffset = (
  date: Date,
  origin: Date,
  context: GanttScale,
): number => {
  const columnWidth = (context.columnWidth * context.zoom) / 100
  if (context.range === 'daily' || context.range === 'weekly')
    return differenceInCalendarDays(date, origin) * columnWidth
  const months = differenceInCalendarMonths(
    startOfMonth(date),
    startOfMonth(origin),
  )
  return (
    months * columnWidth +
    ((date.getDate() - 1) * columnWidth) / getDaysInMonth(date)
  )
}

/** 按两端位置计算时间条宽度，保持跨月和夏令时一致。
 * @param startAt - 起点
 * @param endAt - 排他终点；同日兼容上游单日条，空值兼容开放区间
 * @param context - 时间轴尺度与起始年
 * @returns 时间条像素宽度
 */
export const getGanttWidth = (
  startAt: Date,
  endAt: Date | null,
  context: GanttTimelineScale,
): number => {
  if (!endAt) return ((context.columnWidth * context.zoom) / 100) * 2
  const origin = new Date(context.timelineData[0].year, 0, 1)
  const end = isSameDay(startAt, endAt) ? addDays(endAt, 1) : endAt
  return Math.max(
    1,
    getGanttDateOffset(end, origin, context) -
      getGanttDateOffset(startAt, origin, context),
  )
}

/** 按周一到周日拆分一年的日期，年首与年尾保留实际天数。
 * @param year - 年份
 * @returns 连续、不重叠的周分段列表
 */
export const getGanttWeekList = (
  year: number,
): { start: Date; days: number }[] => {
  const weekList: { start: Date; days: number }[] = []
  const end = new Date(year + 1, 0, 1)
  let start = new Date(year, 0, 1)
  while (start < end) {
    const days = Math.min(
      8 - (start.getDay() || 7),
      differenceInCalendarDays(end, start),
    )
    weekList.push({ start, days })
    start = addDays(start, days)
  }
  return weekList
}

/** 使用连续像素预览时间条，日期吸附独立在释放时生效。
 * @param offset - 原位置
 * @param width - 原可视宽度
 * @param part - 平移或调整的一端
 * @param delta - 鼠标横向位移
 * @returns 时间条的位置与宽度
 */
export const getGanttPreviewPosition = (
  offset: number,
  width: number,
  part: 'move' | 'left' | 'right',
  delta: number,
): { offset: number; width: number } => ({
  offset: part === 'right' ? offset : offset + delta,
  width: Math.max(
    24,
    part === 'move' ? width : width + (part === 'right' ? delta : -delta),
  ),
})
