import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { getDatabase, closeDatabase } from './database-client.ts'
import { migrateImapAccounts } from './migrate-imap-accounts.ts'

// Prisma Migrate 管理表结构；认证数据清理通过 ORM 保留业务记录。
try {
  const db = getDatabase()
  const result = spawnSync(
    process.execPath,
    [
      resolve('../../packages/database/node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      '--config',
      resolve('../../packages/database/prisma.config.ts'),
    ],
    { stdio: 'inherit' },
  )
  if (result.error || result.status !== 0)
    throw new Error('Prisma migration failed')
  const accountList = await db.store.emailAccount.findMany({
    where: { provider: 'gmail' },
  })
  const changed = await migrateImapAccounts(db, accountList)
  console.info(`IMAP credential cleanup: ${changed} account(s)`)
  console.info('Neozebra Prisma migration complete')
} catch {
  console.error(
    'Neozebra migration failed. Check PostgreSQL configuration and migration history.',
  )
  process.exitCode = 1
} finally {
  await closeDatabase()
}
