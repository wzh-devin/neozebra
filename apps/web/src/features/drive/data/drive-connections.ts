import { isDriveProviderId } from '@/features/drive/data/drive-provider'
import { driveProviderList } from '@/features/drive/data/mockDrive'
import type {
  DriveConnectionDraft,
  DriveMountOptions,
  DriveProvider,
  DriveProviderId,
} from '@/features/drive/types'

/**
 * 校验MinIO服务地址，拒绝控制台路径、URL凭据及非HTTP协议。
 *
 * @param value - S3服务的完整URL
 * @returns 标准化服务地址；无效输入抛出安全错误
 */
const normalizeDriveEndpoint = (value: string): string => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Enter a valid S3 endpoint URL.')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'Use an HTTP or HTTPS S3 endpoint without a path or embedded credentials.',
    )
  }
  return url.origin
}

/**
 * 校验产品挂载使用的S3存储桶名称。
 *
 * @param value - Bucket名称
 * @returns 合法名称；无效输入抛出安全错误
 */
const validateDriveBucket = (value: string): string => {
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value) ||
    /\.\.|\.-|-\./.test(value) ||
    /^\d+\.\d+\.\d+\.\d+$/.test(value)
  ) {
    throw new Error(
      'Bucket must be 3–63 lowercase letters, numbers, dots or hyphens, and cannot be an IP address.',
    )
  }
  return value
}

/**
 * 从表单读取并校验所选Provider的配置，保留密钥原值。
 *
 * @param providerId - Provider类型
 * @param formData - 用户输入的表单数据
 * @returns 已校验的连接草稿；无效输入抛出不含凭据的错误
 */
const buildDriveConnectionDraft = (
  providerId: DriveProviderId,
  formData: FormData,
): DriveConnectionDraft => {
  const getValue = (key: string): string => {
    const value = formData.get(key)
    return typeof value === 'string' ? value : ''
  }

  /**
   * 读取并校验必填值。
   *
   * @param key - 字段名称
   * @param label - 用户可见字段名
   * @returns 非空原始文本；缺失时抛出错误
   */
  const getRequiredValue = (key: string, label: string): string => {
    const value = getValue(key)
    if (!value.trim()) throw new Error(`${label} is required.`)
    return value
  }
  const name = getRequiredValue('name', 'Drive name').trim()
  if (name.length > 100)
    throw new Error('Drive name must be 100 characters or fewer.')
  if (providerId === 'minio') {
    return {
      name,
      providerId,
      endpoint: normalizeDriveEndpoint(getValue('endpoint').trim()),
      bucket: validateDriveBucket(getValue('bucket').trim()),
      region: getValue('region').trim(),
      prefix: getValue('prefix'),
      accessKey: getRequiredValue('accessKey', 'Access Key'),
      secretKey: getRequiredValue('secretKey', 'Secret Key'),
      sessionToken: getValue('sessionToken'),
    }
  }
  const authMode = getValue('authMode')
  if (authMode !== 'accessToken' && authMode !== 'refreshToken')
    throw new Error('Choose an authorization method.')
  const rootPath = getValue('rootPath').trim() || '/'
  if (!rootPath.startsWith('/'))
    throw new Error('Root folder must be an absolute path beginning with /.')
  const oauth: Omit<
    Extract<DriveConnectionDraft, { providerId: 'baidu' }>,
    'providerId'
  > = {
    name,
    authMode,
    rootPath,
    accessToken:
      authMode === 'accessToken'
        ? getRequiredValue('accessToken', 'Access Token')
        : '',
    refreshToken:
      authMode === 'refreshToken'
        ? getRequiredValue('refreshToken', 'Refresh Token')
        : '',
    clientId:
      authMode === 'refreshToken'
        ? getRequiredValue(
            'clientId',
            providerId === 'baidu' ? 'AppKey' : 'Client ID',
          ).trim()
        : '',
    clientSecret:
      authMode === 'refreshToken'
        ? getRequiredValue(
            'clientSecret',
            providerId === 'baidu' ? 'SecretKey' : 'Client Secret',
          )
        : '',
  }
  if (providerId === 'baidu') return { ...oauth, providerId }
  const driveType = getValue('driveType')
  if (
    driveType !== 'default' &&
    driveType !== 'resource' &&
    driveType !== 'backup'
  )
    throw new Error('Choose a valid drive type.')
  return { ...oauth, providerId, driveType }
}

/**
 * 从已校验草稿投影可持久化参数，排除所有密钥和Token。
 *
 * @param draft - 连接草稿
 * @param id - 稳定的连接实例ID
 * @returns 无凭据的卡片和挂载元数据
 */
const buildDriveConnection = (
  draft: { name: string } & DriveMountOptions,
  id: string,
): DriveProvider => {
  let options: DriveMountOptions
  if (draft.providerId === 'minio') {
    options = {
      providerId: draft.providerId,
      endpoint: draft.endpoint,
      bucket: draft.bucket,
      region: draft.region,
      prefix: draft.prefix,
    }
  } else if (draft.providerId === 'aliyun') {
    options = {
      providerId: draft.providerId,
      rootPath: draft.rootPath,
      driveType: draft.driveType,
    }
  } else options = { providerId: draft.providerId, rootPath: draft.rootPath }
  return {
    id,
    providerId: draft.providerId,
    name: draft.name,
    description:
      driveProviderList.find((item) => item.providerId === draft.providerId)
        ?.name ?? '',
    status: 'configured',
    lastSyncedAt: 'Never',
    options,
  }
}

// 检查缓存值是否为非空且非数组对象。
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type SavedDriveConnectionRecord = {
  connectionList: DriveProvider[]
  removedDefaultIds: DriveProviderId[]
}

/**
 * 校验缓存并重建公共配置与默认连接删除记录，兼容旧缓存且排除凭据。
 *
 * @param serialized - 浏览器保存的版本化连接JSON
 * @returns 已校验的连接和删除记录；损坏缓存抛出统一错误
 */
const parseSavedDriveConnectionRecord = (
  serialized: string | null,
): SavedDriveConnectionRecord => {
  if (!serialized) return { connectionList: [], removedDefaultIds: [] }
  const data: unknown = JSON.parse(serialized)
  if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.connections))
    throw new Error('Saved Drive configuration is invalid.')
  const removedIds =
    data.removedDefaultIds === undefined ? [] : data.removedDefaultIds
  if (!Array.isArray(removedIds))
    throw new Error('Saved Drive configuration is invalid.')
  const removedDefaultIds: DriveProviderId[] = []
  for (const id of removedIds) {
    if (
      typeof id !== 'string' ||
      !isDriveProviderId(id) ||
      removedDefaultIds.includes(id)
    )
      throw new Error('Saved Drive configuration is invalid.')
    removedDefaultIds.push(id)
  }
  const idSet = new Set<string>()

  /**
   * 从单条缓存重建无凭据实例。
   *
   * @param item - 不可信连接对象
   * @returns 安全实例；缺失或非法字段抛出错误
   */
  const parseConnection = (item: unknown): DriveProvider => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !/^[a-zA-Z0-9-]+$/.test(item.id) ||
      idSet.has(item.id) ||
      typeof item.providerId !== 'string' ||
      !isDriveProviderId(item.providerId) ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.length > 100 ||
      !isRecord(item.options) ||
      item.options.providerId !== item.providerId
    )
      throw new Error('Saved Drive configuration is invalid.')
    if (isDriveProviderId(item.id) && item.id !== item.providerId)
      throw new Error('Saved Drive configuration is invalid.')
    idSet.add(item.id)
    const options = item.options
    if (item.providerId === 'minio') {
      if (
        typeof options.endpoint !== 'string' ||
        typeof options.bucket !== 'string' ||
        typeof options.region !== 'string' ||
        typeof options.prefix !== 'string'
      )
        throw new Error('Saved Drive configuration is invalid.')
      return buildDriveConnection(
        {
          name: item.name.trim(),
          providerId: 'minio',
          endpoint: normalizeDriveEndpoint(options.endpoint),
          bucket: validateDriveBucket(options.bucket),
          region: options.region,
          prefix: options.prefix,
        },
        item.id,
      )
    }
    if (
      typeof options.rootPath !== 'string' ||
      !options.rootPath.startsWith('/')
    )
      throw new Error('Saved Drive configuration is invalid.')
    if (item.providerId === 'baidu')
      return buildDriveConnection(
        {
          name: item.name.trim(),
          providerId: 'baidu',
          rootPath: options.rootPath,
        },
        item.id,
      )
    if (
      options.driveType !== 'default' &&
      options.driveType !== 'resource' &&
      options.driveType !== 'backup'
    )
      throw new Error('Saved Drive configuration is invalid.')
    return buildDriveConnection(
      {
        name: item.name.trim(),
        providerId: 'aliyun',
        rootPath: options.rootPath,
        driveType: options.driveType,
      },
      item.id,
    )
  }
  const connectionList = data.connections.map(parseConnection)
  if (removedDefaultIds.some((id) => idSet.has(id)))
    throw new Error('Saved Drive configuration is invalid.')
  return { connectionList, removedDefaultIds }
}

// 从已校验的公共配置中读取连接列表。
const parseSavedDriveConnectionList = (
  serialized: string | null,
): DriveProvider[] => parseSavedDriveConnectionRecord(serialized).connectionList

export {
  buildDriveConnectionDraft,
  buildDriveConnection,
  parseSavedDriveConnectionList,
  parseSavedDriveConnectionRecord,
}
