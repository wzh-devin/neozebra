import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const cli = resolve(
  '../../packages/database/node_modules/prisma/build/index.js',
)
const config = resolve('../../packages/database/prisma.config.ts')

// 仅接管与模型完全一致的旧库，差异存在时禁止将缺失迁移标记为已应用。
const diff = spawnSync(
  process.execPath,
  [
    cli,
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    resolve(
      '../../packages/database/prisma/migrations/0000_baseline/schema.prisma',
    ),
    '--exit-code',
    '--config',
    config,
  ],
  { stdio: 'inherit' },
)
if (diff.error || diff.status !== 0) {
  console.error(
    'Prisma baseline refused: database schema must match the original baseline models. Use db:migrate for an empty database.',
  )
  process.exitCode = 1
} else {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'migrate',
      'resolve',
      '--applied',
      '0000_baseline',
      '--config',
      config,
    ],
    { stdio: 'inherit' },
  )
  if (result.error || result.status !== 0) process.exitCode = 1
}
