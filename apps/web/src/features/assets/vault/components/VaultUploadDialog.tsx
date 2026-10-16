import { useI18n } from '@/lib/i18n'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Pause, Play, RotateCcw, X, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  pauseTransfer,
  resumeTransfer,
  cancelTransfer,
} from '@/features/assets/vault/uploads/engine'
import type { TransferTask } from '@/features/assets/vault/uploads/engine'
import { formatVaultSize } from '@/features/assets/vault/vault-format'
import styles from './VaultUploadDialog.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useVaultUploadTasks } from '@/features/assets/vault/hooks/useVaultUploadTasks'
import type { UploadSort, UploadStatus } from '@/features/assets/vault/types'

const phaseLabelRecord: Record<string, string> = {
  queued: '等待上传',
  hashing: '校验原文件',
  preparing: '准备上传',
  uploading: '上传中',
  completing: '后台校验与发布',
  completed: '已完成',
  paused: '已暂停',
  cancelled: '已取消',
  failed: '校验失败',
  error: '上传中断',
  running: '上传中',
}

/**
 * 显示上传阶段、进度和可用操作，恢复原文件时重新进行内容校验。
 *
 * @param props - 独立任务与目标目录导航
 * @returns 上传任务行 JSX
 */
const VaultUploadRow = ({
  task,
  onNavigate,
}: {
  task: TransferTask
  onNavigate: (id: string) => void
}) => {
  const { t } = useI18n()

  const sourceRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const actionHandler = async (action: 'pause' | 'cancel') => {
    setBusy(true)
    setError('')
    try {
      if (action === 'pause') await pauseTransfer(task)
      else await cancelTransfer(task)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('任务操作失败'))
    } finally {
      setBusy(false)
    }
  }
  const pauseHandler = () => {
    void actionHandler('pause')
  }
  const cancelHandler = () => {
    void actionHandler('cancel')
  }
  const resumeHandler = () => {
    if (!task.file) sourceRef.current?.click()
    else resumeTransfer(task)
  }
  const sourceHandler = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) resumeTransfer(task, file)
    event.target.value = ''
  }
  const navigateHandler = () => onNavigate(task.parentId)
  const terminal = ['completed', 'cancelled', 'failed'].includes(task.state)
  const resumable =
    ['paused', 'error', 'uploading', 'preparing', 'failed'].includes(
      task.state,
    ) || task.needsSource
  const label = task.needsSource
    ? t('重新选择原文件以继续')
    : (phaseLabelRecord[task.state === 'running' ? task.phase : task.state] ??
      task.state)
  return (
    <div className={styles.row}>
      <div className={styles.details}>
        <button
          type="button"
          onClick={navigateHandler}
          className={styles.name}
          title={t('打开目标文件夹')}
        >
          {task.name}
        </button>
        <div className={styles.meta}>
          <span>{formatVaultSize(task.size)}</span>
          <span>{t(label)}</span>
          {task.phase === 'uploading' && task.speed > 0 ? (
            <span>{formatVaultSize(task.speed)}/s</span>
          ) : null}
        </div>
        {!terminal ? (
          <Progress
            value={task.progress * 100}
            className={styles.progress}
            aria-label={`${task.name} ${t(label)}`}
          />
        ) : null}
        {task.error || error ? (
          <p role="alert" className={styles.error}>
            {t(error || task.error)}
          </p>
        ) : null}
      </div>
      <div className={styles.actions}>
        {task.state === 'running' || task.state === 'queued' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={pauseHandler}
                disabled={busy}
                aria-label={t('暂停') + ' ' + task.name}
              >
                <Pause size={15} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('暂停')}</TooltipContent>
          </Tooltip>
        ) : null}
        {resumable && task.state !== 'running' ? (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={resumeHandler}
            disabled={busy}
            aria-label={t('继续') + ' ' + task.name}
          >
            {task.state === 'error' ? (
              <RotateCcw size={15} />
            ) : (
              <Play size={15} />
            )}
          </Button>
        ) : null}
        {!terminal && task.state !== 'completing' ? (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={cancelHandler}
            disabled={busy}
            aria-label={t('取消') + ' ' + task.name}
          >
            <X size={15} />
          </Button>
        ) : null}
      </div>
      <input
        type="file"
        ref={sourceRef}
        hidden
        onChange={sourceHandler}
        aria-label={t('重新选择') + ' ' + task.name}
      />
    </div>
  )
}

/**
 * 居中展示可搜索、筛选与排序的上传历史；关闭窗口不改变传输生命周期。
 *
 * @param props - 窗口开关和目标目录导航
 * @returns 上传任务弹窗 JSX
 */
const VaultUploadDialog = ({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (id: string) => void
}) => {
  const { t } = useI18n()

  const {
    query,
    status,
    setStatus,
    sort,
    setSort,
    search,
    setSearch,
    visibleTaskList,
  } = useVaultUploadTasks(open)
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(visibleTaskList.length / 10))
  const current = Math.min(page, pageCount - 1)
  const previousHandler = () => setPage((value) => Math.max(0, value - 1))
  const nextHandler = () =>
    setPage((value) => Math.min(pageCount - 1, value + 1))
  const statusHandler = (value: string) => {
    setStatus(value as UploadStatus)
    setPage(0)
  }
  const sortHandler = (value: string) => {
    setSort(value as UploadSort)
    setPage(0)
  }
  const searchHandler = (event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value)
    setPage(0)
  }
  const moreHandler = () => {
    void query.fetchNextPage()
  }
  const retryHandler = () => {
    void query.refetch()
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${styles.dialog} ${surfaceStyles.surface}`}>
        <DialogHeader>
          <DialogTitle>{t('上传任务')}</DialogTitle>
          <DialogDescription>
            {t('关闭窗口或切换目录，上传会继续。刷新后需重新选择原文件续传。')}
          </DialogDescription>
        </DialogHeader>
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <Search size={15} aria-hidden="true" />
            <Input
              value={search}
              onChange={searchHandler}
              placeholder={t('搜索文件名')}
              aria-label={t('搜索上传任务')}
              maxLength={255}
            />
          </div>
          <div className={styles.filter}>
            <Label htmlFor="upload-status">{t('状态')}</Label>
            <Select value={status} onValueChange={statusHandler}>
              <SelectTrigger id="upload-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                className={surfaceStyles.surface}
                position="popper"
                align="start"
                sideOffset={6}
              >
                <SelectItem value="all">{t('全部状态')}</SelectItem>
                <SelectItem value="active">{t('进行中')}</SelectItem>
                <SelectItem value="paused">{t('已暂停')}</SelectItem>
                <SelectItem value="completed">{t('已完成')}</SelectItem>
                <SelectItem value="failed">{t('失败 / 中断')}</SelectItem>
                <SelectItem value="cancelled">{t('已取消')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={styles.filter}>
            <Label htmlFor="upload-sort">{t('排序')}</Label>
            <Select value={sort} onValueChange={sortHandler}>
              <SelectTrigger id="upload-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                className={surfaceStyles.surface}
                position="popper"
                align="start"
                sideOffset={6}
              >
                <SelectItem value="newest">{t('最新任务优先')}</SelectItem>
                <SelectItem value="oldest">{t('最早任务优先')}</SelectItem>
                <SelectItem value="size-desc">
                  {t('文件大小从大到小')}
                </SelectItem>
                <SelectItem value="size-asc">
                  {t('文件大小从小到大')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {query.isError ? (
          <div className={styles.historyError} role="alert">
            <span>
              {query.error instanceof Error
                ? t(query.error.message)
                : t('任务历史加载失败')}
            </span>
            <Button size="sm" variant="outline" onClick={retryHandler}>
              {t('重试')}
            </Button>
          </div>
        ) : null}
        <div className={styles.list}>
          {visibleTaskList
            .slice(current * 10, (current + 1) * 10)
            .map((task) => (
              <VaultUploadRow
                key={task.key}
                task={task}
                onNavigate={onNavigate}
              />
            ))}
          {!visibleTaskList.length ? (
            <div className={styles.empty}>
              {query.isPending && !query.isError
                ? t('加载任务…')
                : t('没有符合条件的上传任务')}
            </div>
          ) : null}
        </div>
        <div className={styles.pagination}>
          <span>
            {visibleTaskList.length}
            {query.hasNextPage ? '+' : ''} {t('个任务 ·')} {current + 1}/
            {pageCount}
          </span>
          <div>
            <Button
              size="sm"
              variant="ghost"
              onClick={previousHandler}
              disabled={current === 0}
            >
              {t('上一页')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={nextHandler}
              disabled={current >= pageCount - 1}
            >
              {t('下一页')}
            </Button>
            {query.hasNextPage ? (
              <Button
                size="sm"
                variant="outline"
                onClick={moreHandler}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? t('加载中…') : t('加载更多任务')}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
export { VaultUploadDialog }
