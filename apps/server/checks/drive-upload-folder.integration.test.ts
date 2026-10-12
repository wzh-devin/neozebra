import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase } from '../src/infrastructure/database/database-client.ts'
import {
  encryptCredentials,
  decryptCredentials,
} from '../src/infrastructure/security/credentials.ts'
import { createUploadS3Fixture } from './drive-upload-s3-fixture.ts'
import { createDriveUploadService } from '../../../packages/assets/src/infrastructure/drive/drive-upload-service.ts'
import { createDriveUploadProcessor } from '../../../packages/assets/src/infrastructure/drive/drive-upload-worker.ts'
import { createDriveCatalog } from '../../../packages/assets/src/infrastructure/drive/drive-catalog.ts'
import { createDriveService } from '../../../packages/assets/src/infrastructure/drive/drive-service.ts'
import { getDriveQueue } from '../../../packages/assets/src/infrastructure/drive/drive-queue.ts'
import { getDriveUploadQueue } from '../../../packages/assets/src/infrastructure/drive/drive-upload-queue.ts'
import { driveUploadDraftDto } from '../../../packages/assets/src/dto/drive/drive-upload-dto.ts'
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

test(
  '真实PG/Redis/MinIO：嵌套目录、相同文件名、目录复用、恢复和冲突保护',
  { skip: !process.env.DATABASE_URL },
  async () => {
    const db = createDatabase()
    const s3 = await createUploadS3Fixture()
    const directory = await mkdtemp(join(tmpdir(), 'neozebra-folder-check-'))
    const owner = randomUUID()
    const infrastructure = {
      store: db.store,
      redis: db.redis,
      connectRedis: db.connectRedis,
      key: db.config.key,
      origin: db.config.origin,
      syncNamespace: db.syncNamespace + '-folders',
      uploadDirectory: directory,
    }
    const dependencies = {
      getInfrastructure: () => infrastructure,
      encryptCredentials,
      decryptCredentials,
    }
    const connections = []
    for (const [name, prefix] of [
      ['Account A', 'a/'],
      ['Account B', 'b/'],
    ])
      connections.push(
        await db.store.driveConnection.create({
          data: {
            ownerId: owner,
            publicId: randomUUID(),
            name,
            provider: 'minio',
            mountOptions: {
              providerId: 'minio',
              endpoint: s3.endpoint,
              bucket: s3.bucket,
              prefix,
              region: 'us-east-1',
            },
            encryptedCredentials: encryptCredentials(
              { accessKey: 'synthetic', secretKey: 'synthetic-secret' },
              db.config.key,
            ),
            lastCheckedAt: new Date(),
          },
        }),
      )
    const [accountA, accountB] = connections
    let service = createDriveUploadService(dependencies)
    const stage = async (
      connection: typeof accountA,
      name: string,
      path: string[],
      bytes = Buffer.from(name),
      mimeType = 'application/octet-stream',
    ) => {
      const fingerprint = hash(Buffer.from(hash(bytes)))
      const draft = driveUploadDraftDto.parse({
        id: randomUUID(),
        parent: 'root',
        directoryPath: path,
        name,
        size: bytes.length,
        mimeType,
        fingerprint,
      })
      const task = await service.createTask(owner, connection.publicId, draft)
      await service.receivePart(
        owner,
        connection.publicId,
        task.id,
        0,
        hash(bytes),
        bytes,
      )
      await service.completeTask(owner, connection.publicId, task.id)
      const row = await db.store.driveUploadTask.findFirstOrThrow({
        where: { publicId: task.id },
      })
      return { task, row, draft, bytes }
    }
    try {
      const left = await stage(
        accountA,
        'same.txt',
        ['Project', 'left'],
        Buffer.from('left'),
      )
      const right = await stage(
        accountA,
        'same.txt',
        ['Project', 'right'],
        Buffer.from('right'),
      )
      assert.equal(
        s3.objects.size,
        0,
        'folders must wait for background transfer',
      )
      const processor = createDriveUploadProcessor(dependencies)
      await processor.processUpload(left.row.id)
      await processor.processUpload(right.row.id)
      assert.deepEqual(
        s3.objects.get('a/Project/left/same.txt')!.bytes,
        left.bytes,
      )
      assert.deepEqual(
        s3.objects.get('a/Project/right/same.txt')!.bytes,
        right.bytes,
      )
      assert.equal(s3.objects.has('a/same.txt'), false)
      const completed = await service.getTaskDetails(
        owner,
        accountA.publicId,
        left.task.id,
      )
      assert.equal(completed.task.status, 'completed')
      assert.deepEqual(completed.task.directoryPath, ['Project', 'left'])
      assert.notEqual(completed.task.parent, 'root')
      assert.equal(completed.task.directoryName, 'Account A / Project / left')
      await assert.rejects(
        service.createTask(owner, accountA.publicId, {
          ...left.draft,
          directoryPath: ['Project', 'elsewhere'],
        }),
        { status: 409 },
      )
      s3.controls.transformedHead = true
      const html = await stage(
        accountA,
        'confirmed.html',
        ['Project', 'html'],
        Buffer.from('<p>synthetic/local mock</p>'),
        'text/html',
      )
      s3.controls.loseCompletion = true
      await assert.rejects(processor.processUpload(html.row.id))
      assert.equal(
        (await service.getTaskDetails(owner, accountA.publicId, html.task.id))
          .task.status,
        'failed',
      )
      assert.equal(
        s3.objects.get('a/Project/html/confirmed.html')!.upload,
        html.task.id,
      )
      const committedParts = s3.partList.length
      await service.updateTask(owner, accountA.publicId, html.task.id, 'retry')
      await createDriveUploadProcessor(dependencies).processUpload(html.row.id)
      assert.equal(
        (await service.getTaskDetails(owner, accountA.publicId, html.task.id))
          .task.status,
        'completed',
      )
      assert.equal(s3.partList.length, committedParts)
      const htmlEntry = await db.store.driveEntry.findFirstOrThrow({
        where: { connectionId: accountA.id, name: 'confirmed.html' },
        orderBy: { id: 'desc' },
      })
      assert.equal(htmlEntry.sizeBytes, BigInt(html.bytes.length))
      assert.deepEqual(
        s3.objects.get('a/Project/html/confirmed.html')!.bytes,
        html.bytes,
      )
      s3.controls.transformedHead = false
      const markerCount = [...s3.objects.keys()].filter((key) =>
        key.endsWith('/'),
      ).length
      const more = await stage(accountA, 'another.txt', ['Project', 'left'])
      await processor.processUpload(more.row.id)
      assert.equal(
        [...s3.objects.keys()].filter((key) => key.endsWith('/')).length,
        markerCount,
      )
      const other = await stage(
        accountB,
        'same.txt',
        ['Project', 'left'],
        Buffer.from('accountB'),
      )
      await processor.processUpload(other.row.id)
      assert.deepEqual(
        s3.objects.get('b/Project/left/same.txt')!.bytes,
        other.bytes,
      )
      assert.deepEqual(
        s3.objects.get('a/Project/left/same.txt')!.bytes,
        left.bytes,
      )
      const duplicate = await stage(
        accountA,
        'same.txt',
        ['Project', 'left'],
        Buffer.from('do not overwrite'),
      )
      await assert.rejects(processor.processUpload(duplicate.row.id))
      assert.deepEqual(
        s3.objects.get('a/Project/left/same.txt')!.bytes,
        left.bytes,
      )
      s3.objects.set('a/blocked', {
        bytes: Buffer.from('existing file'),
        type: 'text/plain',
        upload: '',
        etag: 'blocked',
      })
      const blocked = await stage(accountA, 'child.txt', ['blocked'])
      await assert.rejects(
        processor.processUpload(blocked.row.id),
        /destination folder name/,
      )
      assert.equal(s3.objects.has('a/blocked/'), false)
      const cancelled = await stage(accountA, 'cancel.txt', ['CancelledFolder'])
      await service.updateTask(
        owner,
        accountA.publicId,
        cancelled.task.id,
        'cancel',
      )
      await processor.processUpload(cancelled.row.id)
      assert.equal(s3.objects.has('a/CancelledFolder/'), false)
      const resumed = await stage(accountA, 'resume.txt', [
        'Project',
        'resumed',
      ])
      await service.updateTask(
        owner,
        accountA.publicId,
        resumed.task.id,
        'pause',
      )
      service = createDriveUploadService(dependencies)
      assert.deepEqual(
        (
          await service.getTaskDetails(
            owner,
            accountA.publicId,
            resumed.task.id,
          )
        ).task.directoryPath,
        ['Project', 'resumed'],
      )
      await service.updateTask(
        owner,
        accountA.publicId,
        resumed.task.id,
        'resume',
      )
      await createDriveUploadProcessor(dependencies).processUpload(
        resumed.row.id,
      )
      assert.deepEqual(
        s3.objects.get('a/Project/resumed/resume.txt')!.bytes,
        resumed.bytes,
      )
      const driveService = createDriveService(dependencies)
      const recreated = await driveService.ensureUploadFolder(
        owner,
        accountA.publicId,
        'root',
        'Recreated',
        1,
      )
      s3.objects.delete('a/Recreated/')
      await createDriveCatalog(infrastructure).applyChange(
        accountA,
        recreated,
        undefined,
      )
      assert.equal(
        await db.store.driveEntry.count({
          where: {
            connectionId: accountA.id,
            generation: 'unpublished',
            remoteId: recreated.id,
          },
        }),
        0,
      )
      s3.objects.set('a/Recreated/', {
        bytes: Buffer.alloc(0),
        type: 'application/octet-stream',
        upload: '',
        etag: 'external-recreation',
      })
      const reused = await stage(accountA, 'after-delete.txt', ['Recreated'])
      await processor.processUpload(reused.row.id)
      assert.deepEqual(
        s3.objects.get('a/Recreated/after-delete.txt')!.bytes,
        reused.bytes,
      )
      await assert.rejects(
        driveService.ensureUploadFolder(
          owner,
          accountA.publicId,
          'root',
          'WrongVersion',
          2,
        ),
        { status: 409 },
      )
      assert.equal(s3.objects.has('a/WrongVersion/'), false)

      // Synthetic/local mock：补齐25条元数据，验证分页不会混入其他账号。
      const existing = await db.store.driveUploadTask.count({
        where: { connectionId: accountA.id },
      })
      for (let index = existing; index < 25; index++)
        await service.createTask(
          owner,
          accountA.publicId,
          driveUploadDraftDto.parse({
            id: randomUUID(),
            parent: 'root',
            name: `table-history-${index}.txt`,
            size: 0,
          }),
        )
      const pages = await Promise.all(
        [1, 2, 3, 4].map((page) =>
          service.getTaskPage(owner, accountA.publicId, page),
        ),
      )
      assert.deepEqual(
        pages.map((page) => page.tasks.length),
        [10, 10, 5, 0],
      )
      assert.ok(
        pages.every((page) => page.total === 25 && page.pageSize === 10),
      )
      assert.equal(
        new Set(pages.flatMap((page) => page.tasks.map((task) => task.id)))
          .size,
        25,
      )
      assert.equal(
        (await service.getTaskPage(owner, accountB.publicId, 1)).total,
        1,
      )
      await assert.rejects(
        service.getTaskPage(randomUUID(), accountA.publicId, 1),
        { status: 404 },
      )
      assert.equal(
        (await service.listTasks(owner, accountA.publicId)).tasks.length,
        25,
      )
    } finally {
      await (
        await getDriveUploadQueue(infrastructure)
      ).obliterate({ force: true })
      await (await getDriveQueue(infrastructure)).obliterate({ force: true })
      const tasks = await db.store.driveUploadTask.findMany({
        where: { ownerId: owner },
        select: { id: true },
      })
      await db.store.driveUploadPart.deleteMany({
        where: { taskId: { in: tasks.map((t) => t.id) } },
      })
      await db.store.driveUploadTask.deleteMany({ where: { ownerId: owner } })
      await db.store.driveEntry.deleteMany({
        where: { connectionId: { in: connections.map((c) => c.id) } },
      })
      await db.store.driveDirectory.deleteMany({
        where: { connectionId: { in: connections.map((c) => c.id) } },
      })
      await db.store.driveConnection.deleteMany({ where: { ownerId: owner } })
      await rm(directory, { recursive: true, force: true })
      await s3.close()
      await db.close()
    }
  },
)
