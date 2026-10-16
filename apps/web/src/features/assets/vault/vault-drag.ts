import type { VaultEntry } from './types'

// 原目录与条目自身都不是移动目标；目录循环仍由服务端校验。
const canMoveVaultEntry = (
  entry: Pick<VaultEntry, 'id' | 'parentId'> | undefined,
  targetId: string | undefined,
): boolean =>
  Boolean(
    entry && targetId && targetId !== entry.id && targetId !== entry.parentId,
  )

export { canMoveVaultEntry }
