import { useI18n } from '@/lib/i18n'
import { LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { VaultViewMode } from '@/features/assets/vault/types'
import styles from './VaultViewToggle.module.css'

/**
 * 使用已有按钮切换同一目录的列表与缩略图，不改变查询和分页。
 *
 * @param props - 当前视图和切换回调
 * @returns 带选中状态和键盘焦点的视图按钮组 JSX
 */
const VaultViewToggle = ({
  value,
  onChange,
}: {
  value: VaultViewMode
  onChange: (mode: VaultViewMode) => void
}) => {
  const { t } = useI18n()

  const listHandler = () => onChange('list')
  const thumbnailHandler = () => onChange('thumbnail')
  return (
    <div className={styles.toggle} role="group" aria-label={t('文件视图')}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={styles.button}
        aria-label={t('列表视图')}
        title={t('列表视图')}
        aria-pressed={value === 'list'}
        onClick={listHandler}
      >
        <List size={15} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={styles.button}
        aria-label={t('缩略图视图')}
        title={t('缩略图视图')}
        aria-pressed={value === 'thumbnail'}
        onClick={thumbnailHandler}
      >
        <LayoutGrid size={15} />
      </Button>
    </div>
  )
}
export { VaultViewToggle }
