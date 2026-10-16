import { navigationMessages } from './navigation.ts'
import { commonMessages } from './common.ts'
import { vaultMessages } from './vault.ts'
import { tasksMessages } from './tasks.ts'
import { inboxMessages } from './inbox.ts'
import { dashboardMessages } from './dashboard.ts'
import { initiativesMessages } from './initiatives.ts'
import { errorsMessages } from './errors.ts'

const messageList = Object.entries({
  ...navigationMessages,
  ...commonMessages,
  ...vaultMessages,
  ...tasksMessages,
  ...inboxMessages,
  ...dashboardMessages,
  ...initiativesMessages,
  ...errorsMessages,
})
export { messageList }
