import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'

import { NotificationToaster } from '@/components/shared/notifications'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useVaultPublicationCache } from '@/features/assets/vault'
import { useI18n } from '@/lib/i18n'

type AppProvidersProps = {
  children: ReactNode
}

/**
 * 提供主题、Tooltip 和 Sonner 等应用级上下文。
 *
 * @param props - 应用根节点
 * @returns 包裹全局 Provider 的 JSX
 */
const AppProviders = ({ children }: AppProvidersProps) => {
  const { locale } = useI18n()
  const [queryClient] = useState(() => new QueryClient())
  useVaultPublicationCache(queryClient)
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <TooltipProvider>
          {children}
          <NotificationToaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export { AppProviders }
