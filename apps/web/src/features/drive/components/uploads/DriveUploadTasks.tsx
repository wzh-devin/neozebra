import {
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type RefObject,
} from 'react'
import { ListTodo, Upload, Files, FolderUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { DriveUploadTasksTable } from '@/features/drive/components/uploads/DriveUploadTasksTable'
import { useDriveUploads } from '@/features/drive/hooks/useDriveUploads'
import type { DriveProvider } from '@/features/drive/types'
import styles from '@/features/drive/components/uploads/DriveUploadTasks.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

type DriveUploadTasksProps = {
  connection: DriveProvider
  parent?: string
  directoryName?: string
  className?: string
  compact?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
}

/**
 * 打开当前账号上传任务弹窗，文件选择入口绑定选择时的目标目录。
 *
 * @param props - 关联账号、当前目录和入口样式
 * @returns 上传按钮和独立居中弹窗
 */
const DriveUploadTasks = ({
  connection,
  parent,
  directoryName,
  className,
  compact = false,
  inputRef: externalInputRef,
}: DriveUploadTasksProps) => {
  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState(0)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const directoryInputRef = useRef<HTMLInputElement>(null)
  const localInputRef = useRef<HTMLInputElement>(null)
  const inputRef = externalInputRef ?? localInputRef
  const uploads = useDriveUploads(connection.id, open)
  const selectFilesHandler = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length || parent === undefined) return
    uploads.addDriveUploadFiles(
      connection.id,
      parent,
      directoryName ?? connection.name,
      files,
    )
    setSelection((value) => value + 1)
    setOpen(true)
  }

  // 两个入口共用弹窗，关闭后回到本次实际点击的按钮。
  const rememberOpenerHandler = (event: MouseEvent<HTMLButtonElement>) => {
    openerRef.current = event.currentTarget
  }
  const openUploadHandler = (event: MouseEvent<HTMLButtonElement>) => {
    openerRef.current = event.currentTarget
    setOpen(true)
  }
  const restoreFocusHandler = (event: Event) => {
    if (openerRef.current?.isConnected) {
      event.preventDefault()
      openerRef.current.focus()
    }
  }
  const chooseFilesHandler = () => inputRef.current?.click()
  const chooseFolderHandler = () => directoryInputRef.current?.click()
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            className={className}
            variant="ghost"
            size={compact ? 'icon-sm' : 'sm'}
            aria-label={'Upload tasks for ' + connection.name}
            onClick={rememberOpenerHandler}
          >
            <ListTodo aria-hidden="true" />
            {!compact ? (
              <span>
                Uploads
                {uploads.activeCount ? ' (' + uploads.activeCount + ')' : ''}
              </span>
            ) : null}
            {compact && uploads.activeCount ? (
              <span className={styles.dot} aria-hidden="true" />
            ) : null}
          </Button>
        </DialogTrigger>
        <DialogContent
          className={[styles.panel, surfaceStyles.surface].join(' ')}
          onCloseAutoFocus={restoreFocusHandler}
        >
          <DialogHeader>
            <DialogTitle>Uploads · {connection.name}</DialogTitle>
            <DialogDescription>
              {parent !== undefined
                ? 'Upload files or a folder to ' +
                  (directoryName ?? connection.name) +
                  '.'
                : 'Upload tasks for this account.'}
            </DialogDescription>
          </DialogHeader>
          {parent !== undefined ? (
            <div className={styles.selection}>
              <Button variant="outline" size="sm" onClick={chooseFilesHandler}>
                <Files aria-hidden="true" />
                Choose files
              </Button>
              <Button variant="outline" size="sm" onClick={chooseFolderHandler}>
                <FolderUp aria-hidden="true" />
                Choose folder
              </Button>
            </div>
          ) : null}
          <div className={styles.content}>
            <DriveUploadTasksTable
              key={connection.id + ':' + selection}
              connectionId={connection.id}
              localTasks={uploads.tasks}
            />
          </div>
        </DialogContent>
      </Dialog>
      {parent !== undefined ? (
        <>
          <input
            ref={inputRef}
            className={styles.hidden}
            type="file"
            multiple
            onChange={selectFilesHandler}
            aria-label="Choose files to upload"
          />
          <input
            ref={directoryInputRef}
            className={styles.hidden}
            type="file"
            multiple
            {...{ webkitdirectory: '' }}
            onChange={selectFilesHandler}
            aria-label="Choose folder to upload"
          />
          <Button size="sm" onClick={openUploadHandler} aria-haspopup="dialog">
            <Upload aria-hidden="true" />
            Upload
          </Button>
        </>
      ) : null}
    </>
  )
}

export { DriveUploadTasks }
