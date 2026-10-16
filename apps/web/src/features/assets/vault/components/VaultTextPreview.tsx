import { useI18n, t } from '@/lib/i18n'
import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ComponentProps } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import styles from './VaultTextPreview.module.css'

const renderLink = ({ href, children }: ComponentProps<'a'>) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
)

// 文件内的图片地址可能指向外部服务，阅读原文时不自动请求。
const renderImage = ({ alt }: ComponentProps<'img'>) => (
  <span className={styles.image}>
    {t('图片：')}
    {alt || t('未命名')}
  </span>
)

/**
 * 渲染安全的 Markdown/GFM，并保留原文；普通文本不执行 HTML 或脚本。
 *
 * @param props - 已有的有界文本及格式
 * @returns 文本或可切换的 Markdown 阅读区 JSX
 */
const VaultTextPreview = ({
  text,
  markdown,
}: {
  text: string
  markdown: boolean
}) => {
  const { t } = useI18n()

  const [mode, setMode] = useState('rendered')
  return (
    <div className={styles.root}>
      {markdown ? (
        <Tabs value={mode} onValueChange={setMode} className={styles.tabs}>
          <TabsList>
            <TabsTrigger value="rendered">{t('预览')}</TabsTrigger>
            <TabsTrigger value="source">{t('原文')}</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {markdown && mode === 'rendered' ? (
        <article className={styles.markdown}>
          {text ? (
            <Markdown
              remarkPlugins={[remarkGfm]}
              skipHtml
              components={{ a: renderLink, img: renderImage }}
            >
              {text}
            </Markdown>
          ) : (
            <p>{t('（空文件）')}</p>
          )}
        </article>
      ) : (
        <pre className={styles.text}>{text || t('（空文件）')}</pre>
      )}
    </div>
  )
}
export { VaultTextPreview }
