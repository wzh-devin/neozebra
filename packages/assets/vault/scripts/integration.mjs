import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const fixtureId = 'nm-vault-check-' + randomUUID().slice(0, 8)
const containerList = []
const docker = (args) => {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0)
    throw new Error(`Docker fixture operation failed: ${args[0]}`)
  return result.stdout.trim()
}
const startContainer = (name, port, image, args) => {
  const container = fixtureId + '-' + name
  docker([
    'run',
    '-d',
    '--name',
    container,
    '--label',
    'neozebra.vault.fixture=true',
    '-p',
    `127.0.0.1::${port}`,
    ...args,
    image,
    ...(name === 'minio' ? ['server', '/data'] : []),
  ])
  containerList.push(container)
  const address = docker(['port', container, String(port)])
    .split(':')
    .at(-1)
  return Number(address)
}
const secret = randomBytes(24).toString('hex')
let keep = false
try {
  const pg = startContainer('pg', 5432, 'postgres:16-alpine', [
    '-e',
    'POSTGRES_USER=vault',
    '-e',
    'POSTGRES_DB=vault',
    '-e',
    `POSTGRES_PASSWORD=${secret}`,
  ])
  const redis = startContainer('redis', 6379, 'redis:7.4.1', [])
  const minio = startContainer(
    'minio',
    9000,
    'minio/minio:RELEASE.2024-05-28T17-19-04Z',
    [
      '-e',
      'MINIO_ROOT_USER=vault-check',
      '-e',
      `MINIO_ROOT_PASSWORD=${secret}`,
      '-e',
      'MINIO_API_CORS_ALLOW_ORIGIN=http://localhost:5174,http://localhost:5176',
    ],
  )
  for (let attempt = 0; attempt < 60; attempt++) {
    const ready =
      spawnSync(
        'docker',
        ['exec', containerList[0], 'pg_isready', '-U', 'vault'],
        { stdio: 'ignore' },
      ).status === 0
    const objects = await fetch(`http://127.0.0.1:${minio}/minio/health/live`)
      .then((response) => response.ok)
      .catch(() => false)
    if (ready && objects) break
    if (attempt === 59) throw new Error('Fixture services did not become ready')
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  const env = {
    ...process.env,
    STORAGE_INTEGRATION: '1',
    STORAGE_DATABASE_URL: `postgresql://vault:${secret}@127.0.0.1:${pg}/vault?sslmode=disable`,
    STORAGE_REDIS_URL: `redis://127.0.0.1:${redis}/0`,
    STORAGE_SCHEMA: 'vault_check_' + randomUUID().replaceAll('-', ''),
    APP_ORIGIN: 'http://localhost:5174',
    STORAGE_ADDRESS: '127.0.0.1:3001',
    STORAGE_MINIO_ENDPOINT: `http://127.0.0.1:${minio}`,
    STORAGE_MINIO_PUBLIC_ENDPOINT: `http://127.0.0.1:${minio}`,
    STORAGE_MINIO_ACCESS_KEY: 'vault-check',
    STORAGE_MINIO_SECRET_KEY: secret,
    STORAGE_MINIO_BUCKET: 'vault-check',
  }
  const result = spawnSync('go', ['test', '-race', '-count=1', '-v', './...'], {
    env,
    stdio: 'inherit',
  })
  process.exitCode = result.status ?? 1
  if (result.status === 0 && process.argv.includes('--keep')) {
    const directory = path.join(tmpdir(), fixtureId)
    mkdirSync(directory, { mode: 0o700 })
    const file = path.join(directory, 'fixture.json')
    const vaultEnv = Object.fromEntries(
      Object.entries(env).filter(
        ([key]) => key.startsWith('STORAGE_') || key === 'APP_ORIGIN',
      ),
    )
    writeFileSync(
      file,
      JSON.stringify({ env: vaultEnv, containers: containerList }),
      { mode: 0o600 },
    )
    const migration = spawnSync('go', ['run', './cmd/vault', 'migrate'], {
      env,
      stdio: 'inherit',
    })
    if (migration.status !== 0) throw new Error('UI fixture migration failed')
    keep = true
    console.log(`Isolated UI fixture: ${file}`)
  }
} finally {
  if (!keep)
    for (const container of containerList.reverse())
      spawnSync('docker', ['rm', '-f', '-v', container], { stdio: 'ignore' })
}
