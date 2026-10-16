import { useI18n } from '@/lib/i18n'
import { DndContext } from '@dnd-kit/core'
import { getVaultCollisionList } from '@/features/assets/vault/vault-collision'
import { HardDrive, Search, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { VaultError } from '@/services/assets/vault'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useVaultWorkspace } from '@/features/assets/vault/hooks/useVaultWorkspace'
import { VaultFilesPanel } from './VaultFilesPanel'
import { VaultSplit } from './VaultSplit'
import { VaultTree } from './VaultTree'
import { VaultActionDialog } from './VaultActionDialog'
import { VaultPreview } from './VaultPreview'
import { VaultUploadDialog } from './VaultUploadDialog'
import { VaultTrashDialog } from './VaultTrashDialog'
import { VaultDragOverlay } from './VaultDragOverlay'
import surfaceStyles from '@/components/shared/workbench-surface/WorkbenchSurface.module.css'
import styles from './VaultWorkspace.module.css'

/**
 * 组合文件库导航、分页列表和独立上传任务；页面只挂载此组件。
 *
 * @param 无参数
 * @returns 文件库工作区 JSX
 */
const VaultWorkspace = () => {
  const { t } = useI18n()

  const controller = useVaultWorkspace()
  const {
    parentId,
    trashOpen,
    isMobile,
    state,
    action,
    mutating,
    actionHandler,
    createInFolderHandler,
    preview,
    locatedEntry,
    uploadsOpen,
    setUploadsOpen,
    treeOpen,
    setTreeOpen,
    fileRef,
    folderRef,
    service,
    isServiceReady,
    entries,
    activeCount,
    sensors,
    selectTreeEntryHandler,
    trashHandler,
    closeTrashHandler,
    openEntryHandler,
    closeActionHandler,
    closePreviewHandler,
    showTasksHandler,
    search,
    searchHandler,
    serviceRetryHandler,
    fileSelectionHandler,
    dragEndHandler,
    taskNavigateHandler,
  } = controller
  const tree = (
    <VaultTree
      selectedId={locatedEntry?.id ?? parentId}
      path={entries.path}
      onSelect={selectTreeEntryHandler}
      onTrash={trashHandler}
      onPreview={openEntryHandler}
      onAction={actionHandler}
      onCreate={createInFolderHandler}
      busy={mutating}
    />
  )
  return (
    <Card className={`${styles.workspace} ${surfaceStyles.surface}`}>
      <header className={styles.toolbar}>
        <div className={styles.brand}>
          {isMobile || state === 'collapsed' ? (
            <SidebarTrigger aria-label={t('展开侧栏')} />
          ) : null}
          <HardDrive size={16} />
          <h1>{t('文件库')}</h1>
        </div>
        {isServiceReady ? (
          <div className={styles.headerActions}>
            <InputGroup className={styles.search}>
              <InputGroupAddon>
                <Search size={15} />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={t('搜索当前文件夹')}
                placeholder={t('搜索当前文件夹')}
                value={search}
                onChange={searchHandler}
              />
            </InputGroup>
            <Button
              className={styles.tasksButton}
              variant="ghost"
              size="sm"
              onClick={showTasksHandler}
            >
              <Upload size={15} />
              <span>
                {t('上传任务')}
                {activeCount ? ` · ${activeCount}` : ''}
              </span>
            </Button>
          </div>
        ) : null}
      </header>
      {service.isPending ? (
        <div className={styles.state} role="status">
          <Spinner />
          {t('连接文件库…')}
        </div>
      ) : service.isError ? (
        <div className={styles.state} role="alert">
          {service.error instanceof VaultError &&
          service.error.code === 'SERVICE_NOT_CONFIGURED' ? (
            <>
              <HardDrive size={28} aria-hidden="true" />
              <h2>{t('文件库尚未配置')}</h2>
              <p>{t('完成服务配置后即可使用，其他工作台功能可继续使用。')}</p>
            </>
          ) : (
            <p>{t('文件服务暂时不可用')}</p>
          )}
          <Button variant="outline" onClick={serviceRetryHandler}>
            {t('重试')}
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={getVaultCollisionList}
          onDragEnd={dragEndHandler}
        >
          <VaultSplit tree={tree} isMobile={isMobile}>
            <VaultFilesPanel controller={controller} />
          </VaultSplit>
          <VaultDragOverlay />
          <Dialog open={treeOpen} onOpenChange={setTreeOpen}>
            <DialogContent className={styles.treeDialog}>
              <DialogHeader>
                <DialogTitle>{t('浏览文件库')}</DialogTitle>
                <DialogDescription>
                  {t('选择文件夹，或打开文件预览。')}
                </DialogDescription>
              </DialogHeader>
              {tree}
            </DialogContent>
          </Dialog>
          {trashOpen ? <VaultTrashDialog onClose={closeTrashHandler} /> : null}
          {action ? (
            <VaultActionDialog
              key={action.type + (action.entry?.id ?? '')}
              action={action}
              parentId={action.parentId ?? parentId}
              onClose={closeActionHandler}
            />
          ) : null}
          {preview ? (
            <VaultPreview
              key={preview.id}
              entry={preview}
              onClose={closePreviewHandler}
            />
          ) : null}
          <VaultUploadDialog
            open={uploadsOpen}
            onOpenChange={setUploadsOpen}
            onNavigate={taskNavigateHandler}
          />
          <input
            hidden
            type="file"
            multiple
            ref={fileRef}
            onChange={fileSelectionHandler}
            aria-label={t('选择上传文件')}
          />
          <input
            hidden
            type="file"
            multiple
            ref={folderRef}
            {...{ webkitdirectory: '' }}
            onChange={fileSelectionHandler}
            aria-label={t('选择上传文件夹')}
          />
        </DndContext>
      )}
    </Card>
  )
}
export { VaultWorkspace }
