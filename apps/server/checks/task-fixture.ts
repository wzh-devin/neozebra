import type { TaskPlannerDto } from '../src/dto/task/task-dto.ts'

// Synthetic/local mock，仅供 Task 契约、数据库和负载验证。
const buildTaskFixture = (count = 2): TaskPlannerDto => ({
  version: 1,
  projectList: [
    {
      id: 'project-local',
      name: '本地测试项目',
      description: '',
      color: 'purple',
      icon: 'code',
      deadlineDate: '2026-12-31',
      archived: false,
    },
  ],
  sectionList: [
    { id: 'section-local', projectId: 'project-local', title: '开发' },
  ],
  taskList: Array.from({ length: count }, (_, index) => ({
    id: `task-local-${index}`,
    title: `测试任务 ${index}`,
    description: 'Synthetic/local mock',
    status: 'todo',
    priority: 'medium',
    plannedDate: '2026-10-10',
    deadlineDate: '2026-10-12',
    projectId: 'project-local',
    sectionId: 'section-local',
    labels: ['测试'],
    estimateMinutes: 30,
    isPinned: false,
    source: 'Synthetic/local mock',
    createdAt: '2026-10-09T10:00:00.000Z',
    completedAt: null,
    subtasks: [
      { id: 'step-first', title: '第一步', completed: false },
      { id: 'step-second', title: '第二步', completed: false },
    ],
  })),
})

export { buildTaskFixture }
