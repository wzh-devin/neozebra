import { Trash2 } from 'lucide-react'

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
import surfaceStyles from '@/features/tasks/styles/task-surfaces.module.css'

type TaskDeleteAlertDialogProps = {
  task: TaskItem
  deleteTaskHandler: () => void
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
}: TaskDeleteAlertDialogProps) => (
  <AlertDialog>
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
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction onClick={deleteTaskHandler} variant="destructive">
          删除任务
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

export { TaskDeleteAlertDialog }
