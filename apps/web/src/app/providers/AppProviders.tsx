import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'

import { Toaster } from '@/components/ui/sonner'
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
      <Toaster position="bottom-right" />
    </TooltipProvider>
  </ThemeProvider>
)

export { AppProviders }
