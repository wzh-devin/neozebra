import { z } from 'zod'

const driveMountSchema = z.discriminatedUnion('providerId', [
  z.object({
    providerId: z.literal('minio'),
    endpoint: z.string(),
    bucket: z.string(),
    region: z.string(),
    prefix: z.string(),
  }),
  z.object({ providerId: z.literal('baidu'), rootPath: z.string() }),
  z.object({
    providerId: z.literal('aliyun'),
    rootPath: z.string(),
    driveType: z.enum(['default', 'resource', 'backup']),
    driveId: z.string(),
    rootId: z.string(),
  }),
])

type DriveMount = z.infer<typeof driveMountSchema>

export { driveMountSchema }
export type { DriveMount }
