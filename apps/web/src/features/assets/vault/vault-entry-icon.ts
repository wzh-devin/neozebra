import {
  File,
  FileArchive,
  FileChartColumn,
  FileCode,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  Folder,
  FolderOpen,
} from 'lucide-react'
import type { VaultEntry } from './types'

const fileIconList = [
  {
    extension: /^(csv|tsv|xlsx?|xlsm|ods|et)$/,
    type: 'spreadsheet',
    Icon: FileSpreadsheet,
  },
  {
    extension: /^(pptx?|ppsx?|odp|dps)$/,
    type: 'presentation',
    Icon: FileChartColumn,
  },
  { extension: /^(pdf|ofd)$/, type: 'pdf', Icon: FileText },
  {
    extension: /^(docx?|dotx?|odt|rtf|wps)$/,
    type: 'document',
    Icon: FileText,
  },
  {
    extension: /^(png|jpe?g|gif|webp|avif|bmp|tiff?|heic|heif|svg)$/,
    type: 'image',
    Icon: FileImage,
  },
  { extension: /^(mp4|webm|ogv|mov)$/, type: 'video', Icon: FileVideoCamera },
  { extension: /^(mp3|wav|ogg|m4a|flac|aac)$/, type: 'audio', Icon: FileMusic },
  {
    extension: /^(zip|rar|7z|tar|gz|bz2|xz)$/,
    type: 'archive',
    Icon: FileArchive,
  },
  {
    extension: /^(json|ya?ml|xml|html?|css|[cm]?[jt]sx?|go|py|sh|sql)$/,
    type: 'code',
    Icon: FileCode,
  },
  { extension: /^(txt|md|markdown|log)$/, type: 'text', Icon: FileText },
] as const

/**
 * 按条目和实际后缀选择语义图标，避免把表格、演示稿归为普通文档。
 *
 * @param entry - 条目种类和原始名称
 * @param expanded - 文件夹是否展开
 * @returns 共享图标组件与文件类别；隐藏文件、无后缀和未知后缀使用通用文件图标
 */
const getVaultEntryIcon = (
  entry: Pick<VaultEntry, 'kind' | 'name'>,
  expanded = false,
) => {
  if (entry.kind === 'folder')
    return { type: 'folder', Icon: expanded ? FolderOpen : Folder }
  const dot = entry.name.lastIndexOf('.')
  const extension = dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : ''
  return (
    fileIconList.find((item) => item.extension.test(extension)) ?? {
      type: 'file',
      Icon: File,
    }
  )
}

export { getVaultEntryIcon }
