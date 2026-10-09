import { addDays, buildTask } from '@/features/tasks/data/task-planner'
import type { TaskPlannerData } from '@/features/tasks/types'

/**
 * 生成 synthetic/local mock，只有主动选择示例时才加载。
 *
 * @param today - 当前日期
 * @returns 示例规划
 */
export const buildDemoPlannerData = (today: string): TaskPlannerData => ({
  version: 1,
  isDemo: true,
  projectList: [
    {
      id: 'neozebra',
      name: 'Neozebra MVP',
      description: '打造顺手的个人工作台，让想法有处安放，让计划落到每天。',
      color: 'purple',
      icon: 'code',
      deadlineDate: addDays(today, 14),
      archived: false,
    },
    {
      id: 'growth',
      name: '个人成长',
      description: '保持阅读、学习和记录，给长期目标留出时间。',
      color: 'teal',
      icon: 'book',
      deadlineDate: null,
      archived: false,
    },
  ],
  sectionList: [
    { id: 'design', projectId: 'neozebra', title: '需求与设计' },
    { id: 'build', projectId: 'neozebra', title: '开发与验证' },
    { id: 'learn', projectId: 'growth', title: '学习计划' },
  ],
  taskList: [
    {
      ...buildTask('确定 Task 的核心交互', 'neozebra', today, 'design'),
      id: 'task-1',
      description: '让记录、安排和完成任务都更顺手。',
      priority: 'high',
      isPinned: true,
      estimateMinutes: 45,
      labels: ['设计'],
      deadlineDate: addDays(today, 2),
      subtasks: [
        { id: 'step-1', title: '梳理每日规划流程', completed: true },
        { id: 'step-2', title: '验证手机上的交互', completed: false },
      ],
    },
    {
      ...buildTask('完成今天的一次阅读', 'growth', today, 'learn'),
      id: 'reading',
      isPinned: true,
      estimateMinutes: 30,
      labels: ['学习'],
      description: '留一点时间给长期成长。',
    },
    {
      ...buildTask('实现项目与阶段管理', 'neozebra', today, 'build'),
      id: 'task-2',
      status: 'inProgress',
      estimateMinutes: 90,
      source: 'Inbox',
      labels: ['开发'],
    },
    {
      ...buildTask('整理设计参考与素材', 'neozebra', today, 'design'),
      id: 'task-3',
      priority: 'low',
      source: 'Drive',
      estimateMinutes: 20,
    },
    {
      ...buildTask(
        '检查任务保存与恢复',
        'neozebra',
        addDays(today, 1),
        'build',
      ),
      id: 'verify',
      deadlineDate: addDays(today, 3),
      estimateMinutes: 40,
      labels: ['验证'],
    },
    {
      ...buildTask('列出下一周的学习计划', 'growth', null, 'learn'),
      id: 'week-plan',
      labels: ['规划'],
      estimateMinutes: 15,
    },
    {
      ...buildTask(
        '补齐项目目标说明',
        'neozebra',
        addDays(today, -1),
        'design',
      ),
      id: 'carryover',
      priority: 'high',
      deadlineDate: addDays(today, -1),
    },
    {
      ...buildTask('搭建个人工作台'),
      id: 'task-4',
      status: 'completed',
      plannedDate: today,
      completedAt: new Date().toISOString(),
    },
  ],
})
