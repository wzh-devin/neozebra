import { useI18n } from '@/lib/i18n'
import { DragOverlay, useDndContext } from '@dnd-kit/core'
import { restrictToWindowEdges, snapCenterToCursor } from '@dnd-kit/modifiers'
import { FolderInput } from 'lucide-react'
import { canMoveVaultEntry } from '@/features/assets/vault/vault-drag'
import type { VaultEntry } from '@/features/assets/vault/types'
import { VaultEntryIcon } from './VaultEntryIcon'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import styles from './VaultDragOverlay.module.css'

/**
 * 复用拖放上下文显示跟随指针的文件与目标提示，不遮挡命中检测。
 *
 * @param 无参数
 * @returns 当前拖动条目的轻量浮层 JSX
 */
const VaultDragOverlay = () => {
  const { t } = useI18n()

  const { active, over } = useDndContext()
  const entry = active?.data.current?.entry as VaultEntry | undefined
  const targetId = over?.data.current?.parentId as string | undefined
  const targetName = over?.data.current?.name as string | undefined
  const canMove = canMoveVaultEntry(entry, targetId)
  return (
    <DragOverlay
      dropAnimation={null}
      modifiers={[snapCenterToCursor, restrictToWindowEdges]}
      style={{ width: 260, height: 'auto', pointerEvents: 'none' }}
    >
      {entry ? (
        <div
          className={`${styles.overlay} ${surfaceStyles.surface}`}
          data-valid={canMove || undefined}
          role="status"
        >
          <VaultEntryIcon entry={entry} className={styles.icon} />
          <div className={styles.copy}>
            <span className={styles.name}>{entry.name}</span>
            <span className={styles.target}>
              <FolderInput size={12} />
              {canMove
                ? t('移动到 {0}', targetName ?? t('文件夹'))
                : t('拖到文件夹以移动')}
            </span>
          </div>
        </div>
      ) : null}
    </DragOverlay>
  )
}
export { VaultDragOverlay }
