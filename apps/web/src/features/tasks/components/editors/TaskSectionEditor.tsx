import { Pencil, Plus } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'
import type { TaskSection } from '@/features/tasks/types'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

/**
 * 在项目内新增或重命名阶段。
 *
 * @param props - 当前阶段与项目
 * @returns 阶段编辑 Popover JSX
 */
export const TaskSectionEditor = ({
  projectId,
  section,
}: {
  projectId: string
  section?: TaskSection
}) => {
  const { saveSectionHandler } = useTaskPlannerContext()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(section?.title ?? '')

  // 更新名称输入。
  const titleChangeHandler = (event: ChangeEvent<HTMLInputElement>): void =>
    setTitle(event.target.value)

  /**
   * 保存阶段，失败时保留名称。
   *
   * @param event - 提交事件
   * @returns 无返回值；保存并关闭
   */
  const submitHandler = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (
      title.trim() &&
      saveSectionHandler({
        id: section?.id ?? crypto.randomUUID(),
        projectId,
        title: title.trim(),
      })
    ) {
      setOpen(false)
      if (!section) setTitle('')
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={section ? 'icon-sm' : 'sm'}
          aria-label={section ? `重命名阶段：${section.title}` : '添加阶段'}
        >
          {section ? (
            <Pencil aria-hidden="true" />
          ) : (
            <>
              <Plus aria-hidden="true" />
              添加阶段
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className={surfaceStyles.surface}>
        <form onSubmit={submitHandler} className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            {section ? '重命名阶段' : '添加项目阶段'}
          </p>
          <Input
            aria-label="阶段名称"
            autoFocus
            value={title}
            maxLength={80}
            onChange={titleChangeHandler}
            placeholder="例如：需求梳理"
            required
          />
          <Button type="submit" size="sm">
            保存阶段
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
