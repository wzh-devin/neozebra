import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DriveUploadTaskRow } from '@/features/drive/components/uploads/DriveUploadTaskRow'
import { buildDriveUploadTablePage } from '@/features/drive/data/drive-upload-table'
import { useDriveUploadTaskPage } from '@/features/drive/hooks/useDriveUploadTaskPage'
import type { DriveUploadTask } from '@/features/drive/upload-types'
import styles from '@/features/drive/components/uploads/DriveUploadTasks.module.css'

type DriveUploadTasksTableProps = {
  connectionId: string
  localTasks: DriveUploadTask[]
}

/**
 * 以分页表格展示账号任务，合并新选择文件和实时传片状态，翻页不改变队列。
 *
 * @param props - 账号及共享上传运行态
 * @returns 任务表格、状态反馈与分页操作
 */
const DriveUploadTasksTable = ({
  connectionId,
  localTasks,
}: DriveUploadTasksTableProps) => {
  const query = useDriveUploadTaskPage(connectionId, localTasks[0]?.id)
  const {
    tasks: taskList,
    total,
    pageSize,
    pageCount,
  } = buildDriveUploadTablePage({
    page: query.page,
    data: query.data,
    localTasks,
    knownTotal: query.total,
  })
  const previousPageHandler = () =>
    query.setPage((page) => Math.max(1, page - 1))
  const nextPageHandler = () =>
    query.setPage((page) => Math.min(pageCount, page + 1))
  const renderTask = (task: DriveUploadTask) => (
    <DriveUploadTaskRow key={task.id} connectionId={connectionId} task={task} />
  )
  return (
    <div className={styles['table-panel']} aria-busy={query.loading}>
      {query.error ? (
        <div className={styles['load-error']} role="alert">
          <span>{query.error}</span>
          <Button size="sm" variant="outline" onClick={query.retryHandler}>
            Retry
          </Button>
        </div>
      ) : null}
      <div className={styles['table-scroll']}>
        <Table className={styles.table} aria-label="Upload tasks">
          <TableHeader>
            <TableRow>
              <TableHead className={styles['file-cell']}>File</TableHead>
              <TableHead className={styles['directory-cell']}>
                Destination
              </TableHead>
              <TableHead className={styles['status-cell']}>Status</TableHead>
              <TableHead className={styles['progress-cell']}>
                Progress
              </TableHead>
              <TableHead className={styles['actions-cell']}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {taskList.map(renderTask)}
            {!taskList.length ? (
              <TableRow>
                <TableCell colSpan={5} className={styles['empty-cell']}>
                  {query.loading ? (
                    <span className={styles['loading-state']} role="status">
                      <Spinner />
                      Loading uploads…
                    </span>
                  ) : query.error ? (
                    'Could not load uploads.'
                  ) : (
                    'No uploads yet'
                  )}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <div className={styles.pagination}>
        <span>
          {total
            ? `${(query.page - 1) * pageSize + 1}–${Math.min(query.page * pageSize, total)}` +
              (query.total !== undefined ? ` of ${total}` : '')
            : '0 uploads'}
        </span>
        <div className={styles['page-actions']}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            onClick={previousPageHandler}
            disabled={query.loading || query.page === 1}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span>
            Page {query.page}
            {query.total !== undefined ? ` of ${pageCount}` : ''}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next page"
            onClick={nextPageHandler}
            disabled={query.loading || query.page >= pageCount}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
export { DriveUploadTasksTable }
