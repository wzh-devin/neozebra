import type { InboxItem } from '@/features/inbox/types'

// Synthetic/local mock messages for the Inbox preview; no live mail account.
const inboxMockList: InboxItem[] = [
  {
    id: 'welcome',
    kind: 'notification',
    title: 'Welcome to Neozebra',
    summary: 'A quieter place for your messages, tasks, and files.',
    sender: 'Neozebra',
    receivedAt: '2d',
    read: true,
    archived: false,
    body: 'Your workspace starts here. Keep track of what needs your attention, turn plans into action, and find your files in one place.\n\nInbox brings email and workspace updates together. Select a message to read it here, mark it as read, or archive it when you are done.',
    resourceList: [
      {
        title: 'Make room for focused work',
        description: 'Review your personal workspace and the work ahead.',
        path: '/dashboard',
      },
      {
        title: 'Start with your tasks',
        description: 'Track the things you want to move forward.',
        path: '/task',
      },
      {
        title: 'Bring your files together',
        description: 'Browse Baidu Drive, Aliyun Drive, and MinIO.',
        path: '/assets/drive',
      },
    ],
  },
  {
    id: 'inbox-1',
    kind: 'email',
    title: 'Design review moved to tomorrow',
    summary: 'Can you confirm the revised checklist before the meeting?',
    sender: 'Maya Chen',
    receivedAt: '12 min ago',
    read: false,
    archived: false,
    body: 'The design review moved to tomorrow at 10:00. Please confirm the revised checklist before the meeting.',
  },
  {
    id: 'inbox-2',
    kind: 'notification',
    title: 'You were mentioned in Platform rollout',
    summary: 'Jordan added a note about the rollout checklist.',
    sender: 'Workspace activity',
    receivedAt: '38 min ago',
    read: false,
    archived: false,
    body: 'Jordan added a note about the rollout checklist and mentioned you for a follow-up.',
  },
  {
    id: 'inbox-3',
    kind: 'email',
    title: 'Re: Q3 launch notes',
    summary: 'The updated launch notes are ready for review.',
    sender: 'Alex Morgan',
    receivedAt: 'Yesterday',
    read: true,
    archived: false,
    body: 'The updated launch notes are ready for review. The latest document is attached to the thread.',
  },
  {
    id: 'inbox-4',
    kind: 'notification',
    title: 'Drive connection completed',
    summary: 'MinIO workspace is ready to browse.',
    sender: 'Drive',
    receivedAt: 'Yesterday',
    read: true,
    archived: true,
    body: 'The MinIO workspace connection completed successfully.',
  },
]

export { inboxMockList }
