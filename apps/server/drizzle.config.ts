import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  tablesFilter: [
    'nm_email_accounts',
    'nm_email_messages',
    'nm_task_workspaces',
    'nm_task_projects',
    'nm_task_sections',
    'nm_tasks',
    'nm_task_subtasks',
  ],
})
