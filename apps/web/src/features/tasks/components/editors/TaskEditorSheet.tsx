import { useState, type ChangeEvent, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { TaskDatePicker } from '@/features/tasks/components/editors/TaskDatePicker'
import { TaskSubtaskList } from '@/features/tasks/components/items/TaskSubtaskList'
import { restoreTaskFocusHandler } from '@/features/tasks/utils/task-focus'
import {
  buildTask,
  priorityLabelRecord,
  statusLabelRecord,
} from '@/features/tasks/data/task-planner'
import { useTaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'
import type {
  TaskItem,
  TaskPriority,
  TaskStatus,
  TaskSubtask,
} from '@/features/tasks/types'
import styles from '@/features/tasks/components/editors/TaskEditorSheet.module.css'

type Props = {
  task?: TaskItem
  projectId?: string | null
  plannedDate?: string | null
  onClose: () => void
}

/** 编辑完整任务，保存失败时保留整个草稿。
 * @param props - 原任务、新建上下文与关闭操作
 * @returns 编辑抽屉 JSX
 */
export const TaskEditorSheet = ({
  task,
  projectId = null,
  plannedDate = null,
  onClose,
}: Props) => {
  const { data, saveTaskHandler } = useTaskPlannerContext()
  const [originalTask] = useState(task)
  const [draft, setDraft] = useState<TaskItem>(
    () => task ?? buildTask('', projectId, plannedDate),
  )
  const [labelsText, setLabelsText] = useState(task?.labels.join(', ') ?? '')
  const [saveError, setSaveError] = useState('')

  /** 更新标题或描述。
   * @param event - 输入事件
   * @returns 无返回值；更新草稿
   */
  const textChangeHandler = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void => {
    const { name, value } = event.currentTarget
    if (name === 'title' || name === 'description')
      setDraft((current) => ({ ...current, [name]: value }))
  }
  /** 更新任务项目并清除旧阶段。
   * @param value - 项目标识
   * @returns 无返回值；更新草稿关联
   */
  const projectChangeHandler = (value: string): void =>
    setDraft((current) => ({
      ...current,
      projectId: value === 'none' ? null : value,
      sectionId: null,
    }))
  /** 更新阶段。
   * @param value - 阶段标识
   * @returns 无返回值；更新草稿
   */
  const sectionChangeHandler = (value: string): void =>
    setDraft((current) => ({
      ...current,
      sectionId: value === 'none' ? null : value,
    }))
  /** 更新优先级。
   * @param value - 优先级
   * @returns 无返回值；更新草稿
   */
  const priorityChangeHandler = (value: string): void => {
    if (value === 'high' || value === 'medium' || value === 'low')
      setDraft((current) => ({ ...current, priority: value as TaskPriority }))
  }
  /** 更新执行状态，完成须通过任务行的明确流程。
   * @param value - 状态
   * @returns 无返回值；更新草稿
   */
  const statusChangeHandler = (value: string): void => {
    if (value === 'todo' || value === 'inProgress')
      setDraft((current) => ({
        ...current,
        status: value as TaskStatus,
        completedAt: null,
      }))
  }
  /** 更新计划日期。
   * @param value - 日期
   * @returns 无返回值；更新草稿
   */
  const plannedDateHandler = (value: string | null): void =>
    setDraft((current) => ({ ...current, plannedDate: value }))
  /** 更新截止日期。
   * @param value - 日期
   * @returns 无返回值；更新草稿
   */
  const deadlineDateHandler = (value: string | null): void =>
    setDraft((current) => ({ ...current, deadlineDate: value }))
  /** 更新预计分钟数。
   * @param event - 输入事件
   * @returns 无返回值；更新草稿
   */
  const estimateChangeHandler = (event: ChangeEvent<HTMLInputElement>): void =>
    setDraft((current) => ({
      ...current,
      estimateMinutes:
        event.target.value === '' ? null : Number(event.target.value),
    }))
  /** 保留标签输入，允许连续输入分隔符。
   * @param event - 输入事件
   * @returns 无返回值；更新标签文本
   */
  const labelsChangeHandler = (event: ChangeEvent<HTMLInputElement>): void =>
    setLabelsText(event.target.value)
  /** 编辑步骤时同步主任务状态。
   * @param steps - 步骤
   * @returns 是否接受草稿
   */
  const stepsChangeHandler = (steps: TaskSubtask[]): boolean => {
    setDraft((current) => ({
      ...current,
      subtasks: steps,
      ...(current.status === 'completed' &&
      steps.some((step) => !step.completed)
        ? { status: 'todo', completedAt: null }
        : {}),
    }))
    return true
  }
  /** 保存草稿并阻止覆盖其他窗口的修改。
   * @param event - 提交事件
   * @returns 无返回值；保存成功后关闭
   */
  const submitHandler = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const labels = [
      ...new Set(
        labelsText
          .split(/[,，]/)
          .map((label) => label.trim())
          .filter(Boolean),
      ),
    ]
    if (labels.length > 20 || labels.some((label) => label.length > 32)) {
      setSaveError('标签最多 20 个，每个最多 32 字。')
      return
    }
    const currentTask = data.taskList.find((entry) => entry.id === draft.id)
    if (
      originalTask &&
      JSON.stringify(originalTask) !== JSON.stringify(currentTask)
    ) {
      setSaveError('任务已被其他操作更新。请保留输入，关闭并重新打开后核对。')
      return
    }
    if (saveTaskHandler({ ...draft, title: draft.title.trim(), labels }))
      onClose()
    else {
      setSaveError('保存未成功，草稿已保留，请检查后重试。')
      toast.error('任务草稿仍在此处')
    }
  }
  /** 处理抽屉关闭。
   * @param open - 打开状态
   * @returns 无返回值；关闭抽屉
   */
  const openChangeHandler = (open: boolean): void => {
    if (!open) onClose()
  }
  return (
    <Sheet open onOpenChange={openChangeHandler}>
      <SheetContent
        className={styles.sheet}
        onCloseAutoFocus={restoreTaskFocusHandler}
      >
        <SheetHeader>
          <SheetTitle>{task ? '任务详情' : '记录一件要做的事'}</SheetTitle>
          <SheetDescription>
            {task
              ? `来源：${task.source} · 安排日期与截止日期分别保存`
              : '先记下来，再决定在哪天、哪个项目里完成。'}
          </SheetDescription>
        </SheetHeader>
        <div className={styles.form}>
          <form
            id="task-editor-form"
            onSubmit={submitHandler}
            className={styles.fields}
          >
            <div className={styles.field}>
              <Label htmlFor="task-editor-title">任务标题</Label>
              <Input
                id="task-editor-title"
                name="title"
                autoFocus
                value={draft.title}
                onChange={textChangeHandler}
                placeholder="你准备完成什么？"
                required
                maxLength={200}
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="task-editor-description">说明</Label>
              <Textarea
                id="task-editor-description"
                name="description"
                value={draft.description}
                onChange={textChangeHandler}
                placeholder="目标、想法或需要注意的事…"
                maxLength={10000}
                rows={4}
              />
            </div>
            <div className={styles.twoColumns}>
              <div className={styles.field}>
                <Label htmlFor="task-editor-project">所属项目</Label>
                <Select
                  value={draft.projectId ?? 'none'}
                  onValueChange={projectChangeHandler}
                >
                  <SelectTrigger id="task-editor-project">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">个人事项</SelectItem>
                    {data.projectList.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                        {project.archived ? '（已归档）' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={styles.field}>
                <Label htmlFor="task-editor-section">项目阶段</Label>
                <Select
                  value={draft.sectionId ?? 'none'}
                  onValueChange={sectionChangeHandler}
                  disabled={!draft.projectId}
                >
                  <SelectTrigger id="task-editor-section">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未分阶段</SelectItem>
                    {data.sectionList
                      .filter(
                        (section) => section.projectId === draft.projectId,
                      )
                      .map((section) => (
                        <SelectItem key={section.id} value={section.id}>
                          {section.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className={styles.twoColumns}>
              <div className={styles.field}>
                <Label>准备在哪天做</Label>
                <TaskDatePicker
                  label="计划日期"
                  value={draft.plannedDate}
                  onChange={plannedDateHandler}
                />
              </div>
              <div className={styles.field}>
                <Label>最晚在哪天完成</Label>
                <TaskDatePicker
                  label="截止日期"
                  value={draft.deadlineDate}
                  onChange={deadlineDateHandler}
                />
              </div>
            </div>
            <div className={styles.twoColumns}>
              <div className={styles.field}>
                <Label htmlFor="task-editor-priority">优先级</Label>
                <Select
                  value={draft.priority}
                  onValueChange={priorityChangeHandler}
                >
                  <SelectTrigger id="task-editor-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityLabelRecord).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className={styles.field}>
                <Label htmlFor="task-editor-status">状态</Label>
                <Select
                  value={draft.status}
                  onValueChange={statusChangeHandler}
                >
                  <SelectTrigger id="task-editor-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabelRecord).map(([value, label]) => (
                      <SelectItem
                        key={value}
                        value={value}
                        disabled={value === 'completed'}
                      >
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className={styles.twoColumns}>
              <div className={styles.field}>
                <Label htmlFor="task-editor-estimate">预计用时（分钟）</Label>
                <Input
                  id="task-editor-estimate"
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  value={draft.estimateMinutes ?? ''}
                  onChange={estimateChangeHandler}
                  placeholder="例如 30"
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="task-editor-labels">标签</Label>
                <Input
                  id="task-editor-labels"
                  value={labelsText}
                  onChange={labelsChangeHandler}
                  placeholder="设计, 学习"
                />
              </div>
            </div>
          </form>
          <section className={styles.steps}>
            <h3>
              拆成几个小步骤{' '}
              <span>
                {draft.subtasks.filter((step) => step.completed).length}/
                {draft.subtasks.length}
              </span>
            </h3>
            <TaskSubtaskList
              subtasks={draft.subtasks}
              onChange={stepsChangeHandler}
            />
          </section>
          {saveError ? (
            <p role="alert" className={styles.error}>
              {saveError}
            </p>
          ) : null}
          <SheetFooter className={styles.footer}>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" form="task-editor-form">
              {task ? '保存任务' : '添加任务'}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
