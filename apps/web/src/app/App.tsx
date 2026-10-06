import { AppProviders } from '@/app/providers/AppProviders'
import { InitiativesPage } from '@/pages/InitiativesPage'
import { WorkbenchLayout } from '@/layouts/WorkbenchLayout'

/**
 * 渲染 Neozebra 应用根组件。
 *
 * @param 无参数
 * @returns 应用 Provider、布局和首屏页面 JSX
 */
const App = () => (
  <AppProviders>
    <WorkbenchLayout>
      <InitiativesPage />
    </WorkbenchLayout>
  </AppProviders>
)

export default App
