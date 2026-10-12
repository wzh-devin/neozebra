import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createMinioProvider } from '../../../packages/assets/src/infrastructure/drive/providers/minio-provider.ts'
import { createUploadS3Fixture } from './drive-upload-s3-fixture.ts'
import type { DriveUpload } from '../../../packages/assets/src/infrastructure/drive/types.ts'

test('真实MinIO SDK的可恢复分片、会话过期、完成确认丢失与取消', async (context) => {
  const fixture = await createUploadS3Fixture()
  const directory = await mkdtemp(join(tmpdir(), 'neozebra-s3-upload-'))
  const path = join(directory, 'content')
  const bytes = Buffer.alloc(17 * 1024 * 1024 + 3, 47)
  await writeFile(path, bytes)
  const provider = createMinioProvider({
    mount: {
      providerId: 'minio',
      endpoint: fixture.endpoint,
      bucket: fixture.bucket,
      prefix: '',
      region: 'us-east-1',
    },
    credentials: { accessKey: 'synthetic', secretKey: 'synthetic-secret' },
    assertLease: () => {},
    refreshCredentials: async () => ({}),
  })
  let checkpoint: Record<string, unknown> | undefined
  const file: DriveUpload = {
    path,
    size: bytes.length,
    name: 'test.bin',
    mimeType: 'application/octet-stream',
    taskId: 'synthetic-task',
    saveCheckpoint: async (value) => {
      checkpoint = structuredClone(value)
    },
  }
  try {
    await context.test(
      '第二片失败后新调用只上传剩余片，最终内容一致',
      async () => {
        fixture.controls.failPart = 2
        await assert.rejects(provider.upload('root', 'test.bin', file))
        assert.deepEqual(
          fixture.partList.map((part) => part.part),
          [1],
        )
        await provider.upload('root', 'test.bin', { ...file, checkpoint })
        assert.deepEqual(
          fixture.partList.map((part) => part.part),
          [1, 2, 3],
        )
        assert.deepEqual(fixture.objects.get('test.bin')!.bytes, bytes)
        assert.equal(fixture.sessions.size, 0)
      },
    )
    await context.test(
      '完成响应丢失通过任务标记核验，不覆盖同名对象',
      async () => {
        checkpoint = undefined
        fixture.controls.loseCompletion = true
        const named = {
          ...file,
          taskId: 'completion-task',
          checkpoint: undefined,
        }
        await assert.rejects(provider.upload('root', 'lost.bin', named))
        const count = fixture.partList.length
        await provider.upload('root', 'lost.bin', { ...named, checkpoint })
        assert.equal(fixture.partList.length, count)
        await assert.rejects(
          provider.upload('root', 'lost.bin', {
            ...named,
            taskId: 'another-task',
          }),
          { status: 409 },
        )
        assert.deepEqual(fixture.objects.get('lost.bin')!.bytes, bytes)
      },
    )
    await context.test(
      '代理删除HTML的HEAD大小/ETag后上传和相同任务重试仍能准确确认',
      async () => {
        fixture.controls.transformedHead = true
        checkpoint = undefined
        const html = {
          ...file,
          mimeType: 'text/html',
          taskId: 'html-task',
          checkpoint: undefined,
        }
        const entry = await provider.upload('root', 'transformed.html', html)
        assert.equal(entry.sizeBytes, bytes.length)
        const count = fixture.partList.length
        await provider.upload('root', 'transformed.html', {
          ...html,
          checkpoint,
        })
        assert.equal(fixture.partList.length, count)
        await assert.rejects(
          provider.upload('root', 'transformed.html', {
            ...html,
            taskId: 'other-html-task',
            checkpoint,
          }),
          { status: 409 },
        )
        await assert.rejects(
          provider.upload('root', 'transformed.html', {
            ...html,
            size: bytes.length + 1,
            checkpoint,
          }),
          { status: 409 },
        )
        fixture.controls.loseCompletion = true
        checkpoint = undefined
        const uncertain = { ...html, taskId: 'uncertain-html-task' }
        await assert.rejects(
          provider.upload('root', 'uncertain.html', uncertain),
        )
        const completedCount = fixture.partList.length
        const recovered = await provider.upload('root', 'uncertain.html', {
          ...uncertain,
          checkpoint,
        })
        assert.equal(recovered.sizeBytes, bytes.length)
        assert.equal(fixture.partList.length, completedCount)
        assert.deepEqual(fixture.objects.get('uncertain.html')!.bytes, bytes)
        const empty = await provider.upload('root', 'empty-transformed.html', {
          ...html,
          size: 0,
          taskId: 'empty-html-task',
          checkpoint: undefined,
        })
        assert.equal(empty.sizeBytes, 0)
        fixture.objects.set('invalid.html', {
          bytes: Buffer.from('invalid metadata'),
          upload: 'invalid-html-task',
          type: 'text/html',
          etag: '',
        })
        await assert.rejects(
          provider.upload('root', 'invalid.html', {
            ...html,
            size: 16,
            taskId: 'invalid-html-task',
            checkpoint: undefined,
          }),
          { status: 502 },
        )
        assert.equal(fixture.partList.length, completedCount)
        fixture.controls.transformedHead = false
      },
    )
    await context.test('过期会话重建后完成，暂存文件可复用', async () => {
      fixture.controls.expireOnce = true
      checkpoint = undefined
      await provider.upload('root', 'expired.bin', {
        ...file,
        checkpoint: undefined,
        taskId: 'expired-task',
      })
      assert.deepEqual(fixture.objects.get('expired.bin')!.bytes, bytes)
    })
    await context.test(
      '取消只终止当前分片会话；空文件取消不会删除已完成对象',
      async () => {
        checkpoint = undefined
        fixture.controls.failPart = 2
        await assert.rejects(
          provider.upload('root', 'cancel.bin', {
            ...file,
            checkpoint: undefined,
            taskId: 'cancel-task',
          }),
        )
        assert.ok(checkpoint)
        await provider.abortUpload!(checkpoint!)
        assert.equal(fixture.sessions.size, 0)
        assert.equal(fixture.objects.has('cancel.bin'), false)
        await provider.upload('root', 'empty.bin', {
          ...file,
          size: 0,
          taskId: 'empty-task',
          checkpoint: undefined,
        })
        await provider.abortUpload!(checkpoint!)
        assert.equal(fixture.objects.has('empty.bin'), true)
      },
    )
  } finally {
    await fixture.close()
    await rm(directory, { recursive: true, force: true })
  }
})
