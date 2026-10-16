# Vault 私有文件库

Go API 和 Worker 共用工程；PostgreSQL 保存稳定目录 ID、上传清单和持久任务，MinIO 保存不可变随机对象，Redis 连接纳入服务健康检查。目录及发布状态以 PostgreSQL 为准。业务表由 GORM 管理，位于专用 `STORAGE_SCHEMA`，遵守 PRJ-0001。

## 模块边界

`packages/assets/` 仅隔离菜单目录，不是 workspace。此处 Vault 是独立 Go 模块，对应页面 `/assets/vault` 与 API `/api/assets/vault`，包内不包含 TypeScript controller、编译配置或 HTML。

```text
packages/assets/vault/
├── cmd/vault/       # CLI 与进程装配
├── cmd/performance/ # synthetic 压测数据
├── controller/  # HTTP 参数、响应、流式传输
├── service/     # 文件事务、上传状态、预览任务、Worker
├── dto/         # 请求与响应类型、输入校验
├── model/       # GORM 持久模型
├── repository/  # 数据库连接、迁移与条目读取
├── config/      # 运行配置
├── apperror/    # 公开错误契约
├── server/      # HTTP 监听及关闭
├── tests/           # 单元、HTTP 与隔离集成检查
└── scripts/         # monorepo 启动与验证脚本
```

`.env` 已从原 apps/storage 原样迁至此处；`STORAGE_*` 配置名、默认 `neozebra_storage` schema、`nm_storage_*` 表名、对象键及浏览器 `nm-storage-active` 恢复记录继续保留，改名不触发数据迁移。旧页面 `/assets/storage/:folderId?` 重定向并保留目录。网关配置使用 `VAULT_API_TARGET`；前端资源（包括隔离表格模板）位于 apps/web 的 assets/vault 业务模块。

## 配置与启动

1. 复制 `.env.example` 为 `.env`，填写新的 PostgreSQL、Redis、MinIO 配置。本服务不读取旧 Drive 连接。
2. `pnpm db:migrate:vault` 显式创建/更新文件库 schema，只操作 Go 表，不删除旧 Drive 表。
3. `pnpm --filter @neozebra/vault vault:init` 创建独立私有 Bucket，不配置公开读策略。
4. `pnpm dev` 或 `pnpm dev:vault` 启动服务；生产产物 `packages/assets/vault/dist/vault` 读取进程环境变量。

进入文件库直接显示目录，不要求独立登录、管理员密码或手工生成文件库签名密钥。常规图片、媒体、文本和 PDF 无需转换引擎；Office 和表格预览使用私有 kkFileView。

`vault serve` 启动 API 和两个 Worker，`vault worker` 可独立消费。PG 租约、心跳和带所有者检查的事务协调消费者。SIGTERM 取消 Worker，未完成任务由租约到期后继续。

开发命令使用 `vault dev`：缺少数据库或 Redis 配置时，Go 保持监听并返回明确的 `SERVICE_NOT_CONFIGURED`（HTTP 503），文件库显示“尚未配置”，不阻断前端与 Node API。填写 `packages/assets/vault/.env` 后重启开发命令即可启用；不会自动连接旧 MinIO或执行迁移。已填写但无效的配置仍报错退出，正式 `serve`、`worker` 和迁移命令仍要求数据库与 Redis 配置。

浏览器直传需要 `STORAGE_MINIO_PUBLIC_ENDPOINT` 可访问，并保持签名 Host、协议和路径。生产使用 HTTPS；MinIO CORS 仅允许 `APP_ORIGIN`，允许 PUT/HEAD/GET 和 `x-amz-checksum-sha256` 请求头。专用服务可设置 `MINIO_API_CORS_ALLOW_ORIGIN`。为 Bucket 配置未完成 multipart 生命周期清理，周期至少 8 天，客户端任务有效期 7 天。

数据库账户只授权专用 schema，MinIO 账户只授权专用 Bucket 的对象和 multipart，Redis 使用受保护实例。API 错误包含 code/message/retryable/requestId，写请求检查 Origin；文件库不提供登录与会话鉴权，默认监听本机。如通过网关开放访问，访问控制由网关负责，不能把 Origin 校验当作用户鉴权。浏览器的所有 `/api/` 请求先进入 apps/server，由网关把 `/api/assets/vault/` 转发到此内部模块；Vite 和生产入口不直接代理 Go。

## 上传与目录

Worker 按 8 MiB 起的自适应分片计算完整 SHA256 清单，有界内存；两文件、每文件两分片并发。建立清单额外读取一次源文件。短期签名直传 MinIO 后，Go 对账实际分片大小和 ETag。complete 同事务写完成意图和 Job；后台完成 multipart、逐片验证真实内容，最后事务发布。最终校验额外读取整个对象，时间受 Go 到 MinIO 的带宽和磁盘影响。

刷新后恢复任务，未上传完需重新选择原文件并验证内容；浏览器关闭后尚未收到的字节无法继续上传。已提交 complete 的任务由后台继续，最终发布阶段不可取消。同名冲突明确报错，用户改名后重新上传，不自动覆盖。

移动和改名只更新 PG，对象键不变。命名空间短事务锁定文件库行，维护同名、循环和恢复约束；分片确认锁定任务，不持锁执行对象 I/O。分页游标绑定 revision，变更后要求重新加载。树和列表每次最多 100 项，继续分页按需加载。

原生文件夹选择只返回实际文件，空目录不会单独创建。回收站保留子树，恢复需选择有效目标并解决同名冲突。永久删除异步清理，失败持久重试；内部 tombstone 和上传历史保留，支持幂等及审计。

回收站以独立弹窗展示，Header 搜索图标打开筛选，清空图标需二次确认。`POST /api/assets/vault/trash/empty` 要求当前 `Origin` 及 JSON `{"confirm":true}`，在事务内以 100 条批次提交全部已删除条目的既有清理任务，不受搜索和分页限制；返回 `202 {"state":"purging","queuedCount":205}` 表示已入队，实际对象由 Worker 删除。重复请求不会重复排队，未删除或上传中的条目保持。

图片/音视频、Markdown/GFM、安全文本及 PDF.js 阅读不依赖转换服务。Word/PPT/Excel 等使用私有 kkFileView，Go 管理持久化任务、短期源票据、受控代理与 MinIO PDF 缓存；部署见 [私有预览服务](../../../deploy/preview/README.md)。新增预览表需要运行 `pnpm db:migrate:vault`；不修改原始文件。内容接口继续 HEAD/Range 和祖先回收站校验，旧 `/source/:id` 接口保持移除。

上传任务窗口提供文件名搜索、状态筛选和注册时间/文件大小排序。`GET /api/assets/vault/uploads` 接受 `search`、`status=all|active|paused|completed|failed|cancelled`、`sort=newest|oldest|size-desc|size-asc`；按完整历史查询，每页 10 条，返回与当前筛选绑定的 `nextCursor`。切换条件从第一页开始，传入上一次响应的游标继续加载，不自行解析游标。

文件树沿用原 Drive 的 Collapsible、ScrollArea 与菜单组件；树内容独立滚动，回收站固定在面板底部。文件树与列表都支持右键操作和拖动到目录，列表整行可拖动。键盘用户通过菜单“移动到”选择目标。

## 验证

`pnpm test:vault` 执行 race 检查；`pnpm test:vault:integration` 启动隔离 Docker PG/Redis/MinIO，使用随机 schema 与 synthetic 文件，结束后销毁容器。覆盖无登录/无 Cookie 文件操作、旧 Office 接口不可用、名称竞争、循环、游标、幂等、暂停、内容身份、分片确认、完成重启、损坏拒绝发布、零字节、取消、过期、Range/HEAD、回收站与递归清理。

未接入新生产 MinIO；用户提供配置后验证实际连通、CORS 和吞吐。旧 Drive DROP 迁移独立于此服务，未执行于用户数据库。
