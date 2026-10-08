export type TaskStatus = 'todo' | 'inProgress' | 'completed'
export type TaskPriority = 'high' | 'medium' | 'low'
export type ProjectColor =
  'purple' | 'blue' | 'teal' | 'green' | 'amber' | 'rose'
export type ProjectIcon =
  'code' | 'sparkles' | 'book' | 'briefcase' | 'leaf' | 'rocket'
export type TaskSubtask = { id: string; title: string; completed: boolean }

export type TaskItem = {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  plannedDate: string | null
  deadlineDate: string | null
  projectId: string | null
  sectionId: string | null
  labels: string[]
  estimateMinutes: number | null
  isPinned: boolean
  subtasks: TaskSubtask[]
  source: string
  createdAt: string
  completedAt: string | null
}

export type TaskProject = {
  id: string
  name: string
  description: string
  color: ProjectColor
  icon: ProjectIcon
  deadlineDate: string | null
  archived: boolean
}
export type TaskSection = { id: string; projectId: string; title: string }
export type TaskPlannerData = {
  version: 1
  taskList: TaskItem[]
  projectList: TaskProject[]
  sectionList: TaskSection[]
  isDemo: boolean
}
