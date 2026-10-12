// oxlint-disable no-control-regex -- 路径与标识边界必须拒绝控制字符。

import { HTTPException } from 'hono/http-exception'
import type { DriveListFilter } from '../../dto/drive/drive-dto.ts'
import type { DriveEntry } from './types.ts'

const encodeEntryId = (value: string): string =>
  Buffer.from(value).toString('base64url')
const decodeEntryId = (id: string): string => {
  const value = Buffer.from(id, 'base64url').toString('utf8')
  if (!value || encodeEntryId(value) !== id || /[\x00-\x1f\x7f]/.test(value))
    throw new HTTPException(400, { message: 'Invalid file identifier.' })
  return value
}
const normalizeRootPath = (value: string): string => {
  const path = value.trim() || '/'
  if (
    !path.startsWith('/') ||
    /[\x00-\x1f\x7f\\]/.test(path) ||
    path.split('/').some((part) => part === '.' || part === '..')
  )
    throw new HTTPException(400, {
      message: 'Use an absolute root folder without dot segments.',
    })
  return '/' + path.split('/').filter(Boolean).join('/')
}
const matchesDriveFilter = (
  entry: DriveEntry,
  filter: DriveListFilter,
): boolean =>
  (filter.kind === 'all' || entry.kind === 'folder') &&
  entry.name
    .toLocaleLowerCase()
    .includes(filter.query.trim().toLocaleLowerCase())
const providerError = (status = 502): HTTPException =>
  new HTTPException(
    status === 401 || status === 403
      ? 401
      : status === 404
        ? 404
        : status === 409
          ? 409
          : 502,
    {
      message:
        status === 401 || status === 403
          ? 'Storage authorization failed. Reconfigure this Drive with valid credentials.'
          : status === 404
            ? 'The remote file or folder no longer exists.'
            : status === 409
              ? 'An item with this name already exists.'
              : 'The storage request failed. Retry without changing your credentials.',
    },
  )

// 上游地址仅允许当前存储服务的官方传输域名，重定向每跳重新检查。
const isAllowedTransferUrl = (
  value: string,
  provider: 'baidu' | 'aliyun',
): boolean => {
  const url = new URL(value)
  const suffixList =
    provider === 'baidu'
      ? ['baidu.com', 'baidupcs.com', 'bcebos.com']
      : ['aliyuncs.com', 'aliyundrive.com', 'alipan.com']
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === '443') &&
    suffixList.some(
      (suffix) =>
        url.hostname === suffix || url.hostname.endsWith('.' + suffix),
    )
  )
}

/**
 * 代理经校验的上游内容，逐跳校验重定向且不泄露授权响应。
 *
 * @param value - 上游返回的临时传输地址
 * @param provider - 传输所属服务
 * @param init - 下载或分片上传参数
 * @returns 成功的上游响应；无效域名或失败抛出安全错误
 */
const fetchDriveContent = async (
  value: string,
  provider: 'baidu' | 'aliyun',
  init: RequestInit = {},
): Promise<Response> => {
  let url = value
  for (let hop = 0; hop < 5; hop++) {
    if (!isAllowedTransferUrl(url, provider)) throw providerError()
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: init.signal ?? AbortSignal.timeout(120_000),
    })
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location || init.method === 'PUT' || init.method === 'POST')
        throw providerError()
      url = new URL(location, url).href
      continue
    }
    if (!response.ok && response.status !== 416) {
      await response.body?.cancel()
      throw providerError(response.status)
    }
    return response
  }
  throw providerError()
}

export {
  encodeEntryId,
  decodeEntryId,
  normalizeRootPath,
  matchesDriveFilter,
  providerError,
  fetchDriveContent,
  isAllowedTransferUrl,
}
