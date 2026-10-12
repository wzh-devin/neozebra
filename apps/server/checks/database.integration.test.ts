import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { Pool } from 'pg'
import { PrismaClient } from '@neozebra/database'
import { PrismaPg } from '@prisma/adapter-pg'

test(
  '已有业务表可以无损登记 Prisma baseline 并重复迁移',
  {
    skip: !process.env.DATABASE_URL,
  },
  async () => {
    const schema = `prisma_existing_${randomUUID().replaceAll('-', '')}`
    const url = new URL(process.env.DATABASE_URL!)
    url.searchParams.set('schema', schema)
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    const store = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) })
    try {
      await pool.query(`CREATE SCHEMA "${schema}"`)
      const baselineScript = 'src/infrastructure/database/baseline.ts'
      const baselineOptions = {
        env: { ...process.env, DATABASE_URL: url.href },
        encoding: 'utf8' as const,
      }
      assert.throws(() =>
        execFileSync(process.execPath, [baselineScript], baselineOptions),
      )
      await pool.query(
        readFileSync(
          new URL(
            '../../../packages/database/prisma/migrations/0000_baseline/migration.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      )
      const account = await store.emailAccount.create({
        data: {
          ownerId: 'synthetic-baseline',
          provider: 'gmail',
          email: 'synthetic@example.test',
          credentials: 'synthetic-encrypted',
        },
      })
      const message = await store.emailMessage.create({
        data: {
          accountId: account.id,
          providerId: 'synthetic-baseline',
          title: 'Keep this message',
          sender: 'Fixture',
          receivedAt: new Date('2026-10-10T10:00:00Z'),
          read: true,
          archived: true,
          body: '<p>Keep cached body</p>',
          bodyFormat: 'html',
        },
      })
      const cli = '../../packages/database/node_modules/prisma/build/index.js'
      const config = '../../packages/database/prisma.config.ts'
      const options = {
        env: { ...process.env, DATABASE_URL: url.href },
        encoding: 'utf8' as const,
      }
      const diff = execFileSync(
        process.execPath,
        [
          cli,
          'migrate',
          'diff',
          '--from-config-datasource',
          '--to-schema',
          '../../packages/database/prisma/schema.prisma',
          '--script',
          '--config',
          config,
        ],
        options,
      )
      assert.match(diff, /nm_drive_directories/)
      assert.doesNotMatch(diff, /DROP TABLE/)
      execFileSync(process.execPath, [baselineScript], baselineOptions)
      for (let attempt = 0; attempt < 2; attempt++)
        execFileSync(
          process.execPath,
          [cli, 'migrate', 'deploy', '--config', config],
          options,
        )
      const afterDiff = execFileSync(
        process.execPath,
        [
          cli,
          'migrate',
          'diff',
          '--from-config-datasource',
          '--to-schema',
          '../../packages/database/prisma/schema.prisma',
          '--script',
          '--config',
          config,
        ],
        options,
      )
      assert.match(afterDiff, /empty migration/)
      assert.equal(await store.driveDirectory.count(), 0)
      assert.deepEqual(
        await store.emailAccount.findUnique({ where: { id: account.id } }),
        account,
      )
      assert.deepEqual(
        await store.emailMessage.findUnique({ where: { id: message.id } }),
        message,
      )
      const next = await store.emailAccount.create({
        data: {
          ownerId: 'synthetic-baseline',
          provider: 'qq',
          email: 'next@example.test',
          credentials: '',
        },
      })
      assert.ok(next.id > account.id)
    } finally {
      await store.$disconnect()
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await pool.end()
    }
  },
)
