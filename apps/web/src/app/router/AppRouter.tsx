import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { WorkbenchLayout } from '@/layouts/workbench'
import { DashboardPage } from '@/pages/dashboard'
import { DrivePage, DriveProviderPage } from '@/pages/assets/drive'
import { InboxPage } from '@/pages/inbox'
import { TaskPage } from '@/pages/task'

/**
 * 渲染 Neozebra 的浏览器路由和工作台嵌套路由。
 *
 * @param 无参数
 * @returns 路由树 JSX
 */
const AppRouter = () => (
  <BrowserRouter>
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
        <Route path="assets/drive">
          <Route index element={<DrivePage />} />
          <Route path=":providerId/*" element={<DriveProviderPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  </BrowserRouter>
)

export { AppRouter }
