// oxlint-disable no-control-regex -- 路径与标识边界必须拒绝控制字符。

import { z } from 'zod'

const text = z
  .string()
  .max(4096)
  .regex(/^[^\x00-\x1f\x7f]*$/)
const secret = z.string().max(8192).default('')
const common = {
  name: text.trim().min(1).max(100),
  revision: z.number().int().nonnegative().max(2147483646).optional(),
}
const oauth = {
  rootPath: text.default('/'),
}
const driveConnectionDto = z.discriminatedUnion('providerId', [
  z
    .object({
      ...common,
      providerId: z.literal('minio'),
      endpoint: text.url().regex(/^https?:\/\//i),
      bucket: text.min(3).max(63),
      region: text.default('us-east-1'),
      prefix: text.default(''),
      accessKey: secret,
      secretKey: secret,
      sessionToken: secret,
    })
    .strict(),
  z.object({ ...common, providerId: z.literal('baidu'), ...oauth }).strict(),
  z
    .object({
      ...common,
      providerId: z.literal('aliyun'),
      ...oauth,
      driveType: z.enum(['default', 'resource', 'backup']),
    })
    .strict(),
])
const driveOAuthProviderDto = z.enum(['baidu', 'aliyun'])
const driveOAuthStartDto = z
  .object({
    ...common,
    rootPath: text.default('/'),
    driveType: z.enum(['default', 'resource', 'backup']).default('default'),
    connectionId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => !value.connectionId || value.revision !== undefined)
const driveOAuthCallbackDto = z
  .object({
    state: z.string().regex(/^[a-f0-9]{64}$/),
    code: z.string().min(1).max(8192).optional(),
    error: z.string().max(200).optional(),
  })
  .refine((value) => Boolean(value.code) !== Boolean(value.error))
const entryIdDto = z.string().regex(/^(?:root|[A-Za-z0-9_-]{1,4096})$/)
const entryNameDto = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (name) =>
      !/[\x00-\x1f\x7f/\\]/.test(name) &&
      name !== '.' &&
      name !== '..' &&
      Buffer.byteLength(name) <= 255,
  )
const driveListDto = z.object({
  parent: entryIdDto.default('root'),
  cursor: z.string().max(4096).default(''),
  query: text.max(200).default(''),
  kind: z.enum(['all', 'folder']).default('all'),
  refresh: z.enum(['0', '1']).default('0'),
})
const driveSyncDto = z
  .object({
    parent: entryIdDto.default('root'),
    mode: z.enum(['activate', 'refresh']).default('activate'),
  })
  .strict()
const driveFolderDto = z
  .object({ parent: entryIdDto.default('root'), name: entryNameDto })
  .strict()
const driveEntryPatchDto = z
  .object({ name: entryNameDto.optional(), parent: entryIdDto.optional() })
  .strict()
  .refine((data) => data.name !== undefined || data.parent !== undefined)

export {
  driveConnectionDto,
  driveListDto,
  driveFolderDto,
  driveSyncDto,
  driveEntryPatchDto,
  entryIdDto,
  entryNameDto,
  driveOAuthProviderDto,
  driveOAuthStartDto,
  driveOAuthCallbackDto,
}
export type DriveOAuthProvider = z.infer<typeof driveOAuthProviderDto>
export type DriveOAuthStart = z.infer<typeof driveOAuthStartDto>
export type DriveConnectionDraft = z.infer<typeof driveConnectionDto>
export type DriveListFilter = z.infer<typeof driveListDto>
export type DriveEnv = { Variables: { owner: string } }
