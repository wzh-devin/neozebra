# Neozebra

个人工作台，包含 Dashboard、Inbox、Task 与 Drive，使用 pnpm monorepo。

`apps/web` 是前端；`apps/server` 是 Hono / Node API 网关，承载默认菜单后端；`packages/assets` 是独立的 Assets 菜单组后端模块，后续 Drive 业务放在该模块内。其他非默认菜单组按组增加 workspace 包。

```bash
pnpm install
pnpm dev          # 同时启动前端和后端（Node 22.18+）
pnpm dev:web      # 单独启动前端
pnpm dev:server   # 单独启动后端
pnpm db:migrate  # 复用现有 PostgreSQL / Redis，配置见 apps/server/.env.example
pnpm test:server
pnpm test:inbox   # 真实 PostgreSQL / Redis 集成检查
pnpm format:check
pnpm lint
pnpm build       # 按依赖顺序构建全部 workspace
```

前端开发服务器将 `/api` 转发到 `http://127.0.0.1:3000`。Inbox 已接入 Gmail / QQ IMAP、多账号聚合和 PostgreSQL 持久化；Redis 管理同步锁与节流。真实邮箱需先在页面填写 Google 应用专用密码或 QQ 授权码。Task 已接入 PostgreSQL 持久化、事务与版本保护，初始计划为空，所有日期字段使用 TIMESTAMPTZ。其他业务保留现有 local mock。

目录与扩展方式见 [Web 说明](apps/web/README.md)、[Server 说明](apps/server/README.md)，开发约束见 [AGENTS.md](AGENTS.md)。
