import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Prisma } from '@neozebra/database'

test('Prisma 生成的十三张业务表保留 BIGINT、TIMESTAMPTZ 和代码维护的业务约束', () => {
  const schema = readFileSync(
    new URL('../../../packages/database/prisma/schema.prisma', import.meta.url),
    'utf8',
  )
  const migration = readFileSync(
    new URL(
      '../../../packages/database/prisma/migrations/0000_baseline/migration.sql',
      import.meta.url,
    ),
    'utf8',
  )
  const metadataMigration = readFileSync(
    new URL(
      '../../../packages/database/prisma/migrations/0001_drive_metadata/migration.sql',
      import.meta.url,
    ),
    'utf8',
  )
  const uploadMigration = readFileSync(
    new URL(
      '../../../packages/database/prisma/migrations/0003_drive_upload_tables/migration.sql',
      import.meta.url,
    ),
    'utf8',
  )
  const previewMigration = readFileSync(
    new URL(
      '../../../packages/database/prisma/migrations/202610120004_drive_previews/migration.sql',
      import.meta.url,
    ),
    'utf8',
  )
  const uploadDirectoriesMigration = readFileSync(
    new URL(
      '../../../packages/database/prisma/migrations/202610120005_upload_directories/migration.sql',
      import.meta.url,
    ),
    'utf8',
  )
  assert.match(
    uploadDirectoriesMigration,
    /"directory_path" JSONB NOT NULL DEFAULT '\[\]'/,
  )
  const allMigrations =
    migration +
    metadataMigration +
    uploadMigration +
    previewMigration +
    uploadDirectoriesMigration
  assert.equal(Object.keys(Prisma.ModelName).length, 13)
  assert.doesNotMatch(schema, /\benum\s|@unique|@@unique/)
  assert.match(schema, /relationMode\s*=\s*"prisma"/)
  assert.doesNotMatch(
    allMigrations,
    /FOREIGN KEY|CREATE TYPE|CHECK\s*\(|CREATE UNIQUE INDEX/i,
  )
  const modelList = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\}/g)]
  assert.equal(modelList.length, 13)
  for (const [, name, body] of modelList) {
    assert.ok(name in Prisma.ModelName)
    assert.match(body, /@@map\("nm_[a-z_]+"\)/)
    assert.match(body, /\bid\s+BigInt\s+@id\s+@default\(autoincrement\(\)\)/)
    assert.match(body, /\bupdatedAt\s+DateTime[^\n]*@updatedAt/)
    for (const line of body
      .split('\n')
      .filter((entry) => /\bDateTime\??\s/.test(entry))) {
      assert.match(line, /@db\.Timestamptz\(6\)/)
      const column = line.match(/@map\("([a-z_]+)"\)/)?.[1]
      assert.ok(column)
      assert.match(allMigrations, new RegExp(`"${column}" TIMESTAMPTZ\\(6\\)`))
    }
  }
})
