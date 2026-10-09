import {
  FolderArchive,
  FolderClock,
  FolderClosed,
  FolderKanban,
  FolderOpen,
  FolderPen,
  FolderSymlink,
  type LucideIcon,
} from 'lucide-react'

import styles from '@/features/drive/components/files/DriveFolderIcon.module.css'

type FolderTypeConfig = {
  type: string
  names: string[]
  icon: LucideIcon
}

const folderTypeList: FolderTypeConfig[] = [
  {
    type: 'documents',
    names: ['documents', 'docs', '文档', '资料'],
    icon: FolderPen,
  },
  {
    type: 'projects',
    names: ['projects', 'project', 'roadmap', '项目', '工程', '规划'],
    icon: FolderKanban,
  },
  {
    type: 'backups',
    names: ['backups', 'backup', 'archives', 'archive', '备份', '归档'],
    icon: FolderArchive,
  },
  { type: 'shared', names: ['shared', 'share', '共享'], icon: FolderSymlink },
  { type: 'logs', names: ['logs', 'log', '日志'], icon: FolderClock },
]

type DriveFolderIconProps = {
  name: string
  isOpen?: boolean
}

/**
 * 为常见命名目录匹配语义图标，普通目录根据展开状态展示打开或关闭图标。
 *
 * @param props - 目录名称和展开或选中状态
 * @returns 文件列表与目录树共用的装饰图标 JSX
 */
const DriveFolderIcon = ({ name, isOpen = false }: DriveFolderIconProps) => {
  const normalizedName = name.trim().toLowerCase()
  const presentation = folderTypeList.find((item) =>
    item.names.includes(normalizedName),
  ) ?? {
    type: 'generic',
    icon: isOpen ? FolderOpen : FolderClosed,
  }
  const Icon = presentation.icon

  return (
    <Icon
      className={styles.icon}
      data-file-type="folder"
      data-folder-type={presentation.type}
      aria-hidden="true"
    />
  )
}

export { DriveFolderIcon }
