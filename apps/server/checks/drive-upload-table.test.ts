import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDriveUploadTablePage } from '../../web/src/features/drive/data/drive-upload-table.ts'
import type { DriveUploadTask } from '../../web/src/features/drive/upload-types.ts'
import { driveUploadListDto } from '../../../packages/assets/src/dto/drive/drive-upload-dto.ts'

// Synthetic/local mock：编号同时确定任务日期，方便断言历史页边界。
const getTask = (
  index: number,
  patch: Partial<DriveUploadTask> = {},
): DriveUploadTask => ({
  id: String(index),
  parent: 'root',
  directoryName: 'Synthetic account',
  name: `synthetic-${index}.txt`,
  mimeType: 'text/plain',
  size: 100,
  fingerprint: '',
  partSize: 8 * 1024 ** 2,
  partCount: 1,
  receivedBytes: 0,
  transferredBytes: 0,
  status: 'receiving',
  phase: 'receiving',
  error: null,
  revision: 1,
  createdAt: new Date(index * 1000).toISOString(),
  updatedAt: new Date(index * 1000).toISOString(),
  expiresAt: new Date(86400000).toISOString(),
  ...patch,
})

test('表格合并新任务和实时进度，不重复计数，保留更新的服务端结果', () => {
  const server = [
    getTask(3),
    getTask(2, {
      status: 'completed',
      updatedAt: new Date(9000).toISOString(),
    }),
    getTask(1),
  ]
  const page = buildDriveUploadTablePage({
    page: 1,
    data: { tasks: server, total: 3, page: 1, pageSize: 10 },
    localTasks: [getTask(4), getTask(3, { receivedBytes: 50 }), getTask(2)],
  })
  assert.deepEqual(
    page.tasks.map((task) => task.id),
    ['4', '3', '2', '1'],
  )
  assert.equal(page.tasks[1].receivedBytes, 50)
  assert.equal(page.tasks[2].status, 'completed')
  assert.equal(page.total, 4)
  assert.equal(page.pageCount, 1)
})

test('每页最多10条；历史页不混入缓存任务；加载时保留已知总数', () => {
  const tasks = Array.from({ length: 15 }, (_, index) => getTask(30 - index))
  const first = buildDriveUploadTablePage({
    page: 1,
    data: { tasks: tasks.slice(0, 10), total: 25, page: 1, pageSize: 10 },
    localTasks: [getTask(40), ...tasks],
  })
  assert.equal(first.tasks.length, 10)
  assert.equal(first.total, 26)
  assert.equal(first.pageCount, 3)
  const history = buildDriveUploadTablePage({
    page: 2,
    data: { tasks: tasks.slice(10), total: 25, page: 2, pageSize: 10 },
    localTasks: [getTask(40), getTask(20, { receivedBytes: 70 })],
  })
  assert.deepEqual(
    history.tasks.map((task) => task.id),
    ['20', '19', '18', '17', '16'],
  )
  assert.equal(history.tasks[0].receivedBytes, 70)
  assert.equal(history.total, 25)
  const loading = buildDriveUploadTablePage({
    page: 2,
    data: null,
    localTasks: tasks,
    knownTotal: 25,
  })
  assert.equal(loading.total, 25)
  assert.deepEqual(loading.tasks, [])
  const empty = buildDriveUploadTablePage({
    page: 1,
    data: null,
    localTasks: [],
  })
  assert.equal(empty.total, 0)
  assert.equal(empty.pageCount, 1)
})

test('页码查询边界校验，兼容原游标，禁止两种分页混用', () => {
  assert.deepEqual(driveUploadListDto.parse({}), {})
  assert.deepEqual(driveUploadListDto.parse({ page: '3' }), { page: 3 })
  assert.deepEqual(driveUploadListDto.parse({ cursor: '42' }), { cursor: '42' })
  for (const query of [
    { page: '0' },
    { page: '-1' },
    { page: '1.2' },
    { page: 'NaN' },
    { page: '1000001' },
    { page: '1', cursor: '42' },
    { page: '1', extra: 'x' },
  ])
    assert.equal(driveUploadListDto.safeParse(query).success, false)
})
