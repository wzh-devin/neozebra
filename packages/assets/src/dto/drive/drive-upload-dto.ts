import { z } from 'zod'
import { entryIdDto, entryNameDto } from './drive-dto.ts'

const uploadIdDto = z.string().uuid()
const uploadHashDto = z.string().regex(/^[a-f0-9]{64}$/)
const driveUploadDraftDto = z
  .object({
    id: uploadIdDto,
    parent: entryIdDto,
    directoryPath: z.array(entryNameDto).default([]),
    name: entryNameDto,
    size: z.number().int().nonnegative().safe(),
    mimeType: z
      .string()
      .max(255)
      .regex(/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/)
      .default('application/octet-stream'),
    fingerprint: z.union([uploadHashDto, z.literal('')]).default(''),
  })
  .strict()
const driveUploadActionDto = z
  .object({
    action: z.enum(['pause', 'resume', 'cancel', 'retry']),
    fingerprint: uploadHashDto.optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.fingerprint ||
      value.action === 'resume' ||
      value.action === 'retry',
  )

// 页号和游标分别用于表格与运行态查询，不混用两种分页边界。
const driveUploadListDto = z
  .object({
    page: z.coerce.number().int().min(1).max(1_000_000).optional(),
    cursor: z
      .string()
      .regex(/^\d{1,19}$/)
      .refine((value) => BigInt(value) <= 9223372036854775807n)
      .optional(),
  })
  .strict()
  .refine((value) => value.page === undefined || !value.cursor)

const uploadPartNumberDto = z.coerce.number().int().nonnegative().safe()

export {
  uploadIdDto,
  uploadHashDto,
  uploadPartNumberDto,
  driveUploadDraftDto,
  driveUploadActionDto,
  driveUploadListDto,
}
export type DriveUploadDraft = z.infer<typeof driveUploadDraftDto>
