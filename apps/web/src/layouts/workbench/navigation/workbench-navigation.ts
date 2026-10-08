import {
  Boxes,
  HardDrive,
  Inbox,
  LayoutDashboard,
  ListChecks,
} from 'lucide-react'

import type {
  NavigationGroup,
  NavigationItem,
} from '@/layouts/workbench/navigation/types'

const primaryNavigationList: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
  },
  { id: 'inbox', label: 'Inbox', path: '/inbox', icon: Inbox },
  { id: 'task', label: 'Task', path: '/task', icon: ListChecks },
]

const navigationGroupList: NavigationGroup[] = [
  {
    id: 'assets',
    label: 'Assets',
    icon: Boxes,
    children: [
      { id: 'drive', label: 'Drive', path: '/assets/drive', icon: HardDrive },
    ],
  },
]

export { navigationGroupList, primaryNavigationList }
