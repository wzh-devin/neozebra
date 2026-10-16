/**
 * 递归读取原生拖入的目录，保留相对路径并处理浏览器分批返回目录条目。
 *
 * @param transfer - 本次 drop 的文件条目
 * @returns 包含相对目录路径的文件列表
 */
const collectDropFileList = async (transfer: DataTransfer): Promise<File[]> => {
  const roots = Array.from(transfer.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry)
  if (!roots.length) return Array.from(transfer.files)
  const files: File[] = []
  const visit = async (entry: FileSystemEntry, parent: string) => {
    const path = parent ? `${parent}/${entry.name}` : entry.name
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      )
      if (parent)
        Object.defineProperty(file, 'webkitRelativePath', { value: path })
      files.push(file)
      return
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    while (true) {
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      )
      if (!entries.length) break
      for (const child of entries) await visit(child, path)
    }
  }
  for (const entry of roots) await visit(entry, '')
  return files
}
export { collectDropFileList }
