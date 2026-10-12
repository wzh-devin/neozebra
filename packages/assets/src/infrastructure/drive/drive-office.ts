import { createHmac, timingSafeEqual } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AssetsDependencies } from './types.ts'

const officeTypeRecord: Record<string, 'word' | 'cell' | 'slide' | 'pdf'> =
  Object.fromEntries(
    [
      ['word', 'doc docx docm dot dotx dotm odt ott rtf'],
      ['cell', 'xls xlsx xlsm xlsb xlt xltx xltm ods ots csv'],
      ['slide', 'ppt pptx pptm pps ppsx ppsm pot potx potm odp otp'],
      ['pdf', 'pdf'],
    ].flatMap(([type, extensions]) =>
      extensions.split(' ').map((extension) => [extension, type]),
    ),
  ) as Record<string, 'word' | 'cell' | 'slide' | 'pdf'>

// PDF MIME兼容没有扩展名的文件；HTML仍按纯文本展示。
const getOfficeType = (name: string, mimeType?: string | null) => {
  if (mimeType?.toLowerCase().split(';')[0].trim() === 'application/pdf')
    return { fileType: 'pdf', documentType: 'pdf' as const }
  const fileType = name.toLowerCase().split('.').at(-1) ?? ''
  return Object.hasOwn(officeTypeRecord, fileType)
    ? { fileType, documentType: officeTypeRecord[fileType] }
    : null
}

/**
 * 校验运维配置；不向浏览器暴露引擎密钥或内部源地址的配置错误。
 *
 * @param dependencies - 基础设施
 * @returns 可用的自托管引擎配置，未配置时抛出可重试错误
 */
const getOfficeConfig = (dependencies: AssetsDependencies) => {
  const config = dependencies.getOfficeConfig?.()
  if (!config || config.jwtSecret.length < 32)
    throw new HTTPException(503, {
      message: 'Office preview is not configured on this server.',
    })
  for (const value of [config.url, config.sourceOrigin]) {
    const url = z.string().url().safeParse(value)
    if (
      !url.success ||
      !/^https?:\/\//.test(value) ||
      new URL(value).username ||
      new URL(value).password
    )
      throw new HTTPException(503, {
        message: 'Office preview configuration is invalid.',
      })
  }
  return config
}

// JWT HS256是ONLYOFFICE的标准配置签名格式。
const signOfficeConfig = (payload: object, secret: string) => {
  const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString(
    'base64url',
  )
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const value = header + '.' + body
  return (
    value + '.' + createHmac('sha256', secret).update(value).digest('base64url')
  )
}
const getSourceSignature = (publicId: string, expires: number, key: string) =>
  createHmac('sha256', key)
    .update(`drive-preview-source:${publicId}:${expires}`)
    .digest('base64url')

/**
 * 签发仅适用于单个不可变源快照的短期读票据。
 *
 * @param publicId - 快照标识
 * @param expires - Unix秒时间
 * @param key - 应用签名密钥
 * @returns 到期时间与HMAC票据
 */
const signPreviewSource = (publicId: string, expires: number, key: string) =>
  expires + '.' + getSourceSignature(publicId, expires, key)

/**
 * 固定长度常量时间验证源票据，拒绝过期、异常时长和篡改。
 *
 * @param publicId - 请求快照标识
 * @param ticket - 不可信URL票据
 * @param key - 应用签名密钥
 * @returns 票据是否有效
 */
const isPreviewSourceAuthorized = (
  publicId: string,
  ticket: string,
  key: string,
) => {
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(ticket)
  if (!match) return false
  const expires = Number(match[1])
  const now = Math.floor(Date.now() / 1000)
  if (expires <= now || expires > now + 3600) return false
  return timingSafeEqual(
    Buffer.from(match[2]),
    Buffer.from(getSourceSignature(publicId, expires, key)),
  )
}

export {
  getOfficeType,
  getOfficeConfig,
  signOfficeConfig,
  signPreviewSource,
  isPreviewSourceAuthorized,
}
