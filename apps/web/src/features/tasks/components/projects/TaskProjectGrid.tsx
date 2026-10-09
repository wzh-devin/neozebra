import { ArrowUpRight, CalendarDays, MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { TaskProjectMark } from '@/features/tasks/components/projects/TaskProjectMark'
import { TaskEmptyState } from '@/features/tasks/components/TaskEmptyState'
import { formatTaskDate } from '@/features/tasks/data/task-planner'
import { useTaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'
import type { TaskProject } from '@/features/tasks/types'
import styles from '@/features/tasks/components/projects/TaskProjectGrid.module.css'

/**
 * 展示项目目标、配色和真实任务进度。
 *
 * @param props - 新建与编辑入口
 * @returns 项目概览 JSX
 */
export const TaskProjectGrid = ({
  onEdit,
}: {
  onEdit: (project: TaskProject | null) => void
}) => {
  const { data, today } = useTaskPlannerContext()
  const [archived, setArchived] = useState(false)
  const projectList = data.projectList.filter(
    (project) => project.archived === archived,
  )

  // 新建项目。
  const createHandler = (): void => onEdit(null)

  // 查看活跃项目。
  const activeHandler = (): void => setArchived(false)

  // 查看归档项目。
  const archiveHandler = (): void => setArchived(true)

  /**
   * 渲染一个项目卡片。
   *
   * @param project - 项目
   * @returns 卡片 JSX
   */
  const renderProject = (project: TaskProject) => {
    const tasks = data.taskList.filter((task) => task.projectId === project.id)
    const done = tasks.filter((task) => task.status === 'completed').length
    const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0

    // 编辑当前项目。
    const editHandler = (): void => onEdit(project)
    return (
      <Card key={project.id} className={styles.card} data-color={project.color}>
        <CardHeader className={styles.cardHeader}>
          <TaskProjectMark project={project} />
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={editHandler}
            aria-label={`设置项目：${project.name}`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </CardHeader>
        <CardContent className={styles.cardBody}>
          <Link to={`/task/projects/${project.id}`}>
            <h2>
              {project.name}
              <ArrowUpRight aria-hidden="true" />
            </h2>
            <p>{project.description || '为这个项目写下一句话目标。'}</p>
          </Link>
          <div className={styles.progressLabel}>
            <span>
              {done}/{tasks.length} 已完成
            </span>
            <strong>{progress}%</strong>
          </div>
          <Progress value={progress} aria-label={`${project.name}完成进度`} />
          <div className={styles.cardFooter}>
            <span>{tasks.length - done} 项待办</span>
            {project.deadlineDate ? (
              <span>
                <CalendarDays aria-hidden="true" />
                {formatTaskDate(project.deadlineDate, today)}截止
              </span>
            ) : (
              <span>按自己的节奏推进</span>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }
  return (
    <>
      <div className={styles.projectFilters}>
        <Button
          variant={archived ? 'ghost' : 'secondary'}
          size="sm"
          aria-pressed={!archived}
          onClick={activeHandler}
        >
          进行中的项目
        </Button>
        <Button
          variant={archived ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={archived}
          onClick={archiveHandler}
        >
          已归档
        </Button>
      </div>
      <div className={styles.grid}>
        {projectList.map(renderProject)}
        {!archived ? (
          <Button
            variant="ghost"
            className={styles.newCard}
            onClick={createHandler}
          >
            <Plus aria-hidden="true" />
            <span>开始一个新计划</span>
            <small>给下一个目标留个位置</small>
          </Button>
        ) : null}
      </div>
      {!projectList.length ? (
        <TaskEmptyState
          title={archived ? '还没有归档项目' : '从一个小目标开始'}
          description={
            archived
              ? '归档后的项目仍保留任务与历史。'
              : '创建项目，写下目标，再逐步拆解计划。'
          }
        />
      ) : null}
    </>
  )
}
