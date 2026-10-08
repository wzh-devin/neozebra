import { AppProviders } from '@/app/providers/AppProviders'
import { AppRouter } from '@/app/router/AppRouter'

/**
 * 渲染 Neozebra 应用根组件。
 *
 * @param 无参数
 * @returns 应用 Provider、布局和首屏页面 JSX
 */
const App = () => (
  <AppProviders>
    <AppRouter />
  </AppProviders>
)

export default App
