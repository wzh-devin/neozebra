import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { getDatabase, closeDatabase } from './database-client.ts'
import { emailAccounts } from './schema.ts'
import { migrateImapAccounts } from './migrate-imap-accounts.ts'
import { eq } from 'drizzle-orm'

// 表结构使用 Drizzle 版本文件；认证数据清理通过 ORM 保留业务记录。
try {
  const db = getDatabase()
  await migrate(db.store, { migrationsFolder: resolve('drizzle') })
  const accountList = await db.store
    .select()
    .from(emailAccounts)
    .where(eq(emailAccounts.provider, 'gmail'))
  const changed = await migrateImapAccounts(db, accountList)
  console.info(`IMAP credential cleanup: ${changed} account(s)`)
  console.info('Inbox Drizzle migration complete')
} catch {
  console.error(
    'Inbox migration failed. Check PostgreSQL configuration and migration history.',
  )
  process.exitCode = 1
} finally {
  await closeDatabase()
}
