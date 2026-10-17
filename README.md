# Neozebra

个人工作台，包含 Dashboard、Inbox、Task 与私有文件库，使用 pnpm monorepo。

- `apps/web`：React / TypeScript 前端。
- `apps/server`：Hono / Node 统一 API 网关，管理 Inbox、Task 并转发 Vault 请求。
- `packages/assets/vault`：Go 文件库 API 与后台任务，使用 MinIO、PostgreSQL、Redis。
- `packages/database`：Node 业务的 Prisma 模型和历史迁移。

```bash
pnpm install
pnpm dev           # 前端、Node API、Go 文件库（Node 22+ / Go 1.26+）
pnpm dev:web
pnpm dev:server
pnpm dev:vault
pnpm format:check
pnpm lint
pnpm build
pnpm test:server
pnpm test:vault
pnpm test:vault:integration  # Docker 隔离真实 PG / Redis / MinIO
```

前端使用 `http://localhost:5174`，Node API 使用 `127.0.0.1:3000`，Go 服务使用 `127.0.0.1:3001`。开发代理和生产反向代理统一将 `/api/` 指向 apps/server；网关把 `/api/assets/vault/` 转发到内部 Go 模块。Go 端口只在私有网络或本机访问，可用 apps/server 的 `VAULT_API_TARGET` 指定内部地址。

文件库入口 `/assets/vault` 直接展示单个私有文件库，无网盘连接配置。支持文件树、分页搜索、新建文件夹、预览、移动、重命名、回收站和文件/文件夹分片上传。完整分片 SHA256 清单用于严格续传，直传 MinIO 后由 Go 流式验证并发布。

新服务配置与部署步骤见 [文件库说明](packages/assets/vault/README.md)。旧网盘数据不迁移；旧表清理是单独增量迁移，尚未在现有业务数据库执行。执行 `pnpm db:migrate` 将删除旧 `nm_drive_*` 表，先审查对应迁移；不会删除旧 MinIO 或其他网盘中的对象。

Inbox 配置与 API 见 [Node 后端](apps/server/README.md)。文件库使用统一多格式预览：Markdown/GFM、PDF.js、图片/媒体原生阅读；Word、旧/新 PPT、Excel 等由私有 kkFileView 提供，转换任务和缓存由 Go 管理。部署和默认地址见 [私有预览服务](deploy/preview/README.md)。无需独立文件库密码或签名密钥。

生产应用使用单一镜像 `ghcr.io/wzh-devin/neozebra:vX.Y.Z`，包含 Web、Node 网关和 Go Vault，支持 ARM64 / AMD64。只有推送指向 `main` 历史提交的 `vX.Y.Z` 标签才会构建发布；普通代码推送不触发。配置与命令见 [Docker 部署说明](deploy/production/README.md) 和 [发布工作流](.github/workflows/publish-image.yaml)。
