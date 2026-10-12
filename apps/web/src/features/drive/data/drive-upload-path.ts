/**
 * 提取文件夹选择的相对目录，保留选中根目录并拒绝越界路径。
 *
 * @param file - 普通文件或原生文件夹选择返回的文件
 * @returns 不含文件名的相对目录列表；普通多文件选择返回空列表
 */
const getDriveUploadDirectoryPathList = (file: File): string[] => {
  if (!file.webkitRelativePath) return []
  const segments = file.webkitRelativePath.split('/')
  if (
    segments.at(-1) !== file.name ||
    segments.some(
      (name) =>
        !name ||
        name === '.' ||
        name === '..' ||
        /[\p{Cc}\\]/u.test(name) ||
        new TextEncoder().encode(name).length > 255,
    )
  )
    throw new Error(
      'This folder contains an invalid upload path. Rename the affected file or folder and retry.',
    )
  return segments.slice(0, -1)
}
export { getDriveUploadDirectoryPathList }
