import { Trash2 } from 'lucide-react'
import { useState, type MouseEvent } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { TaskItem } from '@/features/tasks/types'
import { useTaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

type TaskDeleteAlertDialogProps = {
  task: TaskItem
  deleteTaskHandler: () => Promise<boolean>
}

/**
 * 渲染当前任务的删除确认对话框。
 *
 * @param props - 待删除任务和确认操作
 * @returns shadcn AlertDialog 删除确认 JSX
 */
const TaskDeleteAlertDialog = ({
  task,
  deleteTaskHandler,
}: TaskDeleteAlertDialogProps) => {
  const [open, setOpen] = useState(false)
  const { isSaving } = useTaskPlannerContext()

  // 保存期间保持确认框，失败后可原位重试。
  const openChangeHandler = (value: boolean): void => {
    if (!isSaving) setOpen(value)
  }

  /**
   * 等服务端确认删除后关闭，失败不丢失操作上下文。
   *
   * @param event - 确认按钮事件
   * @returns 无返回值；删除成功后关闭弹层
   */
  const confirmDeleteHandler = async (
    event: MouseEvent<HTMLButtonElement>,
  ): Promise<void> => {
    event.preventDefault()
    if (await deleteTaskHandler()) setOpen(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={openChangeHandler}>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`删除任务：${task.title}`}
          size="icon-sm"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className={surfaceStyles.surface}>
        <AlertDialogHeader>
          <AlertDialogTitle>删除这个任务？</AlertDialogTitle>
          <AlertDialogDescription>
            将删除“{task.title}”及其步骤。你可以通过操作提示撤销最近一次删除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDeleteHandler}
            disabled={isSaving}
            variant="destructive"
          >
            删除任务
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { TaskDeleteAlertDialog }
