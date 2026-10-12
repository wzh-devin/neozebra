import { useRef, useState, type MouseEvent } from 'react'
import { FolderTree } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { DriveUploadTasks } from '@/features/drive/components/uploads/DriveUploadTasks'
import { DriveWorkspace } from '@/features/drive/components/DriveWorkspace'
import { DriveFilesToolbar } from '@/features/drive/components/files/DriveFilesToolbar'
import { DriveFilesTable } from '@/features/drive/components/files/DriveFilesTable'
import { DriveFolderPanel } from '@/features/drive/components/files/DriveFolderPanel'
import { DriveMoveDialog } from '@/features/drive/components/files/DriveMoveDialog'
import { DriveMoveDnd } from '@/features/drive/components/files/DriveMoveDnd'
import { DriveRenameDialog } from '@/features/drive/components/files/DriveRenameDialog'
import { DriveFilePreviewDialog } from '@/features/drive/components/files/DriveFilePreviewDialog'
import type { DriveEntry, DriveTreeNode } from '@/features/drive/types'
import type { DriveView } from '@/features/drive/hooks/useDriveView'
import { restoreDriveActionFocus } from '@/features/drive/lib/drive-focus'
import { getDriveDirectoryPathList } from '@/features/drive/data/drive-directories'

import styles from '@/features/drive/components/files/DriveProviderPageContent.module.css'
import overlayStyles from '@/features/drive/styles/drive-overlays.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

/**
 * 组合 Drive 目录导航、文件工作区及远端条目操作。
 *
 * @param props - Drive Provider 状态与操作
 * @returns Provider 文件工作区 JSX
 */
const DriveProviderPageContent = (view: DriveView) => {
  const { isMobile } = useSidebar()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const deleteEntryIdRef = useRef('')
  const [entryToDelete, setEntryToDelete] = useState<DriveEntry | null>(null)
  const [entryToRename, setEntryToRename] = useState<DriveEntry | null>(null)
  const [entryToPreview, setEntryToPreview] = useState<DriveEntry | null>(null)
  const [entryToMove, setEntryToMove] = useState<DriveEntry | null>(null)
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false)

  // 打开本地文件选择器。
  const triggerUploadHandler = (): void => uploadInputRef.current?.click()

  /**
   * 确认删除条目。
   *
   * @param event - 确认按钮事件
   * @returns 无返回值；更新文件列表并关闭确认界面
   */
  const confirmDeleteHandler = async (
    event: MouseEvent<HTMLButtonElement>,
  ): Promise<void> => {
    event.preventDefault()
    if (!entryToDelete) return
    setDeleteError(null)
    try {
      await view.deleteEntry(entryToDelete.id)
      setEntryToDelete(null)
    } catch (cause) {
      setDeleteError(
        cause instanceof Error ? cause.message : 'Could not delete this item.',
      )
    }
  }

  // 关闭删除确认界面。
  const deleteOpenChangeHandler = (open: boolean): void => {
    if (!open && !view.busy) {
      setEntryToDelete(null)
      setDeleteError(null)
    }
  }

  // 删除确认关闭后恢复焦点，成功删除时回到工具栏。
  const restoreDeleteFocusHandler = (event: Event): void => {
    event.preventDefault()
    restoreDriveActionFocus(deleteEntryIdRef.current)
  }

  /**
   * 让文件树复用条目操作，并关闭窄屏目录面板以切换到编辑弹窗。
   *
   * @param action - 菜单或预览操作
   * @param node - 文件树节点及其原始元数据
   * @returns 无返回值；打开对应编辑界面
   */
  const treeActionHandler = (action: string, node: DriveTreeNode): void => {
    if (view.busy) return
    if (action === 'New folder') setNewFolderParent(node.id)
    else if (node.id !== 'root') {
      setIsFolderDialogOpen(false)
      entryActionHandler(
        action,
        node.entry ?? {
          id: node.id,
          name: node.name,
          kind: 'folder',
          parentId:
            getDriveDirectoryPathList(view.rootNode, node.id).at(-2)?.id ??
            'root',
          size: '—',
          updatedAt: '—',
          connectionId: view.provider.id,
        },
      )
    }
  }

  // 选择目录并关闭窄屏目录面板。
  const selectDirectoryHandler = (nodeId: string): void => {
    view.selectDirectory(nodeId)
    setIsFolderDialogOpen(false)
  }

  /**
   * 处理文件条目操作。
   *
   * @param action - 操作名称
   * @param entry - 当前条目
   * @returns 无返回值；打开编辑或确认界面，或显示本地反馈
   */
  const entryActionHandler = (action: string, entry: DriveEntry): void => {
    if (view.busy) return
    if (action === 'Rename') setEntryToRename(entry)
    else if (action === 'Delete') {
      deleteEntryIdRef.current = entry.id
      setEntryToDelete(entry)
    } else if (action === 'Preview') setEntryToPreview(entry)
    else if (action === 'Move') setEntryToMove(entry)
    else if (action === 'Download') view.downloadEntry(entry)
  }

  // 关闭名称编辑界面。
  const closeRenameHandler = (): void => setEntryToRename(null)

  // 关闭文件预览。
  const closePreviewHandler = (): void => setEntryToPreview(null)

  /**
   * 保存条目名称。
   *
   * @param name - 输入的新名称
   * @returns 无返回值；更新条目名称并关闭编辑界面
   */
  const saveRenameHandler = async (name: string): Promise<void> => {
    if (!entryToRename) return
    await view.renameEntry(entryToRename.id, name)
    setEntryToRename(null)
  }

  // 打开新目录表单并在操作完成后关闭。
  const createFolderHandler = (): void =>
    setNewFolderParent(view.selectedDirectoryId)
  const closeFolderHandler = (): void => setNewFolderParent(null)
  const saveFolderHandler = async (name: string): Promise<void> => {
    if (newFolderParent === null) return
    await view.createFolder(name, newFolderParent)
    setNewFolderParent(null)
  }
  const closeMoveHandler = (): void => setEntryToMove(null)
  const saveMoveHandler = async (parent: string): Promise<void> => {
    if (entryToMove) await view.moveEntry(entryToMove, parent)
  }

  const folderPanel = (
    <DriveFolderPanel
      {...view}
      selectDirectory={selectDirectoryHandler}
      onAction={treeActionHandler}
    />
  )

  const error = view.error ?? view.syncError ?? view.syncStatus?.error
  const isInitialSyncing =
    !view.syncStatus?.hasSnapshot &&
    !error &&
    (!view.syncStatus ||
      view.syncStatus.state === 'pending' ||
      view.syncStatus.state === 'syncing')

  const filePanel = (
    <>
      <DriveFilesToolbar
        {...view}
        loading={view.loading || isInitialSyncing}
        onCreateFolder={createFolderHandler}
      />
      {(!view.loading && view.syncStatus?.hasSnapshot) ||
      view.visibleEntryList.length > 0 ? (
        <DriveFilesTable
          entryList={view.visibleEntryList}
          busy={view.busy}
          searchQuery={view.searchQuery}
          onSelect={view.selectDirectory}
          onAction={entryActionHandler}
          onUpload={triggerUploadHandler}
          onCreateFolder={createFolderHandler}
        />
      ) : null}
      <footer className={styles.footer}>
        <span>
          {view.visibleEntryList.length}{' '}
          {view.visibleEntryList.length === 1 ? 'item' : 'items'}
        </span>
        {view.hasMore ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={view.loading || view.busy}
            onClick={view.loadMore}
          >
            Load more
          </Button>
        ) : null}
      </footer>
    </>
  )

  return (
    <DriveMoveDnd
      connectionId={view.provider.id}
      rootNode={view.rootNode}
      busy={view.busy}
      onMove={view.moveEntry}
    >
      <DriveWorkspace
        actions={
          <>
            <Dialog
              open={isFolderDialogOpen}
              onOpenChange={setIsFolderDialogOpen}
            >
              <DialogTrigger asChild>
                <Button
                  aria-label="Browse folders"
                  className={styles['folder-trigger']}
                  size="icon-sm"
                  variant="ghost"
                >
                  <FolderTree aria-hidden="true" />
                </Button>
              </DialogTrigger>
              <DialogContent
                className={`${surfaceStyles.surface} ${styles['folder-dialog']}`}
              >
                <DialogHeader className="sr-only">
                  <DialogTitle>Browse folders</DialogTitle>
                  <DialogDescription>
                    Select a folder in {view.provider.name}.
                  </DialogDescription>
                </DialogHeader>
                {folderPanel}
              </DialogContent>
            </Dialog>
            <DriveUploadTasks
              connection={view.provider}
              parent={view.selectedDirectoryId}
              directoryName={
                view.directoryPathList.at(-1)?.name || view.provider.name
              }
              inputRef={uploadInputRef}
            />
          </>
        }
      >
        {isMobile ? (
          <div className={styles['content-panel']}>{filePanel}</div>
        ) : (
          <ResizablePanelGroup
            orientation="horizontal"
            className={styles.panels}
          >
            <ResizablePanel
              defaultSize="240px"
              minSize="200px"
              maxSize="38%"
              className={styles['tree-panel']}
            >
              {folderPanel}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel className={styles['content-panel']}>
              {filePanel}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
        <AlertDialog
          open={Boolean(entryToDelete)}
          onOpenChange={deleteOpenChangeHandler}
        >
          <AlertDialogContent
            className={overlayStyles.dialog}
            onCloseAutoFocus={restoreDeleteFocusHandler}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {entryToDelete?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the remote item and, for a folder, all its
                contents.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError ? <p role="alert">{deleteError}</p> : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={view.busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={view.busy}
                onClick={confirmDeleteHandler}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {entryToMove ? (
          <DriveMoveDialog
            entry={entryToMove}
            connectionId={view.provider.id}
            onSave={saveMoveHandler}
            onClose={closeMoveHandler}
          />
        ) : null}
        {newFolderParent !== null ? (
          <DriveRenameDialog
            title="New folder"
            entry={{
              id: 'new-folder',
              name: '',
              kind: 'folder',
              size: '—',
              updatedAt: '—',
              parentId: newFolderParent,
            }}
            onSave={saveFolderHandler}
            onClose={closeFolderHandler}
          />
        ) : null}
        {entryToRename ? (
          <DriveRenameDialog
            key={entryToRename.id}
            entry={entryToRename}
            onClose={closeRenameHandler}
            onSave={saveRenameHandler}
          />
        ) : null}
        {entryToPreview ? (
          <DriveFilePreviewDialog
            key={entryToPreview.id}
            entry={entryToPreview}
            onClose={closePreviewHandler}
          />
        ) : null}
      </DriveWorkspace>
    </DriveMoveDnd>
  )
}

export { DriveProviderPageContent }
