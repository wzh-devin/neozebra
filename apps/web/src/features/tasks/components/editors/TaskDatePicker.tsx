import { CalendarDays, X } from 'lucide-react'
import { zhCN } from 'date-fns/locale'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  addDays,
  formatTaskDate,
  getLocalDate,
} from '@/features/tasks/data/task-planner'

type Props = {
  label: string
  value: string | null
  onChange: (value: string | null) => void
}

/** 组合官方 Calendar 与 Popover 选择独立日期。
 * @param props - 名称、日期与更新操作
 * @returns 日期选择器 JSX
 */
export const TaskDatePicker = ({ label, value, onChange }: Props) => {
  const [open, setOpen] = useState(false)
  /** 接受日期后收起日历。
   * @param next - 选择的日期
   * @returns 无返回值；更新日期和弹层状态
   */
  const changeHandler = (next: string | null): void => {
    onChange(next)
    setOpen(false)
  }
  /** 更新日历选中日期。
   * @param date - 选择结果
   * @returns 无返回值；更新日期
   */
  const dateSelectHandler = (date: Date | undefined): void =>
    changeHandler(date ? getLocalDate(date) : null)
  /** 设置今天。
   * @param 无参数
   * @returns 无返回值；更新日期
   */
  const todayHandler = (): void => changeHandler(getLocalDate())
  /** 设置明天。
   * @param 无参数
   * @returns 无返回值；更新日期
   */
  const tomorrowHandler = (): void => changeHandler(addDays(getLocalDate(), 1))
  /** 清除日期。
   * @param 无参数
   * @returns 无返回值；更新日期
   */
  const clearHandler = (): void => changeHandler(null)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`${label}：${value ?? '未设置'}`}
        >
          <CalendarDays aria-hidden="true" />
          {value ? formatTaskDate(value) : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <p className="px-2 py-1 text-sm font-medium">{label}</p>
        <Calendar
          locale={zhCN}
          mode="single"
          autoFocus
          selected={value ? new Date(`${value}T12:00:00`) : undefined}
          defaultMonth={value ? new Date(`${value}T12:00:00`) : undefined}
          onSelect={dateSelectHandler}
        />
        <div className="flex flex-wrap gap-1 border-t pt-2">
          <Button size="sm" variant="ghost" onClick={todayHandler}>
            今天
          </Button>
          <Button size="sm" variant="ghost" onClick={tomorrowHandler}>
            明天
          </Button>
          <Button size="sm" variant="ghost" onClick={clearHandler}>
            <X aria-hidden="true" />
            清除
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
