import type { LucideIcon } from 'lucide-react'

type DashboardSummaryItem = {
  label: string
  value: string
  detail: string
  icon: LucideIcon
  color: string
}

type DashboardActivity = {
  title: string
  source: string
  time: string
  icon: LucideIcon
  color: string
}

export type { DashboardActivity, DashboardSummaryItem }
