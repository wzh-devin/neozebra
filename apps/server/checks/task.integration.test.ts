import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createApp } from '../src/app.ts'
import {
  createDatabase,
  closeDatabase,
} from '../src/infrastructure/database/database-client.ts'
import {
  getTaskPlanner,
  saveTaskPlanner,
} from '../src/infrastructure/task/task-repository.ts'
import type { TaskSaveDto } from '../src/dto/task/task-dto.ts'
import { buildTaskFixture } from './task-fixture.ts'

const configured = Boolean(
  process.env.DATABASE_URL &&
  process.env.REDIS_URL &&
  process.env.MAIL_ENCRYPTION_KEY,
)

test(
  '真实 PostgreSQL/Redis：Task 会话、持久化、事务版本、关联删除与恢复',
  { skip: !configured },
  async (context) => {
    const db = createDatabase()
    const app = createApp()
    const ownerList: string[] = []
    const request = (
      cookie: string,
      input: unknown,
      origin = db.config.origin,
    ) =>
      app.request('/api/task/planner', {
        method: 'PUT',
        headers: { cookie, origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    const openPlanner = async () => {
      const response = await app.request('/api/task/planner')
      assert.equal(response.status, 200)
      const cookie = response.headers.get('set-cookie')!.split(';')[0]
      assert.match(response.headers.get('set-cookie')!, /HttpOnly/)
      assert.match(response.headers.get('set-cookie')!, /SameSite=Lax/i)
      ownerList.push(
        createHash('sha256')
          .update(decodeURIComponent(cookie.split('=')[1]).split('.')[0])
          .digest('hex'),
      )
      return { cookie, snapshot: (await response.json()) as TaskSaveDto }
    }
    try {
      const first = await openPlanner()
      const other = await openPlanner()
      let snapshot = first.snapshot
      assert.equal(snapshot.revision, 0)
      assert.equal(snapshot.data.taskList.length, 0)
      await context.test('会话隔离、来源保护和坏输入', async () => {
        assert.equal((await request('', snapshot)).status, 401)
        assert.equal(
          (await request(first.cookie, snapshot, 'https://invalid.example'))
            .status,
          403,
        )
        assert.equal(
          (await request(first.cookie, { ...snapshot, revision: -1 })).status,
          400,
        )
        assert.equal(
          (await request(first.cookie + 'tampered', snapshot)).status,
          401,
        )
        assert.equal(
          (await request(first.cookie, { text: 'x'.repeat(2 * 1024 * 1024) }))
            .status,
          413,
        )
      })
      await context.test(
        '保存完整计划并读取；UUID 业务标识和创建时间保留',
        async () => {
          const fixture = buildTaskFixture()
          const response = await request(first.cookie, {
            revision: 0,
            data: fixture,
          })
          assert.equal(response.status, 200)
          snapshot = (await response.json()) as TaskSaveDto
          assert.equal(snapshot.revision, 1)
          assert.deepEqual(snapshot.data, fixture)
          const read = await app.request('/api/task/planner', {
            headers: { cookie: first.cookie },
          })
          assert.deepEqual(await read.json(), snapshot)
          const isolated = await app.request('/api/task/planner', {
            headers: { cookie: other.cookie },
          })
          assert.deepEqual(await isolated.json(), other.snapshot)
          const workspace = await db.store.taskWorkspace.findFirst({
            where: { ownerId: ownerList[0] },
          })
          const rowList = await db.store.task.findMany({
            where: { workspaceId: workspace.id },
          })
          const row = rowList.find(
            (entry) =>
              entry.key === fixture.taskList[0].id &&
              entry.createdAt.toISOString() === fixture.taskList[0].createdAt,
          )
          assert.equal(typeof row?.id, 'bigint')
          assert.ok(row?.updatedAt instanceof Date)
        },
      )
      await context.test(
        '并发保存只有一个成功，另一个409且不丢失胜出数据',
        async () => {
          for (let attempt = 0; attempt < 20; attempt++) {
            const a = structuredClone(snapshot)
            const b = structuredClone(snapshot)
            a.data.taskList[0].title = `A 保存 ${attempt}`
            b.data.taskList[0].title = `B 保存 ${attempt}`
            const responseList = await Promise.all([
              request(first.cookie, a),
              request(first.cookie, b),
            ])
            assert.deepEqual(
              responseList.map((response) => response.status).sort(),
              [200, 409],
            )
            const winner = responseList.find(
              (response) => response.status === 200,
            )!
            snapshot = (await winner.json()) as TaskSaveDto
            const read = await app.request('/api/task/planner', {
              headers: { cookie: first.cookie },
            })
            assert.deepEqual(await read.json(), snapshot)
          }
        },
      )
      await context.test('事务中校验失败回滚工作区版本和实体', async () => {
        const invalid = structuredClone(snapshot)
        invalid.data.taskList[0].title = ''
        await assert.rejects(saveTaskPlanner(db, ownerList[0], invalid))
        assert.deepEqual(await getTaskPlanner(db, ownerList[0]), snapshot)
      })
      await context.test(
        '坏关联不产生部分写入；保留任务删除项目和撤销可原子恢复',
        async () => {
          const original = structuredClone(snapshot.data)
          const invalid = structuredClone(snapshot)
          invalid.data.taskList[0].projectId = 'missing'
          assert.equal((await request(first.cookie, invalid)).status, 400)
          const keep = structuredClone(snapshot)
          keep.data.projectList = []
          keep.data.sectionList = []
          keep.data.taskList.forEach((task) => {
            task.projectId = null
            task.sectionId = null
          })
          const response = await request(first.cookie, keep)
          assert.equal(response.status, 200)
          snapshot = (await response.json()) as TaskSaveDto
          assert.equal(snapshot.data.taskList.length, original.taskList.length)
          const restored = await request(first.cookie, {
            revision: snapshot.revision,
            data: original,
          })
          assert.equal(restored.status, 200)
          snapshot = (await restored.json()) as TaskSaveDto
          assert.deepEqual(snapshot.data, original)
        },
      )
      await context.test(
        '步骤/任务顺序、完成、项目归档和级联删除由代码维护',
        async () => {
          const next = structuredClone(snapshot)
          next.data.taskList.reverse()
          next.data.taskList[0].subtasks.reverse()
          next.data.taskList[0].subtasks.forEach((step) => {
            step.completed = true
          })
          next.data.taskList[0].status = 'completed'
          next.data.taskList[0].completedAt = new Date().toISOString()
          next.data.projectList[0].archived = true
          const changed = await request(first.cookie, next)
          assert.equal(changed.status, 200)
          snapshot = (await changed.json()) as TaskSaveDto
          const read = await app.request('/api/task/planner', {
            headers: { cookie: first.cookie },
          })
          assert.deepEqual(await read.json(), snapshot)
          const deleted = await request(first.cookie, {
            revision: snapshot.revision,
            data: {
              version: 1,
              taskList: [],
              sectionList: [],
              projectList: [],
            },
          })
          assert.equal(deleted.status, 200)
          snapshot = (await deleted.json()) as TaskSaveDto
          assert.ok(snapshot.revision > 0)
          const workspace = await db.store.taskWorkspace.findFirst({
            where: { ownerId: ownerList[0] },
          })
          for (const table of [
            db.store.taskProject,
            db.store.taskSection,
            db.store.task,
            db.store.taskSubtask,
          ])
            assert.equal(
              (
                await table.findMany({
                  select: { id: true },
                  where: { workspaceId: workspace.id },
                })
              ).length,
              0,
            )
        },
      )
      await context.test(
        '无日期、项目和步骤的个人任务可以保存和读取',
        async () => {
          const task = buildTaskFixture(1).taskList[0]
          task.projectId = null
          task.sectionId = null
          task.plannedDate = null
          task.deadlineDate = null
          task.subtasks = []
          const data = {
            version: 1,
            taskList: [task],
            projectList: [],
            sectionList: [],
          }
          const saved = await request(other.cookie, { revision: 0, data })
          assert.equal(saved.status, 200)
          const read = await app.request('/api/task/planner', {
            headers: { cookie: other.cookie },
          })
          assert.deepEqual(await read.json(), { revision: 1, data })
        },
      )
      await context.test(
        '无唯一约束：同一新会话并发初始化只创建一个工作区',
        async () => {
          const owner = `task-check-${randomUUID()}`
          ownerList.push(owner)
          const responseList = await Promise.all([
            getTaskPlanner(db, owner),
            getTaskPlanner(db, owner),
            getTaskPlanner(db, owner),
          ])
          assert.ok(responseList.every((entry) => entry.revision === 0))
          assert.equal(
            (
              await db.store.taskWorkspace.findMany({
                where: { ownerId: owner },
              })
            ).length,
            1,
          )
        },
      )
    } finally {
      const workspaceList = ownerList.length
        ? await db.store.taskWorkspace.findMany({
            select: { id: true },
            where: { ownerId: { in: ownerList } },
          })
        : []
      const workspaceIdList = workspaceList.map((entry) => entry.id)
      if (workspaceIdList.length) {
        for (const table of [
          db.store.taskSubtask,
          db.store.task,
          db.store.taskSection,
          db.store.taskProject,
        ])
          await table.deleteMany({
            where: { workspaceId: { in: workspaceIdList } },
          })
        await db.store.taskWorkspace.deleteMany({
          where: { id: { in: workspaceIdList } },
        })
      }
      await db.close()
      await closeDatabase()
    }
  },
)
