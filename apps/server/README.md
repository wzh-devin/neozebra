# Neozebra Server

API 网关采用 Hono 与官方 Node 适配器，运行于 Node 22.18+。开发使用原生 TypeScript / watch，生产使用 tsc 编译后的 JavaScript。

## 目录与模块边界

参照 oh-my-harness 的 router / controller / dto / infrastructure 分层：

```text
apps/server/
├── drizzle/                    # Drizzle Kit 生成的迁移及元数据
├── drizzle.config.ts
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
        ├── database/           # Drizzle 模型、连接与迁移入口
        ├── security/           # AES-GCM 凭据加密
        └── inbox/              # 邮件服务、Repository、Gmail / QQ Provider
packages/assets/src/            # 独立 Assets 菜单组后端
```

默认菜单后端按领域放在 apps/server。非默认菜单组各建一个 packages/<group> workspace，通过包的公开出口接入网关；Assets 内的 Drive 等业务继续放在同一组包中。开发通过 development 条件导入包源码，生产导入 dist，根构建自动按依赖顺序运行。

## PostgreSQL 与 Redis

复用已有中间件，不创建 Compose 或容器。开发验证已在项目独立的 neozebra_inbox 数据库/角色及现有 Redis 完成。用户当前 apps/server/.env 的 neozebra 数据库配置保持不变，增量迁移已执行成功。其他环境从 .env.example 配置连接串。

业务表统一以 nm_ 开头，目前为 nm_email_accounts、nm_email_messages。每表均有 bigint identity 主键 id、TIMESTAMPTZ created_at / updated_at。API 将 bigint ID 序列化为十进制字符串，前端不要转换为 Number。

模型不定义外键、枚举、CHECK 或业务唯一约束，只有主键和普通查询索引。账号去重使用 Redis 锁；邮件去重、关联删除通过事务与账号行锁执行；updated_at 由 Drizzle 更新逻辑维护。所有业务读写使用 Drizzle API，迁移文件由 Drizzle Kit 生成，代码中不手写 SQL。

Redis 键前缀为 neozebra:inbox:，用于连接节流、同步锁及同步节流。同步锁 120 秒过期，每 30 秒续期，只有持有者可以释放；自动同步成功和失败均节流 8 秒；手动 force 刷新绕过节流，保留同步锁。凭据使用 MAIL_ENCRYPTION_KEY 加密，密钥须为 64 位十六进制并持久保存；更换或丢失后需重新连接邮箱。邮件正文和 HTML/Markdown 格式存入 PostgreSQL，数据库备份应按邮件数据保护。

```bash
pnpm install
pnpm db:migrate
pnpm dev
pnpm test:server                 # 无需中间件的单元检查
pnpm test:inbox                  # 使用 .env 的真实 PostgreSQL / Redis 集成检查
pnpm --filter @neozebra/server db:generate
pnpm format:check
pnpm lint
pnpm build
pnpm --filter @neozebra/server start
```

修改模型后先生成、审查迁移，再执行 db:migrate。已发布迁移不要修改或重置；当前 0001 迁移仅新增可空 body_format，已有纯文本缓存和未展开 CID 的 HTML 缓存在下次阅读时重新解析，保留邮件和整理状态。集成检查使用 synthetic 夹具，仅清理本次拥有的记录和 Redis 键。

Gmail 的 OAuth 发起/回调、客户端配置和 Google SDK 已删除。共用业务表没有独立 OAuth 表或专用 token 列；credentials 只保存加密的 IMAP password，cursor 仅包含 uidValidity/uid。db:migrate 还会通过 ORM 清理旧 Gmail 凭据和游标，标记为需要应用密码重新绑定，保留邮箱 ID、邮件、已读与归档。清理幂等并比较凭据版本，避免覆盖同时重新绑定的账号。Gmail IMAP 的稳定 X-GM-MSGID 转为原 Gmail 邮件 ID，重连同步继续复用已有邮件；历史 .sql 迁移不重写。

默认后端 127.0.0.1:3000、前端 localhost:5174。APP_ORIGIN 必须和浏览器实际地址一致；修改后端端口时设置 API_GATEWAY_TARGET 以调整 Vite 代理。生产由反向代理将 /api 转发到 Node。SIGINT / SIGTERM 停止监听并等待请求，10 秒后关闭残留连接。

## 邮箱连接

Gmail：为 Google 账号开启两步验证，在 [应用专用密码](https://myaccount.google.com/apppasswords) 创建 16 位密码。Inbox → Manage mailboxes 选择 Gmail，填写邮箱地址和应用专用密码（可直接粘贴带空格的密码）。服务端仅连接固定 imap.gmail.com:993 TLS 主机并以只读模式访问 INBOX。不要填写 Google 常规登录密码；部分组织账号或高级保护账号禁用应用密码，更改 Google 登录密码会撤销应用密码。

QQ / Foxmail：在 QQ 邮箱设置开启 IMAP 并生成授权码，在 Manage mailboxes 选择 QQ / Foxmail，填写邮箱地址和授权码。服务端仅连接固定 imap.qq.com:993 TLS 主机并以只读模式访问 INBOX。

参考：[Google 应用密码](https://support.google.com/accounts/answer/185833?hl=zh-Hans)、[Gmail IMAP](https://support.google.com/mail/answer/7126229?hl=zh-Hans)、[ImapFlow](https://imapflow.com/docs/api/imapflow-client/)、[Drizzle 迁移](https://orm.drizzle.team/docs/drizzle-kit-generate)。

当前工作台以签名 HttpOnly cookie 识别邮箱所属会话，所有账号与邮件接口均校验所属会话；清除 cookie 或换浏览器需要重新连接。第一版适用于本地个人工作台，尚未引入用户登录及跨设备账号恢复。

## Inbox 行为与接口

多账号聚合、账号筛选、标题/发件人/摘要搜索、100 条游标分页、按需加载正文、已读/未读、归档/恢复、邮箱管理和断开确认均已接入持久化 API。首次同步每个邮箱最近 100 封 INBOX 邮件，后续两种邮箱都按 UID 增量同步；工作台页面可见时每 10 秒检查（Dashboard、Task 等路由也生效），手动同步等待上游查询和入库完成后重载列表。首次导入历史邮件静默；不在对应账号列表时，新邮件以共享 NotificationToaster 提示，点击 Open 打开对应账号邮件。关闭页面后不运行后台轮询；同步失败保留缓存并提示重试或重新绑定。

已读和归档仅维护 Neozebra 内状态。正文支持隔离 HTML 和 Markdown 渲染，HTML 经 DOMPurify 清理并受 sandbox/CSP 限制；Markdown 使用 react-markdown/GFM，原始 HTML 不执行。图片自动加载（包括 HTTP/HTTPS 远程图片和CID 内嵌图片），不附带页面 Referer；HTML 正文按内容高度展开，与阅读区共用滚动条。邮件头仅显示标题和发件信息，不重复正文摘要。原邮件超过 4 MiB 显示体积提示，文本最多 200,000 字符。当前不含发送/回复、附件下载、全历史回填或后台推送订阅。

| 路由                                 | 用途                                                     |
| ------------------------------------ | -------------------------------------------------------- |
| GET /api/health                      | 网关健康检查                                             |
| GET /api/assets/health               | Assets 模块健康检查                                      |
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
