import type { LucideIcon } from 'lucide-react'

type NavigationItem = {
  id: string
  label: string
  path: string
  icon: LucideIcon
}

type NavigationGroup = {
  id: string
  label: string
  icon: LucideIcon
  children: NavigationItem[]
}

export type { NavigationGroup, NavigationItem }
