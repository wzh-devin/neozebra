import { randomUUID } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { Pool } from 'pg'
import { getInboxConfig } from '../src/infrastructure/config/inbox-config.ts'

const config = getInboxConfig()
const schema = `prisma_check_${randomUUID().replaceAll('-', '')}`
const url = new URL(config.databaseUrl)
url.searchParams.set('schema', schema)
const pool = new Pool({ connectionString: config.databaseUrl })
const env = { ...process.env, DATABASE_URL: url.href }

// 每次只创建和删除本脚本生成的 schema，集成测试不接触用户业务表。
try {
  await pool.query(`CREATE SCHEMA "${schema}"`)
  const migration = spawnSync(
    process.execPath,
    [
      '../../packages/database/node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--config',
      '../../packages/database/prisma.config.ts',
    ],
    { env, stdio: 'inherit' },
  )
  if (migration.error || migration.status !== 0)
    throw new Error('Fixture migration failed')
  const fileList = readdirSync('checks').filter(
    (name) =>
      name.endsWith('.integration.test.ts') &&
      (!process.argv.slice(2).length || process.argv.slice(2).includes(name)),
  )
  if (!fileList.length) throw new Error('No integration checks matched')
  const result = spawnSync(
    process.execPath,
    [
      '--conditions=development',
      '--test',
      ...fileList.map((name) => `checks/${name}`),
    ],
    { env, stdio: 'inherit' },
  )
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  await pool.end()
}
