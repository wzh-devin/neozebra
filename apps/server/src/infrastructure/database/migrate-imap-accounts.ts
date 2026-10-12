import { Prisma } from '@neozebra/database'
import type { Database } from './database-client.ts'
import { ignoreMissingRecord } from './prisma-errors.ts'
import type { MailAccount } from '../inbox/types.ts'
import {
  decryptCredentials,
  encryptCredentials,
} from '../security/credentials.ts'

/**
 * 清除 Gmail 旧认证数据，保留账号、邮件与整理状态；并发重连优先于清理快照。
 *
 * @param db - ORM 与加密配置
 * @param accountList - 待检查的 Gmail 账号快照
 * @returns 实际清理的账号数；缺少应用密码的账号被标记为需要重连
 */
const migrateImapAccounts = async (
  db: Database,
  accountList: MailAccount[],
) => {
  let changed = 0
  for (const account of accountList) {
    if (account.provider !== 'gmail') continue
    const value = decryptCredentials<{ password?: unknown } | null>(
      account.credentials,
      db.config.key,
    )
    const password = typeof value?.password === 'string' ? value.password : ''
    const error = 'Reconnect Gmail with a Google app password.'
    if (password && Object.keys(value ?? {}).length === 1) continue
    if (
      !password &&
      value?.password === '' &&
      account.cursor === null &&
      account.error === error
    )
      continue
    const result = await db.store.emailAccount
      .update({
        where: { id: account.id, credentials: account.credentials },
        data: {
          credentials: encryptCredentials({ password }, db.config.key),
          ...(!password ? { cursor: Prisma.DbNull, error } : {}),
        },
      })
      .catch(ignoreMissingRecord)
    changed += result ? 1 : 0
  }
  return changed
}

export { migrateImapAccounts }
