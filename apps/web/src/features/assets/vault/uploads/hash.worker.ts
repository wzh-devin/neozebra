import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

type HashRequest = { file: File; partSize: number }
type WorkerScope = {
  postMessage: (value: unknown) => void
  onmessage: ((event: MessageEvent<HashRequest>) => void) | null
}
const workerScope = self as unknown as WorkerScope

/**
 * 按分片增量读取文件，内存占用不随文件大小增长。
 *
 * @param event - 文件与服务端一致的分片大小
 * @returns 无返回值；向主线程发送校验进度、清单或错误
 */
const hashHandler = async (event: MessageEvent<HashRequest>) => {
  const { file, partSize } = event.data
  try {
    const hashes: string[] = []
    let done = 0
    for (let offset = 0; offset < file.size; offset += partSize) {
      const hash = sha256.create()
      const reader = file
        .slice(offset, offset + partSize)
        .stream()
        .getReader()
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        hash.update(chunk.value)
        done += chunk.value.length
        workerScope.postMessage({ progress: file.size ? done / file.size : 1 })
      }
      hashes.push(bytesToHex(hash.digest()))
    }
    const fingerprint = bytesToHex(
      sha256(
        new TextEncoder().encode(
          `${file.size}:${partSize}:${hashes.join(':')}`,
        ),
      ),
    )
    workerScope.postMessage({ hashes, fingerprint })
  } catch {
    workerScope.postMessage({ error: '无法读取所选文件，请重新选择' })
  }
}
workerScope.onmessage = hashHandler
