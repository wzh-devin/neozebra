import { useI18n } from '@/lib/i18n'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import type { VaultEntry } from '@/features/assets/vault/types'
import { getVaultContentUrl } from '@/services/assets/vault'
import {
  formatVaultEntryMeta,
  getPreviewKind,
} from '@/features/assets/vault/vault-format'
import { VaultEntryIcon } from './VaultEntryIcon'
import { VaultDocumentPreview } from './VaultDocumentPreview'
import { VaultPdfPreview } from './VaultPdfPreview'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import styles from './VaultPreview.module.css'

const VaultTextPreview = lazy(() =>
  import('./VaultTextPreview').then((module) => ({
    default: module.VaultTextPreview,
  })),
)

/**
 * 按文件格式组合媒体、Markdown、PDF 与文档阅读器，关闭时取消读取并恢复焦点。
 *
 * @param props - 已发布文件与关闭回调
 * @returns 文件预览弹窗 JSX
 */
const VaultPreview = ({
  entry,
  onClose,
}: {
  entry: VaultEntry
  onClose: () => void
}) => {
  const { t } = useI18n()

  const kind = getPreviewKind(entry.name)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [opener] = useState(() => document.activeElement)
  const openHandler = (open: boolean) => {
    if (!open) onClose()
  }
  const closeAutoFocusHandler = (event: Event) => {
    event.preventDefault()
    const target =
      opener instanceof HTMLElement &&
      opener.isConnected &&
      opener !== document.body
        ? opener
        : document.querySelector<HTMLElement>(
            `[data-vault-entry="${CSS.escape(entry.id)}"], [data-tree-node="${CSS.escape(entry.id)}"]`,
          )
    target?.focus({ preventScroll: true })
  }
  const retryHandler = () => setAttempt((current) => current + 1)
  const mediaErrorHandler = () => {
    setLoading(false)
    setError(
      kind === 'video'
        ? t(
            '视频播放失败，可能是文件读取失败或浏览器不支持其编码。请重试或下载原文件。',
          )
        : t('无法预览此文件，请下载原文件'),
    )
  }
  const mediaReadyHandler = useCallback(() => setLoading(false), [])
  const previewErrorHandler = useCallback((message: string) => {
    setLoading(false)
    setError(message)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const prepare = async () => {
      setLoading(true)
      setError('')
      try {
        if (kind === 'text' || kind === 'markdown') {
          if (Number(entry.size) > 1024 * 1024)
            throw new Error(t('文本超过 1 MB，请下载查看'))
          const response = await fetch(getVaultContentUrl(entry.id), {
            signal: controller.signal,
          })
          if (!response.ok) throw new Error(t('文件读取失败，请重试'))
          setText(await response.text())
        }
        if (kind === 'text' || kind === 'markdown' || kind === 'unsupported')
          setLoading(false)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : t('预览失败'))
          setLoading(false)
        }
      }
    }
    void prepare()
    return () => controller.abort()
  }, [entry.id, entry.size, kind, attempt, t])
  const url = getVaultContentUrl(entry.id, true)
  const downloadUrl = getVaultContentUrl(entry.id)
  const isCompact = Boolean(error) || kind === 'unsupported' || kind === 'audio'
  return (
    <Dialog open onOpenChange={openHandler}>
      <DialogContent
        className={`${styles.dialog} ${surfaceStyles.surface}`}
        data-compact={isCompact || undefined}
        showCloseButton={false}
        onCloseAutoFocus={closeAutoFocusHandler}
      >
        <DialogHeader className={styles.header}>
          <div className={styles.file}>
            <VaultEntryIcon entry={entry} className={styles.fileIcon} />
            <div className={styles.fileInfo}>
              <DialogTitle className={styles.title} title={entry.name}>
                {entry.name}
              </DialogTitle>
              <DialogDescription className={styles.description}>
                {formatVaultEntryMeta(entry)}
                {t('· 只读')}
              </DialogDescription>
            </div>
          </div>
          <div className={styles.actions}>
            <Button
              variant="ghost"
              size="sm"
              className={styles.download}
              asChild
            >
              <a href={downloadUrl} download aria-label={t('下载原文件')}>
                <Download size={15} />
                <span>{t('下载')}</span>
              </a>
            </Button>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className={styles.close}
                aria-label={t('关闭预览')}
              >
                <X size={16} />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>
        <div className={styles.content}>
          {error || kind === 'unsupported' ? (
            <Empty
              className={styles.fallback}
              role={error ? 'alert' : undefined}
            >
              <EmptyHeader>
                <EmptyMedia className={styles.fileMark}>
                  <VaultEntryIcon entry={entry} />
                </EmptyMedia>
                <EmptyTitle>
                  {error ? t('暂时无法预览') : t('暂不支持此格式的预览')}
                </EmptyTitle>
                <EmptyDescription className={styles.fallbackDescription}>
                  {error ? t(error) : t('下载原文件，使用本地应用打开。')}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className={styles.fallbackActions}>
                <Button size="sm" asChild>
                  <a href={downloadUrl} download>
                    <Download size={14} />
                    {t('下载原文件')}
                  </a>
                </Button>
                {error ? (
                  <Button variant="ghost" size="sm" onClick={retryHandler}>
                    {t('重试')}
                  </Button>
                ) : null}
              </EmptyContent>
            </Empty>
          ) : kind === 'document' ? (
            <VaultDocumentPreview
              key={attempt}
              entry={entry}
              retry={attempt > 0}
              onClose={onClose}
              onReady={mediaReadyHandler}
              onError={previewErrorHandler}
            />
          ) : kind === 'pdf' ? (
            <VaultPdfPreview
              key={attempt}
              url={downloadUrl}
              onReady={mediaReadyHandler}
              onError={previewErrorHandler}
            />
          ) : (kind === 'text' || kind === 'markdown') && !loading ? (
            <Suspense fallback={<Spinner className={styles.state} />}>
              <VaultTextPreview text={text} markdown={kind === 'markdown'} />
            </Suspense>
          ) : kind === 'image' ? (
            <img
              key={attempt}
              src={url}
              alt={entry.name}
              className={styles.image}
              onLoad={mediaReadyHandler}
              onError={mediaErrorHandler}
            />
          ) : kind === 'video' ? (
            <video
              key={attempt}
              src={url}
              className={styles.media}
              controls
              playsInline
              aria-label={entry.name}
              onLoadedData={mediaReadyHandler}
              onError={mediaErrorHandler}
            />
          ) : kind === 'audio' ? (
            <audio
              key={attempt}
              src={url}
              controls
              onLoadedData={mediaReadyHandler}
              onError={mediaErrorHandler}
            />
          ) : null}
          {loading && !error && kind !== 'document' ? (
            <div className={styles.state} role="status">
              <Spinner />
              {t('正在准备预览…')}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
export { VaultPreview }
