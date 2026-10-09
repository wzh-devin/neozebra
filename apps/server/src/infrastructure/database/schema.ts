import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

type MailCursor = { uidValidity?: string; uid?: number }

// 主键由数据库分配，更新时间由 ORM 在每次业务更新时维护。
const emailAccounts = pgTable(
  'nm_email_accounts',
  {
    id: bigint('id', { mode: 'bigint' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    ownerId: text('owner_id').notNull(),
    provider: text('provider').$type<'gmail' | 'qq'>().notNull(),
    email: text('email').notNull(),
    credentials: text('credentials').notNull(),
    cursor: jsonb('cursor').$type<MailCursor>(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    error: text('error'),
  },
  (table) => [
    index('nm_email_accounts_owner_provider_email').on(
      table.ownerId,
      table.provider,
      table.email,
    ),
  ],
)

const emailMessages = pgTable(
  'nm_email_messages',
  {
    id: bigint('id', { mode: 'bigint' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    accountId: bigint('account_id', { mode: 'bigint' }).notNull(),
    providerId: text('provider_id').notNull(),
    title: text('title').notNull(),
    sender: text('sender').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    summary: text('summary').default('').notNull(),
    body: text('body'),
    bodyFormat: text('body_format').$type<'html' | 'markdown'>(),
    read: boolean('read').default(false).notNull(),
    archived: boolean('archived').default(false).notNull(),
  },
  (table) => [
    index('nm_email_messages_account_provider').on(
      table.accountId,
      table.providerId,
    ),
    index('nm_email_messages_account_date').on(
      table.accountId,
      table.receivedAt.desc(),
      table.id,
    ),
  ],
)

export { emailAccounts, emailMessages }
export type { MailCursor }
