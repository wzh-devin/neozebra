import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { buildMailHtmlDocument } from '@/features/inbox/utils/mail-html'
import styles from '@/features/inbox/components/InboxMessageBody.module.css'

const renderMarkdownLink = ({ href, children }: ComponentProps<'a'>) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
)

const renderMarkdownImage = ({ src, alt }: ComponentProps<'img'>) => (
  <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />
)

/**
 * 阅读 HTML 或 Markdown 邮件，自动加载图片并让 HTML 正文与阅读区共用滚动条。
 *
 * @param props - 已解析的正文和格式
 * @returns 隔离 HTML 文档或安全 Markdown 内容 JSX
 */
const InboxMessageBody = ({
  body,
  format,
}: {
  body: string
  format: 'html' | 'markdown'
}) => {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(360)
  const html = useMemo(
    () => (format === 'html' ? buildMailHtmlDocument(body) : ''),
    [body, format],
  )

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !html) return
    let observer: ResizeObserver | undefined
    let resizeFrame = 0
    const loadHandler = () => {
      observer?.disconnect()
      cancelAnimationFrame(resizeFrame)
      const content = frame.contentDocument?.body
      if (!content) return
      const resizeHandler = () => {
        cancelAnimationFrame(resizeFrame)

        // 避免在 ResizeObserver 布局回调内改变 iframe 高度形成反馈循环。
        resizeFrame = requestAnimationFrame(() =>
          setHeight(Math.min(100_000, Math.max(120, content.scrollHeight))),
        )
      }
      observer = new ResizeObserver(resizeHandler)
      observer.observe(content)
      resizeHandler()
    }
    frame.addEventListener('load', loadHandler)
    if (frame.contentDocument?.readyState === 'complete') loadHandler()
    return () => {
      frame.removeEventListener('load', loadHandler)
      observer?.disconnect()
      cancelAnimationFrame(resizeFrame)
    }
  }, [html])

  return (
    <div className={styles.body}>
      {format === 'html' ? (
        <iframe
          ref={frameRef}
          title="Email HTML content"
          className={styles.html}
          style={{ height }}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          srcDoc={html}
        />
      ) : (
        <div className={styles.markdown}>
          <Markdown
            skipHtml
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{ a: renderMarkdownLink, img: renderMarkdownImage }}
          >
            {body}
          </Markdown>
        </div>
      )}
    </div>
  )
}

export { InboxMessageBody }
