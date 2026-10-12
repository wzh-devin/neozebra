import { getDriveContentUrl, getDrivePreviewFile } from '@/services/drive'
import type { DriveEntry } from '@/features/drive/types'
import { useEffect, useState } from 'react'
import { getDriveOfficePreview } from '@/services/drive-office'

import {
  getDriveFilePreviewKind,
  loadDriveFilePreview,
  type DriveFilePreview,
} from '@/features/drive/data/drive-file-preview'

type PreviewState =
  | { status: 'loading' | 'unavailable' | 'unsupported' }
  | { status: 'ready'; preview: DriveFilePreview }
  | { status: 'error'; message: string }

/**
 * 文档与PDF统一使用ONLYOFFICE，媒体使用内容流，其余管理临时URL及过期结果。
 *
 * @param entry - 本地或远端文件；弹窗按条目 ID 独立挂载
 * @returns 加载、内容或失败状态
 */
const useDriveFilePreview = (entry: DriveEntry): PreviewState => {
  const file = entry.localFile
  const remoteFile = new File([], entry.name, { type: entry.mimeType })
  const kind = getDriveFilePreviewKind(file ?? remoteFile)
  const [state, setState] = useState<PreviewState>(
    kind === 'unsupported'
      ? { status: 'unsupported' }
      : !file && !entry.connectionId
        ? { status: 'unavailable' }
        : { status: 'loading' },
  )

  useEffect(() => {
    if (kind === 'unsupported' || (!file && !entry.connectionId)) return
    const controller = new AbortController()
    let isActive = true
    let url: string | undefined

    /**
     * 完成文件读取，卸载后的结果仅释放资源。
     *
     * @param 无参数
     * @returns 无返回值；更新预览状态或释放过期资源
     */
    const loadPreview = async (): Promise<void> => {
      try {
        const preview: DriveFilePreview =
          !file && kind === 'office'
            ? {
                kind,
                office: await getDriveOfficePreview(entry, controller.signal),
              }
            : !file && (kind === 'audio' || kind === 'video')
              ? { kind, url: getDriveContentUrl(entry) }
              : await loadDriveFilePreview(
                  file ??
                    (await getDrivePreviewFile(
                      entry,
                      controller.signal,
                      kind === 'text' ? 1024 * 1024 : undefined,
                    )),
                )
        if (!isActive) {
          if (preview.url) URL.revokeObjectURL(preview.url)
          return
        }
        url = preview.url
        setState(
          preview.kind === 'unsupported'
            ? { status: 'unsupported' }
            : { status: 'ready', preview },
        )
      } catch (error) {
        if (isActive)
          setState({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'File content could not be read.',
          })
      }
    }
    void loadPreview()
    return () => {
      isActive = false
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [file, entry, kind])

  return state
}

export { useDriveFilePreview }
