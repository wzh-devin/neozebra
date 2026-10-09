import { atom } from 'jotai'

import type { DriveEntry, DriveTreeNode } from '@/features/drive/types'

type DriveFileState = {
  rootNode: DriveTreeNode
  entryListMap: Record<string, DriveEntry[]>
}

// synthetic/local mock文件按连接ID保留在会话内，删除连接时释放文件引用。
const fileStateMapAtom = atom<Record<string, DriveFileState>>({})

export { fileStateMapAtom }
export type { DriveFileState }
