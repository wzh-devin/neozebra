import { useI18n } from '@/lib/i18n'
import { Folder, FolderPlus, PanelLeft, Upload } from 'lucide-react'
import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { useDroppable } from '@dnd-kit/core'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { VaultController } from '@/features/assets/vault/hooks/useVaultWorkspace'
import type { VaultEntry } from '@/features/assets/vault/types'
import { VaultFileList } from './VaultFileList'
import { VaultViewToggle } from './VaultViewToggle'
import styles from './VaultFilesPanel.module.css'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'

/**
 * 组合当前目录的工具栏、搜索、分页列表与拖放反馈。
 *
 * @param props - 已封装的文件库状态和操作回调
 * @returns 文件列表面板 JSX
 */
const VaultFilesPanel = ({ controller }: { controller: VaultController }) => {
  const { t } = useI18n()

  const {
    filter,
    mutating,
    adding,
    dropActive,
    viewMode,
    setViewMode,
    service,
    entries,
    dragOverHandler,
    dragLeaveHandler,
    dropHandler,
    showTreeHandler,
    rootHandler,
    crumbHandler,
    refreshHandler,
    createHandler,
    chooseFilesHandler,
    chooseFolderHandler,
    openEntryHandler,
    actionHandler,
    loadMoreHandler,
  } = controller
  const { setNodeRef: setDropNodeRef } = useDroppable({
    id: 'list-root-' + controller.parentId,
    data: {
      parentId: controller.parentId,
      name: entries.path.at(-1)?.name ?? t('我的文件'),
    },
    disabled: mutating,
  })
  const renderCrumb = (entry: VaultEntry, index: number) => (
    <Fragment key={entry.id}>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        {index === entries.path.length - 1 ? (
          <BreadcrumbPage title={entry.name}>{entry.name}</BreadcrumbPage>
        ) : (
          <BreadcrumbLink asChild>
            <button
              type="button"
              data-folder-id={entry.id}
              onClick={crumbHandler}
              title={entry.name}
            >
              {entry.name}
            </button>
          </BreadcrumbLink>
        )}
      </BreadcrumbItem>
    </Fragment>
  )
  const renderLoadingRow = (index: number) => (
    <div className={styles.loadingRow} key={index}>
      <Skeleton className={styles.loadingIcon} />
      <Skeleton className={styles.loadingName} />
      <Skeleton className={styles.loadingMeta} />
      {viewMode === 'list' ? (
        <>
          <Skeleton className={styles.loadingSize} />
          <Skeleton className={styles.loadingDate} />
        </>
      ) : null}
    </div>
  )
  return (
    <div
      className={styles.files}
      onDragOver={dragOverHandler}
      onDragLeave={dragLeaveHandler}
      onDrop={dropHandler}
    >
      <div className={styles.filesToolbar}>
        <div className={styles.directory}>
          <div className={styles.path}>
            <Button
              className={styles.mobileTree}
              size="icon-sm"
              variant="ghost"
              onClick={showTreeHandler}
              data-vault-tree-trigger
              aria-label={t('浏览文件树')}
            >
              <PanelLeft size={16} />
            </Button>
            <Breadcrumb aria-label={t('文件夹路径')}>
              <BreadcrumbList>
                <BreadcrumbItem>
                  {entries.path.length ? (
                    <BreadcrumbLink asChild>
                      <button type="button" onClick={rootHandler}>
                        {t('我的文件')}
                      </button>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{t('我的文件')}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {entries.path.map(renderCrumb)}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        <div className={styles.fileActions}>
          <VaultViewToggle value={viewMode} onChange={setViewMode} />
          <Button
            size="sm"
            variant="ghost"
            className={styles.createButton}
            onClick={createHandler}
            disabled={mutating}
          >
            <FolderPlus size={15} />
            <span>{t('新建文件夹')}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className={styles.uploadButton}
                disabled={adding || !service.data?.vaultConfigured}
              >
                <Upload size={15} />
                {t('上传')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={surfaceStyles.surface}>
              <DropdownMenuItem onSelect={chooseFilesHandler}>
                {t('上传文件')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={chooseFolderHandler}>
                {t('上传文件夹')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!service.data?.vaultConfigured ? (
        <p className={styles.notice}>
          {t('新存储服务尚未配置，配置完成后即可上传文件。')}
        </p>
      ) : null}
      <div
        ref={setDropNodeRef}
        data-vault-drop-id={controller.parentId}
        className={styles.list}
        aria-busy={entries.isFetching}
      >
        {entries.isPending ? (
          <div
            className={styles.loading}
            data-view={viewMode}
            role="status"
            aria-label={t('加载文件')}
          >
            <span className="sr-only">{t('加载文件…')}</span>
            {[0, 1, 2, 3, 4].map(renderLoadingRow)}
          </div>
        ) : entries.isError ? (
          <div className={styles.state} role="alert">
            <p>
              {entries.error instanceof Error
                ? t(entries.error.message)
                : t('加载失败')}
            </p>
            <Button variant="outline" onClick={refreshHandler}>
              {t('重新加载')}
            </Button>
            <Button variant="ghost" onClick={rootHandler}>
              {t('返回我的文件')}
            </Button>
          </div>
        ) : !entries.entries.length ? (
          <div className={styles.state}>
            <div className={styles.emptyIcon}>
              <Folder size={26} />
            </div>
            <h2>{filter ? t('没有找到匹配的条目') : t('文件夹为空')}</h2>
            <p>
              {filter
                ? t('换个关键词试试。')
                : t('上传文件，或新建文件夹来整理内容。')}
            </p>
            {!filter ? (
              <Button
                size="sm"
                onClick={chooseFilesHandler}
                disabled={!service.data?.vaultConfigured}
              >
                {t('上传文件')}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <VaultFileList
              onCreate={controller.createInFolderHandler}
              entries={entries.entries}
              trash={false}
              onOpen={openEntryHandler}
              onAction={actionHandler}
              busy={mutating}
              viewMode={viewMode}
              locatedEntry={controller.locatedEntry}
            />
            {entries.hasNextPage ? (
              <div className={styles.loadMore}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMoreHandler}
                  disabled={entries.isFetchingNextPage}
                >
                  {entries.isFetchingNextPage ? t('加载中…') : t('加载更多')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {dropActive ? (
        <div className={styles.dropOverlay}>{t('松开以上传到当前文件夹')}</div>
      ) : null}
    </div>
  )
}
export { VaultFilesPanel }
