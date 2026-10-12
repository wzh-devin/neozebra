# Neozebra

个人工作台，包含 Dashboard、Inbox、Task 与 Drive，使用 pnpm monorepo。

`apps/web` 是前端；`apps/server` 是 Hono / Node API 网关，承载默认菜单后端；`packages/assets` 是独立的 Assets 菜单组后端模块，Drive 业务在该模块内。其他非默认菜单组按组增加 workspace 包。

```bash
pnpm install
pnpm dev          # 同时启动前端、后端与 Drive Worker（Node 22.18+）
pnpm dev:web      # 单独启动前端
pnpm dev:server   # 单独启动后端
pnpm dev:worker   # 单独启动 Drive 同步 Worker
pnpm db:baseline # 已有数据库首次接管，检查模型一致后登记基线
pnpm db:migrate  # 复用现有 PostgreSQL / Redis，配置见 apps/server/.env.example
pnpm test:server
pnpm test:inbox   # 真实 PostgreSQL / Redis 集成检查
pnpm format:check
pnpm lint
pnpm build       # 按依赖顺序构建全部 workspace
```

前端开发服务器将 `/api` 转发到 `http://127.0.0.1:3000`。Inbox 已接入 Gmail / QQ IMAP、多账号聚合和 PostgreSQL 持久化；Redis 管理同步锁与节流。真实邮箱需先在页面填写 Google 应用专用密码或 QQ 授权码。Task 已接入 PostgreSQL 持久化、事务与版本保护，初始计划为空，所有日期字段使用 TIMESTAMPTZ。其他业务保留现有 local mock。

目录与扩展方式见 [Web 说明](apps/web/README.md)、[Server 说明](apps/server/README.md)，开发约束见 [AGENTS.md](AGENTS.md)。

## Drive

Drive 支持多实例 MinIO、百度网盘与阿里云盘，连接配置通过 Prisma ORM 保存到 `nm_drive_connections`，凭据使用现有 `MAIL_ENCRYPTION_KEY` 在服务端加密。首次进入为空，不读取或导入旧浏览器 mock 配置。数据库迁移使用 `pnpm db:migrate`，现有 PostgreSQL、Redis 和 MinIO 可直接使用。

MinIO 直接使用用户填写的 HTTP(S) S3 endpoint，无需服务端地址白名单；地址可包含端口，不包含路径、查询参数或 URL 内嵌凭据。提供现有 Bucket、Access Key、Secret Key，可选择挂载对象前缀。百度与阿里云盘只通过官方账号授权登录绑定，前端不接收手动 Token。网关兑换、加密保存并自动续期令牌，编辑名称、根目录和阿里盘类型沿用已保存授权；更换账号使用 Reauthorize。MinIO 编辑时密钥留空保留已存值。

在两家开放平台创建具备文件读写权限的应用，把应用 ID/Secret 填入 `apps/server/.env` 的 `BAIDU_DRIVE_CLIENT_ID`、`BAIDU_DRIVE_CLIENT_SECRET`、`ALIYUN_DRIVE_CLIENT_ID`、`ALIYUN_DRIVE_CLIENT_SECRET`；不要在浏览器或仓库中保存应用密钥。官方登录页复用登录会话并由平台决定是否再次确认授权；撤销授权后需要重新绑定。

回调地址必须与开放平台登记值一致，以 `APP_ORIGIN` 为前缀。当前本地配置为：

- 百度：`http://localhost:5174/api/assets/drive/oauth/baidu/callback`
- 阿里：`http://localhost:5174/api/assets/drive/oauth/aliyun/callback`

部署时替换为实际前端域名；网关 `/api` 需在该域名下可访问。如果平台不允许本地回调，请使用已登记的 HTTPS 开发域名，并同步 `APP_ORIGIN`，不要混用 localhost 和 127.0.0.1。临时 state 绑定发起浏览器的签名 Cookie，Redis 保存10分钟并一次性消费；回调 Token 只在服务端处理，数据库结构不变。

授权接口为 `POST /api/assets/drive/oauth/:provider/start`（name/rootPath，阿里含 driveType；重绑包含 connectionId/revision）及 `GET /api/assets/drive/oauth/:provider/callback`。取消/过期/失败返回 Drive 的共享通知；失败不会用未验证凭据覆盖已有配置。协议参考[百度 OAuth](https://openauth.baidu.com/doc/doc.html)、[百度网盘官方 SDK](https://github.com/baidu-netdisk/baidu-drive-sdk-go)、[阿里云盘官方 SDK](https://alibaba.github.io/aliyunpan-ios-sdk/)。

百度和阿里云盘可分别绑定多个账号：通过 Connect provider 添加独立连接，授权时重新选择账号，使用 Account name 区分卡片。每张云盘卡片的插头按钮（Disconnect account）用于解绑所选账号；确认后仅移除该连接和已保存凭据，保留其他账号及远端文件。Configure account 修改当前连接，Reauthorize 更换它的登录账号。

现有目录、文件列表支持分页、当前目录搜索、强制刷新、上传下载、预览、新建目录、重命名、移动和删除。文件列表、目录树和搜索只读取 PostgreSQL 的 `nm_drive_entries` / `nm_drive_directories` 元数据快照。独立 BullMQ Worker 首次扫描根目录，再逐层同步子目录；正在浏览的目录每 60 秒、活跃连接下其他目录每 10 分钟更新，离开页面 150 秒后暂停周期扫描。每个任务最多扫描 10 页后续接，完整目录扫描成功才发布，失败保留上次快照。Redis 单连接锁串行化远端操作和凭据续期；数据库每 15 秒补偿漏投任务，授权失效停止自动重试。手动刷新提交高优先级任务；写操作更新已知元数据，再同步受影响目录。快照分页游标有效 5 分钟，失效后从第一页重载。删除连接只移除配置；删除远端文件需要确认，阿里云盘进入回收站，MinIO/百度按各自删除接口执行。

上传任务按关联账号展示在居中弹窗中，支持多文件、分片、断点续传、暂停/继续/取消/重试。应用不设固定单文件大小上限，每片最多8MiB，最多同时接收4片；网盘协议和实际磁盘空间限制仍适用。任务/确认片保存在PG，文件保存在 API/Worker共享的持久化 DRIVE_UPLOAD_DIRECTORY，完成或取消后清理，未完成任务7天过期。刷新未收齐文件需重新选择原文件；系统收齐后由后台上传到网盘，不依赖浏览器保持打开。文本预览上限 1 MiB，图片预览上限 50 MiB，PDF 无固定预览大小限制，PDF、音视频与下载经网关流式代理。HTML 文件仅作为文本预览。MinIO 目录移动先完整复制并核验，再删除源对象；部分失败会保留已复制对象，刷新后可检查两处文件。递归目录操作上限 10,000 个对象。

Drive API 位于 `/api/assets/drive/connections`；`GET/POST` 读取/创建连接，`PATCH/DELETE /:id` 编辑/移除连接；`GET /:id/entries?parent=root` 查询本地分页快照（含 sync 状态），`POST /:id/sync` 接收 `{parent:"root",mode:"activate"|"refresh"}` 续租或提交同步，`GET/POST /:id/uploads` 查询/创建账号上传任务，`PUT /:id/uploads/:uploadId/parts/:partNumber` 上传带SHA-256的分片，`POST /:id/uploads/:uploadId/complete` 入队后台传输，`PATCH /:id/uploads/:uploadId` 暂停/恢复/取消/重试，`POST /:id/folders` 新建目录，`PATCH/DELETE /:id/entries/:entryId` 文件操作，`GET /:id/entries/:entryId/content` 预览/下载（`download=1`）。写请求需要同源会话和匹配 `APP_ORIGIN` 的 Origin。

生产环境在 API 之外运行独立进程 `pnpm --filter @neozebra/server start:worker`；开发 `pnpm dev` 会一起启动，也可以用 `pnpm dev:worker` 单独运行。Worker 与 API 使用相同 `.env`，队列按数据库与 schema 隔离。Redis 建议启用持久化并使用 `noeviction`；Redis 队列丢失时，PG 中的同步状态仍可恢复。初次索引需要等待网盘扫描，文件内容仍按需从原网盘下载。

Office 文件预览的引擎部署、格式范围和共享存储配置见 [Office 预览部署](deploy/office/README.md)。
