import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, stat, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createDatabase } from '../src/infrastructure/database/database-client.ts'
import {
  encryptCredentials,
  decryptCredentials,
} from '../src/infrastructure/security/credentials.ts'
import { createUploadS3Fixture } from './drive-upload-s3-fixture.ts'
import { createDriveSync } from '../../../packages/assets/src/infrastructure/drive/drive-sync-worker.ts'
import { createDriveCatalog } from '../../../packages/assets/src/infrastructure/drive/drive-catalog.ts'
import {
  createDrivePreviewService,
  getPreviewPath,
} from '../../../packages/assets/src/infrastructure/drive/drive-preview-service.ts'
import { createDrivePreviewProcessor } from '../../../packages/assets/src/infrastructure/drive/drive-preview-worker.ts'
import { getDrivePreviewQueue } from '../../../packages/assets/src/infrastructure/drive/drive-preview-queue.ts'
import { getDriveQueue } from '../../../packages/assets/src/infrastructure/drive/drive-queue.ts'

test(
  '真实PG/Redis/S3：Office源版本、账号隔离、失败与过期回收',
  { skip: !process.env.DATABASE_URL },
  async () => {
    const db = createDatabase()
    const s3 = await createUploadS3Fixture()
    const owner = randomUUID()
    const dependencies = {
      getInfrastructure: () => ({
        ...db,
        key: db.config.key,
        origin: db.config.origin,
        previewDirectory: '.data/drive-previews',
      }),
      encryptCredentials,
      decryptCredentials,
      getOfficeConfig: () => ({
        url: 'http://localhost:8088',
        sourceOrigin: 'http://localhost:3000',
        jwtSecret: 'synthetic-secret-for-office-tests-only',
      }),
    }
    const infra = dependencies.getInfrastructure()
    const service = createDrivePreviewService(dependencies)
    const processor = createDrivePreviewProcessor(dependencies)
    const bytes = Buffer.from('synthetic Office source v1')
    s3.objects.set('sample.pptx', {
      bytes,
      type: 'application/octet-stream',
      upload: '',
      etag: 'v1',
    })
    s3.objects.set('sample.pdf', {
      bytes: Buffer.from('%PDF-synthetic-source'),
      type: 'application/pdf',
      upload: '',
      etag: 'pdf',
    })
    s3.objects.set('empty.docx', {
      bytes: Buffer.alloc(0),
      type: 'application/octet-stream',
      upload: '',
      etag: 'empty',
    })
    const connection = await db.store.driveConnection.create({
      data: {
        publicId: randomUUID(),
        ownerId: owner,
        name: 'synthetic Office fixture',
        provider: 'minio',
        mountOptions: {
          providerId: 'minio',
          endpoint: s3.endpoint,
          bucket: s3.bucket,
          prefix: '',
          region: 'us-east-1',
        },
        encryptedCredentials: encryptCredentials(
          { accessKey: 'synthetic', secretKey: 'synthetic-secret' },
          db.config.key,
        ),
        lastCheckedAt: new Date(),
        syncActiveUntil: new Date(Date.now() + 3600_000),
      },
    })
    let directory = ''
    try {
      const root = await createDriveCatalog(infra).ensureDirectory(
        connection,
        'root',
      )
      await createDriveSync(dependencies).syncDirectory(root.id)
      const entries = await db.store.driveEntry.findMany({
        where: { connectionId: connection.id },
      })
      const entry = entries.find((e) => e.name === 'sample.pptx')!
      const task = await service.createTask(
        owner,
        connection.publicId,
        entry.remoteId,
      )
      const row = await service.getTask(owner, connection.publicId, task.id)
      directory = dirname(dirname(getPreviewPath(dependencies, row)))
      assert.equal(task.status, 'queued')
      assert.equal(s3.contentRequests.length, 0)
      await processor.processPreview(row.id)
      const session = await service.getSession(
        owner,
        connection.publicId,
        task.id,
      )
      assert.equal(session.status, 'ready')
      assert.equal(session.config!.document.permissions.edit, false)
      assert.equal(session.config!.editorConfig.mode, 'view')
      assert.equal(session.config!.editorConfig.customization.macros, false)
      assert.deepEqual(await readFile(getPreviewPath(dependencies, row)), bytes)
      assert.deepEqual(s3.objects.get('sample.pptx')!.bytes, bytes)
      const ready = await service.getTask(owner, connection.publicId, task.id)
      assert.equal(
        ready.contentHash,
        createHash('sha256').update(bytes).digest('hex'),
      )
      await assert.rejects(
        service.getSession('foreign', connection.publicId, task.id),
        /not found|unavailable|no longer exists/i,
      )
      const pdfTask = await service.createTask(
        owner,
        connection.publicId,
        entries.find((e) => e.name === 'sample.pdf')!.remoteId,
      )
      const pdfRow = await service.getTask(
        owner,
        connection.publicId,
        pdfTask.id,
      )
      await processor.processPreview(pdfRow.id)
      const pdfSession = await service.getSession(
        owner,
        connection.publicId,
        pdfTask.id,
      )
      assert.equal(pdfSession.config!.documentType, 'pdf')
      assert.equal(pdfSession.config!.document.fileType, 'pdf')
      assert.equal(pdfSession.config!.document.isForm, false)
      assert.equal(pdfSession.config!.document.permissions.edit, false)
      assert.equal(pdfSession.config!.document.permissions.fillForms, false)
      assert.equal(pdfSession.config!.editorConfig.mode, 'view')
      const changed = Buffer.from(bytes)
      changed[changed.length - 1] ^= 1
      s3.objects.get('sample.pptx')!.bytes = changed
      const next = await service.createTask(
        owner,
        connection.publicId,
        entry.remoteId,
      )
      await processor.processPreview(
        (await service.getTask(owner, connection.publicId, next.id)).id,
      )
      const updated = await service.getSession(
        owner,
        connection.publicId,
        next.id,
      )
      assert.notEqual(
        session.config!.document.key,
        updated.config!.document.key,
      )
      await db.store.driveConnection.update({
        where: { id: connection.id },
        data: { metadataVersion: 2 },
      })
      await assert.rejects(
        service.assertConnection(ready),
        /no longer available/,
      )
      await db.store.driveConnection.update({
        where: { id: connection.id },
        data: { metadataVersion: 1 },
      })
      const empty = await service.createTask(
        owner,
        connection.publicId,
        entries.find((e) => e.name === 'empty.docx')!.remoteId,
      )
      const emptyRow = await service.getTask(
        owner,
        connection.publicId,
        empty.id,
      )
      await assert.rejects(processor.processPreview(emptyRow.id), /empty/)
      assert.equal(
        (await service.getSession(owner, connection.publicId, empty.id)).status,
        'failed',
      )
      await db.store.drivePreviewTask.update({
        where: { id: row.id },
        data: { expiresAt: new Date(0) },
      })
      await assert.rejects(
        service.getSession(owner, connection.publicId, task.id),
        /expired/,
      )
      await processor.sweep()
      assert.equal(
        await db.store.drivePreviewTask.count({ where: { id: row.id } }),
        0,
      )
      await assert.rejects(stat(getPreviewPath(dependencies, row)), /ENOENT/)
    } finally {
      await (await getDrivePreviewQueue(infra)).obliterate({ force: true })
      await (await getDriveQueue(infra)).obliterate({ force: true })
      await db.store.drivePreviewTask.deleteMany({
        where: { connectionId: connection.id },
      })
      await db.store.driveEntry.deleteMany({
        where: { connectionId: connection.id },
      })
      await db.store.driveDirectory.deleteMany({
        where: { connectionId: connection.id },
      })
      await db.store.driveConnection.deleteMany({
        where: { id: connection.id },
      })
      if (directory) await rm(directory, { recursive: true, force: true })
      await s3.close()
      await db.close()
    }
  },
)
