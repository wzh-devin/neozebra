import { CircleAlert, HardDrive, Inbox, ListChecks } from 'lucide-react'
import type {
  DashboardActivity,
  DashboardSummaryItem,
} from '@/features/dashboard/types'

// Synthetic/local mock：保留既有概览内容，尚未汇总真实任务、消息和连接状态。
const summaryList: DashboardSummaryItem[] = [
  {
    label: 'Open tasks',
    value: '12',
    detail: '3 due today',
    icon: ListChecks,
    color: 'var(--project-purple)',
  },
  {
    label: 'Unread inbox',
    value: '7',
    detail: '2 need a reply',
    icon: Inbox,
    color: 'var(--project-teal)',
  },
  {
    label: 'At risk',
    value: '2',
    detail: 'Review this week',
    icon: CircleAlert,
    color: 'var(--project-amber)',
  },
]

const activityList: DashboardActivity[] = [
  {
    title: 'Design review moved to tomorrow',
    source: 'Tasks',
    time: '12 min ago',
    icon: ListChecks,
    color: 'var(--project-purple)',
  },
  {
    title: 'New message from the product team',
    source: 'Inbox',
    time: '38 min ago',
    icon: Inbox,
    color: 'var(--project-teal)',
  },
  {
    title: 'MinIO workspace connected',
    source: 'Vault',
    time: 'Yesterday',
    icon: HardDrive,
    color: 'var(--project-blue)',
  },
]

export { activityList, summaryList }
