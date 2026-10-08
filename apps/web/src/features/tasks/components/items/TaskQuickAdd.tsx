import { Plus } from 'lucide-react'
import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildTask } from '@/features/tasks/data/task-planner'
import { useTaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'
import styles from '@/features/tasks/components/items/TaskRow.module.css'

/** 在日期或项目阶段内连续记录任务。
 * @param props - 日期、项目和阶段上下文
 * @returns 行内新增表单 JSX
 */
export const TaskQuickAdd = ({
  plannedDate = null,
  projectId = null,
  sectionId = null,
}: {
  plannedDate?: string | null
  projectId?: string | null
  sectionId?: string | null
}) => {
  const { saveTaskHandler, isReadError } = useTaskPlannerContext()
  const [title, setTitle] = useState('')
  /** 保留新增输入。
   * @param event - 输入事件
   * @returns 无返回值；更新输入
   */
  const titleChangeHandler = (event: ChangeEvent<HTMLInputElement>): void =>
    setTitle(event.target.value)
  /** 保存任务，仅成功后清空输入。
   * @param event - 提交事件
   * @returns 无返回值；添加任务
   */
  const submitHandler = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (
      title.trim() &&
      saveTaskHandler(buildTask(title, projectId, plannedDate, sectionId))
    )
      setTitle('')
  }
  /** Escape 清空当前新增输入。
   * @param event - 键盘事件
   * @returns 无返回值；清空输入
   */
  const keyDownHandler = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') setTitle('')
  }
  return (
    <form className={styles.quickAdd} onSubmit={submitHandler}>
      <Plus aria-hidden="true" />
      <Input
        aria-label="快速添加任务"
        placeholder="添加任务，按 Enter 保存…"
        maxLength={200}
        value={title}
        onChange={titleChangeHandler}
        onKeyDown={keyDownHandler}
        disabled={isReadError}
      />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={!title.trim() || isReadError}
      >
        添加
      </Button>
    </form>
  )
}
