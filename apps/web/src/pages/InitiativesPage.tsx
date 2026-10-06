import {
  InitiativesPageContent,
  useInitiativesView,
} from '@/features/initiatives'

/**
 * 组合 initiatives 路由页面所需的业务视图。
 *
 * @param 无参数
 * @returns initiatives 页面 JSX
 */
const InitiativesPage = () => {
  const initiativesView = useInitiativesView()

  return <InitiativesPageContent {...initiativesView} />
}

export { InitiativesPage }
