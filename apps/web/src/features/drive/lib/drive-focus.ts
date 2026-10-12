// 弹窗移除后恢复条目操作焦点；条目已被移动或删除时返回工具栏。
const restoreDriveActionFocus = (id: string): void => {
  const restoreFocus = () =>
    (
      document.getElementById(`drive-actions-${id}`) ??
      document.getElementById(`drive-tree-actions-${id}`) ??
      document.getElementById('drive-new-folder')
    )?.focus()
  requestAnimationFrame(restoreFocus)
}

export { restoreDriveActionFocus }
