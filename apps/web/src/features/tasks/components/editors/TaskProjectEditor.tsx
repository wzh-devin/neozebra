import { Archive, Trash2 } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
import { Textarea } from '@/components/ui/textarea'
import { TaskDatePicker } from '@/features/tasks/components/editors/TaskDatePicker'
import {
  projectColorList,
  projectIconList,
} from '@/features/tasks/data/task-planner'
import { useTaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'
import type {
  ProjectColor,
  ProjectIcon,
  TaskProject,
} from '@/features/tasks/types'
import formStyles from '@/components/shared/editor-dialog/EditorForm.module.css'
import styles from '@/features/tasks/components/editors/TaskEditor.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

const colorLabelRecord = {
  purple: '紫',
  blue: '蓝',
  teal: '青',
  green: '绿',
  amber: '琥珀',
  rose: '玫红',
}
const iconLabelRecord = {
  code: '开发',
  sparkles: '创意',
  book: '学习',
  briefcase: '工作',
  leaf: '生活',
  rocket: '目标',
}

/**
 * 编辑项目目标、配色和归档状态，明确删除范围。
 *
 * @param props - 项目及关闭操作
 * @returns 项目新建或编辑弹窗 JSX
 */
export const TaskProjectEditor = ({
  project,
  onClose,
}: {
  project?: TaskProject
  onClose: () => void
}) => {
  const { data, saveProjectHandler, deleteProjectHandler, isSaving } =
    useTaskPlannerContext()
  const navigate = useNavigate()
  const [originalProject] = useState(project)
  const [draft, setDraft] = useState<TaskProject>(
    () =>
      project ?? {
        id: crypto.randomUUID(),
        name: '',
        description: '',
        color: 'purple',
        icon: 'sparkles',
        deadlineDate: null,
        archived: false,
      },
  )
  const [deleteMode, setDeleteMode] = useState('keep')
  const [error, setError] = useState('')

  /**
   * 更新项目文本。
   *
   * @param event - 输入事件
   * @returns 无返回值；更新草稿
   */
  const textChangeHandler = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void => {
    const { name, value } = event.currentTarget
    if (name === 'name' || name === 'description')
      setDraft((current) => ({ ...current, [name]: value }))
  }

  // 设置项目颜色。
  const colorChangeHandler = (value: string): void => {
    if (projectColorList.some((color) => color === value))
      setDraft((current) => ({ ...current, color: value as ProjectColor }))
  }

  // 设置图标。
  const iconChangeHandler = (value: string): void => {
    if (projectIconList.some((icon) => icon === value))
      setDraft((current) => ({ ...current, icon: value as ProjectIcon }))
  }

  // 设置项目截止日期。
  const dateChangeHandler = (value: string | null): void =>
    setDraft((current) => ({ ...current, deadlineDate: value }))

  /**
   * 保存项目，避免覆盖并发更新。
   *
   * @param event - 提交事件
   * @returns 无返回值；保存并导航
   */
  const submitHandler = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()
    if (
      originalProject &&
      JSON.stringify(originalProject) !==
        JSON.stringify(data.projectList.find((entry) => entry.id === draft.id))
    ) {
      setError('项目已更新，请保留输入，关闭并重新打开后核对。')
      return
    }
    if (await saveProjectHandler({ ...draft, name: draft.name.trim() })) {
      onClose()
      navigate(`/task/projects/${draft.id}`)
    } else setError('保存未成功，输入已保留，请重试。')
  }

  /**
   * 归档或恢复项目，任务仍可访问。
   *
   * @param 无参数
   * @returns 无返回值；保存状态
   */
  const archiveHandler = async (): Promise<void> => {
    const current = data.projectList.find((entry) => entry.id === draft.id)
    if (!current) {
      setError('项目已被移除，请关闭并返回项目列表。')
      return
    }
    if (
      await saveProjectHandler({
        ...current,
        archived: !current.archived,
      })
    ) {
      onClose()
      navigate('/task/projects')
    } else setError('操作未成功，输入已保留，请重试。')
  }

  /**
   * 执行已明确范围的项目删除。
   *
   * @param 无参数
   * @returns 无返回值；删除并返回项目页
   */
  const deleteHandler = async (): Promise<void> => {
    if (await deleteProjectHandler(draft.id, deleteMode === 'delete')) {
      onClose()
      navigate('/task/projects')
    }
  }
  return (
    <TaskEditorFrame
      title={project ? '项目设置' : '开始一个新项目'}
      description={'给目标一个名字，再把它拆成可以完成的小事。'}
      onClose={onClose}
    >
      <form
        className={formStyles.form}
        onSubmit={submitHandler}
        aria-busy={isSaving}
      >
        <fieldset disabled={isSaving} className="contents">
          <EditorField id="project-name" label="项目名称">
            <Input
              id="project-name"
              name="name"
              value={draft.name}
              onChange={textChangeHandler}
              autoFocus
              required
              maxLength={80}
              placeholder="例如：个人网站改版"
            />
          </EditorField>
          <EditorField id="project-description" label="目标说明">
            <Textarea
              id="project-description"
              name="description"
              value={draft.description}
              onChange={textChangeHandler}
              maxLength={10000}
              rows={4}
              placeholder="这次计划希望达成什么？"
            />
          </EditorField>
          <div className={formStyles.field}>
            <Label id="project-colors-label">项目颜色</Label>
            <RadioGroup
              aria-labelledby="project-colors-label"
              value={draft.color}
              onValueChange={colorChangeHandler}
              className={styles.colors}
            >
              {projectColorList.map((color) => (
                <div
                  key={color}
                  className={styles.colorChoice}
                  data-color={color}
                >
                  <RadioGroupItem
                    id={`project-color-${color}`}
                    value={color}
                    aria-label={colorLabelRecord[color]}
                  />
                  <Label htmlFor={`project-color-${color}`}>
                    {colorLabelRecord[color]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className={styles.twoColumns}>
            <div className={formStyles.field}>
              <Label htmlFor="project-icon">项目图标</Label>
              <Select value={draft.icon} onValueChange={iconChangeHandler}>
                <SelectTrigger id="project-icon">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  className={surfaceStyles.surface}
                  position="popper"
                  align="start"
                  sideOffset={6}
                >
                  {projectIconList.map((icon) => (
                    <SelectItem key={icon} value={icon}>
                      {iconLabelRecord[icon]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={formStyles.field}>
              <Label>项目截止</Label>
              <TaskDatePicker
                label="项目截止日期"
                value={draft.deadlineDate}
                onChange={dateChangeHandler}
              />
            </div>
          </div>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter className={formStyles.footer}>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit">
              {isSaving ? '保存中…' : project ? '保存项目' : '创建项目'}
            </Button>
          </DialogFooter>
          {project ? (
            <div className={styles.dangerZone}>
              <Button type="button" variant="outline" onClick={archiveHandler}>
                <Archive aria-hidden="true" />
                {project.archived ? '恢复项目' : '归档项目'}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="ghost">
                    <Trash2 aria-hidden="true" />
                    删除项目
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className={surfaceStyles.surface}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除“{project.name}”？</AlertDialogTitle>
                    <AlertDialogDescription>
                      请选择如何处理项目中的任务。最近一次删除可撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <RadioGroup
                    className={styles.deleteOptions}
                    value={deleteMode}
                    onValueChange={setDeleteMode}
                  >
                    <div className={styles.deleteOption}>
                      <RadioGroupItem id="keep-project-tasks" value="keep" />
                      <Label htmlFor="keep-project-tasks">
                        保留任务，移出这个项目
                      </Label>
                    </div>
                    <div className={styles.deleteOption}>
                      <RadioGroupItem
                        id="delete-project-tasks"
                        value="delete"
                      />
                      <Label htmlFor="delete-project-tasks">
                        删除项目及其中全部任务
                      </Label>
                    </div>
                  </RadioGroup>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={deleteHandler}
                      disabled={isSaving}
                    >
                      删除项目
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : null}
        </fieldset>
      </form>
    </TaskEditorFrame>
  )
}
