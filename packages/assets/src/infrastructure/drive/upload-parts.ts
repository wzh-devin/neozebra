import { open } from 'node:fs/promises'
import type { DriveUpload } from './types.ts'

/**
 * 从临时文件读取单个4MiB分片，空文件仍有一个空分片。
 *
 * @param file - 有界临时上传文件
 * @param part - 从0开始的分片序号
 * @returns 当前分片字节；始终关闭文件句柄
 */
const readUploadPart = async (
  file: DriveUpload,
  part: number,
  partSize = 4 * 1024 * 1024,
): Promise<Buffer<ArrayBuffer>> => {
  const size = Math.max(0, Math.min(partSize, file.size - part * partSize))
  const buffer = Buffer.alloc(size)
  const handle = await open(file.path, 'r')
  try {
    let offset = 0
    while (offset < size) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        size - offset,
        part * partSize + offset,
      )
      if (!bytesRead) throw new Error('Upload content could not be read.')
      offset += bytesRead
    }
    return buffer
  } finally {
    await handle.close()
  }
}
const getUploadPartCount = (
  file: DriveUpload,
  partSize = 4 * 1024 * 1024,
): number => Math.max(1, Math.ceil(file.size / partSize))
export { readUploadPart, getUploadPartCount }
