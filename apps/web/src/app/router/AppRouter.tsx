import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
  useLocation,
} from 'react-router-dom'

import { WorkbenchLayout } from '@/layouts/workbench'
import { DashboardPage } from '@/pages/dashboard'
import { VaultPage } from '@/pages/assets/vault'
import { InboxSyncProvider } from '@/features/inbox'
import { InboxPage } from '@/pages/inbox'
import { TaskPage } from '@/pages/task'

/**
 * 保留旧文件库书签中的目录、查询和锚点，跳转到 vault 路由。
 *
 * @param 无参数
 * @returns 兼容旧地址的跳转 JSX
 */
const LegacyVaultRedirect = () => {
  const { folderId } = useParams()
  const location = useLocation()
  return (
    <Navigate
      to={
        '/assets/vault' +
        (folderId ? '/' + encodeURIComponent(folderId) : '') +
        location.search +
        location.hash
      }
      replace
    />
  )
}

/**
 * 渲染 Neozebra 的浏览器路由和工作台嵌套路由。
 *
 * @param 无参数
 * @returns 路由树 JSX
 */
const AppRouter = () => (
  <BrowserRouter>
    <InboxSyncProvider>
      <Routes>
        <Route element={<WorkbenchLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="inbox/:itemId?" element={<InboxPage />} />
          <Route path="task" element={<TaskPage />} />
          <Route path="task/today" element={<TaskPage />} />
          <Route path="task/upcoming" element={<TaskPage />} />
          <Route path="task/projects" element={<TaskPage />} />
          <Route path="task/projects/:projectId" element={<TaskPage />} />
          <Route path="task/all" element={<TaskPage />} />
          <Route path="task/completed" element={<TaskPage />} />
          <Route path="task/gantt" element={<TaskPage />} />
          <Route path="task/:taskId" element={<TaskPage />} />
          <Route path="assets/vault/:folderId?" element={<VaultPage />} />
          <Route
            path="assets/storage/:folderId?"
            element={<LegacyVaultRedirect />}
          />
          <Route
            path="assets/drive/*"
            element={<Navigate to="/assets/vault" replace />}
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </InboxSyncProvider>
  </BrowserRouter>
)

export { AppRouter }
