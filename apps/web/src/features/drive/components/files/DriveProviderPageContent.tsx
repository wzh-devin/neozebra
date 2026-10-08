import { useRef, useState, type ChangeEvent } from 'react'
import {
  Archive,
  Download,
  File,
  Folder,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { Link } from 'react-router-dom'

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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageFrame } from '@/components/shared/page-frame'
import { DriveFileTree } from '@/features/drive/components/files/DriveFileTree'
import type { DriveEntry, DriveTreeNode } from '@/features/drive/types'
import type { DriveView } from '@/features/drive/hooks/useDriveView'

import styles from '@/features/drive/components/files/DriveProviderPageContent.module.css'

type DriveProviderPageContentProps = DriveView

/**
 * 返回文件树中指定目录的展示名称。
 *
 * @param node - 当前树节点
 * @param nodeId - 目标目录标识
 * @returns 目录名称或空字符串
 */
const findDirectoryName = (node: DriveTreeNode, nodeId: string): string => {
  if (node.id === nodeId) {
    return node.name
  }

  for (const child of node.children ?? []) {
    const childName = findDirectoryName(child, nodeId)
    if (childName) {
      return childName
    }
  }

  return ''
}

/**
 * 渲染 Provider 文件树和当前目录内容。
 *
 * @param props - Drive Provider 状态和操作
 * @returns Provider 文件空间 JSX
 */
const DriveProviderPageContent = ({
  provider,
  rootNode,
  selectedDirectoryId,
  expandedSet,
  visibleEntryList,
  searchQuery,
  setSearchQuery,
  toggleDirectory,
  selectDirectory,
  createFolder,
  uploadFile,
  deleteEntry,
  renameEntry,
  showEntryFeedback,
}: DriveProviderPageContentProps) => {
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [entryToDelete, setEntryToDelete] = useState<DriveEntry | null>(null)
  const selectedDirectoryName =
    findDirectoryName(rootNode, selectedDirectoryId) || provider.name

  /**
   * 打开本地文件选择器。
   *
   * @param 无参数
   * @returns 无返回值；打开文件选择器
   */
  const triggerUploadHandler = (): void => {
    uploadInputRef.current?.click()
  }

  /**
   * 将选择的文件加入当前 mock 目录。
   *
   * @param event - 文件选择事件
   * @returns 无返回值；更新 Drive 文件列表
   */
  const uploadInputChangeHandler = (
    event: ChangeEvent<HTMLInputElement>,
  ): void => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    uploadFile(file.name)
    event.target.value = ''
  }

  /**
   * 设置待删除的文件条目。
   *
   * @param entry - 待删除条目
   * @returns 无返回值；打开确认弹窗
   */
  const requestDeleteHandler = (entry: DriveEntry): void => {
    setEntryToDelete(entry)
  }

  /**
   * 确认删除文件条目。
   *
   * @param 无参数
   * @returns 无返回值；删除条目并关闭弹窗
   */
  const confirmDeleteHandler = (): void => {
    if (!entryToDelete) {
      return
    }

    deleteEntry(entryToDelete.id)
    setEntryToDelete(null)
  }

  /**
   * 处理文件树右键操作。
   *
   * @param action - 操作名称
   * @param node - 当前目录节点
   * @returns 无返回值；执行本地反馈或操作
   */
  const treeActionHandler = (action: string, node: DriveTreeNode): void => {
    if (action === 'New folder') {
      createFolder()
      return
    }

    showEntryFeedback(action, node.name)
  }

  /**
   * 处理文件条目操作反馈。
   *
   * @param action - 操作名称
   * @param entry - 当前文件条目
   * @returns 无返回值；执行本地反馈或重命名
   */
  const entryActionHandler = (action: string, entry: DriveEntry): void => {
    if (action === 'Rename') {
      renameEntry(entry.id)
      return
    }

    if (action === 'Delete') {
      requestDeleteHandler(entry)
      return
    }

    showEntryFeedback(action, entry.name)
  }

  return (
    <PageFrame
      title={provider.name}
      kicker="Drive"
      description="Browse and manage connected files"
      actions={
        <div className={styles['header-actions']}>
          <input
            ref={uploadInputRef}
            className={styles['hidden-input']}
            type="file"
            onChange={uploadInputChangeHandler}
          />
          <Button onClick={triggerUploadHandler}>
            <Upload aria-hidden="true" />
            Upload
          </Button>
        </div>
      }
    >
      <div className={styles['mobile-tree-trigger']}>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">
              <Menu aria-hidden="true" />
              Browse folders
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className={styles['mobile-tree-sheet']}>
            <SheetHeader>
              <SheetTitle>{provider.name}</SheetTitle>
            </SheetHeader>
            <DriveFileTree
              rootNode={rootNode}
              expandedSet={expandedSet}
              selectedDirectoryId={selectedDirectoryId}
              onToggle={toggleDirectory}
              onSelect={selectDirectory}
              onAction={treeActionHandler}
            />
          </SheetContent>
        </Sheet>
      </div>

      <ResizablePanelGroup
        orientation="horizontal"
        className={styles['drive-panels']}
      >
        <ResizablePanel
          defaultSize="26%"
          minSize="20%"
          maxSize="38%"
          className={styles['tree-panel']}
        >
          <div className={styles['tree-panel-header']}>
            <span>Folders</span>
            <Button
              aria-label="Create folder"
              size="icon-xs"
              variant="ghost"
              onClick={createFolder}
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>
          <DriveFileTree
            rootNode={rootNode}
            expandedSet={expandedSet}
            selectedDirectoryId={selectedDirectoryId}
            onToggle={toggleDirectory}
            onSelect={selectDirectory}
            onAction={treeActionHandler}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="74%" className={styles['content-panel']}>
          <div className={styles['content-toolbar']}>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={`/assets/drive/${provider.id}`}>
                      {provider.name}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {selectedDirectoryId !== 'root' ? (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{selectedDirectoryName}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
              </BreadcrumbList>
            </Breadcrumb>
            <div className={styles['content-toolbar-actions']}>
              <div className={styles['search-field']}>
                <Search aria-hidden="true" />
                <Input
                  aria-label="Search files"
                  placeholder="Search files"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <Button variant="outline" onClick={createFolder}>
                <Plus aria-hidden="true" />
                New folder
              </Button>
            </div>
          </div>

          {visibleEntryList.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className={styles['actions-column']} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEntryList.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {entry.kind === 'folder' ? (
                        <button
                          className={styles['entry-link']}
                          onClick={() => selectDirectory(entry.id)}
                          type="button"
                        >
                          <Folder aria-hidden="true" />
                          {entry.name}
                        </button>
                      ) : (
                        <span className={styles['entry-name']}>
                          <File aria-hidden="true" />
                          {entry.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{entry.updatedAt}</TableCell>
                    <TableCell>{entry.size}</TableCell>
                    <TableCell className={styles['actions-column']}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label={`Actions for ${entry.name}`}
                            size="icon-sm"
                            variant="ghost"
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              entryActionHandler('Download', entry)
                            }
                          >
                            <Download aria-hidden="true" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => entryActionHandler('Rename', entry)}
                          >
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => entryActionHandler('Move', entry)}
                          >
                            <Archive aria-hidden="true" />
                            Move
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => entryActionHandler('Delete', entry)}
                          >
                            <Trash2 aria-hidden="true" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className={styles['empty-state']}>
              <EmptyHeader>
                <EmptyTitle>No files in this folder</EmptyTitle>
                <EmptyDescription>
                  Upload a file or create a new folder to get started.
                </EmptyDescription>
              </EmptyHeader>
              <Button onClick={triggerUploadHandler}>
                <Upload aria-hidden="true" />
                Upload file
              </Button>
            </Empty>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

      <AlertDialog
        open={Boolean(entryToDelete)}
        onOpenChange={(open) => !open && setEntryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entryToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the item from the local mock workspace.
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
    </PageFrame>
  )
}

export { DriveProviderPageContent }
