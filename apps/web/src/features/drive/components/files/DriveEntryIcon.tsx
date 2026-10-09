import {
  File,
  FileArchive,
  FileBraces,
  FileChartColumn,
  FileCode,
  FileHeadphone,
  FileImage,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  type LucideIcon,
} from 'lucide-react'

import type { DriveEntry } from '@/features/drive/types'
import { DriveFolderIcon } from '@/features/drive/components/files/DriveFolderIcon'
import styles from '@/features/drive/components/files/DriveEntryIcon.module.css'

type FileTypeConfig = {
  type: string
  extensions: string[]
  icon: LucideIcon
}

const fileTypeList: FileTypeConfig[] = [
  { type: 'json', extensions: ['json', 'jsonc'], icon: FileBraces },
  { type: 'pdf', extensions: ['pdf'], icon: FileText },
  {
    type: 'document',
    extensions: ['doc', 'docx', 'odt', 'rtf'],
    icon: FilePenLine,
  },
  { type: 'text', extensions: ['txt', 'md', 'mdx', 'log'], icon: FileText },
  {
    type: 'spreadsheet',
    extensions: ['xls', 'xlsx', 'csv', 'tsv', 'ods'],
    icon: FileSpreadsheet,
  },
  {
    type: 'presentation',
    extensions: ['ppt', 'pptx', 'odp'],
    icon: FileChartColumn,
  },
  {
    type: 'image',
    extensions: [
      'png',
      'jpg',
      'jpeg',
      'gif',
      'webp',
      'avif',
      'svg',
      'bmp',
      'ico',
      'heic',
      'tif',
      'tiff',
    ],
    icon: FileImage,
  },
  {
    type: 'video',
    extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'],
    icon: FileVideoCamera,
  },
  {
    type: 'audio',
    extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'],
    icon: FileHeadphone,
  },
  {
    type: 'archive',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
    icon: FileArchive,
  },
  {
    type: 'code',
    extensions: [
      'js',
      'jsx',
      'ts',
      'tsx',
      'html',
      'css',
      'scss',
      'py',
      'go',
      'rs',
      'java',
      'sh',
      'sql',
      'yaml',
      'yml',
      'toml',
      'xml',
    ],
    icon: FileCode,
  },
]

type DriveEntryIconProps = {
  entry: Pick<DriveEntry, 'kind' | 'name'>
}

/**
 * 根据文件扩展名展示类型图标，目录复用语义图标，未知格式使用通用图标。
 *
 * @param props - 文件或目录的名称与类型
 * @returns 带文件类型样式的装饰图标 JSX
 */
const DriveEntryIcon = ({ entry }: DriveEntryIconProps) => {
  if (entry.kind === 'folder') return <DriveFolderIcon name={entry.name} />

  const extensionIndex = entry.name.lastIndexOf('.')
  const extension =
    extensionIndex > 0 ? entry.name.slice(extensionIndex + 1).toLowerCase() : ''
  const presentation = fileTypeList.find((item) =>
    item.extensions.includes(extension),
  ) ?? {
    type: 'file',
    icon: File,
  }
  const Icon = presentation.icon

  return (
    <Icon
      className={styles.icon}
      data-file-type={presentation.type}
      aria-hidden="true"
    />
  )
}

export { DriveEntryIcon }
