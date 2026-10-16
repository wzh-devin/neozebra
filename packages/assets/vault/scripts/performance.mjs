import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const fixture = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const output = path.resolve(process.argv[3])
const apiPort = Number(process.argv[4] ?? 3301)
mkdirSync(output, { recursive: true })
const env = {
  ...process.env,
  ...fixture.env,
  STORAGE_SCHEMA: 'vault_perf_check_' + randomUUID().replaceAll('-', ''),
  STORAGE_MINIO_BUCKET: 'perf-' + randomUUID().slice(0, 8),
  STORAGE_ADDRESS: '127.0.0.1:3301',
}
const seeded = spawnSync('go', ['run', './cmd/performance'], {
  env,
  encoding: 'utf8',
})
if (seeded.status !== 0) throw new Error('Performance fixture failed')
const { uploadId } = JSON.parse(seeded.stdout)
mkdirSync('dist', { recursive: true })
if (
  spawnSync('go', ['build', '-o', 'dist/vault-check', './cmd/vault'], {
    stdio: 'ignore',
  }).status !== 0
)
  throw new Error('Performance build failed')
const server = spawn('./dist/vault-check', [], { env, stdio: 'ignore' })
const base = 'http://127.0.0.1:3301/api/assets/vault'
const endpoints = [
  ['list', 'GET', '/entries?parentId=0&limit=100', ''],
  ['search', 'GET', '/entries?parentId=0&limit=100&search=009', ''],
  ['tasks', 'GET', '/uploads', ''],
  ['task-filter', 'GET', '/uploads?status=active&sort=size-desc', ''],
  [
    'task-search',
    'GET',
    '/uploads?status=completed&sort=oldest&search=009',
    '',
  ],
  ['sign', 'POST', `/uploads/${uploadId}/parts/1/sign`, ''],
  [
    'pause',
    'PATCH',
    `/uploads/${uploadId}`,
    '{"action":"pause","fingerprint":""}',
  ],
]
const escapeXml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
const createPlan = (label, method, route, body, loops) =>
  `<?xml version="1.0"?><jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3"><hashTree><TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Vault ${label}" enabled="true"><elementProp name="TestPlan.user_defined_variables" elementType="Arguments"><collectionProp name="Arguments.arguments"/></elementProp></TestPlan><hashTree><ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="10 users" enabled="true"><stringProp name="ThreadGroup.num_threads">10</stringProp><stringProp name="ThreadGroup.ramp_time">1</stringProp><stringProp name="ThreadGroup.on_sample_error">continue</stringProp><elementProp name="ThreadGroup.main_controller" elementType="LoopController"><boolProp name="LoopController.continue_forever">false</boolProp><stringProp name="LoopController.loops">${loops}</stringProp></elementProp></ThreadGroup><hashTree><HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="Headers" enabled="true"><collectionProp name="HeaderManager.headers">${[
    ['Origin', 'http://localhost:5174'],
    ['Content-Type', 'application/json'],
  ]
    .map(
      ([name, value]) =>
        `<elementProp name="" elementType="Header"><stringProp name="Header.name">${name}</stringProp><stringProp name="Header.value">${value}</stringProp></elementProp>`,
    )
    .join(
      '',
    )}</collectionProp></HeaderManager><hashTree/><ConstantTimer guiclass="ConstantTimerGui" testclass="ConstantTimer" testname="100ms think" enabled="true"><stringProp name="ConstantTimer.delay">100</stringProp></ConstantTimer><hashTree/><HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${label}" enabled="true"><elementProp name="HTTPsampler.Arguments" elementType="Arguments"><collectionProp name="Arguments.arguments">${body ? `<elementProp name="" elementType="HTTPArgument"><boolProp name="HTTPArgument.always_encode">false</boolProp><stringProp name="Argument.value">${escapeXml(body)}</stringProp><stringProp name="Argument.metadata">=</stringProp></elementProp>` : ''}</collectionProp></elementProp><stringProp name="HTTPSampler.domain">127.0.0.1</stringProp><stringProp name="HTTPSampler.port">${apiPort}</stringProp><stringProp name="HTTPSampler.protocol">http</stringProp><stringProp name="HTTPSampler.path">/api/assets/vault${escapeXml(route)}</stringProp><stringProp name="HTTPSampler.method">${method}</stringProp><boolProp name="HTTPSampler.postBodyRaw">true</boolProp><boolProp name="HTTPSampler.use_keepalive">true</boolProp><stringProp name="HTTPSampler.connect_timeout">3000</stringProp><stringProp name="HTTPSampler.response_timeout">5000</stringProp></HTTPSamplerProxy><hashTree/></hashTree></hashTree></hashTree></jmeterTestPlan>`
try {
  for (let i = 0; i < 60; i++) {
    if (
      await fetch(base + '/health')
        .then((res) => res.ok)
        .catch(() => false)
    )
      break
    await new Promise((resolve) => setTimeout(resolve, 500))
    if (i === 59) throw new Error('Performance API did not start')
  }
  const summary = []
  for (const [label, method, route, body] of endpoints) {
    for (const [stage, loops] of [
      ['warmup', 30],
      ['formal', 100],
    ]) {
      const plan = path.join(output, `${label}-${stage}.jmx`)
      const results = path.join(output, `${label}-${stage}.jtl`)
      writeFileSync(plan, createPlan(label, method, route, body, loops))
      const result = await new Promise((resolve) => {
        const child = spawn(
          'jmeter',
          [
            '-n',
            '-t',
            plan,
            '-l',
            results,
            '-j',
            path.join(output, `${label}-${stage}.log`),
            '-Jjmeter.save.saveservice.output_format=csv',
          ],
          { stdio: 'ignore' },
        )
        child.on('exit', resolve)
      })
      if (result !== 0) throw new Error('JMeter execution failed')
      if (stage === 'formal') {
        const lines = readFileSync(results, 'utf8').trim().split('\n')
        const headers = lines.shift().split(',')
        const rows = lines.map((line) => line.split(','))
        const column = (key) => headers.indexOf(key)
        const samples = rows
          .map((row) => Number(row[column('elapsed')]))
          .sort((a, b) => a - b)
        const stamps = rows.map((row) => Number(row[column('timeStamp')]))
        const ends = rows.map(
          (row) =>
            Number(row[column('timeStamp')]) + Number(row[column('elapsed')]),
        )
        const p95 = samples[Math.ceil(samples.length * 0.95) - 1]
        const p99 = samples[Math.ceil(samples.length * 0.99) - 1]
        const errors = rows.filter(
          (row) =>
            row[column('success')] !== 'true' ||
            row[column('responseCode')] !== '200',
        ).length
        const throughput =
          rows.length / ((Math.max(...ends) - Math.min(...stamps)) / 1000)
        summary.push({
          label,
          samples: rows.length,
          p95,
          p99,
          errors,
          throughput: Number(throughput.toFixed(2)),
          passed:
            rows.length >= 1000 &&
            errors === 0 &&
            p95 <= (['sign', 'pause'].includes(label) ? 300 : 100) &&
            p99 <= (['sign', 'pause'].includes(label) ? 600 : 200) &&
            throughput >= 25,
        })
      }
    }
  }
  writeFileSync(
    path.join(output, 'summary.json'),
    JSON.stringify(
      {
        entries: 10000,
        threads: 10,
        warmupPerEndpoint: 300,
        formalPerEndpoint: 1000,
        thinkTimeMs: 100,
        summary,
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify(summary, null, 2))
  if (summary.some((item) => !item.passed)) process.exitCode = 1
} finally {
  server.kill('SIGINT')
}
