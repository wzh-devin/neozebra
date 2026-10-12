import { useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { DriveEntryIcon } from '@/features/drive/components/files/DriveEntryIcon'
import { canMoveDriveEntry } from '@/features/drive/data/drive-directories'
import type { DriveEntry, DriveTreeNode } from '@/features/drive/types'
import styles from '@/features/drive/components/files/DriveMoveDnd.module.css'

type DriveMoveDndProps = {
  connectionId: string
  rootNode: DriveTreeNode
  busy: boolean
  onMove: (entry: DriveEntry, parent: string) => Promise<void>
  children: ReactNode
}

/**
 * 让文件树和列表跨面板投放到目录，复用同一移动接口和错误反馈。
 *
 * @param props - 当前连接、文件树、操作状态及工作区内容
 * @returns 拖放上下文和跟随指针的条目预览
 */
const DriveMoveDnd = ({
  connectionId,
  rootNode,
  busy,
  onMove,
  children,
}: DriveMoveDndProps) => {
  const [draggedEntry, setDraggedEntry] = useState<DriveEntry | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  )

  /**
   * 仅合法目录参与命中，禁止文件、原目录及自身子树产生投放高亮。
   *
   * @param args - 当前拖动条目、指针及已注册的目标
   * @returns 指针命中的合法目录列表
   */
  const collisionDetectionHandler: CollisionDetection = (args) => {
    const entry = args.active.data.current?.entry as DriveEntry | undefined
    if (busy || !entry) return []
    return pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) => {
        const parent = container.data.current?.directoryId
        return (
          typeof parent === 'string' &&
          canMoveDriveEntry(entry, parent, rootNode, connectionId)
        )
      }),
    })
  }

  // dnd-kit 数据仅由本工作区的树节点和文件行注册。
  const dragStartHandler = (event: DragStartEvent): void => {
    const entry = event.active.data.current?.entry as DriveEntry | undefined
    if (!busy && entry) setDraggedEntry(entry)
  }
  const dragCancelHandler = (): void => setDraggedEntry(null)

  /**
   * 放开后重新校验目标，失败由既有移动流程提示且不删除源条目。
   *
   * @param event - 拖放条目与目标目录
   * @returns 无返回值；结束拖动并最多提交一次移动
   */
  const dragEndHandler = (event: DragEndEvent): void => {
    setDraggedEntry(null)
    const entry = event.active.data.current?.entry as DriveEntry | undefined
    const parent = event.over?.data.current?.directoryId
    if (
      !busy &&
      entry &&
      typeof parent === 'string' &&
      canMoveDriveEntry(entry, parent, rootNode, connectionId)
    )
      void onMove(entry, parent).catch(() => undefined)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionHandler}
      onDragStart={dragStartHandler}
      onDragCancel={dragCancelHandler}
      onDragEnd={dragEndHandler}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'To move with the keyboard, open this item’s actions menu and choose Move.',
        },
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {draggedEntry ? (
          <div className={styles.preview}>
            <DriveEntryIcon entry={draggedEntry} />
            <span>{draggedEntry.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

export { DriveMoveDnd }
