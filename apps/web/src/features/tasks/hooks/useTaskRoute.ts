import { useEffect } from 'react'
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { isValidDate } from '@/features/tasks/data/task-planner'

const viewList = ['all', 'projects', 'completed', 'gantt'] as const

/**
 * 管理规划视图、兼容链接与编辑查询参数。
 *
 * @param today - 当前本地日期
 * @returns 路由状态与导航操作
 */
export const useTaskRoute = (today: string) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { taskId: legacyTaskId, projectId } = useParams()
  const [params, setParams] = useSearchParams()
  const segment = location.pathname.split('/')[2]
  const view = viewList.find((entry) => entry === segment) ?? 'all'
  const isNew = params.get('new') === '1'
  const selectedTaskId = params.get('task')
  const date = params.get('date')
  const draftDate =
    segment === 'today' ? today : date && isValidDate(date) ? date : null

  useEffect(() => {
    if (legacyTaskId) {
      const next = new URLSearchParams(location.search)
      next.set('task', legacyTaskId)
      navigate(`/task/all?${next}`, { replace: true })
    } else if (segment === 'upcoming' || segment === 'today') {
      const next = new URLSearchParams(location.search)
      if (
        segment === 'today' ||
        !next.get('date') ||
        !isValidDate(next.get('date'))
      )
        next.set('date', today)
      navigate(`/task/all?${next}`, { replace: true })
    } else if (location.pathname === '/task' || location.pathname === '/task/')
      navigate(`/task/all${location.search}`, { replace: true })
  }, [
    legacyTaskId,
    location.pathname,
    location.search,
    navigate,
    segment,
    today,
  ])

  // 导航到明确的规划视图。
  const viewChangeHandler = (value: string): void => {
    if (viewList.some((entry) => entry === value)) navigate(`/task/${value}`)
  }

  /**
   * 打开新任务表单。
   *
   * @param 无参数
   * @returns 无返回值；更新查询参数
   */
  const createTaskHandler = (): void => {
    const next = new URLSearchParams(params)
    next.delete('task')
    next.set('new', '1')
    setParams(next)
  }

  /**
   * 关闭详情而保留当前列表上下文。
   *
   * @param 无参数
   * @returns 无返回值；更新查询参数
   */
  const closeEditorHandler = (): void => {
    const next = new URLSearchParams(params)
    next.delete('task')
    next.delete('new')
    setParams(next, { replace: true })
  }

  return {
    view,
    projectId,
    isNew,
    selectedTaskId,
    draftDate,
    viewChangeHandler,
    createTaskHandler,
    closeEditorHandler,
  }
}
