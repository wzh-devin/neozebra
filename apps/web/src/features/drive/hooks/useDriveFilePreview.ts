import { useEffect, useState } from 'react'

import {
  getDriveFilePreviewKind,
  loadDriveFilePreview,
  type DriveFilePreview,
} from '@/features/drive/data/drive-file-preview'

type PreviewState =
  | { status: 'loading' | 'unavailable' | 'unsupported' }
  | { status: 'ready'; preview: DriveFilePreview }
  | { status: 'error'; message: string }

/** 读取单个弹窗的文件内容并管理临时 URL 和过期异步结果。
 * @param file - 可选本地文件；弹窗按条目 ID 独立挂载
 * @returns 加载、内容或失败状态
 */
const useDriveFilePreview = (file?: File): PreviewState => {
  const [state, setState] = useState<PreviewState>(
    !file
      ? { status: 'unavailable' }
      : getDriveFilePreviewKind(file) === 'unsupported'
        ? { status: 'unsupported' }
        : { status: 'loading' },
  )

  useEffect(() => {
    if (!file || getDriveFilePreviewKind(file) === 'unsupported') return
    let isActive = true
    let url: string | undefined
    /** 完成文件读取，卸载后的结果仅释放资源。
     * @param 无参数
     * @returns 无返回值；更新预览状态或释放过期资源
     */
    const loadPreview = async (): Promise<void> => {
      try {
        const preview = await loadDriveFilePreview(file)
        if (!isActive) {
          if (preview.url) URL.revokeObjectURL(preview.url)
          return
        }
        url = preview.url
        setState({ status: 'ready', preview })
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
      if (url) URL.revokeObjectURL(url)
    }
  }, [file])

  return state
}

export { useDriveFilePreview }
