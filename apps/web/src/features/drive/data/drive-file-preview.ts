export type DriveFilePreviewKind =
  'image' | 'pdf' | 'text' | 'audio' | 'video' | 'unsupported'
export type DriveFilePreview = {
  kind: DriveFilePreviewKind
  url?: string
  text?: string
}

const previewMimeRecord: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}
const textExtensionSet = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'jsonl',
  'csv',
  'tsv',
  'log',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'js',
  'jsx',
  'ts',
  'tsx',
  'css',
  'html',
  'htm',
  'py',
  'go',
  'java',
  'rs',
  'sh',
  'sql',
])

/** 解析文件真实 MIME，缺失时才使用原始文件扩展名。
 * @param file - 本地文件，改名不会改变此原始来源
 * @returns 预览使用的 MIME
 */
const getDriveFileMime = (file: File): string => {
  const mime = file.type.toLowerCase()
  if (mime && mime !== 'application/octet-stream') return mime
  const extension = file.name.toLowerCase().split('.').at(-1) ?? ''
  return Object.hasOwn(previewMimeRecord, extension)
    ? previewMimeRecord[extension]
    : textExtensionSet.has(extension)
      ? 'text/plain'
      : ''
}

/** 按内容类型选择浏览器预览方式；HTML 也只展示纯文本。
 * @param file - 本地文件
 * @returns 预览类型或不支持类型
 */
export const getDriveFilePreviewKind = (file: File): DriveFilePreviewKind => {
  const mime = getDriveFileMime(file)
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('text/') || /(?:json|xml|javascript|yaml)$/.test(mime))
    return 'text'
  return 'unsupported'
}

/** 读取安全文本或建立当前弹窗使用的 Blob URL。
 * @param file - 本地文件
 * @returns 预览内容；调用方负责撤销 URL，读取失败时抛出错误
 */
export const loadDriveFilePreview = async (
  file: File,
): Promise<DriveFilePreview> => {
  const kind = getDriveFilePreviewKind(file)
  if (kind === 'unsupported') return { kind }
  if (kind === 'text') {
    if (file.size > 1024 * 1024)
      throw new Error('Text preview is limited to 1 MB.')
    return { kind, text: await file.text() }
  }
  if (kind === 'pdf' && (await file.slice(0, 5).text()) !== '%PDF-') {
    throw new Error('This file could not be read as a PDF.')
  }
  return {
    kind,
    url: URL.createObjectURL(
      new Blob([file], { type: getDriveFileMime(file) }),
    ),
  }
}

/** 显示本地文件的实际大小。
 * @param bytes - 文件字节数
 * @returns 带单位的文件大小
 */
export const formatDriveFileSize = (bytes: number): string => {
  const unitList = ['B', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(
    Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)),
    3,
  )
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(bytes / 1024 ** unitIndex)} ${unitList[unitIndex]}`
}
