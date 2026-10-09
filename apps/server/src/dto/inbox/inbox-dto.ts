import { z } from 'zod'

const idSchema = z
  .string()
  .refine(
    (value) =>
      /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n,
  )
  .transform((value) => BigInt(value))
const qqSchema = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .regex(/@(qq|foxmail)\.com$/i),
    password: z.string().trim().min(8).max(128),
  })
  .strict()
const gmailSchema = z
  .object({
    email: z.string().email().max(254),
    password: z
      .string()
      .max(128)
      .transform((value) => value.replace(/\s/g, ''))
      .pipe(z.string().regex(/^[a-z\d]{16}$/i)),
  })
  .strict()
const patchSchema = z
  .object({ read: z.boolean().optional(), archived: z.boolean().optional() })
  .strict()
  .refine((value) => value.read !== undefined || value.archived !== undefined)
const filterSchema = z.object({
  tab: z.enum(['all', 'unread', 'archived']).default('all'),
  account: z
    .union([z.literal('all'), z.literal('email'), idSchema])
    .default('all'),
  query: z
    .string()
    .max(200)
    .refine((value) => !value.includes('\0'))
    .default(''),
  before: idSchema.optional(),
})
type MailFilterDto = z.infer<typeof filterSchema>
type MailPatchDto = z.infer<typeof patchSchema>
type InboxEnv = { Variables: { owner: string } }
const syncSchema = z.object({ force: z.boolean().default(false) }).strict()
const arrivalSchema = z
  .object({
    after: z
      .string()
      .regex(/^(0|[1-9]\d{0,18})$/)
      .refine((value) => BigInt(value) <= 9223372036854775807n)
      .transform((value) => BigInt(value))
      .optional(),
  })
  .strict()

export {
  idSchema,
  qqSchema,
  gmailSchema,
  patchSchema,
  filterSchema,
  syncSchema,
  arrivalSchema,
}
export type { MailFilterDto, MailPatchDto, InboxEnv }
