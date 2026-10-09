import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { DriveFileTree } from '@/features/drive/components/files/DriveFileTree'
import { DriveProviderIcon } from '@/features/drive/components/DriveProviderIcon'
import type { DriveView } from '@/features/drive/hooks/useDriveView'
import type { DriveTreeNode } from '@/features/drive/types'

import styles from '@/features/drive/components/files/DriveFolderPanel.module.css'

type DriveFolderPanelProps = Pick<
  DriveView,
  | 'provider'
  | 'rootNode'
  | 'expandedSet'
  | 'selectedDirectoryId'
  | 'toggleDirectory'
  | 'selectDirectory'
> & { onAction: (action: string, node: DriveTreeNode) => void }

/**
 * 组合 Provider 导航、目录树和连接说明。
 *
 * @param props - Provider、目录状态与目录操作
 * @returns 目录导航面板 JSX
 */
const DriveFolderPanel = ({
  provider,
  rootNode,
  expandedSet,
  selectedDirectoryId,
  toggleDirectory,
  selectDirectory,
  onAction,
}: DriveFolderPanelProps) => (
  <nav aria-label={`${provider.name} folders`} className={styles.panel}>
    <div className={styles.provider}>
      <Button asChild size="icon-sm" variant="ghost">
        <Link aria-label="Back to providers" to="/assets/drive">
          <ArrowLeft aria-hidden="true" />
        </Link>
      </Button>
      <DriveProviderIcon
        providerId={provider.providerId}
        className={styles.icon}
      />
      <h2>{provider.name}</h2>
    </div>
    <DriveFileTree
      rootNode={rootNode}
      expandedSet={expandedSet}
      selectedDirectoryId={selectedDirectoryId}
      onToggle={toggleDirectory}
      onSelect={selectDirectory}
      onAction={onAction}
    />
    <div className={styles.footer}>
      <span>
        <span
          className={styles.dot}
          data-status={provider.status}
          aria-hidden="true"
        />
        {provider.status === 'connected' ? 'Connected' : 'Configured'}
      </span>
    </div>
  </nav>
)

export { DriveFolderPanel }
