import { useI18n } from '@/lib/i18n'
import { useEffect, useRef, useState } from 'react'
import type { PDFViewer, EventBus } from 'pdfjs-dist/web/pdf_viewer.mjs'
import type { PDFDocumentLoadingTask } from 'pdfjs-dist'
import type { KeyboardEvent } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import styles from './VaultPdfPreview.module.css'

/**
 * 复用 PDF.js 官方阅读器，保留按页渲染、文本选择与搜索；关闭时终止 Worker 和请求。
 *
 * @param props - 同源 PDF 地址和加载/错误回调
 * @returns 带搜索、缩放与翻页的 PDF 阅读区 JSX
 */
const VaultPdfPreview = ({
  url,
  onReady,
  onError,
}: {
  url: string
  onReady: () => void
  onError: (message: string) => void
}) => {
  const { t } = useI18n()

  const containerRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<PDFViewer | null>(null)
  const busRef = useRef<EventBus | null>(null)
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [notFound, setNotFound] = useState(false)
  useEffect(() => {
    let active = true
    let loading: PDFDocumentLoadingTask | undefined
    let viewer: PDFViewer | undefined
    let observer: ResizeObserver | undefined
    const prepare = async () => {
      try {
        await import('pdfjs-dist/web/pdf_viewer.css')
        const pdf = await import('pdfjs-dist')
        pdf.GlobalWorkerOptions.workerSrc = workerUrl
        const { PDFViewer, PDFLinkService, PDFFindController, EventBus } =
          await import('pdfjs-dist/web/pdf_viewer.mjs')
        if (!active || !containerRef.current || !documentRef.current) return
        const bus = new EventBus()
        const link = new PDFLinkService({
          eventBus: bus,
          externalLinkTarget: 2,
          externalLinkRel: 'noopener noreferrer',
        })
        const find = new PDFFindController({ eventBus: bus, linkService: link })
        viewer = new PDFViewer({
          container: containerRef.current,
          viewer: documentRef.current,
          eventBus: bus,
          linkService: link,
          findController: find,
          annotationMode: 0,
          annotationEditorMode: -1,
          maxCanvasPixels: 16 * 1024 * 1024,
        })
        viewerRef.current = viewer
        busRef.current = bus
        link.setViewer(viewer)
        const pagesInitHandler = () => {
          if (active && viewer) viewer.currentScaleValue = 'page-width'
        }
        const pageChangeHandler = ({ pageNumber }: { pageNumber: number }) => {
          if (active) setPage(pageNumber)
        }
        const renderedHandler = ({ error }: { error?: unknown }) => {
          if (!active) return
          if (error) {
            onError(t('PDF 页面无法渲染，请下载原文件查看'))
            return
          }
          setReady(true)
          onReady()
        }
        const findStateHandler = ({ state }: { state: number }) => {
          if (active) setNotFound(state === 1)
        }
        bus.on('pagesinit', pagesInitHandler)
        bus.on('pagechanging', pageChangeHandler)
        bus.on('pagerendered', renderedHandler)
        bus.on('updatefindcontrolstate', findStateHandler)
        loading = pdf.getDocument({
          url,
          withCredentials: false,
          cMapUrl: '/vendor/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
          wasmUrl: '/vendor/pdfjs/wasm/',
          enableXfa: false,
        })
        const document = await loading.promise
        if (!active) {
          await loading.destroy()
          return
        }
        if (document.numPages > 2000)
          throw new Error(t('PDF 超过 2000 页，请下载查看'))
        viewer.setDocument(document)
        link.setDocument(document)
        setCount(document.numPages)
        observer = new ResizeObserver(() => {
          if (active && viewer && viewer.currentScaleValue === 'page-width')
            viewer.currentScaleValue = 'page-width'
        })
        observer.observe(containerRef.current)
      } catch (cause) {
        if (active)
          onError(
            cause instanceof Error && /[\u4e00-\u9fff]/.test(cause.message)
              ? cause.message
              : t('PDF 无法读取，可能已损坏、加密或被移除'),
          )
      }
    }
    void prepare()
    return () => {
      active = false
      observer?.disconnect()
      viewer?.setDocument(null)
      viewer?.cleanup()
      viewerRef.current = null
      busRef.current = null
      void loading?.destroy().catch(() => undefined)
    }
  }, [url, onReady, onError, t])
  const previousHandler = () => {
    if (viewerRef.current)
      viewerRef.current.currentPageNumber = Math.max(1, page - 1)
  }
  const nextHandler = () => {
    if (viewerRef.current)
      viewerRef.current.currentPageNumber = Math.min(count, page + 1)
  }
  const zoomInHandler = () => {
    if (viewerRef.current)
      viewerRef.current.currentScale = Math.min(
        3,
        viewerRef.current.currentScale * 1.2,
      )
  }
  const zoomOutHandler = () => {
    if (viewerRef.current)
      viewerRef.current.currentScale = Math.max(
        0.25,
        viewerRef.current.currentScale / 1.2,
      )
  }
  const searchHandler = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter')
      busRef.current?.dispatch('find', {
        source: busRef.current,
        type: 'again',
        query: search,
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious: event.shiftKey,
        matchDiacritics: false,
      })
  }
  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={14} />
          <Input
            aria-label={t('搜索文档内容')}
            placeholder={t('搜索内容，回车查找')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={searchHandler}
          />
          {notFound ? <span>{t('未找到')}</span> : null}
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={zoomOutHandler}
          disabled={!ready}
          aria-label={t('缩小')}
        >
          <ZoomOut size={15} />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={zoomInHandler}
          disabled={!ready}
          aria-label={t('放大')}
        >
          <ZoomIn size={15} />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={previousHandler}
          disabled={page <= 1}
          aria-label={t('上一页')}
        >
          <ChevronLeft size={15} />
        </Button>
        <span className={styles.page} aria-live="polite">
          {count ? `${page} / ${count}` : '—'}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={nextHandler}
          disabled={page >= count}
          aria-label={t('下一页')}
        >
          <ChevronRight size={15} />
        </Button>
      </div>
      <div className={styles.body}>
        <div
          ref={containerRef}
          className={styles.viewport}
          tabIndex={0}
          role="region"
          aria-label={t('PDF 文档内容')}
        >
          <div ref={documentRef} className="pdfViewer" />
        </div>
        {!ready ? (
          <div className={styles.state} role="status">
            <Spinner />
            {t('正在加载页面…')}
          </div>
        ) : null}
      </div>
    </div>
  )
}
export { VaultPdfPreview }
