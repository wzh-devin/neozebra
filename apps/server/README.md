# Neozebra Server

API 网关采用 Hono 与官方 Node 适配器，运行于 Node 22.18+。开发使用原生 TypeScript / watch，生产使用 tsc 编译后的 JavaScript。

## 目录与模块边界

参照 oh-my-harness 的 router / controller / dto / infrastructure 分层：

```text
apps/server/
├── checks/                     # Node 单元和 PostgreSQL / Redis 集成检查
└── src/
    ├── main.ts                 # 监听、启动与优雅关闭
    ├── app.ts                  # /api 网关、模块挂载、错误边界
    ├── router/                 # 路由注册、会话及同源保护
    │   ├── index.ts
    │   ├── health/
    │   └── inbox/
    ├── controller/             # 请求校验、调用服务、公开响应
    │   ├── health/
    │   └── inbox/
    ├── dto/inbox/              # 请求 schema 与类型
    └── infrastructure/
        ├── config/             # 环境校验
        ├── database/           # Prisma 连接、baseline 与迁移入口
        ├── security/           # AES-GCM 凭据加密
        └── inbox/              # 邮件服务、Repository、Gmail / QQ Provider
packages/assets/               # 菜单目录隔离，不是 workspace
└── vault/                     # Go 文件库模块（controller/service/dto/tests）
packages/database/              # 共享 Prisma 模型、生成类型和迁移
```

apps/server 是统一 API 网关：Inbox / Task 使用当前 Node 实现，`/api/assets/vault/*` 通过网关路由流式转发至 packages/assets/vault 的内部 Go 模块。`VAULT_API_TARGET` 默认 http://127.0.0.1:3001。所有开发与生产 `/api` 流量都进入此网关；Vault 的 Go 端口不直接作为外部入口，见 [文件库模块](../../packages/assets/vault/README.md)。

## PostgreSQL 与 Redis

复用已有中间件，不创建 Compose 或容器。集成检查在配置的 PostgreSQL 内创建随机独立 schema，结束后删除；Redis 只清理 synthetic 会话键。用户 apps/server/.env 配置保持不变。其他环境从 .env.example 配置连接串。

业务表统一以 nm_ 开头，包括 nm_email_accounts、nm_email_messages，以及 Task 的 nm_task_workspaces、nm_task_projects、nm_task_sections、nm_tasks、nm_task_subtasks。每表均有数据库自增的 BIGINT 主键 id，既有 identity 主键保持原样、TIMESTAMPTZ created_at / updated_at；其他日期字段也使用 TIMESTAMPTZ。Inbox API 将 bigint ID 序列化为十进制字符串，Task 保留现有 UUID 业务标识，数据库 bigint 主键仅用于内部存储。

模型不定义外键、枚举、CHECK 或业务唯一约束，只有主键和普通查询索引。账号去重使用 Redis 锁；邮件去重、关联删除通过事务与账号行锁执行；updated_at 由 Prisma @updatedAt 维护。所有业务读写使用 Prisma API，迁移文件由 Prisma Migrate 生成，业务代码不手写 SQL。relationMode=prisma 支持 Inbox 关系查询且不生成数据库外键；Task UUID 关联继续由代码维护。

Redis 键前缀为 neozebra:inbox:，用于连接节流、同步锁及同步节流。同步锁 120 秒过期，每 30 秒续期，只有持有者可以释放；自动同步成功和失败均节流 8 秒；手动 force 刷新绕过节流，保留同步锁。凭据使用 MAIL_ENCRYPTION_KEY 加密，密钥须为 64 位十六进制并持久保存；更换或丢失后需重新连接邮箱。邮件正文和 HTML/Markdown 格式存入 PostgreSQL，数据库备份应按邮件数据保护。

```bash
pnpm install                    # 自动生成 Prisma 客户端
pnpm db:migrate                 # 新空库初始化；已有库见下面 baseline 步骤
pnpm dev
pnpm test:server                 # 无需中间件的单元检查
pnpm test:inbox                  # 隔离 schema 的数据库 / Inbox / Task 集成检查
pnpm db:generate                # schema 变更后重新生成实体和查询类型
pnpm db:diff --name change      # 生成待审查迁移，不应用业务库迁移
pnpm format:check
pnpm lint
pnpm build
pnpm --filter @neozebra/server start
```

Prisma 模型与迁移在 packages/database/prisma，生成出口为 @neozebra/database；pnpm install 和 pnpm build 自动生成客户端。可以直接 import type { TaskProject, TaskProjectSelect, TaskProjectWhereInput } from '@neozebra/database'，或用 Prisma.TaskProjectGetPayload 推导选择字段/关联后的结果。业务 JSON（IMAP 游标）通过现有 Zod 校验。

既有数据库首次切换时运行：

```bash
pnpm db:baseline
pnpm db:migrate
```

db:baseline 先比较现有表与固定的原始八模型 baseline（migrations/0000_baseline/schema.prisma），差异为零才登记 0000_baseline 为已应用；它不会创建、重置或修改业务表。空库直接 db:migrate。缺少表、索引或字段的已有库会拒绝 baseline，需要先制定 Prisma 增量迁移，不能跳过差异。不要重复 baseline 已登记的数据库。

修改模型后重新 db:generate，使用 db:diff 生成并审查迁移，然后 db:migrate。db:diff 使用 Prisma migrate dev 的影子数据库，需要相应权限；发生 drift 或重置提示时停止，禁止 reset 有业务数据的库。已发布的 Prisma 迁移不要修改或重置。body_format 及既有正文缓存、整理状态保持。集成检查使用 synthetic 夹具，不执行真实 IMAP/云盘授权。

Gmail 的 OAuth 发起/回调、客户端配置和 Google SDK 已删除。共用业务表没有独立 OAuth 表或专用 token 列；credentials 只保存加密的 IMAP password，cursor 仅包含 uidValidity/uid。db:migrate 还会通过 ORM 清理旧 Gmail 凭据和游标，标记为需要应用密码重新绑定，保留邮箱 ID、邮件、已读与归档。清理幂等并比较凭据版本，避免覆盖同时重新绑定的账号。Gmail IMAP 的稳定 X-GM-MSGID 转为原 Gmail 邮件 ID，重连同步继续复用已有邮件；历史 .sql 迁移不重写。

默认后端 127.0.0.1:3000、前端 localhost:5174。APP_ORIGIN 必须和浏览器实际地址一致；修改后端端口时设置 API_GATEWAY_TARGET 以调整 Vite 代理。生产由反向代理将 /api 转发到 Node。SIGINT / SIGTERM 停止监听并等待请求，10 秒后关闭残留连接。

## Task 行为与接口

Task 保留现有任务、项目、阶段、步骤、排序、归档、日历及甘特图界面。首次访问为空计划，没有示例或种子数据；浏览器旧 localStorage 不再读取或自动导入，原文保留。保存成功后才更新界面并关闭编辑器；失败保留输入，最近一次完成、删除、排序或日期调整支持撤销。

GET `/api/task/planner` 返回 `{data, revision}`。PUT 同一路径接受该结构，在事务中通过 revision 条件更新取得工作区写锁并保存变化行，revision 不匹配返回 409 并保护已有数据。data 为 `{version:1, taskList:[], projectList:[], sectionList:[]}`，实体结构与前端 Task 类型一致。首次初始化使用 Redis `neozebra:task:init:` 锁；之后读取使用一致快照，关联和去重由代码维护。

计划/截止日期 API 保持 YYYY-MM-DD，后端按 UTC 午夜写入 TIMESTAMPTZ，并按 UTC 原日读取；createdAt/completedAt 使用 ISO 时间。请求最多 2 MiB、1000 个任务、100 个项目、500 个阶段，每任务最多 100 个步骤。独立签名 HttpOnly/SameSite cookie 识别个人工作区，写请求校验 APP_ORIGIN。清除 Task cookie 或更换浏览器会进入新的空工作区，目前没有登录及跨设备恢复。

执行 `pnpm db:migrate` 应用 Prisma Migrate 的待执行迁移。真实存储验证执行 `pnpm test:inbox`，包含 Task 事务与并发保存回归；夹具为 synthetic 专属会话，运行器创建并最终删除独立 schema。

## 邮箱连接

Gmail：为 Google 账号开启两步验证，在 [应用专用密码](https://myaccount.google.com/apppasswords) 创建 16 位密码。Inbox → Manage mailboxes 选择 Gmail，填写邮箱地址和应用专用密码（可直接粘贴带空格的密码）。服务端仅连接固定 imap.gmail.com:993 TLS 主机并以只读模式访问 INBOX。不要填写 Google 常规登录密码；部分组织账号或高级保护账号禁用应用密码，更改 Google 登录密码会撤销应用密码。

QQ / Foxmail：在 QQ 邮箱设置开启 IMAP 并生成授权码，在 Manage mailboxes 选择 QQ / Foxmail，填写邮箱地址和授权码。服务端仅连接固定 imap.qq.com:993 TLS 主机并以只读模式访问 INBOX。

参考：[Google 应用密码](https://support.google.com/accounts/answer/185833?hl=zh-Hans)、[Gmail IMAP](https://support.google.com/mail/answer/7126229?hl=zh-Hans)、[ImapFlow](https://imapflow.com/docs/api/imapflow-client/)、[Prisma baseline](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining)。

当前工作台以签名 HttpOnly cookie 识别邮箱所属会话，所有账号与邮件接口均校验所属会话；清除 cookie 或换浏览器需要重新连接。第一版适用于本地个人工作台，尚未引入用户登录及跨设备账号恢复。

## Inbox 行为与接口

多账号聚合、账号筛选、标题/发件人/摘要搜索、100 条游标分页、按需加载正文、已读/未读、归档/恢复、邮箱管理和断开确认均已接入持久化 API。首次同步每个邮箱最近 100 封 INBOX 邮件，后续两种邮箱都按 UID 增量同步；工作台页面可见时每 10 秒检查（Dashboard、Task 等路由也生效），手动同步等待上游查询和入库完成后重载列表。首次导入历史邮件静默；不在对应账号列表时，新邮件以共享 NotificationToaster 提示，点击 Open 打开对应账号邮件。关闭页面后不运行后台轮询；同步失败保留缓存并提示重试或重新绑定。

已读和归档仅维护 Neozebra 内状态。正文支持隔离 HTML 和 Markdown 渲染，HTML 经 DOMPurify 清理并受 sandbox/CSP 限制；Markdown 使用 react-markdown/GFM，原始 HTML 不执行。图片自动加载（包括 HTTP/HTTPS 远程图片和CID 内嵌图片），不附带页面 Referer；HTML 正文按内容高度展开，与阅读区共用滚动条。邮件头仅显示标题和发件信息，不重复正文摘要。原邮件超过 4 MiB 显示体积提示，文本最多 200,000 字符。当前不含发送/回复、附件下载、全历史回填或后台推送订阅。

| 路由                                 | 用途                                                     |
| ------------------------------------ | -------------------------------------------------------- |
| GET /api/health                      | 网关健康检查                                             |
| GET /api/inbox/accounts              | 所属账号、未读数、账号状态                               |
| POST /api/inbox/accounts/gmail       | 验证 Gmail IMAP 应用密码并连接                           |
| POST /api/inbox/accounts/qq          | 验证并连接 QQ / Foxmail                                  |
| DELETE /api/inbox/accounts/:id       | 断开并清理所属缓存                                       |
| GET /api/inbox/messages              | 聚合列表；tab、account、query、before 筛选               |
| GET /api/inbox/messages/new?after=ID | 新邮件ID游标；不传 after 只建立基线，返回 cursor/hasMore |
| GET /api/inbox/messages/:id          | 读取并缓存正文                                           |
| PATCH /api/inbox/messages/:id        | 更新本地 read / archived                                 |
| POST /api/inbox/read-all             | 所属非归档邮件全部已读                                   |
| POST /api/inbox/sync                 | 触发账号同步；可传 {force:true} 绕过自动节流             |

Inbox 接口不缓存，变更请求要求同源 Origin。输入错误返回 400，未知或跨会话对象返回 404，上游错误返回安全提示，配置/存储错误返回 503；凭据与连接串不返回前端。自动化检查使用隔离数据库和 synthetic fixtures，不读取私人邮件；Gmail / QQ 新邮件的真实投递延迟取决于上游。
