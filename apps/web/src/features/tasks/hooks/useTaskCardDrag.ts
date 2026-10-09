import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useTaskPlannerContext } from '@/features/tasks/hooks/TaskPlannerContext'

export type TaskCardDragHandlers = {
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: () => void
  onLostPointerCapture: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}

type DragState = {
  id: string
  offset: number
  targetId: string
  fromIndex: number
  targetIndex: number
  pitch: number
}
type DragSession = {
  id: string
  pointerId: number
  startY: number
  clientY: number
  scrollTop: number
  scroller: HTMLElement | null
  rowCenterList: number[]
  pitch: number
}

/**
 * 在当前任务组中预览拖动，释放后使用现有保存与撤销操作。
 *
 * @param taskIdList - 当前可手动排序的任务 ID
 * @returns 列表 ref、拖动状态及手柄事件
 */
export const useTaskCardDrag = (taskIdList: string[]) => {
  const { moveTaskHandler } = useTaskPlannerContext()
  const listRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<DragSession | null>(null)
  const stateRef = useRef<DragState | null>(null)
  const frameRef = useRef<number | null>(null)
  const settleFrameRef = useRef<number | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)

  /**
   * 停止拖动与边缘滚动，不改变任务数据。
   *
   * @param 无参数
   * @returns 无返回值；清除会话和预览
   */
  const cancelDragHandler = (): void => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    sessionRef.current = null
    stateRef.current = null
    setDragState(null)
  }

  useEffect(() => {
    /**
     * 卸载时停止动画帧，不在卸载组件上更新状态。
     *
     * @param 无参数
     * @returns 无返回值；释放动画帧
     */
    const cleanupHandler = (): void => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      if (settleFrameRef.current !== null)
        cancelAnimationFrame(settleFrameRef.current)
      sessionRef.current = null
    }
    return cleanupHandler
  }, [])

  /**
   * 根据指针和同组卡片中心更新落点与位移。
   *
   * @param 无参数
   * @returns 无返回值；更新拖动预览
   */
  const updatePreviewHandler = (): void => {
    const session = sessionRef.current
    if (!session || !listRef.current) return
    const offset =
      session.clientY -
      session.startY +
      (session.scroller?.scrollTop ?? 0) -
      session.scrollTop
    if (!stateRef.current && Math.abs(offset) < 6) return
    const rowList = [
      ...listRef.current.querySelectorAll<HTMLElement>('[data-task-id]'),
    ]
    const index = rowList.findIndex((row) => row.dataset.taskId === session.id)
    const scrollOffset = (session.scroller?.scrollTop ?? 0) - session.scrollTop
    const targetIndex = session.rowCenterList.filter(
      (center, rowIndex) =>
        rowIndex !== index && session.clientY > center - scrollOffset,
    ).length
    const targetId = rowList[targetIndex]?.dataset.taskId
    if (index < 0 || !targetId) return cancelDragHandler()
    const next: DragState = {
      id: session.id,
      offset,
      targetId,
      fromIndex: index,
      targetIndex,
      pitch: session.pitch,
    }
    if (
      stateRef.current?.offset === offset &&
      stateRef.current.targetId === targetId
    )
      return
    stateRef.current = next
    setDragState(next)
  }

  /**
   * 拖动期间在列表上下边缘连续滚动。
   *
   * @param 无参数
   * @returns 无返回值；滚动列表并调度下一帧
   */
  const scrollFrameHandler = (): void => {
    const session = sessionRef.current
    if (!session) return
    if (stateRef.current && session.scroller) {
      const rect = session.scroller.getBoundingClientRect()
      const direction =
        session.clientY < rect.top + 36
          ? -1
          : session.clientY > rect.bottom - 36
            ? 1
            : 0
      if (direction) {
        session.scroller.scrollTop += direction * 8
        updatePreviewHandler()
      }
    }
    frameRef.current = requestAnimationFrame(scrollFrameHandler)
  }

  /**
   * 从独立手柄启动主指针拖动。
   *
   * @param event - 手柄指针事件
   * @returns 无返回值；捕获指针并记录起点
   */
  const pointerDownHandler = (event: PointerEvent<HTMLButtonElement>): void => {
    const id = event.currentTarget.dataset.taskDragId
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      !id ||
      !taskIdList.includes(id) ||
      taskIdList.length < 2
    )
      return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rowList = [
      ...(listRef.current?.querySelectorAll<HTMLElement>('[data-task-id]') ??
        []),
    ]
    const row = rowList.find((entry) => entry.dataset.taskId === id)
    if (!row) return
    const pitch =
      row.getBoundingClientRect().height +
      parseFloat(getComputedStyle(row).marginBottom) -
      12
    let scroller = listRef.current?.parentElement ?? null
    while (
      scroller &&
      !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
    )
      scroller = scroller.parentElement
    sessionRef.current = {
      id,
      pointerId: event.pointerId,
      startY: event.clientY,
      clientY: event.clientY,
      scrollTop: scroller?.scrollTop ?? 0,
      scroller,
      rowCenterList: rowList.map((entry) => {
        const rect = entry.getBoundingClientRect()
        return rect.top + rect.height / 2
      }),
      pitch,
    }
    frameRef.current = requestAnimationFrame(scrollFrameHandler)
  }

  /**
   * 更新被捕获指针的位置。
   *
   * @param event - 指针移动事件
   * @returns 无返回值；更新预览
   */
  const pointerMoveHandler = (event: PointerEvent<HTMLButtonElement>): void => {
    if (sessionRef.current?.pointerId !== event.pointerId) return
    sessionRef.current.clientY = event.clientY
    updatePreviewHandler()
  }

  /**
   * 保存移动并从当前视觉位置平滑归位。
   *
   * @param id - 当前任务
   * @param direction - 组内整数位移
   * @returns 无返回值；保存顺序并播放短动画
   */
  const moveHandler = (id: string, direction: number): void => {
    const rowList = [
      ...(listRef.current?.querySelectorAll<HTMLElement>('[data-task-id]') ??
        []),
    ]
    const topMap = new Map(
      rowList.map((row) => [
        row.dataset.taskId,
        row.getBoundingClientRect().top,
      ]),
    )
    moveTaskHandler(taskIdList, id, direction)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (settleFrameRef.current !== null)
      cancelAnimationFrame(settleFrameRef.current)

    /**
     * 从旧屏幕坐标到保存后的卡片坐标播放位移。
     *
     * @param 无参数
     * @returns 无返回值；播放归位动画
     */
    const settleHandler = (): void => {
      settleFrameRef.current = null
      for (const row of rowList) {
        if (!row.isConnected) continue
        const offset =
          (topMap.get(row.dataset.taskId) ?? row.getBoundingClientRect().top) -
          row.getBoundingClientRect().top
        if (Math.abs(offset) > 1)
          row.animate(
            [
              { transform: `translateY(${offset}px)` },
              { transform: 'translateY(0)' },
            ],
            { duration: 220, easing: 'ease-out' },
          )
      }
    }
    settleFrameRef.current = requestAnimationFrame(settleHandler)
  }

  /**
   * 松开后一次保存组内插入位置。
   *
   * @param event - 指针释放事件
   * @returns 无返回值；结束预览并保存有效移动
   */
  const pointerUpHandler = (event: PointerEvent<HTMLButtonElement>): void => {
    if (sessionRef.current?.pointerId !== event.pointerId) return
    pointerMoveHandler(event)
    const state = stateRef.current
    cancelDragHandler()
    if (state) {
      const index = taskIdList.indexOf(state.id)
      const targetIndex = taskIdList.indexOf(state.targetId)
      if (index >= 0 && targetIndex >= 0 && index !== targetIndex)
        moveHandler(state.id, targetIndex - index)
    }
  }

  /**
   * 键盘上下移动或取消当前拖动。
   *
   * @param event - 手柄键盘事件
   * @returns 无返回值；移动任务或取消预览
   */
  const keyDownHandler = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const id = event.currentTarget.dataset.taskDragId
    if (event.key === 'Escape') cancelDragHandler()
    else if (id && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      cancelDragHandler()
      moveHandler(id, event.key === 'ArrowUp' ? -1 : 1)
    }
  }

  const dragHandlers: TaskCardDragHandlers = {
    onPointerDown: pointerDownHandler,
    onPointerMove: pointerMoveHandler,
    onPointerUp: pointerUpHandler,
    onPointerCancel: cancelDragHandler,
    onLostPointerCapture: cancelDragHandler,
    onKeyDown: keyDownHandler,
  }
  return { listRef, dragState, dragHandlers }
}
