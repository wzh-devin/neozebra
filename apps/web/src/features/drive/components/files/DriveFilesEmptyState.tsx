import { FolderOpen, FolderPlus, Search, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

import styles from '@/features/drive/components/files/DriveFilesEmptyState.module.css'

type DriveFilesEmptyStateProps = {
  hasSearchQuery: boolean
  onUpload: () => void
  onCreateFolder: () => void
}

/**
 * 展示目录空态及已有文件操作，或搜索无结果的恢复提示。
 *
 * @param props - 搜索状态、上传与新建文件夹操作
 * @returns 文件空态 JSX
 */
const DriveFilesEmptyState = ({
  hasSearchQuery,
  onUpload,
  onCreateFolder,
}: DriveFilesEmptyStateProps) => (
  <Empty className={styles.empty}>
    <EmptyHeader className={styles.header}>
      <EmptyMedia className={hasSearchQuery ? styles.search : styles.folder}>
        {hasSearchQuery ? (
          <Search aria-hidden="true" />
        ) : (
          <FolderOpen aria-hidden="true" />
        )}
      </EmptyMedia>
      <EmptyTitle className={styles.title}>
        {hasSearchQuery ? 'No matching files' : 'This folder is empty'}
      </EmptyTitle>
      <EmptyDescription className={styles.description}>
        {hasSearchQuery
          ? 'Try another file name or clear your search.'
          : 'Upload a file or create a folder to get started.'}
      </EmptyDescription>
    </EmptyHeader>
    {!hasSearchQuery ? (
      <EmptyContent className={styles.actions}>
        <Button
          className={styles.action}
          variant="outline"
          type="button"
          aria-label="Upload file"
          onClick={onUpload}
        >
          <Upload aria-hidden="true" className={styles['upload-icon']} />
          <span className={styles.copy}>
            <strong>Upload file</strong>
            <span>From your device</span>
          </span>
        </Button>
        <Button
          className={styles.action}
          variant="outline"
          type="button"
          aria-label="New folder"
          onClick={onCreateFolder}
        >
          <FolderPlus aria-hidden="true" className={styles['folder-icon']} />
          <span className={styles.copy}>
            <strong>New folder</strong>
            <span>Organize your files</span>
          </span>
        </Button>
      </EmptyContent>
    ) : null}
  </Empty>
)

export { DriveFilesEmptyState }
