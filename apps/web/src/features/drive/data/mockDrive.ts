import type {
  DriveEntry,
  DriveProvider,
  DriveProviderId,
  DriveTreeNode,
} from '@/features/drive/types'

const driveProviderList: DriveProvider[] = [
  {
    id: 'baidu',
    name: 'Baidu Drive',
    description: 'Personal cloud storage',
    status: 'connected',
    lastSyncedAt: '12 min ago',
  },
  {
    id: 'aliyun',
    name: 'Aliyun Drive',
    description: 'Shared workspace storage',
    status: 'connected',
    lastSyncedAt: '38 min ago',
  },
  {
    id: 'minio',
    name: 'MinIO',
    description: 'Self-hosted object storage',
    status: 'connected',
    lastSyncedAt: 'Yesterday',
  },
]

const driveRootNodeMap: Record<DriveProviderId, DriveTreeNode> = {
  baidu: {
    id: 'root',
    name: 'Baidu Drive',
    kind: 'folder',
    hasChildren: true,
    children: [
      { id: 'documents', name: 'Documents', kind: 'folder', hasChildren: true },
      { id: 'projects', name: 'Projects', kind: 'folder', hasChildren: true },
      { id: 'shared', name: 'Shared', kind: 'folder', hasChildren: false },
    ],
  },
  aliyun: {
    id: 'root',
    name: 'Aliyun Drive',
    kind: 'folder',
    hasChildren: true,
    children: [
      { id: 'documents', name: 'Documents', kind: 'folder', hasChildren: true },
      { id: 'media', name: 'Media', kind: 'folder', hasChildren: true },
      { id: 'shared', name: 'Shared', kind: 'folder', hasChildren: false },
    ],
  },
  minio: {
    id: 'root',
    name: 'MinIO',
    kind: 'folder',
    hasChildren: true,
    children: [
      { id: 'buckets', name: 'Buckets', kind: 'folder', hasChildren: true },
      { id: 'backups', name: 'Backups', kind: 'folder', hasChildren: true },
    ],
  },
}

const driveChildrenMap: Record<string, DriveTreeNode[]> = {
  'baidu:documents': [
    { id: 'notes', name: 'Notes', kind: 'folder', hasChildren: false },
    { id: 'reports', name: 'Reports', kind: 'folder', hasChildren: false },
  ],
  'baidu:projects': [
    { id: 'neozebra', name: 'Neozebra', kind: 'folder', hasChildren: false },
    { id: 'launch', name: 'Launch', kind: 'folder', hasChildren: false },
  ],
  'aliyun:documents': [
    { id: 'contracts', name: 'Contracts', kind: 'folder', hasChildren: false },
    { id: 'briefs', name: 'Briefs', kind: 'folder', hasChildren: false },
  ],
  'aliyun:media': [
    { id: 'images', name: 'Images', kind: 'folder', hasChildren: false },
    { id: 'videos', name: 'Videos', kind: 'folder', hasChildren: false },
  ],
  'minio:buckets': [
    { id: 'assets', name: 'Assets', kind: 'folder', hasChildren: false },
    { id: 'exports', name: 'Exports', kind: 'folder', hasChildren: false },
  ],
  'minio:backups': [
    { id: 'daily', name: 'Daily', kind: 'folder', hasChildren: false },
  ],
}

const driveEntryMap: Record<string, DriveEntry[]> = {
  'baidu:root': [
    {
      id: 'launch-plan',
      name: 'Launch plan.pdf',
      kind: 'file',
      size: '2.4 MB',
      updatedAt: 'Today',
      parentId: 'root',
    },
    {
      id: 'roadmap',
      name: 'Roadmap',
      kind: 'folder',
      size: '—',
      updatedAt: 'Yesterday',
      parentId: 'root',
    },
  ],
  'baidu:documents': [
    {
      id: 'weekly-notes',
      name: 'Weekly notes.md',
      kind: 'file',
      size: '18 KB',
      updatedAt: 'Today',
      parentId: 'documents',
    },
  ],
  'baidu:projects': [
    {
      id: 'product-brief',
      name: 'Product brief.docx',
      kind: 'file',
      size: '842 KB',
      updatedAt: 'Monday',
      parentId: 'projects',
    },
  ],
  'aliyun:root': [
    {
      id: 'team-handbook',
      name: 'Team handbook.pdf',
      kind: 'file',
      size: '4.2 MB',
      updatedAt: 'Today',
      parentId: 'root',
    },
    {
      id: 'design-assets',
      name: 'Design assets',
      kind: 'folder',
      size: '—',
      updatedAt: 'Yesterday',
      parentId: 'root',
    },
  ],
  'aliyun:documents': [
    {
      id: 'q3-brief',
      name: 'Q3 brief.docx',
      kind: 'file',
      size: '1.1 MB',
      updatedAt: 'Friday',
      parentId: 'documents',
    },
  ],
  'aliyun:media': [
    {
      id: 'hero-image',
      name: 'Hero image.png',
      kind: 'file',
      size: '6.8 MB',
      updatedAt: 'Monday',
      parentId: 'media',
    },
  ],
  'minio:root': [
    {
      id: 'backup-index',
      name: 'Backup index.json',
      kind: 'file',
      size: '74 KB',
      updatedAt: 'Today',
      parentId: 'root',
    },
    {
      id: 'logs',
      name: 'Logs',
      kind: 'folder',
      size: '—',
      updatedAt: 'Yesterday',
      parentId: 'root',
    },
  ],
  'minio:buckets': [
    {
      id: 'asset-manifest',
      name: 'Asset manifest.json',
      kind: 'file',
      size: '22 KB',
      updatedAt: 'Tuesday',
      parentId: 'buckets',
    },
  ],
  'minio:backups': [
    {
      id: 'daily-archive',
      name: 'daily-archive.zip',
      kind: 'file',
      size: '1.8 GB',
      updatedAt: 'Yesterday',
      parentId: 'backups',
    },
  ],
}

/**
 * 返回指定 Provider 的根目录节点。
 *
 * @param providerId - Provider 标识
 * @returns 根目录节点
 */
const getDriveRootNode = (providerId: DriveProviderId): DriveTreeNode =>
  driveRootNodeMap[providerId]

/**
 * 返回指定目录在 mock Provider 中的子目录。
 *
 * @param providerId - Provider 标识
 * @param nodeId - 目录标识
 * @returns 子目录列表
 */
const getDriveChildrenList = (
  providerId: DriveProviderId,
  nodeId: string,
): DriveTreeNode[] => driveChildrenMap[`${providerId}:${nodeId}`] ?? []

/**
 * 返回指定 Provider 目录下的 mock 文件条目。
 *
 * @param providerId - Provider 标识
 * @param nodeId - 目录标识
 * @returns 文件和子目录列表
 */
const getDriveEntryList = (
  providerId: DriveProviderId,
  nodeId: string,
): DriveEntry[] => driveEntryMap[`${providerId}:${nodeId}`] ?? []

export {
  driveProviderList,
  getDriveChildrenList,
  getDriveEntryList,
  getDriveRootNode,
}
