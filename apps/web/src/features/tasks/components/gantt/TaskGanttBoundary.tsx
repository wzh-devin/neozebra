import { t } from '@/lib/i18n'
import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'

/**
 * 隔离按需加载的甘特图错误，保留已保存计划及其他 Task 标签。
 *
 * @param props - 甘特图及加载反馈
 * @returns 子组件或可重试错误 JSX
 */
export class TaskGanttBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  /**
   * 将加载或渲染失败转换为错误界面。
   *
   * @param 无参数
   * @returns 错误状态
   */
  static getDerivedStateFromError = () => ({ failed: true })

  /**
   * 重新加载页面和失败的动态资源，已保存计划继续保留。
   *
   * @param 无参数
   * @returns 无返回值；重新加载当前地址
   */
  retryHandler = (): void => window.location.reload()

  /**
   * 渲染可重试反馈或原甘特图。
   *
   * @param 无参数
   * @returns JSX
   */
  render = () =>
    this.state.failed ? (
      <Empty role="alert">
        <EmptyHeader>
          <EmptyTitle>{t('甘特图暂时无法打开')}</EmptyTitle>
          <EmptyDescription>
            {t('已保存的计划仍然保留，请重新加载后重试。')}
          </EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={this.retryHandler}>
          {t('重新加载')}
        </Button>
      </Empty>
    ) : (
      this.props.children
    )
}
