import { CheckCheck, FolderOpen, ListTodo, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskCollectionView } from '@/features/tasks/components/collection/TaskCollectionView'
import { TaskEditorSheet } from '@/features/tasks/components/editors/TaskEditorSheet'
import { TaskProjectEditor } from '@/features/tasks/components/editors/TaskProjectEditor'
import { TaskProjectGrid } from '@/features/tasks/components/projects/TaskProjectGrid'
import { TaskProjectView } from '@/features/tasks/components/projects/TaskProjectView'
import { restoreTaskFocusHandler } from '@/features/tasks/utils/task-focus'
import { TaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'
import { useTaskPlanner } from '@/features/tasks/hooks/useTaskPlanner'
import { useTaskRoute } from '@/features/tasks/hooks/useTaskRoute'
import type { TaskProject } from '@/features/tasks/types'
import styles from '@/features/tasks/components/TaskPageContent.module.css'

const navigationList = [
  { value: 'all', label: '全部', icon: ListTodo },
  { value: 'projects', label: '项目', icon: FolderOpen },
  { value: 'completed', label: '已完成', icon: CheckCheck },
]

/** 组合规划路由、导航、状态和按需编辑界面。
 * @param 无参数
 * @returns Task 工作区 JSX
 */
export const TaskPageContent = () => {
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

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Neozebra — Task'
    return () => {
      document.title = previousTitle
    }
  }, [])

  /** 打开项目编辑器。
   * @param value - 项目，空值表示新建
   * @returns 无返回值；更新编辑器状态
   */
  const projectEditorHandler = (value: TaskProject | null): void =>
    setProjectEditor(value)
  /** 关闭项目编辑器。
   * @param 无参数
   * @returns 无返回值；关闭表单
   */
  const closeProjectHandler = (): void => setProjectEditor(undefined)
  /** 取消主任务完成确认。
   * @param open - 打开状态
   * @returns 无返回值；按需清除待确认任务
   */
  const completionOpenHandler = (open: boolean): void => {
    if (!open) planner.setPendingCompletionId(null)
  }
  /** 明确完成主任务及全部步骤。
   * @param 无参数
   * @returns 无返回值；保存完成结果
   */
  const confirmCompletionHandler = (): void => {
    if (pendingTask && planner.toggleTaskHandler(pendingTask.id, true))
      restoreTaskFocusHandler()
  }
  /** 关闭缺失任务的详情。
   * @param open - 打开状态
   * @returns 无返回值；关闭详情
   */
  const missingOpenHandler = (open: boolean): void => {
    if (!open) route.closeEditorHandler()
  }
  /** 渲染导航入口；项目详情允许点当前标签返回概览。
   * @param item - 导航项
   * @returns 导航 JSX
   */
  const renderNavigation = (item: (typeof navigationList)[number]) => {
    const Icon = item.icon
    /** 返回当前视图的根目录。
     * @param 无参数
     * @returns 无返回值；按需导航
     */
    const clickHandler = (): void => {
      if (route.view === item.value && route.projectId)
        route.viewChangeHandler(item.value)
    }
    return (
      <TabsTrigger key={item.value} value={item.value} onClick={clickHandler}>
        <Icon aria-hidden="true" />
        {item.label}
      </TabsTrigger>
    )
  }
  /** 根据路由组合页面，业务数据处理留在各 feature 组件。
   * @param 无参数
   * @returns 当前视图 JSX
   */
  const renderView = () => {
    if (planner.isLoading)
      return (
        <div className={styles.loading} role="status" aria-label="加载计划">
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
            <EmptyTitle>暂时无法打开计划</EmptyTitle>
            <EmptyDescription>
              已保留原数据，请检查浏览器存储后重试。
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={planner.loadHandler}>
            重新读取
          </Button>
        </Empty>
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
            <EmptyTitle>项目不存在</EmptyTitle>
            <EmptyDescription>这个项目可能已被删除。</EmptyDescription>
          </EmptyHeader>
          <Button asChild variant="outline">
            <Link to="/task/projects">返回我的项目</Link>
          </Button>
        </Empty>
      )
    }
    return <TaskCollectionView completed={route.view === 'completed'} />
  }
  return (
    <TaskPlannerContext.Provider value={planner}>
      <Tabs
        value={route.view}
        onValueChange={route.viewChangeHandler}
        className={styles.workspace}
      >
        <header className={styles.toolbar}>
          <div className={styles.brand}>
            {isMobile || state === 'collapsed' ? (
              <SidebarTrigger aria-label="打开导航" />
            ) : null}
            <ListTodo aria-hidden="true" />
            <span>Task</span>
          </div>
          <TabsList className={styles.navigation} aria-label="任务规划视图">
            {navigationList.map(renderNavigation)}
          </TabsList>
          <Button
            size="sm"
            onClick={route.createTaskHandler}
            disabled={
              planner.isLoading ||
              planner.isReadError ||
              (!!route.projectId && !project)
            }
          >
            <Plus aria-hidden="true" />
            <span>新任务</span>
          </Button>
        </header>
        {planner.error ? (
          <div className={styles.error} role="alert">
            {planner.error}
          </div>
        ) : null}
        {planner.data.isDemo ? (
          <div className={styles.demo}>
            <Badge variant="outline">本地示例 · synthetic/local mock</Badge>
            <Button variant="ghost" size="sm" onClick={planner.keepDemoHandler}>
              保留为我的计划
            </Button>
          </div>
        ) : null}
        <TabsContent value={route.view} className={styles.panel}>
          <ScrollArea className={styles.scroll}>
            <main id="task-content" tabIndex={-1} className={styles.content}>
              {renderView()}
            </main>
            <footer className={styles.localMode}>计划保存在当前浏览器</footer>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      {!planner.isLoading &&
      !planner.isReadError &&
      (route.isNew || selectedTask) ? (
        <TaskEditorSheet
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
        <Sheet open onOpenChange={missingOpenHandler}>
          <SheetContent onCloseAutoFocus={restoreTaskFocusHandler}>
            <SheetHeader>
              <SheetTitle>任务不存在</SheetTitle>
              <SheetDescription>
                这个任务可能已被删除，原链接仍可返回任务列表。
              </SheetDescription>
            </SheetHeader>
            <Button
              variant="outline"
              className="mx-4"
              onClick={route.closeEditorHandler}
            >
              返回列表
            </Button>
          </SheetContent>
        </Sheet>
      ) : null}
      {projectEditor !== undefined ? (
        <TaskProjectEditor
          project={projectEditor ?? undefined}
          onClose={closeProjectHandler}
        />
      ) : null}
      <AlertDialog open={!!pendingTask} onOpenChange={completionOpenHandler}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>还有步骤未完成</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingTask?.title}”仍有未完成步骤。确定一并标记为完成？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续完成步骤</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCompletionHandler}>
              完成任务和所有步骤
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TaskPlannerContext.Provider>
  )
}
