import { useState } from 'react'
import { FileWarning } from 'lucide-react'

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import type { DriveFilePreview } from '@/features/drive/data/drive-file-preview'
import { DriveOfficePreview } from './DriveOfficePreview'

import styles from '@/features/drive/components/files/DriveFilePreviewDialog.module.css'

type DriveFilePreviewContentProps = {
  preview: DriveFilePreview
  name: string
}

/**
 * 展示文件内容及浏览器解码中的加载、失败状态。
 *
 * @param props - 已读取的文件内容和可访问名称
 * @returns 安全纯文本或浏览器媒体预览 JSX
 */
const DriveFilePreviewContent = ({
  preview,
  name,
}: DriveFilePreviewContentProps) => {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(
    ['image', 'audio', 'video'].includes(preview.kind),
  )

  // 完成媒体解码。
  const mediaLoadHandler = (): void => setIsLoading(false)

  // 处理媒体读取或解码失败。
  const mediaErrorHandler = (): void => setHasError(true)

  if (preview.kind === 'office' && preview.office)
    return <DriveOfficePreview preview={preview.office} name={name} />

  if (hasError)
    return (
      <Empty className={styles.empty} role="alert">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileWarning aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Could not load preview</EmptyTitle>
          <EmptyDescription>
            The file may be damaged or use an unsupported media format.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  if (preview.kind === 'text')
    return preview.text ? (
      <pre
        className={styles.text}
        tabIndex={0}
        aria-label={`Contents of ${name}`}
      >
        {preview.text}
      </pre>
    ) : (
      <Empty className={styles.empty}>
        <EmptyHeader>
          <EmptyTitle>This file is empty</EmptyTitle>
          <EmptyDescription>There is no text to display.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <div className={styles.media}>
      {isLoading ? (
        <div className={styles.loading}>
          <Spinner />
          Loading preview…
        </div>
      ) : null}
      {preview.kind === 'image' ? (
        <img
          className={styles.image}
          src={preview.url}
          alt={name}
          onLoad={mediaLoadHandler}
          onError={mediaErrorHandler}
        />
      ) : preview.kind === 'video' ? (
        <video
          className={styles.video}
          src={preview.url}
          controls
          preload="metadata"
          aria-label={`Preview of ${name}`}
          onLoadedMetadata={mediaLoadHandler}
          onError={mediaErrorHandler}
        />
      ) : (
        <audio
          className={styles.audio}
          src={preview.url}
          controls
          preload="metadata"
          aria-label={`Preview of ${name}`}
          onLoadedMetadata={mediaLoadHandler}
          onError={mediaErrorHandler}
        />
      )}
    </div>
  )
}

export { DriveFilePreviewContent }
