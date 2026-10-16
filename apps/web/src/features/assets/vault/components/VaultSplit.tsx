import { useI18n } from '@/lib/i18n'
import type { ReactNode } from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import styles from './VaultWorkspace.module.css'

/**
 * 使用已有可键盘调整的面板组件组合文件树与列表。
 *
 * @param props - 文件树、列表和窄屏状态
 * @returns 文件库分栏 JSX
 */
const VaultSplit = ({
  tree,
  children,
  isMobile,
}: {
  tree: ReactNode
  children: ReactNode
  isMobile: boolean
}) => {
  const { t } = useI18n()
  return isMobile ? (
    <div className={styles.body}>{children}</div>
  ) : (
    <ResizablePanelGroup orientation="horizontal" className={styles.body}>
      <ResizablePanel defaultSize="248px" minSize="180px" maxSize="360px">
        <aside className={styles.treePanel}>{tree}</aside>
      </ResizablePanel>
      <ResizableHandle
        className={styles.splitHandle}
        aria-label={t('调整文件树宽度')}
      />
      <ResizablePanel minSize="45%">{children}</ResizablePanel>
    </ResizablePanelGroup>
  )
}
export { VaultSplit }
