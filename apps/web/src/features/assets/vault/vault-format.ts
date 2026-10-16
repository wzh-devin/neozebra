import { t } from '@/lib/i18n'
import type { VaultEntry } from '@/features/assets/vault/types'

const formatVaultSize = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1024 ** 2
      ? `${(size / 1024).toFixed(1)} KB`
      : size < 1024 ** 3
        ? `${(size / 1024 ** 2).toFixed(1)} MB`
        : `${(size / 1024 ** 3).toFixed(1)} GB`

/**
 * 按文件后缀选择现有阅读器，媒体的实际解码能力由浏览器判断。
 *
 * @param name - 完整文件名
 * @returns 阅读器类型，未接入的格式使用下载回退
 */
const getPreviewKind = (name: string) => {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? ''
  if (/^(png|jpe?g|gif|webp|avif|bmp)$/.test(extension)) return 'image'
  if (/^(mp4|webm|ogv|mov)$/.test(extension)) return 'video'
  if (/^(mp3|wav|ogg|m4a)$/.test(extension)) return 'audio'
  if (extension === 'pdf') return 'pdf'
  if (/^(md|markdown)$/.test(extension)) return 'markdown'
  if (
    /^(docx?|dotx?|odt|rtf|pptx?|ppsx?|odp|xlsx?|xlsm|csv|tsv|ods|wps|et|dps|ofd|epub|eml|msg|xmind|drawio|bpmn|tiff?|heic|heif|zip|rar|7z|tar|gz)$/.test(
      extension,
    )
  )
    return 'document'
  if (/^(txt|json|log|yaml|yml|xml|html|css|js|ts|go|svg)$/.test(extension))
    return 'text'
  return 'unsupported'
}

/**
 * 根据条目种类和有效后缀生成类型名称。
 *
 * @param entry - 文件名称与种类
 * @returns 文件夹、文件格式或通用文件说明
 */
const formatVaultEntryType = (entry: Pick<VaultEntry, 'kind' | 'name'>) => {
  if (entry.kind === 'folder') return t('文件夹')
  const dot = entry.name.lastIndexOf('.')
  return dot > 0 && dot < entry.name.length - 1
    ? t('{0} 文件', entry.name.slice(dot + 1).toUpperCase())
    : t('文件')
}

/**
 * 为缩略图和预览生成类型与大小说明。
 *
 * @param entry - 文件名称、种类与字节数
 * @returns 文件夹说明，或文件格式和大小
 */
const formatVaultEntryMeta = (
  entry: Pick<VaultEntry, 'kind' | 'name' | 'size'>,
) =>
  entry.kind === 'folder'
    ? t('文件夹')
    : `${formatVaultEntryType(entry)} · ${formatVaultSize(Number(entry.size))}`

export {
  formatVaultSize,
  formatVaultEntryType,
  formatVaultEntryMeta,
  getPreviewKind,
}
