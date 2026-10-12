import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAliyunProvider } from '../../../packages/assets/src/infrastructure/drive/providers/aliyun-provider.ts'
import type {
  DriveUpload,
  ProviderContext,
} from '../../../packages/assets/src/infrastructure/drive/types.ts'

test('阿里官方接口协议：更新分片地址、续传、过期识别及安全取消', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'neozebra-aliyun-upload-'))
  const path = join(directory, 'content')
  const bytes = Buffer.alloc(9 * 1024 * 1024 + 7, 31)
  await writeFile(path, bytes)
  const files = new Map<
    string,
    { status: string; name: string; size: number; parts: Map<number, Buffer> }
  >()
  const sent: number[] = []
  const urls: number[] = []
  let failPart = 2
  let expired = false
  let created = 0
  let deleted = 0
  const providerContext: ProviderContext = {
    mount: {
      providerId: 'aliyun',
      rootPath: '/',
      driveType: 'default',
      driveId: 'synthetic-drive',
      rootId: 'root',
    },
    credentials: { accessToken: 'synthetic-token' },
    assertLease: () => {},
    refreshCredentials: async () => ({ accessToken: 'synthetic-token' }),
  }
  context.mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.hostname === 'synthetic.aliyuncs.com') {
        const part = Number(url.pathname.split('/').at(-1))
        if (failPart === part) {
          failPart = 0
          throw new TypeError('Synthetic connection interruption')
        }
        const body = Buffer.from(await new Response(init!.body).arrayBuffer())
        files.get('file-' + created)!.parts.set(part, body)
        sent.push(part)
        return new Response('', { status: 200 })
      }
      const parameters = JSON.parse(String(init?.body ?? '{}'))
      if (url.pathname.endsWith('/create')) {
        created++
        files.set('file-' + created, {
          status: 'uploading',
          name: parameters.name,
          size: parameters.size,
          parts: new Map(),
        })
        return Response.json({
          file_id: 'file-' + created,
          upload_id: 'upload-' + created,
        })
      }
      if (url.pathname.endsWith('/getUploadUrl')) {
        if (expired)
          return Response.json({ code: 'UploadIdExpired' }, { status: 400 })
        const part = parameters.part_info_list[0].part_number
        urls.push(part)
        return Response.json({
          part_info_list: [
            {
              part_number: part,
              upload_url: 'https://synthetic.aliyuncs.com/part/' + part,
            },
          ],
        })
      }
      if (url.pathname.endsWith('/complete')) {
        files.get(parameters.file_id)!.status = 'available'
        return Response.json({})
      }
      if (url.pathname.endsWith('/get')) {
        const file = files.get(parameters.file_id)
        if (!file)
          return Response.json({ code: 'NotFound.File' }, { status: 404 })
        return Response.json({
          file_id: parameters.file_id,
          parent_file_id: 'root',
          type: 'file',
          name: file.name,
          size: file.size,
          status: file.status,
        })
      }
      if (url.pathname.endsWith('/delete')) {
        deleted++
        files.delete(parameters.file_id)
        return Response.json({})
      }
      throw new Error('Unexpected synthetic request')
    },
  )
  let checkpoint: Record<string, unknown> | undefined
  const file: DriveUpload = {
    path,
    size: bytes.length,
    name: 'cloud.bin',
    mimeType: 'application/octet-stream',
    taskId: 'synthetic',
    saveCheckpoint: async (value) => {
      checkpoint = structuredClone(value)
    },
  }
  try {
    await assert.rejects(
      createAliyunProvider(providerContext).upload('root', 'cloud.bin', file),
    )
    assert.deepEqual(sent, [1])
    await createAliyunProvider(providerContext).upload('root', 'cloud.bin', {
      ...file,
      checkpoint,
    })
    assert.deepEqual(sent, [1, 2, 3])
    assert.deepEqual(urls, [1, 2, 2, 3])
    assert.deepEqual(
      Buffer.concat([...files.get('file-1')!.parts.values()]),
      bytes,
    )
    assert.equal(created, 1)
    await createAliyunProvider(providerContext).abortUpload!(checkpoint!)
    assert.equal(deleted, 0)
    failPart = 2
    await assert.rejects(
      createAliyunProvider(providerContext).upload('root', 'cancel.bin', {
        ...file,
        checkpoint: undefined,
      }),
    )
    await createAliyunProvider(providerContext).abortUpload!(checkpoint!)
    assert.equal(deleted, 1)
    failPart = 2
    await assert.rejects(
      createAliyunProvider(providerContext).upload('root', 'expire.bin', {
        ...file,
        checkpoint: undefined,
      }),
    )
    expired = true
    await assert.rejects(
      createAliyunProvider(providerContext).upload('root', 'expire.bin', {
        ...file,
        checkpoint,
      }),
      { status: 410 },
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
