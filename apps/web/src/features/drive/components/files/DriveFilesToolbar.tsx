import { Plus, Search, RefreshCw } from 'lucide-react'
import { Fragment, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'

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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import type { DriveTreeNode } from '@/features/drive/types'
import type { DriveView } from '@/features/drive/hooks/useDriveView'

import styles from '@/features/drive/components/files/DriveFilesToolbar.module.css'

type DriveFilesToolbarProps = Pick<
  DriveView,
  | 'provider'
  | 'directoryPathList'
  | 'searchQuery'
  | 'setSearchQuery'
  | 'loading'
  | 'busy'
  | 'refresh'
> & { onCreateFolder: () => void }

/**
 * 渲染文件路径、搜索和新建目录工具栏。
 *
 * @param props - Provider、目录与搜索状态及新建操作
 * @returns 文件工具栏 JSX
 */
const DriveFilesToolbar = ({
  provider,
  directoryPathList,
  searchQuery,
  setSearchQuery,
  onCreateFolder,
  loading,
  busy,
  refresh,
}: DriveFilesToolbarProps) => {
  // 更新文件搜索条件。
  const searchChangeHandler = (event: ChangeEvent<HTMLInputElement>): void =>
    setSearchQuery(event.target.value)

  /**
   * 渲染当前目录路径中的一项。
   *
   * @param directory - 路径目录
   * @param index - 路径位置
   * @returns 当前目录文本或可返回的父目录链接
   */
  const renderBreadcrumbItem = (directory: DriveTreeNode, index: number) => (
    <Fragment key={directory.id}>
      {index > 0 ? <BreadcrumbSeparator /> : null}
      <BreadcrumbItem>
        {index === directoryPathList.length - 1 ? (
          <BreadcrumbPage>{directory.name}</BreadcrumbPage>
        ) : (
          <BreadcrumbLink asChild>
            <Link
              to={`/assets/drive/${provider.id}${directory.id === 'root' ? '' : `/${directory.id}`}`}
            >
              {directory.name}
            </Link>
          </BreadcrumbLink>
        )}
      </BreadcrumbItem>
    </Fragment>
  )

  return (
    <header className={styles.toolbar}>
      <span className="sr-only" role="status">
        {loading ? 'Loading files…' : null}
      </span>
      <Breadcrumb className={styles.breadcrumb}>
        <BreadcrumbList>
          {directoryPathList.map(renderBreadcrumbItem)}
        </BreadcrumbList>
      </Breadcrumb>
      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh folder"
          aria-busy={loading || busy}
          disabled={loading || busy}
          onClick={refresh}
        >
          <RefreshCw
            className={loading || busy ? styles.spinning : undefined}
            aria-hidden="true"
          />
        </Button>
        <InputGroup className={styles.search}>
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search files"
            placeholder="Search files…"
            value={searchQuery}
            onChange={searchChangeHandler}
          />
        </InputGroup>
        <Button
          variant="ghost"
          size="sm"
          id="drive-new-folder"
          onClick={onCreateFolder}
          disabled={busy}
          className={styles.create}
        >
          <Plus aria-hidden="true" />
          New folder
        </Button>
      </div>
    </header>
  )
}

export { DriveFilesToolbar }
