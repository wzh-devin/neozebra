import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, rename, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { createAssetsRouter } from '@neozebra/assets'
import { createDatabase } from '../src/infrastructure/database/database-client.ts'
import {
  encryptCredentials,
  decryptCredentials,
} from '../src/infrastructure/security/credentials.ts'
import {
  createDriveUploadService,
  getUploadPath,
  uploadPartSize,
} from '../../../packages/assets/src/infrastructure/drive/drive-upload-service.ts'
import {
  createDriveUploadProcessor,
  startDriveUploadWorker,
} from '../../../packages/assets/src/infrastructure/drive/drive-upload-worker.ts'
import { getDriveUploadQueue } from '../../../packages/assets/src/infrastructure/drive/drive-upload-queue.ts'
import { getDriveQueue } from '../../../packages/assets/src/infrastructure/drive/drive-queue.ts'

const hashBytes = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex')
const getFingerprint = (parts: Buffer[]) =>
  createHash('sha256').update(parts.map(hashBytes).join('')).digest('hex')

test(
  '分片上传：真实PG/Redis断点、账号隔离、暂停恢复及HTTP边界',
  { skip: !process.env.DATABASE_URL },
  async (context) => {
    const db = createDatabase()
    const directory = await mkdtemp(join(tmpdir(), 'neozebra-upload-check-'))
    const session = randomUUID()
    const owner = hashBytes(Buffer.from(session))
    const dbContext = {
      store: db.store,
      redis: db.redis,
      connectRedis: db.connectRedis,
      key: db.config.key,
      origin: db.config.origin,
      syncNamespace: db.syncNamespace + '-upload-check',
      uploadDirectory: directory,
    }
    const dependencies = {
      getInfrastructure: () => dbContext,
      encryptCredentials,
      decryptCredentials,
    }
    const service = createDriveUploadService(dependencies)
    let processor = createDriveUploadProcessor(dependencies)
    const connectionIds: bigint[] = []
    const makeConnection = async (name: string) => {
      const connection = await db.store.driveConnection.create({
        data: {
          ownerId: owner,
          publicId: randomUUID(),
          name,
          provider: 'baidu',
          mountOptions: { providerId: 'baidu', rootPath: '/' },
          encryptedCredentials: encryptCredentials(
            {
              accessToken: 'synthetic-access',
              refreshToken: 'synthetic-refresh',
              clientId: 'synthetic-id',
              clientSecret: 'synthetic-secret',
            },
            db.config.key,
          ),
          tokenExpiresAt: new Date(Date.now() + 3600_000),
          lastCheckedAt: new Date(),
        },
      })
      connectionIds.push(connection.id)
      return connection
    }
    const remoteFiles: Record<string, unknown>[] = []
    const sentPartList: number[] = []
    let pauseTask: string | null = null
    let connectionPublicId = ''
    context.mock.method(
      globalThis,
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        const method = url.searchParams.get('method')
        if (method === 'precreate') {
          const values = new URLSearchParams(String(init?.body))
          const hashes = JSON.parse(values.get('block_list')!) as string[]
          return Response.json({
            errno: 0,
            return_type: 1,
            uploadid: 'synthetic-upload',
            block_list: hashes.map((_, index) => index),
          })
        }
        if (method === 'upload') {
          const part = Number(url.searchParams.get('partseq'))
          sentPartList.push(part)
          const file = (init!.body as FormData).get('file') as Blob
          const bytes = Buffer.from(await file.arrayBuffer())
          if (pauseTask) {
            const taskId = pauseTask
            pauseTask = null
            await service.updateTask(owner, connectionPublicId, taskId, 'pause')
          }
          return Response.json({
            errno: 0,
            md5: createHash('md5').update(bytes).digest('hex'),
          })
        }
        if (method === 'create') {
          const values = new URLSearchParams(String(init?.body))
          const path = values.get('path')!
          remoteFiles.push({
            fs_id: String(remoteFiles.length + 1),
            path,
            server_filename: path.slice(1),
            size: Number(values.get('size')),
            server_mtime: 1700000000,
            isdir: 0,
          })
          return Response.json({ errno: 0 })
        }
        if (method === 'list')
          return Response.json({ errno: 0, list: remoteFiles })
        throw new Error('Unexpected synthetic request: ' + url.pathname)
      },
    )
    try {
      const first = await makeConnection('Synthetic account A')
      const second = await makeConnection('Synthetic account B')
      connectionPublicId = first.publicId
      const parts = [
        Buffer.alloc(uploadPartSize, 17),
        Buffer.alloc(1024 * 1024 + 13, 29),
      ]
      const draft = {
        id: randomUUID(),
        parent: 'root',
        name: 'synthetic.bin',
        size: parts.reduce((sum, part) => sum + part.length, 0),
        mimeType: 'application/octet-stream',
        fingerprint: getFingerprint(parts),
      }
      let task = await service.createTask(owner, first.publicId, draft)
      const row = await db.store.driveUploadTask.findFirstOrThrow({
        where: { publicId: task.id },
      })
      await context.test(
        '创建幂等，同平台账号独立、跨owner和跨连接拒绝，公开信息无秘密',
        async () => {
          assert.equal(
            (await service.createTask(owner, first.publicId, draft)).id,
            task.id,
          )
          assert.equal(
            await db.store.driveUploadTask.count({
              where: { publicId: task.id },
            }),
            1,
          )
          assert.equal(
            (await service.listTasks(owner, second.publicId)).tasks.length,
            0,
          )
          await assert.rejects(
            service.getTaskDetails(owner + '-foreign', first.publicId, task.id),
            { status: 404 },
          )
          await assert.rejects(
            service.getTaskDetails(owner, second.publicId, task.id),
            { status: 404 },
          )
          await assert.rejects(
            service.createTask(owner, first.publicId, {
              ...draft,
              name: 'other.bin',
            }),
            { status: 409 },
          )
          assert.doesNotMatch(
            JSON.stringify(
              await service.getTaskDetails(owner, first.publicId, task.id),
            ),
            /synthetic-secret|uploadDirectory|encryptedCheckpoint|content"/,
          )
        },
      )
      await context.test(
        '排队元数据先落库，首片前绑定不可变指纹，刷新后仍可恢复',
        async () => {
          const pending = await service.createTask(owner, first.publicId, {
            ...draft,
            id: randomUUID(),
            name: 'pending.bin',
            fingerprint: '',
          })
          assert.equal(pending.status, 'preparing')
          assert.equal(
            (
              await createDriveUploadService(dependencies).getTaskDetails(
                owner,
                first.publicId,
                pending.id,
              )
            ).task.name,
            'pending.bin',
          )
          await assert.rejects(
            service.receivePart(
              owner,
              first.publicId,
              pending.id,
              0,
              hashBytes(parts[0]),
              parts[0],
            ),
            { status: 409 },
          )
          await service.updateTask(
            owner,
            first.publicId,
            pending.id,
            'resume',
            draft.fingerprint,
          )
          await assert.rejects(
            service.updateTask(
              owner,
              first.publicId,
              pending.id,
              'resume',
              '0'.repeat(64),
            ),
            { status: 409 },
          )
          await service.updateTask(owner, first.publicId, pending.id, 'cancel')
        },
      )
      await context.test(
        '大小和校验拒绝；重复并发片只记录一次，未收齐不能完成',
        async () => {
          await assert.rejects(
            service.receivePart(
              owner,
              first.publicId,
              task.id,
              0,
              '0'.repeat(64),
              parts[0],
            ),
            { status: 400 },
          )
          await assert.rejects(
            service.receivePart(
              owner,
              first.publicId,
              task.id,
              2,
              hashBytes(parts[1]),
              parts[1],
            ),
            { status: 400 },
          )
          await Promise.all([
            service.receivePart(
              owner,
              first.publicId,
              task.id,
              0,
              hashBytes(parts[0]),
              parts[0],
            ),
            service.receivePart(
              owner,
              first.publicId,
              task.id,
              0,
              hashBytes(parts[0]),
              parts[0],
            ),
          ])
          assert.equal(
            await db.store.driveUploadPart.count({ where: { taskId: row.id } }),
            1,
          )
          assert.equal(
            (await service.getTaskDetails(owner, first.publicId, task.id)).task
              .receivedBytes,
            parts[0].length,
          )
          await assert.rejects(
            service.completeTask(owner, first.publicId, task.id),
            { status: 409 },
          )
        },
      )
      await context.test(
        '同一公开任务标识跨账号，磁盘、字节和取消互不影响',
        async () => {
          const bytes = Buffer.alloc(1024, 77)
          const other = await service.createTask(owner, second.publicId, {
            ...draft,
            name: 'other-account.bin',
            size: bytes.length,
            fingerprint: getFingerprint([bytes]),
          })
          const otherRow = await db.store.driveUploadTask.findFirstOrThrow({
            where: { connectionId: second.id, publicId: other.id },
          })
          assert.notEqual(
            getUploadPath(dependencies, row),
            getUploadPath(dependencies, otherRow),
          )
          await service.receivePart(
            owner,
            second.publicId,
            other.id,
            0,
            hashBytes(bytes),
            bytes,
          )
          assert.deepEqual(
            await readFile(getUploadPath(dependencies, otherRow)),
            bytes,
          )
          await service.updateTask(owner, second.publicId, other.id, 'cancel')
          assert.deepEqual(
            await readFile(getUploadPath(dependencies, row)),
            parts[0],
          )
        },
      )
      await context.test(
        '暂停保留确认片，新服务实例续传，完整文件字节正确',
        async () => {
          await service.updateTask(owner, first.publicId, task.id, 'pause')
          await assert.rejects(
            service.receivePart(
              owner,
              first.publicId,
              task.id,
              1,
              hashBytes(parts[1]),
              parts[1],
            ),
            { status: 409 },
          )
          const restarted = createDriveUploadService(dependencies)
          assert.equal(
            (await restarted.getTaskDetails(owner, first.publicId, task.id))
              .parts[0].partNumber,
            0,
          )
          await restarted.updateTask(owner, first.publicId, task.id, 'resume')
          task = await restarted.receivePart(
            owner,
            first.publicId,
            task.id,
            1,
            hashBytes(parts[1]),
            parts[1],
          )
          assert.equal(task.receivedBytes, draft.size)
          assert.deepEqual(
            await readFile(getUploadPath(dependencies, row)),
            Buffer.concat(parts),
          )
          task = await restarted.completeTask(owner, first.publicId, task.id)
          assert.equal(task.status, 'queued')
        },
      )
      await context.test(
        '网盘分片边界暂停，重建处理器仅发送剩余片，完成后释放暂存',
        async () => {
          pauseTask = task.id
          await processor.processUpload(row.id)
          assert.equal(
            (await service.getTaskDetails(owner, first.publicId, task.id)).task
              .status,
            'paused',
          )
          assert.deepEqual(sentPartList, [0])
          await service.updateTask(owner, first.publicId, task.id, 'resume')
          processor = createDriveUploadProcessor(dependencies)
          await processor.processUpload(row.id)
          assert.deepEqual(sentPartList, [0, 1, 2])
          const completed = (
            await service.getTaskDetails(owner, first.publicId, task.id)
          ).task
          assert.equal(completed.status, 'completed')
          assert.equal(completed.transferredBytes, draft.size)
          assert.equal(
            (await service.completeTask(owner, first.publicId, task.id)).status,
            'completed',
          )
          await assert.rejects(readFile(getUploadPath(dependencies, row)), {
            code: 'ENOENT',
          })
          assert.equal(
            (await service.updateTask(owner, first.publicId, task.id, 'cancel'))
              .status,
            'completed',
          )
          assert.equal(remoteFiles.length, 1)
        },
      )
      await context.test(
        '整文件无2GiB/100MiB上限；取消仅删除该任务；账号版本变更拒绝',
        async () => {
          const large = await service.createTask(owner, second.publicId, {
            ...draft,
            id: randomUUID(),
            name: 'large.bin',
            size: 3 * 1024 ** 3,
          })
          assert.equal(large.size, 3 * 1024 ** 3)
          await service.updateTask(owner, second.publicId, large.id, 'cancel')
          assert.equal(
            (await service.listTasks(owner, first.publicId)).tasks.find(
              (item) => item.id === task.id,
            )?.status,
            'completed',
          )
          const versioned = await service.createTask(owner, second.publicId, {
            ...draft,
            id: randomUUID(),
            name: 'versioned.bin',
          })
          await db.store.driveConnection.update({
            where: { id: second.id },
            data: { metadataVersion: { increment: 1 } },
          })
          await assert.rejects(
            service.receivePart(
              owner,
              second.publicId,
              versioned.id,
              0,
              hashBytes(parts[0]),
              parts[0],
            ),
            { status: 409 },
          )
          await service.updateTask(
            owner,
            second.publicId,
            versioned.id,
            'cancel',
          )
        },
      )
      await context.test(
        '磁盘不可用保留已确认分片，恢复或丢失后可重新接收原文件',
        async () => {
          const pending = await service.createTask(owner, first.publicId, {
            ...draft,
            id: randomUUID(),
            name: 'disk-recovery.bin',
          })
          const pendingRow = await db.store.driveUploadTask.findFirstOrThrow({
            where: { publicId: pending.id },
          })
          const path = getUploadPath(dependencies, pendingRow)
          await service.receivePart(
            owner,
            first.publicId,
            pending.id,
            0,
            hashBytes(parts[0]),
            parts[0],
          )
          await rename(path, path + '.backup')
          await mkdir(path)
          await assert.rejects(
            service.receivePart(
              owner,
              first.publicId,
              pending.id,
              1,
              hashBytes(parts[1]),
              parts[1],
            ),
            { status: 507 },
          )
          assert.equal(
            (await service.getTaskDetails(owner, first.publicId, pending.id))
              .task.receivedBytes,
            parts[0].length,
          )
          await rm(path, { recursive: true })
          await rename(path + '.backup', path)
          await service.updateTask(owner, first.publicId, pending.id, 'resume')
          assert.deepEqual(await readFile(path), parts[0])
          await rm(path)
          const restored = await service.updateTask(
            owner,
            first.publicId,
            pending.id,
            'resume',
          )
          assert.equal(restored.receivedBytes, 0)
          assert.equal(
            (await service.getTaskDetails(owner, first.publicId, pending.id))
              .parts.length,
            0,
          )
          await service.receivePart(
            owner,
            first.publicId,
            pending.id,
            0,
            hashBytes(parts[0]),
            parts[0],
          )
          await service.updateTask(owner, first.publicId, pending.id, 'cancel')
        },
      )
      await context.test(
        '提交确认丢失时先核对远端，不把丢失暂存误当成重新传片',
        async () => {
          const pending = await service.createTask(owner, first.publicId, {
            ...draft,
            id: randomUUID(),
            name: 'finalizing.bin',
            size: 0,
            fingerprint: getFingerprint([Buffer.alloc(0)]),
          })
          await service.receivePart(
            owner,
            first.publicId,
            pending.id,
            0,
            hashBytes(Buffer.alloc(0)),
            Buffer.alloc(0),
          )
          await service.completeTask(owner, first.publicId, pending.id)
          const pendingRow = await db.store.driveUploadTask.findFirstOrThrow({
            where: { publicId: pending.id },
          })
          await db.store.driveUploadTask.update({
            where: { id: pendingRow.id },
            data: {
              status: 'transferring',
              encryptedCheckpoint: encryptCredentials(
                { provider: 'baidu', completing: true },
                db.config.key,
              ),
            },
          })
          await assert.rejects(
            service.updateTask(owner, first.publicId, pending.id, 'cancel'),
            { status: 409 },
          )
          await rm(getUploadPath(dependencies, pendingRow))
          await db.store.driveUploadTask.update({
            where: { id: pendingRow.id },
            data: { status: 'failed' },
          })
          const restored = await service.updateTask(
            owner,
            first.publicId,
            pending.id,
            'retry',
          )
          assert.equal(restored.status, 'queued')
          assert.equal(restored.phase, 'remote')
          await service.updateTask(owner, first.publicId, pending.id, 'cancel')
        },
      )
      await context.test('零字节有一片，文件指纹不匹配拒绝入队', async () => {
        const empty = await service.createTask(owner, first.publicId, {
          ...draft,
          id: randomUUID(),
          name: 'empty.bin',
          size: 0,
          fingerprint: getFingerprint([Buffer.alloc(0)]),
        })
        await service.receivePart(
          owner,
          first.publicId,
          empty.id,
          0,
          hashBytes(Buffer.alloc(0)),
          Buffer.alloc(0),
        )
        assert.equal(
          (await service.completeTask(owner, first.publicId, empty.id)).status,
          'queued',
        )
        await service.updateTask(owner, first.publicId, empty.id, 'cancel')
        const changed = await service.createTask(owner, first.publicId, {
          ...draft,
          id: randomUUID(),
          name: 'changed.bin',
          size: 0,
          fingerprint: '0'.repeat(64),
        })
        await service.receivePart(
          owner,
          first.publicId,
          changed.id,
          0,
          hashBytes(Buffer.alloc(0)),
          Buffer.alloc(0),
        )
        await assert.rejects(
          service.completeTask(owner, first.publicId, changed.id),
          { status: 409 },
        )
        await service.updateTask(owner, first.publicId, changed.id, 'cancel')
      })
      await context.test('HTTP会话、Origin、请求大小与DTO边界', async () => {
        const app = new Hono()
        app.get('/fixture-session', async (c) => {
          await setSignedCookie(
            c,
            'neozebra_drive_session',
            session,
            db.config.key,
          )
          return c.text('ok')
        })
        app.route('/api/assets', createAssetsRouter(dependencies))
        const response = await app.request('/fixture-session')
        const cookie = response.headers.get('set-cookie')!.split(';')[0]
        const base =
          '/api/assets/drive/connections/' + first.publicId + '/uploads'
        const headers = {
          Cookie: cookie,
          Origin: db.config.origin,
          'Content-Type': 'application/json',
        }
        assert.equal(
          (
            await app.request(base, {
              method: 'POST',
              headers: { Cookie: cookie },
              body: '{}',
            })
          ).status,
          403,
        )
        assert.equal(
          (await app.request(base, { headers: { Cookie: cookie } })).status,
          200,
        )
        assert.equal(
          (
            await app.request(base, {
              method: 'POST',
              headers,
              body: JSON.stringify({ ...draft, id: randomUUID(), size: 0.5 }),
            })
          ).status,
          400,
        )
        assert.equal(
          (
            await app.request(base + '/' + task.id, {
              headers: { Cookie: cookie },
            })
          ).status,
          200,
        )
        const fresh = await service.createTask(owner, first.publicId, {
          ...draft,
          id: randomUUID(),
          name: 'http.bin',
        })
        const put = base + '/' + fresh.id + '/parts/0'
        assert.equal(
          (
            await app.request(put, {
              method: 'PUT',
              headers: {
                ...headers,
                'X-Part-SHA256': hashBytes(parts[0]),
                'Content-Length': String(uploadPartSize + 1),
              },
              body: parts[0],
            })
          ).status,
          413,
        )
        assert.equal(
          (
            await app.request(put, {
              method: 'PUT',
              headers: { ...headers, 'X-Part-SHA256': hashBytes(parts[0]) },
              body: parts[0],
            })
          ).status,
          200,
        )
        await service.updateTask(owner, first.publicId, fresh.id, 'cancel')
      })
      await context.test(
        '到期任务补偿清理不访问或删除用户已完成文件',
        async () => {
          const expired = await service.createTask(owner, first.publicId, {
            ...draft,
            id: randomUUID(),
            name: 'expired.bin',
          })
          await db.store.driveUploadTask.updateMany({
            where: { publicId: expired.id },
            data: { expiresAt: new Date(0) },
          })
          await processor.sweep()
          assert.equal(
            await db.store.driveUploadTask.count({
              where: { publicId: expired.id },
            }),
            0,
          )
          assert.equal(remoteFiles.length, 1)
        },
      )
      await context.test(
        'Redis任务丢失后，实际Worker从PG排队状态补偿并完成',
        async () => {
          const bytes = Buffer.alloc(1024, 88)
          const pending = await service.createTask(owner, first.publicId, {
            ...draft,
            id: randomUUID(),
            name: 'worker-recovery.bin',
            size: bytes.length,
            fingerprint: getFingerprint([bytes]),
          })
          await service.receivePart(
            owner,
            first.publicId,
            pending.id,
            0,
            hashBytes(bytes),
            bytes,
          )
          await service.completeTask(owner, first.publicId, pending.id)
          const pendingRow = await db.store.driveUploadTask.findFirstOrThrow({
            where: { publicId: pending.id },
          })
          const queue = await getDriveUploadQueue(dbContext)
          await (await queue.getJob('upload-' + pendingRow.id))!.remove()
          const worker = await startDriveUploadWorker(dependencies)
          try {
            const deadline = Date.now() + 15_000
            while (
              (await service.getTaskDetails(owner, first.publicId, pending.id))
                .task.status !== 'completed'
            ) {
              assert.ok(Date.now() < deadline, 'Worker recovery timed out')
              await new Promise((resolve) => setTimeout(resolve, 50))
            }
            assert.ok(
              remoteFiles.some((file) => file.server_filename === pending.name),
            )
          } finally {
            await worker.close()
          }
          await assert.rejects(
            readFile(getUploadPath(dependencies, pendingRow)),
            { code: 'ENOENT' },
          )
        },
      )
    } finally {
      await (await getDriveUploadQueue(dbContext)).obliterate({ force: true })
      await (await getDriveQueue(dbContext)).obliterate({ force: true })
      const tasks = await db.store.driveUploadTask.findMany({
        where: { ownerId: owner },
        select: { id: true },
      })
      await db.store.driveUploadPart.deleteMany({
        where: { taskId: { in: tasks.map((task) => task.id) } },
      })
      await db.store.driveUploadTask.deleteMany({ where: { ownerId: owner } })
      await db.store.driveEntry.deleteMany({
        where: { connectionId: { in: connectionIds } },
      })
      await db.store.driveDirectory.deleteMany({
        where: { connectionId: { in: connectionIds } },
      })
      await db.store.driveConnection.deleteMany({ where: { ownerId: owner } })
      await rm(directory, { recursive: true, force: true })
      await db.close()
    }
  },
)
