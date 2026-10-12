import type {
  DriveConnectionDraft,
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
  isEditing = false,
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
    if (
      !value.trim() &&
      !(isEditing && ['accessKey', 'secretKey'].includes(key))
    )
      throw new Error(`${label} is required.`)
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
  const rootPath = getValue('rootPath').trim() || '/'
  if (!rootPath.startsWith('/'))
    throw new Error('Root folder must be an absolute path beginning with /.')
  const oauth: Omit<
    Extract<DriveConnectionDraft, { providerId: 'baidu' }>,
    'providerId'
  > = {
    name,
    rootPath,
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

export { buildDriveConnectionDraft }
