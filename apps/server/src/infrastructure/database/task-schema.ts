import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import type { TaskPlannerDto } from '../../dto/task/task-dto.ts'

// 每张业务表使用独立的列实例；关联与业务唯一性由事务内代码维护。
const buildBaseColumns = () => ({
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})
const buildEntryColumns = () => ({
  ...buildBaseColumns(),
  workspaceId: bigint('workspace_id', { mode: 'bigint' }).notNull(),
  key: text('business_key').notNull(),
  position: integer('position').notNull(),
})
const taskWorkspaces = pgTable(
  'nm_task_workspaces',
  {
    ...buildBaseColumns(),
    ownerId: text('owner_id').notNull(),
    revision: integer('revision').default(0).notNull(),
  },
  (table) => [index('nm_task_workspaces_owner').on(table.ownerId)],
)
const taskProjects = pgTable(
  'nm_task_projects',
  {
    ...buildEntryColumns(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    color: text('color')
      .$type<TaskPlannerDto['projectList'][number]['color']>()
      .notNull(),
    icon: text('icon')
      .$type<TaskPlannerDto['projectList'][number]['icon']>()
      .notNull(),
    deadlineDate: timestamp('deadline_date', { withTimezone: true }),
    archived: boolean('archived').notNull(),
  },
  (table) => [
    index('nm_task_projects_workspace_key').on(table.workspaceId, table.key),
  ],
)
const taskSections = pgTable(
  'nm_task_sections',
  {
    ...buildEntryColumns(),
    projectKey: text('project_key').notNull(),
    title: text('title').notNull(),
  },
  (table) => [
    index('nm_task_sections_workspace_key').on(table.workspaceId, table.key),
  ],
)
const tasks = pgTable(
  'nm_tasks',
  {
    ...buildEntryColumns(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: text('status')
      .$type<TaskPlannerDto['taskList'][number]['status']>()
      .notNull(),
    priority: text('priority')
      .$type<TaskPlannerDto['taskList'][number]['priority']>()
      .notNull(),
    plannedDate: timestamp('planned_date', { withTimezone: true }),
    deadlineDate: timestamp('deadline_date', { withTimezone: true }),
    projectKey: text('project_key'),
    sectionKey: text('section_key'),
    labels: jsonb('labels').$type<string[]>().notNull(),
    estimateMinutes: integer('estimate_minutes'),
    isPinned: boolean('is_pinned').notNull(),
    source: text('source').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [index('nm_tasks_workspace_key').on(table.workspaceId, table.key)],
)
const taskSubtasks = pgTable(
  'nm_task_subtasks',
  {
    ...buildEntryColumns(),
    taskKey: text('task_key').notNull(),
    title: text('title').notNull(),
    completed: boolean('completed').notNull(),
  },
  (table) => [
    index('nm_task_subtasks_workspace_task_key').on(
      table.workspaceId,
      table.taskKey,
      table.key,
    ),
  ],
)

export { taskWorkspaces, taskProjects, taskSections, tasks, taskSubtasks }
