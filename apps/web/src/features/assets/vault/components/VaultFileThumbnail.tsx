import { useI18n } from '@/lib/i18n'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { VaultEntry } from '@/features/assets/vault/types'
import { getPreviewKind } from '@/features/assets/vault/vault-format'
import { getVaultContentUrl } from '@/services/assets/vault'
import { VaultEntryIcon } from './VaultEntryIcon'
import styles from './VaultFileThumbnail.module.css'

/**
 * 按需读取图片预览，其他格式或读取失败时回退到现有类型图标。
 *
 * @param props - 当前文件或文件夹
 * @returns 带图片加载占位与错误回退的缩略图 JSX
 */
const VaultFileThumbnail = ({ entry }: { entry: VaultEntry }) => {
  const { t } = useI18n()

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const isImage =
    entry.kind === 'file' && getPreviewKind(entry.name) === 'image'
  const readyHandler = () => setState('ready')
  const errorHandler = () => setState('error')
  return (
    <span className={styles.thumbnail} data-kind={entry.kind}>
      {isImage && state !== 'error' ? (
        <>
          {state === 'loading' ? (
            <Skeleton className={styles.placeholder}>
              <span className="sr-only">{t('正在加载缩略图')}</span>
            </Skeleton>
          ) : null}
          <img
            src={getVaultContentUrl(entry.id, true)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className={styles.image}
            data-ready={state === 'ready' || undefined}
            onLoad={readyHandler}
            onError={errorHandler}
          />
        </>
      ) : (
        <>
          <VaultEntryIcon entry={entry} className={styles.icon} />
          {isImage ? (
            <span className="sr-only">{t('缩略图加载失败，显示文件图标')}</span>
          ) : null}
        </>
      )}
    </span>
  )
}
export { VaultFileThumbnail }
