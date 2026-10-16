import { pointerWithin } from '@dnd-kit/core'
import type { CollisionDetection } from '@dnd-kit/core'
import type { VaultEntry } from '@/features/assets/vault/types'
import { canMoveVaultEntry } from './vault-drag.ts'

/**
 * 使用 dnd-kit 指针命中，并排除滚动裁切或弹窗遮挡的目录，避免落入隐藏条目。
 *
 * @param args - dnd-kit 当前指针位置及目标容器
 * @returns 实际可见目录的碰撞列表
 */
const getVaultCollisionList: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) return []
  const { x, y } = args.pointerCoordinates
  const target = document
    .elementFromPoint(x, y)
    ?.closest('[data-vault-drop-id]')
  if (!target) return []
  const entry = args.active.data.current?.entry as VaultEntry | undefined
  if (
    !canMoveVaultEntry(
      entry,
      target.getAttribute('data-vault-drop-id') ?? undefined,
    )
  )
    return []
  const isVisibleTarget = (collision: { id: string | number }) =>
    args.droppableContainers.find((container) => container.id === collision.id)
      ?.node.current === target
  return pointerWithin(args).filter(isVisibleTarget)
}
export { getVaultCollisionList }
