import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import { test } from 'node:test'
import { HTTPException } from 'hono/http-exception'
import { createMinioProvider } from '../../../packages/assets/src/infrastructure/drive/providers/minio-provider.ts'

// 合成凭据仅用于本地 S3 协议检查，不连接真实存储。
const createProvider = (endpoint: string) =>
  createMinioProvider({
    mount: {
      providerId: 'minio',
      endpoint,
      bucket: 'synthetic-drive',
      prefix: '',
      region: 'us-east-1',
    },
    credentials: {
      accessKey: 'synthetic-access',
      secretKey: 'synthetic-secret',
    },
    assertLease: () => {},
    refreshCredentials: async () => ({}),
  })

test('MinIO 接受用户配置的公网、内网及自定义端口，无需地址白名单', () => {
  for (const endpoint of [
    'https://storage.example.test',
    'http://storage.internal:9100',
    'http://192.168.10.20:9000',
    'https://storage.example.test:9443',
  ])
    assert.doesNotThrow(() => createProvider(endpoint))
})

test('MinIO 保留 HTTP(S) origin 格式校验', () => {
  for (const endpoint of [
    'ftp://storage.example.test',
    'https://storage.example.test/path',
    'https://user:password@storage.example.test',
    'https://storage.example.test?bucket=test',
    'https://storage.example.test#fragment',
  ])
    assert.throws(
      () => createProvider(endpoint),
      (error: unknown) =>
        error instanceof HTTPException &&
        error.status === 400 &&
        error.message === 'The endpoint must be an HTTP(S) origin.',
    )
})

test('MinIO 通过随机端口 S3 协议服务验证桶并查询文件', async () => {
  const requestList: string[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://synthetic.local')
    requestList.push(`${request.method} ${url.pathname}`)
    response.setHeader('Content-Type', 'application/xml')
    response.end(
      request.method === 'HEAD'
        ? ''
        : '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>synthetic-drive</Name><IsTruncated>false</IsTruncated><Contents><Key>synthetic.txt</Key><LastModified>2026-10-10T00:00:00.000Z</LastModified><ETag>&quot;synthetic-etag&quot;</ETag><Size>12</Size><StorageClass>STANDARD</StorageClass></Contents></ListBucketResult>',
    )
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const provider = createProvider(`http://127.0.0.1:${address.port}`)
    await provider.connect()
    const page = await provider.list({
      parent: 'root',
      kind: 'all',
      query: '',
      cursor: '',
      refresh: '0',
    })
    assert.equal(page.entries[0]?.name, 'synthetic.txt')
    assert.equal(page.entries[0]?.sizeBytes, 12)
    assert.equal(page.nextCursor, null)
    assert.ok(requestList.includes('HEAD /synthetic-drive'))
    assert.ok(requestList.includes('GET /synthetic-drive'))
  } finally {
    await promisify(server.close.bind(server))()
  }
})
