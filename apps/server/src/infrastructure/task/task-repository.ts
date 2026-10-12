import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { Prisma } from '@neozebra/database'
import { HTTPException } from 'hono/http-exception'
import type { Database } from '../database/database-client.ts'
import { ignoreMissingRecord } from '../database/prisma-errors.ts'
import {
  plannerSchema,
  type TaskPlannerDto,
  type TaskSaveDto,
} from '../../dto/task/task-dto.ts'

type Transaction = Prisma.TransactionClient

/**
 * 只在首次创建工作区时使用 Redis 锁，避免依赖业务唯一约束。
 *
 * @param db - 已配置的存储
 * @param owner - 签名会话所有者
 * @returns 个人工作区；创建成功后释放本次锁
 */
const ensureWorkspace = async (db: Database, owner: string) => {
  const findWorkspace = () =>
    db.store.taskWorkspace.findFirst({ where: { ownerId: owner } })
  let workspace = await findWorkspace()
  if (workspace) return workspace
  await db.connectRedis()
  const key = `neozebra:task:init:${owner}`
  const token = randomUUID()
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await db.redis.set(key, token, { NX: true, PX: 30000 })) {
      try {
        workspace = await findWorkspace()
        return (
          workspace ??
          (await db.store.taskWorkspace.create({ data: { ownerId: owner } }))
        )
      } finally {
        await db.redis
          .eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
            { keys: [key], arguments: [token] },
          )
          .catch(() => {})
      }
    }
    await delay(100)
    workspace = await findWorkspace()
    if (workspace) return workspace
  }
  throw new HTTPException(503, {
    message: '任务工作区正在初始化，请稍后重试。',
  })
}

/**
 * 在同一事务快照内读取实体，避免数据与版本不一致。
 *
 * @param tx - 当前事务
 * @param workspaceId - 已鉴权的工作区主键
 * @returns 项目、阶段、任务与步骤行
 */
const getPlannerRowList = async (tx: Transaction, workspaceId: bigint) => {
  const projectList = await tx.taskProject.findMany({
    where: { workspaceId },
    orderBy: { position: 'asc' },
  })
  const sectionList = await tx.taskSection.findMany({
    where: { workspaceId },
    orderBy: { position: 'asc' },
  })
  const taskList = await tx.task.findMany({
    where: { workspaceId },
    orderBy: { position: 'asc' },
  })
  const stepList = await tx.taskSubtask.findMany({
    where: { workspaceId },
    orderBy: { position: 'asc' },
  })
  return { projectList, sectionList, taskList, stepList }
}

/**
 * 以业务标识保留原 URL，日历日期按 UTC 还原。
 *
 * @param rows - 当前工作区的实体行
 * @returns 已校验的前端计划
 */
const buildPlannerData = (
  rows: Awaited<ReturnType<typeof getPlannerRowList>>,
): TaskPlannerDto => {
  const stepMap = new Map<
    string,
    TaskPlannerDto['taskList'][number]['subtasks']
  >()
  for (const step of rows.stepList) {
    const list = stepMap.get(step.taskKey) ?? []
    list.push({ id: step.key, title: step.title, completed: step.completed })
    stepMap.set(step.taskKey, list)
  }
  return plannerSchema.parse({
    version: 1,
    projectList: rows.projectList.map((row) => ({
      id: row.key,
      name: row.name,
      description: row.description,
      color: row.color,
      icon: row.icon,
      deadlineDate: row.deadlineDate?.toISOString().slice(0, 10) ?? null,
      archived: row.archived,
    })),
    sectionList: rows.sectionList.map((row) => ({
      id: row.key,
      projectId: row.projectKey,
      title: row.title,
    })),
    taskList: rows.taskList.map((row) => ({
      id: row.key,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      plannedDate: row.plannedDate?.toISOString().slice(0, 10) ?? null,
      deadlineDate: row.deadlineDate?.toISOString().slice(0, 10) ?? null,
      projectId: row.projectKey,
      sectionId: row.sectionKey,
      labels: row.labels,
      estimateMinutes: row.estimateMinutes,
      isPinned: row.isPinned,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      subtasks: stepMap.get(row.key) ?? [],
    })),
  })
}

/**
 * 读取个人计划，首次访问初始化空工作区。
 *
 * @param db - 存储
 * @param owner - 签名会话所有者
 * @returns 与版本一致的计划快照
 */
const getTaskPlanner = async (
  db: Database,
  owner: string,
): Promise<TaskSaveDto> => {
  const workspace = await ensureWorkspace(db, owner)
  return db.store.$transaction(
    async (tx) => {
      const current = await tx.taskWorkspace.findFirstOrThrow({
        where: { id: workspace.id, ownerId: owner },
      })
      return {
        revision: current.revision,
        data: buildPlannerData(await getPlannerRowList(tx, current.id)),
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
}

// 比较持久化字段，避免一次小修改重新写入整份计划。
const isSameValue = (left: unknown, right: unknown): boolean =>
  left instanceof Date && right instanceof Date
    ? left.getTime() === right.getTime()
    : Array.isArray(left) && Array.isArray(right)
      ? JSON.stringify(left) === JSON.stringify(right)
      : left === right

/**
 * 按业务标识计算变化，保存只更新变化行。
 *
 * @param previousList - 当前工作区已有行
 * @param nextList - 下一份持久化字段
 * @returns 新增、更新和删除集合
 */
const getEntryChanges = <
  T extends { key: string; taskKey?: string },
  P extends { id: bigint; key: string; taskKey?: string },
>(
  previousList: P[],
  nextList: T[],
) => {
  const getKey = (entry: { key: string; taskKey?: string }) =>
    `${entry.taskKey ?? ''}\0${entry.key}`
  const previousMap = new Map(
    previousList.map((entry) => [getKey(entry), entry]),
  )
  const nextKeySet = new Set(nextList.map(getKey))
  return {
    addedList: nextList.filter((entry) => !previousMap.has(getKey(entry))),
    deletedIdList: previousList
      .filter((entry) => !nextKeySet.has(getKey(entry)))
      .map((entry) => entry.id),
    updatedList: nextList.flatMap((entry) => {
      const previous = previousMap.get(getKey(entry))
      return previous &&
        Object.entries(entry).some(
          ([key, value]) => !isSameValue(value, previous[key as keyof P]),
        )
        ? [{ id: previous.id, values: entry }]
        : []
    }),
  }
}

/**
 * 锁定当前工作区版本，在同一事务中保存实体、顺序和关联删除。
 *
 * @param db - 存储
 * @param owner - 签名会话所有者
 * @param input - 已校验的完整计划与预期版本
 * @returns 新快照；冲突拒绝覆盖，任意写入失败回滚
 */
const saveTaskPlanner = async (
  db: Database,
  owner: string,
  input: TaskSaveDto,
): Promise<TaskSaveDto> =>
  db.store.$transaction(async (tx) => {
    const workspace = await tx.taskWorkspace.findFirst({
      where: { ownerId: owner },
    })
    const updated =
      workspace &&
      (await tx.taskWorkspace
        .update({
          where: { id: workspace.id, ownerId: owner, revision: input.revision },
          data: { revision: { increment: 1 } },
        })
        .catch(ignoreMissingRecord))
    if (!workspace || !updated)
      throw new HTTPException(409, {
        message: '计划已在其他页面更新，请核对后重新保存。',
      })
    const workspaceId = workspace.id
    const rows = await getPlannerRowList(tx, workspaceId)
    const data = plannerSchema.parse(input.data)
    const projectChanges = getEntryChanges(
      rows.projectList,
      data.projectList.map(({ id, deadlineDate, ...entry }, position) => ({
        ...entry,
        deadlineDate: deadlineDate
          ? new Date(`${deadlineDate}T00:00:00Z`)
          : null,
        key: id,
        workspaceId,
        position,
      })),
    )
    const sectionChanges = getEntryChanges(
      rows.sectionList,
      data.sectionList.map(({ id, projectId, ...entry }, position) => ({
        ...entry,
        key: id,
        projectKey: projectId,
        workspaceId,
        position,
      })),
    )
    const taskChanges = getEntryChanges(
      rows.taskList,
      data.taskList.map(
        (
          {
            id,
            projectId,
            sectionId,
            subtasks: _steps,
            createdAt,
            completedAt,
            plannedDate,
            deadlineDate,
            ...entry
          },
          position,
        ) => ({
          ...entry,
          key: id,
          workspaceId,
          position,
          projectKey: projectId,
          sectionKey: sectionId,
          plannedDate: plannedDate
            ? new Date(`${plannedDate}T00:00:00Z`)
            : null,
          deadlineDate: deadlineDate
            ? new Date(`${deadlineDate}T00:00:00Z`)
            : null,
          createdAt: new Date(createdAt),
          completedAt: completedAt ? new Date(completedAt) : null,
        }),
      ),
    )
    const stepChanges = getEntryChanges(
      rows.stepList,
      data.taskList.flatMap((task) =>
        task.subtasks.map(({ id, ...step }, position) => ({
          ...step,
          workspaceId,
          taskKey: task.id,
          key: id,
          position,
        })),
      ),
    )
    if (stepChanges.deletedIdList.length)
      await tx.taskSubtask.deleteMany({
        where: { id: { in: stepChanges.deletedIdList } },
      })
    if (taskChanges.deletedIdList.length)
      await tx.task.deleteMany({
        where: { id: { in: taskChanges.deletedIdList } },
      })
    if (sectionChanges.deletedIdList.length)
      await tx.taskSection.deleteMany({
        where: { id: { in: sectionChanges.deletedIdList } },
      })
    if (projectChanges.deletedIdList.length)
      await tx.taskProject.deleteMany({
        where: { id: { in: projectChanges.deletedIdList } },
      })
    if (projectChanges.addedList.length)
      await tx.taskProject.createMany({ data: projectChanges.addedList })
    if (sectionChanges.addedList.length)
      await tx.taskSection.createMany({ data: sectionChanges.addedList })
    if (taskChanges.addedList.length)
      await tx.task.createMany({ data: taskChanges.addedList })

    // 步骤允许跨多个任务批量导入，分批避免超过 PostgreSQL 参数数量上限。
    for (let offset = 0; offset < stepChanges.addedList.length; offset += 1000)
      await tx.taskSubtask.createMany({
        data: stepChanges.addedList.slice(offset, offset + 1000),
      })
    for (const change of projectChanges.updatedList)
      await tx.taskProject.update({
        where: { id: change.id },
        data: change.values,
      })
    for (const change of sectionChanges.updatedList)
      await tx.taskSection.update({
        where: { id: change.id },
        data: change.values,
      })
    for (const change of taskChanges.updatedList)
      await tx.task.update({ where: { id: change.id }, data: change.values })
    for (const change of stepChanges.updatedList)
      await tx.taskSubtask.update({
        where: { id: change.id },
        data: change.values,
      })
    const revision = input.revision + 1
    return { revision, data }
  })

export { getTaskPlanner, saveTaskPlanner }
