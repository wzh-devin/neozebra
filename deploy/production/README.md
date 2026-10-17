# 生产镜像与 GitHub 发布

应用镜像统一为 `ghcr.io/wzh-devin/neozebra:vX.Y.Z`，同时包含 Web、Node API 网关和 Go Vault，支持 `linux/arm64`、`linux/amd64`。现有 PostgreSQL、Redis、MinIO 保持外部服务；Office 预览继续使用独立的 kkFileView 容器。

## 发布规则

`.github/workflows/publish-image.yaml` 只监听版本标签推送，不监听 `main` 推送、PR、Release 或手动触发。

1. 标签必须严格符合 `vX.Y.Z`，例如 `v1.2.3`；不接受预发布后缀或前导零。
2. 标签指向的提交必须已经位于远程 `main` 的历史中。未合并分支上的标签会在校验阶段失败，不构建、不发布镜像。
3. 校验成功后，Buildx 构建 ARM64 / AMD64，并将两种架构合并到同一个镜像标签。Git 标签 `v1.2.3` 对应 `ghcr.io/wzh-devin/neozebra:v1.2.3`，保留 `v`，不额外发布 `latest`。
4. 使用 GitHub 自带的 `GITHUB_TOKEN` 和 `packages: write` 发布到 GHCR，无需 Docker Hub 账号或额外 registry secret。Action 均固定到官方版本的完整 commit SHA。

先把代码提交或合并到 `main` 并推送，随后再打版本标签。例如（自行选择实际版本号）：

```bash
git switch main
git pull --ff-only origin main
git tag -a v1.2.3 -m 'Release v1.2.3'
git push origin v1.2.3
```

流程入口：[GitHub Actions](https://github.com/wzh-devin/neozebra/actions)。删除标签不会发布镜像；不要移动已经发布的版本标签。

## 配置线上

需要 Docker Engine、Compose v2，执行目录为仓库根目录。

```bash
cp deploy/production/.env.example deploy/production/.env
chmod 600 deploy/production/.env
```

填写 `.env`：

- `APP_IMAGE` 默认 `ghcr.io/wzh-devin/neozebra`，`IMAGE_TAG` 必须填实际发布的 `vX.Y.Z`。
- `APP_ORIGIN` 是浏览器访问的完整 HTTPS origin，不带尾部 `/` 或路径。
- PostgreSQL、Redis、MinIO 地址必须能从 Docker 访问，不能填写容器自身的 `127.0.0.1`。连接串的密码特殊字符需 URL 编码；Compose `.env` 中含 `$` 的值用单引号包裹。
- 已有库沿用原 `MAIL_ENCRYPTION_KEY`，否则已有邮箱凭据无法解密。新实例按模板生成一次并保存，不随版本更新更换。
- Vault 默认复用主数据库与 Redis，也可以填写独立 `STORAGE_DATABASE_URL`、`STORAGE_REDIS_URL`。保留原 schema、bucket 和对象。
- MinIO 内网地址和公网地址必须指向同一实例。浏览器使用公网地址签名直传，保留签名 Host/路径，并在已有 MinIO 配置允许 `APP_ORIGIN` 上传、下载、HEAD 及所需请求头的 CORS。桶保持私有。

GHCR 包若未公开，先使用拥有 `read:packages` 权限的凭据执行 `docker login ghcr.io`；如需匿名拉取，可在首次发布后将该镜像包设为 Public。

```bash
docker compose --env-file deploy/production/.env -f deploy/production/compose.yaml config --quiet
docker compose --env-file deploy/production/.env -f deploy/production/compose.yaml pull app
# 预览引擎沿用现有 Dockerfile，只在首次部署或引擎升级时构建。
docker compose --env-file deploy/production/.env -f deploy/production/compose.yaml build preview
```

预览首次构建需要 GitHub、Maven 与基础镜像网络，详见 [预览说明](../preview/README.md)。它不属于应用版本流水线，现有同版本镜像可直接复用。

## 显式数据库准备

应用启动不会自动迁移。先备份并审查 `packages/database/prisma/migrations`：其中已有迁移会删除旧 `nm_drive_*` 表并处理历史 Gmail 凭据，见 [Node 数据库说明](../../apps/server/README.md)。确认后再执行：

```bash
docker compose --env-file deploy/production/.env -f deploy/production/compose.yaml run --rm --no-deps app migrate
docker compose --env-file deploy/production/.env -f deploy/production/compose.yaml run --rm --no-deps app vault migrate
docker compose --env-file deploy/production/.env -f deploy/production/compose.yaml run --rm --no-deps app vault init-bucket
```

未纳入 Prisma 历史的旧库先核对 [baseline 条件](../../apps/server/README.md)，满足条件时才使用同一镜像的 `baseline` 命令，随后再审查迁移：

```bash
docker compose --env-file deploy/production/.env -f deploy/production/compose.yaml run --rm --no-deps app baseline
```

不对有业务数据的库执行 reset。`vault migrate` 只维护自身 schema，`vault init-bucket` 不覆盖已有对象，也不修改 MinIO 全局 CORS 或访问权限。迁移工具与应用在同一镜像，Prisma CLI 使用和客户端一致的固定版本。

## 启动与更新

```bash
docker compose --env-file deploy/production/.env -f deploy/production/compose.yaml up -d --no-build
docker compose --env-file deploy/production/.env -f deploy/production/compose.yaml ps
curl --fail http://127.0.0.1:8080/api/health
curl --fail http://127.0.0.1:8080/api/assets/vault/health
```

只有应用 `127.0.0.1:8080` 发布到宿主机。接到现有 HTTPS / 认证入口，保留浏览器 Origin；当前应用无独立登录，线上应使用已有访问控制。Node 网关在容器内 `127.0.0.1:3000`，Vault 的 `3001` 仅供容器内网和预览回读，不发布到公网。

Tini 负责进程回收，启动脚本管理 Nginx、Node、Go；任一服务退出都会停止其他服务并使应用容器退出，由 Docker 的重启策略恢复。SIGTERM 会转发给所有子服务，Compose 留出30秒退出时间。健康检查经过 Nginx → Node → Vault，并检查 PostgreSQL / Redis；MinIO 和 Office 转换仍需真实文件验收。

SPA 子路由刷新回退到 index，所有 API 保留网关 JSON 错误，流式请求、Range 和 HEAD 继续传递。外层代理也需配置满足上传和预览的请求体限制及超时。

更新时填写新的 `IMAGE_TAG`，`pull app` 后 `up -d --no-build`。回滚应用时改回上一版本标签；数据库迁移不会自动随镜像回滚。预览缓存位于 `preview-cache` 卷，原件和派生 PDF 位于既有 MinIO。

## 本地构建

根 `Dockerfile` 是应用唯一构建入口，pnpm 冻结锁文件安装，Go 交叉编译，运行阶段不复制前后端源文件、测试或 `.env`。

```bash
docker build -t neozebra:local .
docker buildx build --platform linux/amd64,linux/arm64 --load -t neozebra:local .
```

后一命令需要支持多架构加载的 Docker 镜像存储；普通单架构 Docker Engine 可在目标服务器构建，或用 `--push` 输出到有权限的镜像仓库。不要把仅 ARM64 的镜像直接放到 AMD64 服务器。

官方参考：[Docker 多架构 Actions](https://docs.docker.com/build/ci/github-actions/multi-platform/)、[GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)。
