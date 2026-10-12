import { useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { Pause, Play, RotateCcw, X, Check, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogClose } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { TableRow, TableCell } from '@/components/ui/table'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { formatDriveFileSize } from '@/features/drive/data/drive-file-preview'
import { DriveEntryIcon } from '@/features/drive/components/files/DriveEntryIcon'
import {
  addDriveUploadFiles,
  controlDriveUpload,
  hasUploadFile,
} from '@/features/drive/data/drive-uploads'
import type {
  DriveUploadTask,
  DriveUploadAction,
} from '@/features/drive/upload-types'
import styles from '@/features/drive/components/uploads/DriveUploadTasks.module.css'

const statusLabelRecord: Record<DriveUploadTask['status'], string> = {
  waiting: 'Waiting',
  preparing: 'Preparing file',
  receiving: 'Receiving file',
  queued: 'Queued for Drive',
  transferring: 'Uploading to Drive',
  paused: 'Paused',
  failed: 'Failed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/**
 * 展示上传进度和控制，点击格式图标、文件名或目标目录进入对应父目录。
 *
 * @param props - 账号和上传任务
 * @returns 任务条目JSX
 */
const DriveUploadTaskRow = ({
  connectionId,
  task,
}: {
  connectionId: string
  task: DriveUploadTask
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const directoryUrl =
    `/assets/drive/${connectionId}` +
    (task.parent === 'root' ? '' : '/' + task.parent)
  const isTerminal = task.status === 'completed' || task.status === 'cancelled'
  const needsFile =
    task.phase === 'receiving' && !hasUploadFile(connectionId, task.id)
  const canPause =
    !needsFile &&
    ['waiting', 'preparing', 'receiving', 'queued', 'transferring'].includes(
      task.status,
    )
  const bytes =
    task.status === 'preparing'
      ? (task.preparedBytes ?? 0)
      : task.phase === 'receiving'
        ? Math.min(task.size, task.receivedBytes + (task.inFlightBytes ?? 0))
        : task.transferredBytes
  const percent =
    task.status === 'completed'
      ? 100
      : task.size
        ? Math.min(100, Math.floor((bytes / task.size) * 100))
        : isTerminal
          ? 100
          : 0
  const controlHandler = async (action: DriveUploadAction) => {
    setBusy(true)
    try {
      await controlDriveUpload(connectionId, task, action)
    } finally {
      setBusy(false)
    }
  }
  const pauseHandler = () => {
    void controlHandler('pause')
  }
  const cancelHandler = () => {
    void controlHandler('cancel')
  }
  const resumeHandler = () => {
    if (needsFile) inputRef.current?.click()
    else void controlHandler(task.status === 'failed' ? 'retry' : 'resume')
  }
  const selectOriginalFileHandler = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file)
      addDriveUploadFiles(
        connectionId,
        task.parent,
        task.directoryName,
        [file],
        task,
      )
  }
  return (
    <TableRow className={styles.task} data-status={task.status}>
      <TableCell className={styles['file-cell']}>
        <DialogClose asChild>
          <Link
            className={styles['task-heading']}
            to={directoryUrl}
            aria-label={'Open folder for ' + task.name}
            title={task.directoryName}
          >
            <DriveEntryIcon entry={{ kind: 'file', name: task.name }} />
            <span className={styles.name} title={task.name}>
              {task.name}
            </span>
          </Link>
        </DialogClose>
        <span className={styles.size}>{formatDriveFileSize(task.size)}</span>
        <DialogClose asChild>
          <Link
            className={styles['mobile-destination']}
            to={directoryUrl}
            title={task.directoryName}
            aria-label={'Open destination: ' + task.directoryName}
          >
            {task.directoryName}
          </Link>
        </DialogClose>
      </TableCell>
      <TableCell className={styles['directory-cell']}>
        <DialogClose asChild>
          <Link
            className={styles.destination}
            to={directoryUrl}
            title={task.directoryName}
            aria-label={'Open destination: ' + task.directoryName}
          >
            {task.directoryName}
          </Link>
        </DialogClose>
      </TableCell>
      <TableCell className={styles['status-cell']}>
        <span
          className={task.status === 'completed' ? styles.complete : undefined}
        >
          {needsFile &&
          (task.status === 'receiving' || task.status === 'preparing')
            ? 'Ready to resume'
            : statusLabelRecord[task.status]}
        </span>
        {task.error ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <p className={styles.error} role="alert" tabIndex={0}>
                {task.error}
              </p>
            </TooltipTrigger>
            <TooltipContent className={styles['error-tooltip']}>
              {task.error}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </TableCell>
      <TableCell className={styles['progress-cell']}>
        {isTerminal ? (
          <span className={styles['terminal-progress']}>
            {task.status === 'completed' ? (
              <>
                <Check aria-hidden="true" />
                100%
              </>
            ) : (
              '—'
            )}
          </span>
        ) : (
          <div className={styles['task-progress']}>
            <span>{percent}%</span>
            <Progress
              className={styles.progress}
              value={percent}
              aria-label={'Upload progress: ' + task.name}
            />
            <span className={styles.bytes}>
              {task.bytesPerSecond && canPause
                ? formatDriveFileSize(task.bytesPerSecond) + '/s'
                : formatDriveFileSize(bytes) +
                  ' / ' +
                  formatDriveFileSize(task.size)}
            </span>
          </div>
        )}
      </TableCell>
      <TableCell className={styles['actions-cell']}>
        {!isTerminal ? (
          <div className={styles['task-actions']}>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              onClick={canPause ? pauseHandler : resumeHandler}
              aria-label={(canPause ? 'Pause ' : 'Resume ') + task.name}
              title={
                canPause
                  ? 'Pause'
                  : needsFile
                    ? 'Select original file'
                    : task.status === 'failed'
                      ? 'Retry'
                      : 'Resume'
              }
            >
              {busy ? (
                <LoaderCircle className={styles.spinning} aria-hidden="true" />
              ) : canPause ? (
                <Pause aria-hidden="true" />
              ) : task.status === 'failed' ? (
                <RotateCcw aria-hidden="true" />
              ) : (
                <Play aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              onClick={cancelHandler}
              aria-label={'Cancel ' + task.name}
              title="Cancel"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <span className={styles['terminal-action']}>—</span>
        )}
        <input
          ref={inputRef}
          className={styles.hidden}
          type="file"
          onChange={selectOriginalFileHandler}
          aria-label={'Select original file for ' + task.name}
        />
      </TableCell>
    </TableRow>
  )
}

export { DriveUploadTaskRow }
