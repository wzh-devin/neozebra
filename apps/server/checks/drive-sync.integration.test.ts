import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { test } from 'node:test'
import { Hono } from 'hono'
import { createAssetsRouter } from '@neozebra/assets'
import { createDatabase } from '../src/infrastructure/database/database-client.ts'
import {
  encryptCredentials,
  decryptCredentials,
} from '../src/infrastructure/security/credentials.ts'
import { createDriveService } from '../../../packages/assets/src/infrastructure/drive/drive-service.ts'
import { createDriveCatalog } from '../../../packages/assets/src/infrastructure/drive/drive-catalog.ts'
import {
  createDriveSync,
  startDriveSyncWorker,
} from '../../../packages/assets/src/infrastructure/drive/drive-sync-worker.ts'
import { getDriveQueue } from '../../../packages/assets/src/infrastructure/drive/drive-queue.ts'
import { encodeEntryId } from '../../../packages/assets/src/infrastructure/drive/drive-utils.ts'

const filter = {
  parent: 'root',
  kind: 'all' as const,
  query: '',
  cursor: '',
  refresh: '0' as const,
}
const getFixtureFile = (name: string, folder = false) => ({
  fs_id: String(
    parseInt(createHash('sha256').update(name).digest('hex').slice(0, 8), 16),
  ),
  path: '/' + name,
  server_filename: name,
  size: folder ? 0 : 10,
  server_mtime: 1700000000,
  isdir: folder ? 1 : 0,
})
const waitFor = async (condition: () => Promise<boolean>) => {
  const deadline = Date.now() + 20_000
  while (!(await condition())) {
    assert.ok(Date.now() < deadline, 'Worker timed out')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

test(
  '真实 PG/Redis 队列：原子快照、隔离、恢复、写入与游标',
  { skip: !process.env.DATABASE_URL },
  async (context) => {
    const db = createDatabase()
    const dependencies = {
      getInfrastructure: () => ({
        store: db.store,
        redis: db.redis,
        connectRedis: db.connectRedis,
        key: db.config.key,
        origin: db.config.origin,
        syncNamespace: db.syncNamespace + '-sync-check',
      }),
      encryptCredentials,
      decryptCredentials,
    }
    const service = createDriveService(dependencies)
    const catalog = createDriveCatalog(dependencies.getInfrastructure())
    const sync = createDriveSync(dependencies)
    const queue = await getDriveQueue(dependencies.getInfrastructure())
    const owner = 'synthetic-sync-' + randomUUID()
    let remoteFiles = Array.from({ length: 205 }, (_, index) =>
      getFixtureFile(`file-${String(index).padStart(3, '0')}.txt`),
    )
    let failPage = false
    let denyAuth = false
    let failManage = false
    const requests: string[] = []
    context.mock.method(
      globalThis,
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        requests.push(url.pathname + '?' + url.searchParams.get('start'))
        if (url.pathname.includes('oauth'))
          return Response.json(
            denyAuth
              ? { error: 'invalid_grant' }
              : {
                  access_token: 'synthetic',
                  refresh_token: 'synthetic',
                  expires_in: 3600,
                },
          )
        if (denyAuth) return Response.json({ errno: 110 }, { status: 401 })
        if (url.searchParams.get('method') === 'filemanager') {
          const params = new URLSearchParams(String(init?.body))
          const files = JSON.parse(params.get('filelist') ?? '[]')
          for (const file of files) {
            const path = typeof file === 'string' ? file : file.path
            const index = remoteFiles.findIndex((entry) => entry.path === path)
            if (index >= 0) {
              if (url.searchParams.get('opera') === 'delete')
                remoteFiles.splice(index, 1)
              else {
                const name = file.newname
                remoteFiles[index] = getFixtureFile(
                  name,
                  remoteFiles[index].isdir === 1,
                )
              }
            }
          }
          return Response.json(
            { errno: failManage ? -1 : 0 },
            { status: failManage ? 502 : 200 },
          )
        }
        if (url.searchParams.get('method') === 'create') {
          const params = new URLSearchParams(String(init?.body))
          remoteFiles.push(getFixtureFile(params.get('path')!.slice(1), true))
          remoteFiles.sort((a, b) =>
            a.server_filename.localeCompare(b.server_filename),
          )
          return Response.json({ errno: 0 })
        }
        const start = Number(url.searchParams.get('start') ?? 0)
        if (failPage && start === 100)
          return Response.json({ errno: -1 }, { status: 502 })
        const files = url.searchParams.get('dir') === '/' ? remoteFiles : []
        return Response.json({
          errno: 0,
          list: files.slice(
            start,
            start + Number(url.searchParams.get('limit') ?? 100),
          ),
        })
      },
    )
    let worker: Awaited<ReturnType<typeof startDriveSyncWorker>> | undefined
    try {
      const saved = await service.saveConnection(
        owner,
        { providerId: 'baidu', name: 'Synthetic sync', rootPath: '/' },
        undefined,
        {
          credentials: {
            accessToken: 'synthetic',
            refreshToken: 'synthetic',
            clientId: 'synthetic',
            clientSecret: 'synthetic',
          },
          expiresAt: new Date(Date.now() + 3600_000),
        },
      )
      let row = await db.store.driveConnection.findFirstOrThrow({
        where: { publicId: saved.id },
      })
      await context.test(
        '首次查询不请求网盘，激活幂等且目录队列去重',
        async () => {
          const count = requests.length
          assert.equal(
            (await service.listEntries(owner, saved.id, filter)).sync!
              .hasSnapshot,
            false,
          )
          assert.equal(requests.length, count)
          await Promise.all(
            Array.from({ length: 5 }, () =>
              service.requestSync(owner, saved.id, 'root'),
            ),
          )
          assert.equal(
            await db.store.driveDirectory.count({
              where: { connectionId: row.id },
            }),
            1,
          )
          assert.equal(
            (await queue.getJobCounts('waiting', 'prioritized')).prioritized,
            1,
          )
        },
      )
      let directory = await catalog.getDirectory(row, 'root')
      assert.ok(directory)
      await context.test('整目录发布、100 条分页与搜索全部走 PG', async () => {
        await sync.syncDirectory(directory!.id)
        const page = await service.listEntries(owner, saved.id, filter)
        assert.equal(page.entries.length, 100)
        assert.equal(page.sync!.hasSnapshot, true)
        assert.equal(page.entries[0].name, 'file-000.txt')
        const count = requests.length
        const offlineService = createDriveService({
          ...dependencies,
          getInfrastructure: () => ({
            ...dependencies.getInfrastructure(),
            connectRedis: async () => {
              throw new Error('Redis offline')
            },
          }),
        })
        assert.equal(
          (await offlineService.listEntries(owner, saved.id, filter)).entries
            .length,
          100,
        )
        const next = await service.listEntries(owner, saved.id, {
          ...filter,
          cursor: page.nextCursor!,
        })
        assert.equal(next.entries[0].name, 'file-100.txt')
        assert.equal(
          (
            await service.listEntries(owner, saved.id, {
              ...filter,
              query: 'FILE-204',
            })
          ).entries.length,
          1,
        )
        await assert.rejects(
          service.listEntries(owner + '-foreign', saved.id, filter),
          { status: 404 },
        )
        assert.equal(requests.length, count)
        directory = await catalog.getDirectory(row, 'root')
        assert.ok(directory!.nextSyncAt.getTime() - Date.now() <= 60_000)
      })
      await context.test(
        '扫描锁占用时心跳和刷新意图不阻塞、不调用网盘',
        async () => {
          const key = `drive:operation:${owner}:${saved.id}`
          const token = 'synthetic-held-' + randomUUID()
          assert.equal(
            await db.redis.set(key, token, { NX: true, PX: 30_000 }),
            'OK',
          )
          const before = await catalog.getDirectory(row, 'root')
          const count = requests.length
          try {
            await service.requestSync(owner, saved.id, 'root')
            await service.requestSync(owner, saved.id, 'root', true)
            const after = await catalog.getDirectory(row, 'root')
            assert.equal(
              after!.publishedGeneration,
              before!.publishedGeneration,
            )
            assert.equal(
              after!.requestedRevision,
              before!.requestedRevision + 1,
            )
            assert.ok(after!.activeUntil!.getTime() > Date.now())
            assert.equal(await db.redis.get(key), token)
            assert.equal(requests.length, count)
            await assert.rejects(
              service.requestSync(owner + '-foreign', saved.id, 'root'),
              { status: 404 },
            )
          } finally {
            await db.redis.del(key)
          }
        },
      )
      await db.store.driveEntry.updateMany({
        where: { directoryId: directory!.id },
        data: { createdAt: new Date(0), updatedAt: new Date(0) },
      })
      const oldPage = await service.listEntries(owner, saved.id, filter)
      await context.test(
        '第二页失败仍保留完整旧快照，重试发布后旧游标继续读旧代',
        async () => {
          remoteFiles = remoteFiles.map((entry) => ({
            ...entry,
            server_filename: 'new-' + entry.server_filename,
          }))
          await service.requestSync(owner, saved.id, 'root', true)
          failPage = true
          await assert.rejects(sync.syncDirectory(directory!.id))
          const failed = await service.listEntries(owner, saved.id, filter)
          assert.equal(failed.sync!.generation, oldPage.sync!.generation)
          assert.equal(failed.entries[0].name, 'file-000.txt')
          assert.equal(failed.sync!.state, 'error')
          failPage = false
          await sync.syncDirectory(directory!.id)
          assert.equal(
            (await service.listEntries(owner, saved.id, filter)).entries[0]
              .name,
            'new-file-000.txt',
          )
          await sync.sweep()
          const oldNext = await service.listEntries(owner, saved.id, {
            ...filter,
            cursor: oldPage.nextCursor!,
          })
          assert.equal(oldNext.entries[0].name, 'file-100.txt')
          const reset = await service.listEntries(owner, saved.id, {
            ...filter,
            cursor: oldPage.nextCursor! + 'tampered',
          })
          assert.equal(reset.resetCursor, true)
          assert.equal(reset.entries[0].name, 'new-file-000.txt')
        },
      )
      await context.test(
        '写操作立即更新本地快照并取消旧扫描，删除子树不复活',
        async () => {
          const before = await service.listEntries(owner, saved.id, filter)
          const target = before.entries[0]
          await service.updateEntry(owner, saved.id, target.id, {
            name: 'renamed.txt',
          })
          assert.equal(
            (
              await service.listEntries(owner, saved.id, {
                ...filter,
                query: 'renamed.txt',
              })
            ).entries.length,
            1,
          )
          await service.createFolder(owner, saved.id, 'root', 'Folder')
          assert.equal(
            (
              await service.listEntries(owner, saved.id, {
                ...filter,
                kind: 'folder',
              })
            ).entries[0].name,
            'Folder',
          )
          const folderId = encodeEntryId('/Folder')
          assert.ok(await catalog.getDirectory(row, folderId))
          await service.deleteEntry(owner, saved.id, folderId)
          assert.equal(
            (await catalog.getDirectory(row, folderId))!.state,
            'removed',
          )
          await assert.rejects(
            service.listEntries(owner, saved.id, {
              ...filter,
              parent: folderId,
            }),
            { status: 404 },
          )
          await sync.syncDirectory(
            (await catalog.getDirectory(row, folderId))!.id,
          )
          assert.equal(
            (await catalog.getDirectory(row, folderId))!.state,
            'removed',
          )
        },
      )
      await context.test(
        '远端操作部分失败仍安排复核并保留本地快照',
        async () => {
          const target = (
            await service.listEntries(owner, saved.id, {
              ...filter,
              query: 'renamed.txt',
            })
          ).entries[0]
          failManage = true
          await assert.rejects(service.deleteEntry(owner, saved.id, target.id))
          failManage = false
          assert.equal(
            (await catalog.getDirectory(row, 'root'))!.state,
            'pending',
          )
          assert.equal(
            (
              await service.listEntries(owner, saved.id, {
                ...filter,
                query: 'renamed.txt',
              })
            ).entries.length,
            1,
          )
          await sync.syncDirectory(directory!.id)
          assert.equal(
            (
              await service.listEntries(owner, saved.id, {
                ...filter,
                query: 'renamed.txt',
              })
            ).entries.length,
            0,
          )
        },
      )
      await context.test(
        '崩溃后恢复分页，写入 revision 不允许旧扫描发布',
        async () => {
          const generation = randomUUID()
          directory = await db.store.driveDirectory.update({
            where: { id: directory!.id },
            data: {
              scanGeneration: generation,
              scanRevision: 0,
              requestedRevision: 1,
              scanCursor: encodeEntryId('100'),
              state: 'syncing',
            },
          })
          await sync.syncDirectory(directory.id)
          assert.notEqual(
            (await catalog.getDirectory(row, 'root'))!.publishedGeneration,
            generation,
          )
          assert.equal(
            (await catalog.getDirectory(row, 'root'))!.state,
            'ready',
          )
        },
      )
      await context.test(
        '超过十页后持久化游标，新消费者续接同一次扫描',
        async () => {
          const previousFiles = remoteFiles
          remoteFiles = Array.from({ length: 1100 }, (_, index) =>
            getFixtureFile(`resume-${String(index).padStart(4, '0')}.txt`),
          )
          await catalog.markDirty(row, 'root')
          const before = (await catalog.getDirectory(row, 'root'))!
            .publishedGeneration
          await sync.syncDirectory(directory!.id)
          const staged = (await catalog.getDirectory(row, 'root'))!
          assert.equal(staged.state, 'pending')
          assert.equal(staged.scanCursor, encodeEntryId('1000'))
          assert.equal(staged.publishedGeneration, before)
          await createDriveSync(dependencies).syncDirectory(directory!.id)
          const published = (await catalog.getDirectory(row, 'root'))!
          assert.equal(published.publishedGeneration, staged.scanGeneration)
          assert.equal(
            await db.store.driveEntry.count({
              where: {
                directoryId: directory!.id,
                generation: published.publishedGeneration!,
              },
            }),
            1100,
          )
          remoteFiles = previousFiles
          await catalog.markDirty(row, 'root')
          await sync.syncDirectory(directory!.id)
        },
      )
      await context.test(
        'Redis 任务丢失后，数据库补偿和实际 Worker 恢复',
        async () => {
          await queue.drain(true)
          remoteFiles.push(getFixtureFile('ColdFolder', true))
          remoteFiles.sort((a, b) =>
            a.server_filename.localeCompare(b.server_filename),
          )
          await catalog.markDirty(row, 'root')
          await sync.sweep()
          assert.ok(
            (await queue.getJobCounts('waiting', 'prioritized')).prioritized >=
              1,
          )
          worker = await startDriveSyncWorker(dependencies)
          await waitFor(
            async () =>
              (await catalog.getDirectory(row, 'root'))!.state === 'ready',
          )
          const coldId = encodeEntryId('/ColdFolder')
          await waitFor(
            async () =>
              (await catalog.getDirectory(row, coldId))?.state === 'ready',
          )
          const cold = (await catalog.getDirectory(row, coldId))!
          assert.ok(cold.nextSyncAt.getTime() - Date.now() > 590_000)
          await worker.close()
          worker = undefined
        },
      )
      await context.test(
        '阿里稳定 ID 在外部移动后复用目录记录并重扫子树',
        async (child) => {
          let moved = false
          const files = [
            { file_id: 'A', parent_file_id: 'root', name: 'A', type: 'folder' },
            { file_id: 'B', parent_file_id: 'root', name: 'B', type: 'folder' },
            { file_id: 'X', parent_file_id: 'A', name: 'X', type: 'folder' },
          ]
          child.mock.method(
            globalThis,
            'fetch',
            async (_input: RequestInfo | URL, init?: RequestInit) => {
              const input = JSON.parse(String(init?.body))
              const current = files.map((file) =>
                file.file_id === 'X' && moved
                  ? { ...file, parent_file_id: 'B' }
                  : file,
              )
              return input.file_id
                ? Response.json(
                    current.find((file) => file.file_id === input.file_id),
                  )
                : Response.json({
                    items: current.filter(
                      (file) => file.parent_file_id === input.parent_file_id,
                    ),
                    next_marker: '',
                  })
            },
          )
          const connection = await db.store.driveConnection.create({
            data: {
              ownerId: owner,
              publicId: randomUUID(),
              provider: 'aliyun',
              name: 'Synthetic Aliyun',
              mountOptions: {
                providerId: 'aliyun',
                rootPath: '/',
                driveType: 'default',
                driveId: 'synthetic',
                rootId: 'root',
              },
              encryptedCredentials: encryptCredentials(
                {
                  accessToken: 'synthetic',
                  refreshToken: 'synthetic',
                  clientId: 'synthetic',
                  clientSecret: 'synthetic',
                },
                db.config.key,
              ),
              lastCheckedAt: new Date(),
              tokenExpiresAt: new Date(Date.now() + 3600_000),
            },
          })
          try {
            await service.requestSync(owner, connection.publicId, 'root')
            await sync.syncDirectory(
              (await catalog.getDirectory(connection, 'root'))!.id,
            )
            const a = (await catalog.getDirectory(
              connection,
              encodeEntryId('A'),
            ))!
            const b = (await catalog.getDirectory(
              connection,
              encodeEntryId('B'),
            ))!
            await sync.syncDirectory(a.id)
            await sync.syncDirectory(b.id)
            const x = (await catalog.getDirectory(
              connection,
              encodeEntryId('X'),
            ))!
            await sync.syncDirectory(x.id)
            moved = true
            await catalog.markDirty(connection, encodeEntryId('B'))
            await sync.syncDirectory(b.id)
            await catalog.markDirty(connection, encodeEntryId('A'))
            await sync.syncDirectory(a.id)
            const after = (await catalog.getDirectory(
              connection,
              encodeEntryId('X'),
            ))!
            assert.equal(after.id, x.id)
            assert.equal(after.parentRemoteId, encodeEntryId('B'))
            assert.equal(after.removedAt, null)
            assert.equal(after.publishedGeneration, null)
            assert.equal(
              await db.store.driveDirectory.count({
                where: {
                  connectionId: connection.id,
                  remoteId: encodeEntryId('X'),
                },
              }),
              1,
            )
          } finally {
            await service.deleteConnection(owner, connection.publicId)
          }
        },
      )
      await context.test(
        '授权失败阻止自动重试，重新授权隔离旧账号',
        async () => {
          await catalog.markDirty(row, 'root')
          denyAuth = true
          await sync.syncDirectory(directory!.id)
          assert.equal(
            (await catalog.getDirectory(row, 'root'))!.state,
            'blocked',
          )
          const count = requests.length
          await sync.syncDirectory(directory!.id)
          assert.equal(requests.length, count)
          denyAuth = false
          await service.saveConnection(
            owner,
            {
              providerId: 'baidu',
              name: 'Synthetic account two',
              rootPath: '/',
              revision: saved.revision,
            },
            saved.id,
            {
              credentials: {
                accessToken: 'synthetic-two',
                refreshToken: 'synthetic-two',
                clientId: 'synthetic',
                clientSecret: 'synthetic',
              },
              expiresAt: new Date(Date.now() + 3600_000),
            },
          )
          row = await db.store.driveConnection.findUniqueOrThrow({
            where: { id: row.id },
          })
          assert.equal(row.metadataVersion, 2)
          assert.equal(
            (await service.listEntries(owner, saved.id, filter)).sync!
              .hasSnapshot,
            false,
          )
          const countBeforeOldJob = requests.length
          await sync.syncDirectory(directory!.id)
          assert.equal(requests.length, countBeforeOldJob)
        },
      )
      await context.test('写同步接口保持 Origin、会话与归属校验', async () => {
        const app = new Hono().route(
          '/api/assets',
          createAssetsRouter(dependencies),
        )
        const response = await app.request('/api/assets/drive/connections')
        const cookie = response.headers.get('set-cookie')!.split(';')[0]
        const path = '/api/assets/drive/connections/' + saved.id + '/sync'
        assert.equal(
          (
            await app.request(path, {
              method: 'POST',
              headers: { Cookie: cookie },
              body: '{}',
            })
          ).status,
          403,
        )
        assert.equal(
          (
            await app.request(path, {
              method: 'POST',
              headers: { Cookie: cookie, Origin: db.config.origin },
              body: '{}',
            })
          ).status,
          404,
        )
        assert.equal(
          await db.store.driveConnection.count({
            where: {
              ownerId: createHash('sha256').update('foreign').digest('hex'),
            },
          }),
          0,
        )
      })
    } finally {
      await worker?.close()
      await queue.obliterate({ force: true })
      const rows = await db.store.driveConnection.findMany({
        where: { ownerId: owner },
        select: { id: true },
      })
      await db.store.driveEntry.deleteMany({
        where: { connectionId: { in: rows.map((row) => row.id) } },
      })
      await db.store.driveDirectory.deleteMany({
        where: { connectionId: { in: rows.map((row) => row.id) } },
      })
      await db.store.driveConnection.deleteMany({ where: { ownerId: owner } })
      await db.close()
    }
  },
)
