import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createDriveService } from '../../../packages/assets/src/infrastructure/drive/drive-service.ts'
import { createDriveSync } from '../../../packages/assets/src/infrastructure/drive/drive-sync-worker.ts'
import { getDriveQueue } from '../../../packages/assets/src/infrastructure/drive/drive-queue.ts'
import { createDatabase } from '../src/infrastructure/database/database-client.ts'
import {
  encryptCredentials,
  decryptCredentials,
} from '../src/infrastructure/security/credentials.ts'

test(
  'Drive Prisma 存储保持隔离、版本保护、缓存失效和 Token 轮换',
  {
    skip:
      !process.env.DATABASE_URL ||
      !process.env.REDIS_URL ||
      !process.env.MAIL_ENCRYPTION_KEY,
  },
  async (context) => {
    const db = createDatabase()
    const owner = `synthetic-drive-${randomUUID()}`
    const idList: string[] = []
    let failList = false
    const fetchMock = context.mock.method(
      globalThis,
      'fetch',
      async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.pathname.includes('oauth'))
          return Response.json({
            access_token: 'synthetic-rotated-access',
            refresh_token: 'synthetic-rotated-refresh',
            expires_in: 3600,
          })
        if (failList) return Response.json({ errno: -1 }, { status: 502 })
        return Response.json({
          errno: 0,
          list: [
            {
              fs_id: '1',
              path: '/synthetic.txt',
              server_filename: 'synthetic.txt',
              size: 10,
              server_mtime: 1700000000,
              isdir: 0,
            },
          ],
        })
      },
    )
    const dependencies = {
      getInfrastructure: () => ({
        store: db.store,
        redis: db.redis,
        connectRedis: db.connectRedis,
        key: db.config.key,
        origin: db.config.origin,
        syncNamespace: db.syncNamespace,
      }),
      encryptCredentials,
      decryptCredentials,
    }
    const service = createDriveService(dependencies)
    const draft = {
      providerId: 'baidu' as const,
      name: 'Synthetic Drive',
      rootPath: '/',
    }
    const authorization = {
      credentials: {
        accessToken: 'synthetic-access',
        refreshToken: 'synthetic-refresh',
        clientId: 'synthetic-id',
        clientSecret: 'synthetic-secret',
      },
      expiresAt: new Date(Date.now() + 3600_000),
    }
    const filter = {
      parent: 'root',
      kind: 'all' as const,
      query: '',
      cursor: undefined,
      refresh: '0' as const,
    }
    try {
      assert.deepEqual(await service.listConnections(owner), [])
      const first = await service.saveConnection(
        owner,
        draft,
        undefined,
        authorization,
      )
      idList.push(first.id)
      const second = await service.saveConnection(
        owner,
        draft,
        undefined,
        authorization,
      )
      idList.push(second.id)
      assert.notEqual(first.id, second.id)
      assert.equal((await service.listConnections(owner)).length, 2)
      assert.deepEqual(await service.listConnections(owner + '-foreign'), [])
      await assert.rejects(
        service.deleteConnection(owner + '-foreign', first.id),
        { status: 404 },
      )
      assert.doesNotMatch(
        JSON.stringify(await service.listConnections(owner)),
        /synthetic-secret|synthetic-refresh|encryptedCredentials/,
      )
      const renamed = await service.saveConnection(
        owner,
        { ...draft, name: 'Renamed', revision: first.revision },
        first.id,
      )
      assert.equal(renamed.revision, first.revision + 1)
      await assert.rejects(
        service.saveConnection(
          owner,
          { ...draft, revision: first.revision },
          first.id,
        ),
        { status: 409 },
      )
      const count = fetchMock.mock.calls.length
      assert.equal(
        (await service.listEntries(owner, first.id, filter)).sync.hasSnapshot,
        false,
      )
      await service.requestSync(owner, first.id, 'root')
      const directory = await db.store.driveDirectory.findFirstOrThrow({
        where: {
          connectionId: (
            await db.store.driveConnection.findFirstOrThrow({
              where: { publicId: first.id },
            })
          ).id,
        },
      })
      await createDriveSync(dependencies).syncDirectory(directory.id)
      const afterSync = fetchMock.mock.calls.length
      assert.equal(
        (await service.listEntries(owner, first.id, filter)).entries.length,
        1,
      )
      await service.listEntries(owner, first.id, filter)
      assert.equal(fetchMock.mock.calls.length, afterSync)
      assert.ok(afterSync > count)
      const row = await db.store.driveConnection.findFirstOrThrow({
        where: { ownerId: owner, publicId: first.id },
      })
      await db.store.driveConnection.update({
        where: { id: row.id },
        data: { tokenExpiresAt: new Date(0) },
      })
      failList = true
      await assert.rejects(
        service.saveConnection(
          owner,
          { ...draft, revision: renamed.revision },
          first.id,
        ),
      )
      const rotated = await db.store.driveConnection.findUniqueOrThrow({
        where: { id: row.id },
      })
      assert.equal(rotated.revision, renamed.revision)
      assert.equal(rotated.name, 'Renamed')
      assert.equal(
        decryptCredentials<{ refreshToken: string }>(
          rotated.encryptedCredentials,
          db.config.key,
        ).refreshToken,
        'synthetic-rotated-refresh',
      )
      await service.deleteConnection(owner, first.id)
      await assert.rejects(service.listEntries(owner, first.id, filter), {
        status: 404,
      })
      assert.equal((await service.listConnections(owner)).length, 1)
    } finally {
      await db.store.driveConnection.deleteMany({ where: { ownerId: owner } })
      if (db.redis.isReady) {
        for (const id of idList) {
          for await (const keys of db.redis.scanIterator({
            MATCH: `drive:*:${owner}:${id}*`,
            COUNT: 100,
          }))
            if (keys.length) await db.redis.del(keys)
        }
      }
      await (
        await getDriveQueue(dependencies.getInfrastructure())
      ).obliterate({ force: true })
      await db.close()
    }
  },
)
