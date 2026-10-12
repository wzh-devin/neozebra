import { useEffect, useState } from 'react'
import { Folder } from 'lucide-react'
import { EditorDialogContent } from '@/components/shared/editor-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { getDriveEntryPage } from '@/services/drive'
import type { DriveEntry } from '@/features/drive/types'
import { restoreDriveActionFocus } from '@/features/drive/lib/drive-focus'
import formStyles from '@/components/shared/editor-dialog/EditorForm.module.css'

type DriveMoveDialogProps = {
  entry: DriveEntry
  connectionId: string
  onClose: () => void
  onSave: (parent: string) => Promise<void>
}

/**
 * 在已绑定根目录内选择移动目标，懒加载目标目录并保留失败后的选择。
 *
 * @param props - 待移动条目、连接及保存关闭操作
 * @returns 移动目录选择弹窗
 */
const DriveMoveDialog = ({
  entry,
  connectionId,
  onClose,
  onSave,
}: DriveMoveDialogProps) => {
  const [parent, setParent] = useState('root')
  const [page, setPage] = useState<{
    entries: DriveEntry[]
    path: { id: string; name: string }[]
    nextCursor: string | null
  }>({ entries: [], path: [], nextCursor: null })
  const [cursor, setCursor] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const loadFolders = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await getDriveEntryPage(connectionId, parent, {
          kind: 'folder',
          cursor,
          signal: controller.signal,
        })
        if (!controller.signal.aborted)
          setPage((current) => ({
            ...result,
            entries: cursor
              ? [...current.entries, ...result.entries]
              : result.entries,
          }))
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Could not load folders.',
          )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadFolders()
    return () => controller.abort()
  }, [connectionId, parent, cursor, retry])
  const selectFolderHandler = (id: string) => {
    setParent(id)
    setCursor('')
    setPage({ entries: [], path: [], nextCursor: null })
  }
  const saveMoveHandler = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(parent)
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not move this item.',
      )
    } finally {
      setSaving(false)
    }
  }
  const openChangeHandler = (open: boolean) => {
    if (!open && !saving) onClose()
  }
  const retryLoadHandler = () => setRetry((current) => current + 1)
  const loadMoreHandler = () => {
    if (page.nextCursor) setCursor(page.nextCursor)
  }

  // 等待弹窗移除后恢复到条目操作；条目已移动时返回工具栏。
  const restoreFocusHandler = (event: Event): void => {
    event.preventDefault()
    restoreDriveActionFocus(entry.id)
  }
  const renderPathButton = (part: { id: string; name: string }) => (
    <Button
      key={part.id}
      size="sm"
      variant="ghost"
      disabled={saving}
      onClick={selectFolderHandler.bind(null, part.id)}
    >
      {part.name || 'Root'}
    </Button>
  )
  const renderFolderButton = (folder: DriveEntry) => (
    <Button
      key={folder.id}
      variant="ghost"
      className="justify-start"
      disabled={saving || folder.id === entry.id}
      onClick={selectFolderHandler.bind(null, folder.id)}
    >
      <Folder aria-hidden="true" />
      {folder.name}
    </Button>
  )
  return (
    <Dialog open onOpenChange={openChangeHandler}>
      <EditorDialogContent
        onCloseAutoFocus={restoreFocusHandler}
        title={`Move ${entry.name}`}
        description="Choose a destination in this Drive."
      >
        <div className={formStyles.form}>
          <nav aria-label="Destination path" className="flex flex-wrap">
            {page.path.map(renderPathButton)}
          </nav>
          <div className="grid max-h-64 overflow-auto" aria-busy={loading}>
            {page.entries.map(renderFolderButton)}
            {loading ? (
              <Spinner />
            ) : !page.entries.length && !error ? (
              <p role="status">No subfolders. You can move the item here.</p>
            ) : null}
            {page.nextCursor ? (
              <Button
                variant="ghost"
                disabled={loading || saving}
                onClick={loadMoreHandler}
              >
                Load more folders
              </Button>
            ) : null}
          </div>
          {error ? (
            <div role="alert">
              <p>{error}</p>
              <Button
                variant="ghost"
                disabled={saving}
                onClick={retryLoadHandler}
              >
                Retry
              </Button>
            </div>
          ) : null}
          <DialogFooter className={formStyles.footer}>
            <Button variant="outline" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={
                loading ||
                saving ||
                Boolean(error) ||
                parent === entry.parentId ||
                page.path.some((part) => part.id === entry.id)
              }
              onClick={saveMoveHandler}
            >
              {saving ? 'Moving…' : 'Move here'}
            </Button>
          </DialogFooter>
        </div>
      </EditorDialogContent>
    </Dialog>
  )
}
export { DriveMoveDialog }
