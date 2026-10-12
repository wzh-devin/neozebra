import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plannerSaveSchema } from '../src/dto/task/task-dto.ts'
import { buildTaskFixture } from './task-fixture.ts'

test('Task 兼容原业务标识、独立日期、排序和单层步骤', () => {
  const input = { revision: 0, data: buildTaskFixture() }
  assert.deepEqual(plannerSaveSchema.parse(input), input)

  // 既有甘特图保留倒置日期的修正入口，读取时不删除这类旧数据。
  input.data.taskList[0].deadlineDate = '2026-10-01'
  assert.equal(plannerSaveSchema.safeParse(input).success, true)
})

test('Task 边界拒绝无效日期、未知状态、重复标识和不存在的关联', () => {
  const invalidList = [
    {
      taskList: [
        { ...buildTaskFixture().taskList[0], plannedDate: '2026-02-30' },
      ],
    },
    { taskList: [{ ...buildTaskFixture().taskList[0], status: 'unknown' }] },
    { taskList: [{ ...buildTaskFixture().taskList[0], sectionId: 'missing' }] },
    { taskList: [{ ...buildTaskFixture().taskList[0], projectId: null }] },
    {
      sectionList: [
        { id: 'section-local', projectId: 'missing', title: '阶段' },
      ],
    },
    {
      taskList: [
        buildTaskFixture().taskList[0],
        buildTaskFixture().taskList[0],
      ],
    },
    {
      taskList: [
        {
          ...buildTaskFixture().taskList[0],
          subtasks: [
            { id: 'step', title: 'A', completed: false },
            { id: 'step', title: 'B', completed: false },
          ],
        },
      ],
    },
    { taskList: [{ ...buildTaskFixture().taskList[0], title: '  ' }] },
    { taskList: [{ ...buildTaskFixture().taskList[0], estimateMinutes: 0 }] },
  ]
  for (const patch of invalidList)
    assert.equal(
      plannerSaveSchema.safeParse({
        revision: 1,
        data: { ...buildTaskFixture(), ...patch },
      }).success,
      false,
    )
  assert.equal(
    plannerSaveSchema.safeParse({ revision: -1, data: buildTaskFixture() })
      .success,
    false,
  )
  assert.equal(
    plannerSaveSchema.safeParse({
      revision: 0,
      data: { ...buildTaskFixture(), owner: 'other' },
    }).success,
    false,
  )
})

test('Task 完成必须有完成时间且全部步骤已完成，重新打开清除完成时间', () => {
  const data = buildTaskFixture()
  data.taskList[0].status = 'completed'
  assert.equal(
    plannerSaveSchema.safeParse({ revision: 0, data }).success,
    false,
  )
  data.taskList[0].completedAt = '2026-10-10T10:00:00.000Z'
  assert.equal(
    plannerSaveSchema.safeParse({ revision: 0, data }).success,
    false,
  )
  data.taskList[0].subtasks.forEach((step) => {
    step.completed = true
  })
  assert.equal(plannerSaveSchema.safeParse({ revision: 0, data }).success, true)
  data.taskList[0].status = 'todo'
  assert.equal(
    plannerSaveSchema.safeParse({ revision: 0, data }).success,
    false,
  )
})
