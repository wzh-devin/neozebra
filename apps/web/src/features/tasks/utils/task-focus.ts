/** 任务移出当前清单后保持键盘操作入口，不干扰仍在编辑的控件。
 * @param 无参数
 * @returns 无返回值；在渲染后按需聚焦任务内容区
 */
export const restoreTaskFocusHandler = (): void => {
  requestAnimationFrame(() => {
    if (document.activeElement === document.body)
      document.getElementById('task-content')?.focus({ preventScroll: true })
  })
}
