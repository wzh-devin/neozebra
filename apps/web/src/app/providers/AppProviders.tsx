import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'

import { NotificationToaster } from '@/components/shared/notifications'
import { TooltipProvider } from '@/components/ui/tooltip'

type AppProvidersProps = {
  children: ReactNode
}

/**
 * 提供主题、Tooltip 和 Sonner 等应用级上下文。
 *
 * @param props - 应用根节点
 * @returns 包裹全局 Provider 的 JSX
 */
const AppProviders = ({ children }: AppProvidersProps) => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <TooltipProvider>
      {children}
      <NotificationToaster />
    </TooltipProvider>
  </ThemeProvider>
)

export { AppProviders }
