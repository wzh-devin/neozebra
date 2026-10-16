import { useI18n } from '@/lib/i18n'
import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui/spinner'
import { requestVault } from '@/services/assets/vault'
import type { VaultEntry } from '@/features/assets/vault/types'
import { VaultPdfPreview } from './VaultPdfPreview'
import styles from './VaultDocumentPreview.module.css'
import { buildVaultSheetDocument } from '../preview/sheet-preview'

type DocumentPreview = {
  state: 'queued' | 'running' | 'ready' | 'failed'
  message?: string
  kind?: 'pdf' | 'frame' | 'sheet'
  url?: string
}

/**
 * 提交一次文档任务并查询持久状态，按结果选择 PDF 或隔离引擎查看器。
 *
 * @param props - 当前条目、重试标记及预览生命周期回调
 * @returns 文档准备状态或只读查看器 JSX
 */
const VaultDocumentPreview = ({
  entry,
  retry,
  onReady,
  onError,
  onClose,
}: {
  entry: VaultEntry
  retry: boolean
  onReady: () => void
  onError: (message: string) => void
  onClose: () => void
}) => {
  const { t, locale } = useI18n()

  const prepared = useRef(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const query = useQuery({
    queryKey: ['vault', 'preview', entry.id, entry.updatedAt, retry],
    queryFn: async ({ signal }) => {
      if (!prepared.current) {
        const result = await requestVault<DocumentPreview>(
          `/entries/${entry.id}/preview`,
          { method: 'POST', body: JSON.stringify({ retry }), signal },
        )
        prepared.current = true
        return result
      }
      return requestVault<DocumentPreview>(`/entries/${entry.id}/preview`, {
        signal,
      })
    },
    refetchInterval: (query) =>
      query.state.data && ['queued', 'running'].includes(query.state.data.state)
        ? 1000
        : false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const sheetDocument = useMemo(() => {
    if (query.data?.kind !== 'sheet' || !query.data.url) return {}
    try {
      return {
        html: buildVaultSheetDocument(
          query.data.url,
          entry.name,
          window.location.origin,
          locale,
        ),
      }
    } catch {
      return { error: t('表格预览地址无效，请重试') }
    }
  }, [query.data, entry.name, locale, t])
  useEffect(() => {
    if (sheetDocument.error) onError(sheetDocument.error)
  }, [sheetDocument.error, onError])
  useEffect(() => {
    if (query.error) onError(t(query.error.message))
    else if (query.data?.state === 'failed')
      onError(t(query.data.message || '此文件无法预览，请下载查看'))
  }, [query.error, query.data, onError, t])
  useEffect(() => {
    if (
      !['frame', 'sheet'].includes(query.data?.kind ?? '') ||
      !query.data?.url
    )
      return
    let ready = false
    const messageHandler = (event: MessageEvent) => {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        event.origin !== 'null'
      )
        return
      if (event.data?.type === 'vault-preview-ready') {
        ready = true
        onReady()
      }
      if (event.data?.type === 'vault-preview-close') onClose()
      if (event.data?.type === 'vault-preview-error')
        onError(
          typeof event.data.message === 'string'
            ? event.data.message.slice(0, 160)
            : t('表格无法预览，请下载原文件查看'),
        )
    }
    window.addEventListener('message', messageHandler)
    const timer = setTimeout(() => {
      if (!ready) onError(t('预览页面未能加载，请重试或下载原文件'))
    }, 30_000)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('message', messageHandler)
    }
  }, [
    query.data?.kind,
    query.data?.url,
    sheetDocument.html,
    onReady,
    onError,
    onClose,
    t,
  ])
  const frameErrorHandler = () => onError(t('预览服务连接失败，请重试'))
  if (query.data?.state !== 'ready' || !query.data.url)
    return (
      <div className={styles.state} role="status">
        <Spinner />
        <span>
          {(query.data?.message ? t(query.data.message) : undefined) ||
            (query.data?.state === 'running'
              ? t('正在生成文档预览…')
              : t('正在准备文档预览…'))}
        </span>
      </div>
    )
  if (query.data.kind === 'pdf')
    return (
      <VaultPdfPreview
        url={query.data.url}
        onReady={onReady}
        onError={onError}
      />
    )
  return (
    <iframe
      ref={iframeRef}
      className={styles.frame}
      src={query.data.kind === 'sheet' ? undefined : query.data.url}
      srcDoc={sheetDocument.html}
      title={entry.name + (' ' + t('只读预览'))}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      onError={frameErrorHandler}
    />
  )
}
export { VaultDocumentPreview }
