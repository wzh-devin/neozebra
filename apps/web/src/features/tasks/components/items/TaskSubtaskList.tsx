import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import { toast } from 'sonner'
import { taskToastOptions } from '@/features/tasks/utils/task-toast'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { TaskSubtask } from '@/features/tasks/types'
import styles from '@/features/tasks/components/items/TaskRow.module.css'

type Props = {
  subtasks: TaskSubtask[]
  onChange: (steps: TaskSubtask[]) => boolean
}

/**
 * 编辑一层子任务，支持键盘与明确的排序操作。
 *
 * @param props - 步骤与保存操作
 * @returns 步骤清单 JSX
 */
export const TaskSubtaskList = ({ subtasks, onChange }: Props) => {
  const [title, setTitle] = useState('')

  // 更新新增步骤输入。
  const titleChangeHandler = (event: ChangeEvent<HTMLInputElement>): void =>
    setTitle(event.target.value)

  /**
   * 提交新步骤，成功后清空。
   *
   * @param event - 表单事件
   * @returns 无返回值；添加步骤
   */
  const addStepHandler = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (
      title.trim() &&
      onChange([
        ...subtasks,
        { id: crypto.randomUUID(), title: title.trim(), completed: false },
      ])
    )
      setTitle('')
  }

  /**
   * 渲染步骤及其独立操作。
   *
   * @param step - 子任务
   * @param index - 当前顺序
   * @returns 子任务 JSX
   */
  const renderStep = (step: TaskSubtask, index: number) => {
    /**
     * 切换步骤完成状态。
     *
     * @param checked - 选中状态
     * @returns 无返回值；更新步骤
     */
    const checkedChangeHandler = (checked: boolean | 'indeterminate'): void => {
      onChange(
        subtasks.map((entry) =>
          entry.id === step.id
            ? { ...entry, completed: checked === true }
            : entry,
        ),
      )
    }

    /**
     * 保存步骤标题，失败时保留输入。
     *
     * @param event - 失焦事件
     * @returns 无返回值；保存步骤
     */
    const renameHandler = (event: FocusEvent<HTMLInputElement>): void => {
      const next = event.currentTarget.value.trim()
      if (!next) {
        toast.error('步骤标题不能为空', taskToastOptions)
        return
      }
      if (next !== step.title)
        onChange(
          subtasks.map((entry) =>
            entry.id === step.id ? { ...entry, title: next } : entry,
          ),
        )
    }

    /**
     * Enter 提交标题。
     *
     * @param event - 键盘事件
     * @returns 无返回值；触发标题保存
     */
    const keyDownHandler = (event: KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Enter') {
        event.preventDefault()
        event.currentTarget.blur()
      }
    }

    // 删除步骤。
    const deleteHandler = (): void => {
      onChange(subtasks.filter((entry) => entry.id !== step.id))
    }

    /**
     * 调整步骤顺序。
     *
     * @param direction - 方向
     * @returns 无返回值；保存顺序
     */
    const moveHandler = (direction: -1 | 1): void => {
      const next = [...subtasks]
      ;[next[index], next[index + direction]] = [
        next[index + direction],
        next[index],
      ]
      onChange(next)
    }

    // 上移当前步骤。
    const upHandler = (): void => moveHandler(-1)

    // 下移当前步骤。
    const downHandler = (): void => moveHandler(1)
    return (
      <li
        key={step.id}
        className={styles.subtask}
        data-completed={step.completed}
      >
        <Checkbox
          checked={step.completed}
          aria-label={`完成步骤：${step.title}`}
          onCheckedChange={checkedChangeHandler}
        />
        <Input
          key={`${step.id}:${step.title}`}
          defaultValue={step.title}
          maxLength={200}
          aria-label="步骤标题"
          onBlur={renameHandler}
          onKeyDown={keyDownHandler}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="上移步骤"
          disabled={index === 0}
          onClick={upHandler}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="下移步骤"
          disabled={index === subtasks.length - 1}
          onClick={downHandler}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`删除步骤：${step.title}`}
          onClick={deleteHandler}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </li>
    )
  }
  return (
    <div className={styles.subtasks}>
      <ul>{subtasks.map(renderStep)}</ul>
      <form className={styles.quickAdd} onSubmit={addStepHandler}>
        <Plus aria-hidden="true" />
        <Input
          value={title}
          maxLength={200}
          aria-label="新增步骤"
          placeholder="添加一个步骤…"
          onChange={titleChangeHandler}
        />
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          disabled={!title.trim()}
        >
          添加
        </Button>
      </form>
    </div>
  )
}
