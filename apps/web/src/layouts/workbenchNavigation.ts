import {
  Bot,
  ChartNoAxesColumnIncreasing,
  CircleDot,
  CircleHelp,
  FolderKanban,
  Inbox,
  MoreHorizontal,
  Target,
  WandSparkles,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react'

type NavigationItem = {
  id: string
  label: string
  icon: LucideIcon
  tone?: string
}

const mainNavigationList: NavigationItem[] = [
  { id: 'pulse', label: 'Pulse', icon: Zap },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'issues', label: 'My issues', icon: CircleHelp },
  { id: 'reviews', label: 'Reviews', icon: Workflow },
]

const workspaceNavigationList: NavigationItem[] = [
  { id: 'initiatives', label: 'Initiatives', icon: Target },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'more', label: 'More', icon: MoreHorizontal },
]

const favoriteNavigationList: NavigationItem[] = [
  {
    id: 'faster-launch',
    label: 'Faster app launch',
    icon: CircleDot,
    tone: 'yellow',
  },
  { id: 'agent-tasks', label: 'Agent tasks', icon: Bot, tone: 'blue' },
  {
    id: 'agent-insights',
    label: 'Agent Insights',
    icon: ChartNoAxesColumnIncreasing,
    tone: 'purple',
  },
  { id: 'ui-refresh', label: 'UI Refresh', icon: WandSparkles, tone: 'orange' },
]

export { favoriteNavigationList, mainNavigationList, workspaceNavigationList }
export type { NavigationItem }
