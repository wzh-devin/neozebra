import { useI18n } from '@/lib/i18n'
import {
  ChartNoAxesGantt,
  CheckCheck,
  FolderOpen,
  ListChecks,
  ListTodo,
  Plus,
} from 'lucide-react'
import { lazy, Suspense, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskCollectionView } from '@/features/tasks/components/collection/TaskCollectionView'
import { TaskEditor } from '@/features/tasks/components/editors/TaskEditor'
import { TaskProjectEditor } from '@/features/tasks/components/editors/TaskProjectEditor'
import { TaskProjectGrid } from '@/features/tasks/components/projects/TaskProjectGrid'
import { TaskProjectView } from '@/features/tasks/components/projects/TaskProjectView'
import { TaskGanttBoundary } from '@/features/tasks/components/gantt/TaskGanttBoundary'
import { restoreTaskFocusHandler } from '@/features/tasks/utils/task-focus'
import { TaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'
import { useTaskPlanner } from '@/features/tasks/hooks/useTaskPlanner'
import { useTaskRoute } from '@/features/tasks/hooks/useTaskRoute'
import type { TaskProject } from '@/features/tasks/types'
import styles from '@/features/tasks/components/TaskPageContent.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

const navigationList = [
  { value: 'all', label: '待完成', icon: ListTodo },
  { value: 'completed', label: '已完成', icon: CheckCheck },
  { value: 'projects', label: '项目', icon: FolderOpen },
  { value: 'gantt', label: '甘特图', icon: ChartNoAxesGantt },
]

const TaskGanttView = lazy(() =>
  import('@/features/tasks/components/gantt/TaskGanttView').then((module) => ({
    default: module.TaskGanttView,
  })),
)

/**
 * 组合规划路由、导航、状态和按需编辑界面。
 *
 * @param 无参数
 * @returns Task 工作区 JSX
 */
export const TaskPageContent = () => {
  const { t } = useI18n()

  const planner = useTaskPlanner()
  const route = useTaskRoute(planner.today)
  const { isMobile, state } = useSidebar()
  const [projectEditor, setProjectEditor] = useState<
    TaskProject | null | undefined
  >(undefined)
  const project = planner.data.projectList.find(
    (entry) => entry.id === route.projectId,
  )
  const selectedTask = planner.data.taskList.find(
    (task) => task.id === route.selectedTaskId,
  )
  const pendingTask = planner.data.taskList.find(
    (task) => task.id === planner.pendingCompletionId,
  )

  // 打开项目编辑器。
  const projectEditorHandler = (value: TaskProject | null): void =>
    setProjectEditor(value)

  // 关闭项目编辑器。
  const closeProjectHandler = (): void => setProjectEditor(undefined)

  // 取消主任务完成确认。
  const completionOpenHandler = (open: boolean): void => {
    if (!open && !planner.isSaving) planner.setPendingCompletionId(null)
  }

  // 明确完成主任务及全部步骤。
  const confirmCompletionHandler = async (
    event: MouseEvent<HTMLButtonElement>,
  ): Promise<void> => {
    event.preventDefault()
    if (pendingTask && (await planner.toggleTaskHandler(pendingTask.id, true)))
      restoreTaskFocusHandler()
  }

  // 关闭缺失任务的详情。
  const missingOpenHandler = (open: boolean): void => {
    if (!open) route.closeEditorHandler()
  }

  /**
   * 渲染导航入口；项目详情允许点当前标签返回概览。
   *
   * @param item - 导航项
   * @returns 导航 JSX
   */
  const renderNavigation = (item: (typeof navigationList)[number]) => {
    const Icon = item.icon

    // 返回当前视图的根目录。
    const clickHandler = (): void => {
      if (route.view === item.value && route.projectId)
        route.viewChangeHandler(item.value)
    }
    return (
      <TabsTrigger key={item.value} value={item.value} onClick={clickHandler}>
        <Icon aria-hidden="true" />
        {t(item.label)}
      </TabsTrigger>
    )
  }

  /**
   * 根据路由组合页面，业务数据处理留在各 feature 组件。
   *
   * @param 无参数
   * @returns 当前视图 JSX
   */
  const renderView = () => {
    if (planner.isLoading)
      return (
        <div
          className={styles.loading}
          role="status"
          aria-label={t('加载计划')}
        >
          <Skeleton className="h-10 w-48" />
          {[0, 1, 2].map((id) => (
            <Skeleton key={id} className="h-24 w-full" />
          ))}
        </div>
      )
    if (planner.isReadError)
      return (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('暂时无法打开计划')}</EmptyTitle>
            <EmptyDescription>
              {t('已保留原数据，请检查服务连接后重试。')}
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={planner.loadHandler}>
            {t('重新读取')}
          </Button>
        </Empty>
      )
    if (route.view === 'gantt')
      return (
        <TaskGanttBoundary>
          <Suspense
            fallback={
              <div
                className={styles.loading}
                role="status"
                aria-label={t('加载甘特图')}
              >
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <TaskGanttView />
          </Suspense>
        </TaskGanttBoundary>
      )
    if (route.view === 'projects') {
      if (!route.projectId)
        return <TaskProjectGrid onEdit={projectEditorHandler} />
      if (project)
        return (
          <TaskProjectView project={project} onEdit={projectEditorHandler} />
        )
      return (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('项目不存在')}</EmptyTitle>
            <EmptyDescription>{t('这个项目可能已被删除。')}</EmptyDescription>
          </EmptyHeader>
          <Button asChild variant="outline">
            <Link to="/task/projects">{t('返回我的项目')}</Link>
          </Button>
        </Empty>
      )
    }
    return (
      <TaskCollectionView
        completed={route.view === 'completed'}
        pending={route.view === 'all'}
      />
    )
  }
  return (
    <TaskPlannerContext.Provider value={planner}>
      <Tabs
        value={route.view}
        onValueChange={route.viewChangeHandler}
        className={`${surfaceStyles.surface} ${styles.workspace}`}
      >
        <header className={styles.toolbar}>
          <div className={styles.brand}>
            {isMobile || state === 'collapsed' ? (
              <SidebarTrigger aria-label={t('打开导航')} />
            ) : null}
            <ListChecks aria-hidden="true" />
            <span>{t('Tasks')}</span>
          </div>
          <TabsList
            className={styles.navigation}
            aria-label={t('任务规划视图')}
          >
            {navigationList.map(renderNavigation)}
          </TabsList>
          <Button
            size="sm"
            onClick={route.createTaskHandler}
            disabled={
              planner.isLoading ||
              planner.isReadError ||
              planner.isSaving ||
              (!!route.projectId && !project)
            }
          >
            <Plus aria-hidden="true" />
            <span>{t('新任务')}</span>
          </Button>
        </header>
        {planner.error ? (
          <div className={styles.error} role="alert">
            {t(planner.error)}
          </div>
        ) : null}
        <TabsContent value={route.view} className={styles.panel}>
          <ScrollArea className={styles.scroll}>
            <div className={styles.scrollContent}>
              <main id="task-content" tabIndex={-1} className={styles.content}>
                {renderView()}
              </main>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      {!planner.isLoading &&
      !planner.isReadError &&
      (route.isNew || selectedTask) ? (
        <TaskEditor
          key={
            route.isNew
              ? `new-${route.projectId ?? route.view}`
              : selectedTask!.id
          }
          task={route.isNew ? undefined : selectedTask}
          projectId={project?.id}
          plannedDate={route.draftDate}
          onClose={route.closeEditorHandler}
        />
      ) : null}
      {!planner.isLoading &&
      !planner.isReadError &&
      !route.isNew &&
      route.selectedTaskId &&
      !selectedTask ? (
        <Dialog open onOpenChange={missingOpenHandler}>
          <DialogContent
            className={surfaceStyles.surface}
            onCloseAutoFocus={restoreTaskFocusHandler}
          >
            <DialogHeader>
              <DialogTitle>{t('任务不存在')}</DialogTitle>
              <DialogDescription>
                {t('这个任务可能已被删除，原链接仍可返回任务列表。')}
              </DialogDescription>
            </DialogHeader>
            <Button
              variant="outline"
              className="mx-4"
              onClick={route.closeEditorHandler}
            >
              {t('返回列表')}
            </Button>
          </DialogContent>
        </Dialog>
      ) : null}
      {projectEditor !== undefined ? (
        <TaskProjectEditor
          project={projectEditor ?? undefined}
          onClose={closeProjectHandler}
        />
      ) : null}
      <AlertDialog open={!!pendingTask} onOpenChange={completionOpenHandler}>
        <AlertDialogContent className={surfaceStyles.surface}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('还有步骤未完成')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                '“{0}”仍有未完成步骤。确定一并标记为完成？',
                pendingTask?.title,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={planner.isSaving}>
              {t('继续完成步骤')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCompletionHandler}
              disabled={planner.isSaving}
            >
              {t('完成任务和所有步骤')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TaskPlannerContext.Provider>
  )
}
