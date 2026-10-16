import { useI18n } from '@/lib/i18n'
import { ArrowDown, ArrowLeft, ArrowUp, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { TaskGroup } from '@/features/tasks/components/items/TaskGroup'
import { TaskProjectMark } from '@/features/tasks/components/projects/TaskProjectMark'
import { TaskSectionEditor } from '@/features/tasks/components/editors/TaskSectionEditor'
import {
  formatMinutes,
  formatTaskDate,
} from '@/features/tasks/data/task-planner'
import { useTaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'
import type { TaskProject, TaskSection } from '@/features/tasks/types'
import styles from '@/features/tasks/components/projects/TaskProjectGrid.module.css'

/**
 * 按阶段展示项目规划并保留归档项目访问。
 *
 * @param props - 项目及设置入口
 * @returns 项目详情 JSX
 */
export const TaskProjectView = ({
  project,
  onEdit,
}: {
  project: TaskProject
  onEdit: (project: TaskProject | null) => void
}) => {
  const { t } = useI18n()

  const { data, today, moveSectionHandler } = useTaskPlannerContext()
  const taskList = data.taskList.filter((task) => task.projectId === project.id)
  const sectionList = data.sectionList.filter(
    (section) => section.projectId === project.id,
  )
  const done = taskList.filter((task) => task.status === 'completed').length
  const estimate = taskList
    .filter((task) => task.status !== 'completed')
    .reduce((sum, task) => sum + (task.estimateMinutes ?? 0), 0)

  // 打开项目设置。
  const editHandler = (): void => onEdit(project)

  /**
   * 渲染可排序和编辑的阶段。
   *
   * @param section - 阶段
   * @param index - 顺序
   * @returns 阶段 JSX
   */
  const renderSection = (section: TaskSection, index: number) => {
    // 上移阶段。
    const upHandler = (): void => {
      void moveSectionHandler(section.id, -1)
    }

    // 下移阶段。
    const downHandler = (): void => {
      void moveSectionHandler(section.id, 1)
    }
    return (
      <TaskGroup
        key={section.id}
        title={section.title}
        taskList={taskList.filter((task) => task.sectionId === section.id)}
        projectId={project.id}
        sectionId={section.id}
        quickAdd
        actions={
          <div className={styles.stageActions}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('上移阶段：{0}', section.title)}
              onClick={upHandler}
              disabled={index === 0}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('下移阶段：{0}', section.title)}
              onClick={downHandler}
              disabled={index === sectionList.length - 1}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <TaskSectionEditor
              key={`${section.id}:${section.title}`}
              projectId={project.id}
              section={section}
            />
          </div>
        }
      />
    )
  }
  return (
    <>
      <Button asChild variant="ghost" size="sm" className={styles.back}>
        <Link to="/task/projects">
          <ArrowLeft aria-hidden="true" />
          {t('我的项目')}
        </Link>
      </Button>
      <header className={styles.projectHeading}>
        <TaskProjectMark project={project} />
        <div>
          <h1>{project.name}</h1>
          {project.archived ? (
            <Badge variant="outline">{t('已归档')}</Badge>
          ) : (
            <span>{t('项目规划')}</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={editHandler}>
          <Settings2 aria-hidden="true" />
          {t('项目设置')}
        </Button>
      </header>
      <p className={styles.goal}>
        {project.description || t('为这个项目写下目标，让每一步都有方向。')}
      </p>
      <div className={styles.summary}>
        <span>
          {done}/{taskList.length}
          {t('已完成')}
        </span>
        <span>
          {t('剩余已估时')} {formatMinutes(estimate)}
        </span>
        {project.deadlineDate ? (
          <span>
            {formatTaskDate(project.deadlineDate, today)}
            {t('截止')}
          </span>
        ) : null}
      </div>
      <Progress
        className={styles.projectProgress}
        value={taskList.length ? (done / taskList.length) * 100 : 0}
        aria-label={t('项目完成进度')}
      />
      <div className={styles.stageHeading}>
        <h2>{t('拆解计划')}</h2>
        <TaskSectionEditor projectId={project.id} />
      </div>
      {sectionList.map(renderSection)}
      {taskList.some((task) => task.sectionId === null) ||
      !sectionList.length ? (
        <TaskGroup
          title={sectionList.length ? t('未分阶段') : t('任务清单')}
          taskList={taskList.filter((task) => task.sectionId === null)}
          projectId={project.id}
          quickAdd
        />
      ) : null}
    </>
  )
}
