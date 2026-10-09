import { z } from 'zod'

const keySchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !value.includes('\0'))
const titleSchema = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => value.trim().length > 0 && !value.includes('\0'))
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`)
    return (
      value.slice(0, 4) !== '0000' &&
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    )
  })
  .nullable()
const instantSchema = z.string().datetime({ offset: true })
const stepSchema = z
  .object({ id: keySchema, title: titleSchema(200), completed: z.boolean() })
  .strict()
const taskSchema = z
  .object({
    id: keySchema,
    title: titleSchema(200),
    description: z
      .string()
      .max(10000)
      .refine((value) => !value.includes('\0')),
    status: z.enum(['todo', 'inProgress', 'completed']),
    priority: z.enum(['high', 'medium', 'low']),
    plannedDate: dateSchema,
    deadlineDate: dateSchema,
    projectId: keySchema.nullable(),
    sectionId: keySchema.nullable(),
    labels: z.array(titleSchema(32)).max(20),
    estimateMinutes: z.number().int().min(1).max(1440).nullable(),
    isPinned: z.boolean(),
    subtasks: z.array(stepSchema).max(100),
    source: z
      .string()
      .max(200)
      .refine((value) => !value.includes('\0')),
    createdAt: instantSchema,
    completedAt: instantSchema.nullable(),
  })
  .strict()
const projectSchema = z
  .object({
    id: keySchema,
    name: titleSchema(80),
    description: z
      .string()
      .max(10000)
      .refine((value) => !value.includes('\0')),
    color: z.enum(['purple', 'blue', 'teal', 'green', 'amber', 'rose']),
    icon: z.enum(['code', 'sparkles', 'book', 'briefcase', 'leaf', 'rocket']),
    deadlineDate: dateSchema,
    archived: z.boolean(),
  })
  .strict()
const sectionSchema = z
  .object({ id: keySchema, projectId: keySchema, title: titleSchema(80) })
  .strict()
const plannerSchema = z
  .object({
    version: z.literal(1),
    taskList: z.array(taskSchema).max(1000),
    projectList: z.array(projectSchema).max(100),
    sectionList: z.array(sectionSchema).max(500),
  })
  .strict()
  .superRefine((data, context) => {
    const projectIdSet = new Set(data.projectList.map((project) => project.id))
    const sectionMap = new Map(
      data.sectionList.map((section) => [section.id, section.projectId]),
    )
    const isUnique = (list: { id: string }[]) =>
      new Set(list.map((entry) => entry.id)).size === list.length
    if (
      !isUnique(data.taskList) ||
      !isUnique(data.projectList) ||
      !isUnique(data.sectionList)
    )
      context.addIssue({ code: 'custom', message: '计划中存在重复标识。' })
    for (const section of data.sectionList)
      if (!projectIdSet.has(section.projectId))
        context.addIssue({ code: 'custom', message: '阶段所属项目不存在。' })
    for (const task of data.taskList) {
      if (
        (task.projectId !== null && !projectIdSet.has(task.projectId)) ||
        (task.sectionId !== null &&
          sectionMap.get(task.sectionId) !== task.projectId)
      )
        context.addIssue({
          code: 'custom',
          message: '任务的项目或阶段关联无效。',
        })
      if (
        !isUnique(task.subtasks) ||
        (task.status === 'completed'
          ? task.completedAt === null ||
            task.subtasks.some((step) => !step.completed)
          : task.completedAt !== null)
      )
        context.addIssue({
          code: 'custom',
          message: '任务完成状态或步骤标识无效。',
        })
    }
  })
const plannerSaveSchema = z
  .object({
    revision: z.number().int().min(0).max(2147483646),
    data: plannerSchema,
  })
  .strict()

type TaskPlannerDto = z.infer<typeof plannerSchema>
type TaskSaveDto = z.infer<typeof plannerSaveSchema>
type TaskEnv = { Variables: { owner: string } }

export { plannerSchema, plannerSaveSchema }
export type { TaskPlannerDto, TaskSaveDto, TaskEnv }
