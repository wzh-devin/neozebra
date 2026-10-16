import type { VaultEntry } from '@/features/assets/vault/types'
import { getVaultEntryIcon } from '../vault-entry-icon'
import styles from './VaultEntryIcon.module.css'

/**
 * 统一展示文件类别的图形与配色，展开目录使用打开的文件夹。
 *
 * @param props - 条目、可选样式与目录展开状态
 * @returns 文件类型图标 JSX
 */
const VaultEntryIcon = ({
  entry,
  className,
  expanded = false,
}: {
  entry: Pick<VaultEntry, 'kind' | 'name'>
  className?: string
  expanded?: boolean
}) => {
  const { Icon, type } = getVaultEntryIcon(entry, expanded)
  return (
    <Icon
      className={`${styles.icon} ${className ?? ''}`}
      data-file-type={type}
      size={16}
      aria-hidden="true"
    />
  )
}
export { VaultEntryIcon }
