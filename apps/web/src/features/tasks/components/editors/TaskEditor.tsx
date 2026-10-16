import { useI18n } from '@/lib/i18n'
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
import { DialogFooter } from '@/components/ui/dialog'
import { TaskEditorFrame } from '@/features/tasks/components/editors/TaskEditorFrame'
import { EditorField } from '@/components/shared/editor-dialog'
import { Textarea } from '@/components/ui/textarea'
import { TaskDatePicker } from '@/features/tasks/components/editors/TaskDatePicker'
import { TaskSubtaskList } from '@/features/tasks/components/items/TaskSubtaskList'
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
import formStyles from '@/components/shared/editor-dialog/EditorForm.module.css'
import styles from '@/features/tasks/components/editors/TaskEditor.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

type Props = {
  task?: TaskItem
  projectId?: string | null
  plannedDate?: string | null
  onClose: () => void
}

/**
 * 编辑完整任务，保存失败时保留整个草稿。
 *
 * @param props - 原任务、新建上下文与关闭操作
 * @returns 任务新建或编辑弹窗 JSX
 */
export const TaskEditor = ({
  task,
  projectId = null,
  plannedDate = null,
  onClose,
}: Props) => {
  const { t } = useI18n()

  const { data, saveTaskHandler, isSaving } = useTaskPlannerContext()
  const [originalTask] = useState(task)
  const [draft, setDraft] = useState<TaskItem>(
    () => task ?? buildTask('', projectId, plannedDate),
  )
  const [labelsText, setLabelsText] = useState(task?.labels.join(', ') ?? '')
  const [saveError, setSaveError] = useState('')

  /**
   * 更新标题或描述。
   *
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

  /**
   * 更新任务项目并清除旧阶段。
   *
   * @param value - 项目标识
   * @returns 无返回值；更新草稿关联
   */
  const projectChangeHandler = (value: string): void =>
    setDraft((current) => ({
      ...current,
      projectId: value === 'none' ? null : value,
      sectionId: null,
    }))

  // 更新阶段。
  const sectionChangeHandler = (value: string): void =>
    setDraft((current) => ({
      ...current,
      sectionId: value === 'none' ? null : value,
    }))

  // 更新优先级。
  const priorityChangeHandler = (value: string): void => {
    if (value === 'high' || value === 'medium' || value === 'low')
      setDraft((current) => ({ ...current, priority: value as TaskPriority }))
  }

  /**
   * 更新执行状态，完成须通过任务行的明确流程。
   *
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

  // 更新计划日期。
  const plannedDateHandler = (value: string | null): void =>
    setDraft((current) => ({ ...current, plannedDate: value }))

  // 更新截止日期。
  const deadlineDateHandler = (value: string | null): void =>
    setDraft((current) => ({ ...current, deadlineDate: value }))

  /**
   * 更新预计分钟数。
   *
   * @param event - 输入事件
   * @returns 无返回值；更新草稿
   */
  const estimateChangeHandler = (event: ChangeEvent<HTMLInputElement>): void =>
    setDraft((current) => ({
      ...current,
      estimateMinutes:
        event.target.value === '' ? null : Number(event.target.value),
    }))

  // 保留标签输入，允许连续输入分隔符。
  const labelsChangeHandler = (event: ChangeEvent<HTMLInputElement>): void =>
    setLabelsText(event.target.value)

  /**
   * 编辑步骤时同步主任务状态。
   *
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

  /**
   * 保存草稿并阻止覆盖其他窗口的修改。
   *
   * @param event - 提交事件
   * @returns 无返回值；保存成功后关闭
   */
  const submitHandler = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
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
      setSaveError(t('标签最多 20 个，每个最多 32 字。'))
      return
    }
    const currentTask = data.taskList.find((entry) => entry.id === draft.id)
    if (
      originalTask &&
      JSON.stringify(originalTask) !== JSON.stringify(currentTask)
    ) {
      setSaveError(
        t('任务已被其他操作更新。请保留输入，关闭并重新打开后核对。'),
      )
      return
    }
    if (await saveTaskHandler({ ...draft, title: draft.title.trim(), labels }))
      onClose()
    else {
      setSaveError(t('保存未成功，草稿已保留，请检查后重试。'))
      toast.error(t('任务草稿仍在此处'))
    }
  }
  return (
    <TaskEditorFrame
      title={task ? t('任务详情') : t('记录一件要做的事')}
      description={
        task
          ? t('来源：{0} · 安排日期与截止日期分别保存', t(task.source))
          : t('先记下来，再决定在哪天、哪个项目里完成。')
      }
      onClose={onClose}
    >
      <div className={formStyles.form} aria-busy={isSaving}>
        <fieldset disabled={isSaving} className="contents">
          <form
            id="task-editor-form"
            onSubmit={submitHandler}
            className={formStyles.fields}
          >
            <EditorField id="task-editor-title" label={t('任务标题')}>
              <Input
                id="task-editor-title"
                name="title"
                autoFocus
                value={draft.title}
                onChange={textChangeHandler}
                placeholder={t('你准备完成什么？')}
                required
                maxLength={200}
              />
            </EditorField>
            <EditorField id="task-editor-description" label={t('说明')}>
              <Textarea
                id="task-editor-description"
                name="description"
                value={draft.description}
                onChange={textChangeHandler}
                placeholder={t('目标、想法或需要注意的事…')}
                maxLength={10000}
                rows={4}
              />
            </EditorField>
            <div className={styles.twoColumns}>
              <div className={formStyles.field}>
                <Label htmlFor="task-editor-project">{t('所属项目')}</Label>
                <Select
                  value={draft.projectId ?? 'none'}
                  onValueChange={projectChangeHandler}
                >
                  <SelectTrigger id="task-editor-project">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className={surfaceStyles.surface}
                    position="popper"
                    align="start"
                    sideOffset={6}
                  >
                    <SelectItem value="none">{t('个人事项')}</SelectItem>
                    {data.projectList.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                        {project.archived ? t('（已归档）') : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={formStyles.field}>
                <Label htmlFor="task-editor-section">{t('项目阶段')}</Label>
                <Select
                  value={draft.sectionId ?? 'none'}
                  onValueChange={sectionChangeHandler}
                  disabled={!draft.projectId}
                >
                  <SelectTrigger id="task-editor-section">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className={surfaceStyles.surface}
                    position="popper"
                    align="start"
                    sideOffset={6}
                  >
                    <SelectItem value="none">{t('未分阶段')}</SelectItem>
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
              <div className={formStyles.field}>
                <Label>{t('准备在哪天做')}</Label>
                <TaskDatePicker
                  label={t('计划日期')}
                  value={draft.plannedDate}
                  onChange={plannedDateHandler}
                />
              </div>
              <div className={formStyles.field}>
                <Label>{t('最晚在哪天完成')}</Label>
                <TaskDatePicker
                  label={t('截止日期')}
                  value={draft.deadlineDate}
                  onChange={deadlineDateHandler}
                />
              </div>
            </div>
            <div className={styles.twoColumns}>
              <div className={formStyles.field}>
                <Label htmlFor="task-editor-priority">{t('优先级')}</Label>
                <Select
                  value={draft.priority}
                  onValueChange={priorityChangeHandler}
                >
                  <SelectTrigger id="task-editor-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className={surfaceStyles.surface}
                    position="popper"
                    align="start"
                    sideOffset={6}
                  >
                    {Object.entries(priorityLabelRecord).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {t(label)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className={formStyles.field}>
                <Label htmlFor="task-editor-status">{t('状态')}</Label>
                <Select
                  value={draft.status}
                  onValueChange={statusChangeHandler}
                >
                  <SelectTrigger id="task-editor-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className={surfaceStyles.surface}
                    position="popper"
                    align="start"
                    sideOffset={6}
                  >
                    {Object.entries(statusLabelRecord).map(([value, label]) => (
                      <SelectItem
                        key={value}
                        value={value}
                        disabled={value === 'completed'}
                      >
                        {t(label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className={styles.twoColumns}>
              <div className={formStyles.field}>
                <Label htmlFor="task-editor-estimate">
                  {t('预计用时（分钟）')}
                </Label>
                <Input
                  id="task-editor-estimate"
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  value={draft.estimateMinutes ?? ''}
                  onChange={estimateChangeHandler}
                  placeholder={t('例如 30')}
                />
              </div>
              <div className={formStyles.field}>
                <Label htmlFor="task-editor-labels">{t('标签')}</Label>
                <Input
                  id="task-editor-labels"
                  value={labelsText}
                  onChange={labelsChangeHandler}
                  placeholder={t('设计, 学习')}
                />
              </div>
            </div>
          </form>
          <section className={styles.steps}>
            <h3>
              {t('拆成几个小步骤')}{' '}
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
              {t(saveError)}
            </p>
          ) : null}
          <DialogFooter className={formStyles.footer}>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('取消')}
            </Button>
            <Button type="submit" form="task-editor-form">
              {isSaving ? t('保存中…') : task ? t('保存任务') : t('添加任务')}
            </Button>
          </DialogFooter>
        </fieldset>
      </div>
    </TaskEditorFrame>
  )
}
