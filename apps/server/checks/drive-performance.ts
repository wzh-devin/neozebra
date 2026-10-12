import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { writeFileSync, readFileSync } from 'node:fs'
import { Pool } from 'pg'
import { serve } from '@hono/node-server'
import { createApp } from '../src/app.ts'
import { getInboxConfig } from '../src/infrastructure/config/inbox-config.ts'
import {
  getDatabase,
  closeDatabase,
} from '../src/infrastructure/database/database-client.ts'

// Synthetic/local mock；只清理本脚本随机生成的 schema，Cookie 仅传入 JMeter 进程环境。
const config = getInboxConfig()
const schema = `drive_perf_${randomUUID().replaceAll('-', '')}`
const pool = new Pool({ connectionString: config.databaseUrl })
const url = new URL(config.databaseUrl)
url.searchParams.set('schema', schema)
const evidence = resolve(
  process.env.DRIVE_PERF_EVIDENCE ??
    '../../.agents/skills/devin-project-context/assets/features/drive-metadata-sync/jmeter/2026-10-10',
)
let server: ReturnType<typeof serve> | undefined
let operationLock: string | undefined
let upstreamCalls = 0
const originalFetch = globalThis.fetch
globalThis.fetch = async () => {
  upstreamCalls++
  throw new Error('Read must not call upstream')
}
try {
  await pool.query(`CREATE SCHEMA "${schema}"`)
  process.env.DATABASE_URL = url.href
  const migration = spawnSync(
    process.execPath,
    [
      '../../packages/database/node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--config',
      '../../packages/database/prisma.config.ts',
    ],
    { env: process.env, stdio: 'ignore' },
  )
  assert.equal(migration.status, 0)
  const app = createApp()
  const db = getDatabase()
  const cookieList: string[] = []
  const ownerList: string[] = []
  for (const path of ['/api/assets/drive/connections']) {
    const response = await app.request(path)
    assert.equal(response.status, 200)
    const cookie = response.headers.get('set-cookie')!.split(';')[0]
    cookieList.push(cookie)
    ownerList.push(
      createHash('sha256')
        .update(decodeURIComponent(cookie.split('=')[1]).split('.')[0])
        .digest('hex'),
    )
  }
  const connection = await db.store.driveConnection.create({
    data: {
      ownerId: ownerList[0],
      publicId: randomUUID(),
      provider: 'baidu',
      name: 'Synthetic Drive',
      mountOptions: { providerId: 'baidu', rootPath: '/' },
      encryptedCredentials: 'synthetic-unused',
      lastCheckedAt: new Date(),
    },
  })
  const directory = await db.store.driveDirectory.create({
    data: {
      connectionId: connection.id,
      connectionVersion: 1,
      remoteId: 'root',
      parentRemoteId: 'root',
      path: [{ id: 'root', name: connection.name }],
      publishedGeneration: 'synthetic-generation',
      state: 'ready',
      lastSyncedAt: new Date(),
      nextSyncAt: new Date(Date.now() + 600_000),
    },
  })
  if (process.env.DRIVE_PERF_HOLD_LOCK === '1') {
    operationLock = `drive:operation:${ownerList[0]}:${connection.publicId}`
    await db.connectRedis()
    assert.equal(
      await db.redis.set(operationLock, 'synthetic-performance', {
        NX: true,
        PX: 300_000,
      }),
      'OK',
    )
  }
  for (let offset = 0; offset < 10_000; offset += 500)
    await db.store.driveEntry.createMany({
      data: Array.from({ length: 500 }, (_, index) => ({
        connectionId: connection.id,
        connectionVersion: 1,
        directoryId: directory.id,
        remoteId: 'entry-' + (offset + index),
        parentRemoteId: 'root',
        generation: 'synthetic-generation',
        name: `Synthetic ${String(offset + index).padStart(5, '0')}`,
        kind: (offset + index) % 10 === 0 ? 'folder' : 'file',
        sizeBytes: 1000n,
      })),
    })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  if (!server.listening)
    await new Promise<void>((resolve) => server!.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const exec = promisify(execFile)
  const common = [
    '-n',
    '-t',
    `${evidence}/drive.jmx`,
    `-Jport=${address.port}`,
    '-Jjmeter.save.saveservice.output_format=csv',
    '-Jjmeter.save.saveservice.response_data=false',
    '-Jjmeter.save.saveservice.response_data.on_error=false',
    '-Jjmeter.save.saveservice.requestHeaders=false',
    '-Jjmeter.save.saveservice.responseHeaders=false',
    '-Jjmeter.save.saveservice.samplerData=false',
  ]
  const env = {
    ...process.env,
    PRISMA_TEST_COOKIE: cookieList.join('; '),
    DRIVE_TEST_ID: connection.publicId,
    DRIVE_TEST_ORIGIN: db.config.origin,
  }
  const preflight = await exec(
    'jmeter',
    [
      ...common,
      '-Jthreads=1',
      '-JwarmLoops=1',
      '-JmeasureLoops=1',
      '-l',
      `${evidence}/preflight.jtl`,
      '-j',
      `${evidence}/preflight.log`,
    ],
    { env },
  )
  assert.equal(preflight.stderr.includes('ERROR'), false)
  assert.ok(
    readFileSync(`${evidence}/preflight.jtl`, 'utf8')
      .split('\n')
      .slice(1)
      .filter(Boolean)
      .every((line) => line.split(',')[7] === 'true'),
  )
  const started = new Date().toISOString()
  console.log('JMeter preflight complete; starting 10-thread isolated reads')
  await exec(
    'jmeter',
    [
      ...common,
      '-Jthreads=10',
      '-JwarmLoops=30',
      '-JmeasureLoops=100',
      '-l',
      `${evidence}/results.jtl`,
      '-j',
      `${evidence}/jmeter.log`,
      '-e',
      '-o',
      `${evidence}/dashboard`,
    ],
    { env, maxBuffer: 1024 * 1024 },
  )
  assert.equal(upstreamCalls, 0)
  if (operationLock)
    assert.equal(await db.redis.get(operationLock), 'synthetic-performance')
  writeFileSync(
    `${evidence}/run.json`,
    JSON.stringify(
      {
        started,
        finished: new Date().toISOString(),
        exitCode: 0,
        threads: 10,
        warmLoops: 30,
        measureLoops: 100,
        schema: 'isolated temporary schema',
        metadataRows: 10000,
        folderRows: 1000,
        upstreamCalls,
        heldOperationLock: Boolean(operationLock),
        rssBytes: process.memoryUsage().rss,
        poolTotal: db.pool.totalCount,
        poolWaiting: db.pool.waitingCount,
      },
      null,
      2,
    ),
  )
  console.log('JMeter finished; evidence saved without session credentials')
} finally {
  globalThis.fetch = originalFetch
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    )
  if (operationLock) await getDatabase().redis.del(operationLock)
  await closeDatabase()
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  await pool.end()
}
