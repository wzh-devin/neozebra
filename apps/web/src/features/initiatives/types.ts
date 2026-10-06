import type { LucideIcon } from 'lucide-react'

export type InitiativeStatus = 'active' | 'planned'
export type HealthStatus = 'onTrack' | 'atRisk' | 'offTrack'
export type ActivityStatus = 'up' | 'flat'
export type ActiveProjectTone = 'green' | 'yellow' | 'muted'

export type ActiveProjectStat = {
  value: string
  tone: ActiveProjectTone
}

export type InitiativeRow = {
  id: string
  name: string
  description?: string
  target: string
  status: InitiativeStatus
  health: HealthStatus
  projects: string
  activeProjects: ActiveProjectStat[]
  activity: ActivityStatus
  icon: LucideIcon
  iconTone: string
  children?: InitiativeRow[]
}
