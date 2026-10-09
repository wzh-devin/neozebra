import type { Context } from 'hono'
import { getDatabase } from '../../infrastructure/database/database-client.ts'
import {
  idSchema,
  filterSchema,
  qqSchema,
  gmailSchema,
  patchSchema,
  syncSchema,
  arrivalSchema,
} from '../../dto/inbox/inbox-dto.ts'
import type { InboxEnv } from '../../dto/inbox/inbox-dto.ts'
import {
  getMessagePage,
  getNewMessagePage,
  getPublicAccountList,
  getUnreadCount,
  deleteAccount,
  patchMessage,
  markAllRead,
} from '../../infrastructure/inbox/inbox-repository.ts'
import {
  connectImap,
  getMessage,
  syncMailboxList,
} from '../../infrastructure/inbox/inbox-service.ts'
import type { MailProvider } from '../../infrastructure/inbox/types.ts'

type InboxContext = Context<InboxEnv>

/**
 * 将已校验的 HTTP 请求交给邮件服务，并构建公开响应。
 *
 * @param 无参数
 * @returns Inbox 的 HTTP Controller；创建时不连接外部存储
 */
const createInboxController = () => {
  const listMessagesHandler = async (context: InboxContext) =>
    context.json(
      await getMessagePage(
        getDatabase(),
        context.get('owner'),
        filterSchema.parse(context.req.query()),
      ),
    )
  const listAccountsHandler = async (context: InboxContext) => {
    const db = getDatabase()
    const owner = context.get('owner')
    const [accountList, unreadCount] = await Promise.all([
      getPublicAccountList(db, owner),
      getUnreadCount(db, owner),
    ])
    return context.json({
      accountList: accountList.map((account) => ({
        ...account,
        id: account.id.toString(),
      })),
      unreadCount,
    })
  }
  const connectMailboxHandler = async (
    context: InboxContext,
    provider: MailProvider,
    schema: typeof qqSchema | typeof gmailSchema,
  ) => {
    const input = schema.parse(await context.req.json().catch(() => null))
    const account = await connectImap(
      getDatabase(),
      context.get('owner'),
      provider,
      input.email,
      input.password,
    )
    return context.json({ id: account.id.toString() }, 201)
  }
  const connectQqHandler = (context: InboxContext) =>
    connectMailboxHandler(context, 'qq', qqSchema)
  const connectGmailHandler = (context: InboxContext) =>
    connectMailboxHandler(context, 'gmail', gmailSchema)
  const deleteAccountHandler = async (context: InboxContext) => {
    await deleteAccount(
      getDatabase(),
      context.get('owner'),
      idSchema.parse(context.req.param('id')),
    )
    return context.json({ ok: true })
  }
  const syncHandler = async (context: InboxContext) => {
    const raw = await context.req.text()
    const input = syncSchema.parse(raw ? JSON.parse(raw) : {})
    return context.json({
      statusList: await syncMailboxList(
        getDatabase(),
        context.get('owner'),
        input.force,
      ),
    })
  }
  const listNewMessagesHandler = async (context: InboxContext) =>
    context.json(
      await getNewMessagePage(
        getDatabase(),
        context.get('owner'),
        arrivalSchema.parse(context.req.query()).after,
      ),
    )
  const getMessageHandler = async (context: InboxContext) =>
    context.json(
      await getMessage(
        getDatabase(),
        context.get('owner'),
        idSchema.parse(context.req.param('id')),
      ),
    )
  const patchMessageHandler = async (context: InboxContext) => {
    await patchMessage(
      getDatabase(),
      context.get('owner'),
      idSchema.parse(context.req.param('id')),
      patchSchema.parse(await context.req.json().catch(() => null)),
    )
    return context.json({ ok: true })
  }
  const readAllHandler = async (context: InboxContext) => {
    await markAllRead(getDatabase(), context.get('owner'))
    return context.json({ ok: true })
  }
  return {
    listMessagesHandler,
    listAccountsHandler,
    connectQqHandler,
    connectGmailHandler,
    deleteAccountHandler,
    syncHandler,
    listNewMessagesHandler,
    getMessageHandler,
    patchMessageHandler,
    readAllHandler,
  }
}

export { createInboxController }
