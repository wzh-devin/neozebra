import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
import { createHash, randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const fixture = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const env = {
  ...process.env,
  ...fixture.env,
  STORAGE_SCHEMA: 'vault_transfer_check_' + randomUUID().replaceAll('-', ''),
  STORAGE_MINIO_BUCKET: 'transfer-' + randomUUID().slice(0, 8),
  STORAGE_ADDRESS: '127.0.0.1:3302',
}
for (const command of ['migrate', 'init-bucket'])
  if (
    spawnSync('./dist/vault', [command], { env, stdio: 'ignore' }).status !== 0
  )
    throw new Error('Transfer fixture failed')
const server = spawn('./dist/vault', [], { env, stdio: 'ignore' })
const base = 'http://127.0.0.1:3302/api/assets/vault'
let sampler
const call = async (route, body) => {
  const response = await fetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: env.APP_ORIGIN,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Transfer API failed: ${response.status}`)
  return response.json()
}
try {
  for (let i = 0; i < 60; i++) {
    if (
      await fetch(base + '/health')
        .then((res) => res.ok)
        .catch(() => false)
    )
      break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  const rss = () =>
    Number(
      spawnSync('ps', ['-o', 'rss=', '-p', String(server.pid)], {
        encoding: 'utf8',
      }).stdout.trim(),
    )
  const initialRssKiB = rss()
  let peakRssKiB = initialRssKiB
  sampler = setInterval(() => {
    peakRssKiB = Math.max(peakRssKiB, rss())
  }, 100)
  const partSize = 8 * 1024 * 1024
  const count = 16
  const bytes = Buffer.alloc(partSize)
  const started = performance.now()
  const hashes = Array.from({ length: count }, () =>
    createHash('sha256').update(bytes).digest('hex'),
  )
  const manifestMs = performance.now() - started
  const upload = await call('/uploads', {
    name: 'synthetic-transfer.bin',
    parentId: '0',
    size: String(partSize * count),
    partSize: String(partSize),
    hashes,
    mime: 'application/octet-stream',
    idempotencyKey: randomUUID(),
  })
  while ((await call(`/uploads/${upload.id}`)).upload.state !== 'uploading')
    await new Promise((resolve) => setTimeout(resolve, 100))
  const sending = performance.now()
  let position = 1
  const lane = async () => {
    while (position <= count) {
      const number = position++
      const signed = await call(
        `/uploads/${upload.id}/parts/${number}/sign`,
        {},
      )
      const response = await fetch(signed.url, {
        method: 'PUT',
        headers: signed.headers,
        body: bytes,
      })
      if (!response.ok) throw new Error('Signed part failed')
      await call(`/uploads/${upload.id}/parts/${number}/confirm`, {})
    }
  }
  await Promise.all([lane(), lane()])
  const directPartsAndConfirmMs = performance.now() - sending
  const confirming = performance.now()
  await call(`/uploads/${upload.id}/complete`, {})
  while (true) {
    const state = (await call(`/uploads/${upload.id}`)).upload.state
    if (state === 'completed') break
    if (state === 'failed') throw new Error('Verification failed')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  clearInterval(sampler)
  const summary = {
    bytes: partSize * count,
    concurrentParts: 2,
    manifestMs: Math.round(manifestMs),
    directPartsAndConfirmMs: Math.round(directPartsAndConfirmMs),
    completedPublishMs: Math.round(performance.now() - confirming),
    totalMs: Math.round(performance.now() - started),
    transferMiBps: Number((128 / (directPartsAndConfirmMs / 1000)).toFixed(2)),
    initialRssKiB,
    peakRssKiB,
    state: 'completed',
    environment:
      'isolated local Docker MinIO; includes confirmations; not a production bandwidth SLO',
  }
  writeFileSync(process.argv[3], JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
} finally {
  clearInterval(sampler)
  server.kill('SIGINT')
}
