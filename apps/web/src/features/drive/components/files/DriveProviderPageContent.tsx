import { useRef, useState, type ChangeEvent } from 'react'
import { FolderTree, Upload } from 'lucide-react'

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
import { DriveWorkspace } from '@/features/drive/components/DriveWorkspace'
import { DriveFilesToolbar } from '@/features/drive/components/files/DriveFilesToolbar'
import { DriveFilesTable } from '@/features/drive/components/files/DriveFilesTable'
import { DriveFolderPanel } from '@/features/drive/components/files/DriveFolderPanel'
import { DriveRenameDialog } from '@/features/drive/components/files/DriveRenameDialog'
import { DriveFilePreviewDialog } from '@/features/drive/components/files/DriveFilePreviewDialog'
import type { DriveEntry, DriveTreeNode } from '@/features/drive/types'
import type { DriveView } from '@/features/drive/hooks/useDriveView'

import styles from '@/features/drive/components/files/DriveProviderPageContent.module.css'
import overlayStyles from '@/features/drive/styles/drive-overlays.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

/**
 * 组合 Drive 目录导航、文件工作区及本地条目操作。
 *
 * @param props - Drive Provider 状态与操作
 * @returns Provider 文件工作区 JSX
 */
const DriveProviderPageContent = (view: DriveView) => {
  const { isMobile } = useSidebar()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [entryToDelete, setEntryToDelete] = useState<DriveEntry | null>(null)
  const [entryToRename, setEntryToRename] = useState<DriveEntry | null>(null)
  const [entryToPreview, setEntryToPreview] = useState<DriveEntry | null>(null)
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false)

  // 打开本地文件选择器。
  const triggerUploadHandler = (): void => uploadInputRef.current?.click()

  /**
   * 将选中的文件加入当前 mock 目录。
   *
   * @param event - 文件选择事件
   * @returns 无返回值；更新文件列表并重置输入
   */
  const uploadInputChangeHandler = (
    event: ChangeEvent<HTMLInputElement>,
  ): void => {
    const file = event.target.files?.[0]
    if (!file) return
    view.uploadFile(file)
    event.target.value = ''
  }

  /**
   * 确认删除条目。
   *
   * @param 无参数
   * @returns 无返回值；更新文件列表并关闭确认界面
   */
  const confirmDeleteHandler = (): void => {
    if (!entryToDelete) return
    view.deleteEntry(entryToDelete.id)
    setEntryToDelete(null)
  }

  // 关闭删除确认界面。
  const deleteOpenChangeHandler = (open: boolean): void => {
    if (!open) setEntryToDelete(null)
  }

  // 处理目录树操作。
  const treeActionHandler = (action: string, node: DriveTreeNode): void => {
    if (action === 'New folder') view.createFolder()
    else view.showEntryFeedback(action, node.name)
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
    if (action === 'Rename') setEntryToRename(entry)
    else if (action === 'Delete') setEntryToDelete(entry)
    else if (action === 'Preview') setEntryToPreview(entry)
    else view.showEntryFeedback(action, entry.name)
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
  const saveRenameHandler = (name: string): void => {
    if (!entryToRename) return
    view.renameEntry(entryToRename.id, name)
    setEntryToRename(null)
  }

  const folderPanel = (
    <DriveFolderPanel
      {...view}
      selectDirectory={selectDirectoryHandler}
      onAction={treeActionHandler}
    />
  )

  const filePanel = (
    <>
      <DriveFilesToolbar {...view} />
      <DriveFilesTable
        entryList={view.visibleEntryList}
        searchQuery={view.searchQuery}
        onSelect={view.selectDirectory}
        onAction={entryActionHandler}
        onUpload={triggerUploadHandler}
        onCreateFolder={view.createFolder}
      />
      <footer className={styles.footer}>
        <span>
          {view.visibleEntryList.length}{' '}
          {view.visibleEntryList.length === 1 ? 'item' : 'items'}
        </span>
      </footer>
    </>
  )

  return (
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
          <input
            ref={uploadInputRef}
            className={styles['hidden-input']}
            type="file"
            onChange={uploadInputChangeHandler}
            aria-label="Choose a file to upload"
          />
          <Button
            size="sm"
            onClick={triggerUploadHandler}
            className={styles.upload}
          >
            <Upload aria-hidden="true" />
            Upload
          </Button>
        </>
      }
    >
      {isMobile ? (
        <div className={styles['content-panel']}>{filePanel}</div>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className={styles.panels}>
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
        <AlertDialogContent className={overlayStyles.dialog}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entryToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the item from the current folder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteHandler}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  )
}

export { DriveProviderPageContent }
