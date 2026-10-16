# 私有文件预览服务

Go 保持文件、版本、任务和访问边界的控制权；kkFileView 只提供格式处理。Word/PPT 的 PDF 结果存到 MinIO，Excel 等专属阅读器通过 Go 代理。图片、音视频、Markdown、普通文本和原生 PDF 不依赖 kkFileView。

## 启动

```bash
docker compose -f deploy/preview/compose.yaml up -d --build
pnpm db:migrate:vault
pnpm dev
```

首次构建从官方 `v5.0.3` 源码归档构建，并校验固定 SHA-256；无需安装宿主机 Java/LibreOffice。构建应用 `office-lifecycle.patch`：尊重 `KK_OFFICE_HOME`，关闭上游启动时结束其他 Office 进程的逻辑，并明确禁止执行文档宏。归档和 Maven 依赖较大，首次构建需要能访问 GitHub、Maven Central 和上游列出的依赖仓库。预览服务只绑定 `127.0.0.1:8012`，包含 LibreOffice Writer/Calc/Impress、Noto CJK 和 Liberation 字体。商业字体没有打包，缺失字体会导致换行或排版变化。只暴露 Go 已集成的格式，CAD 等额外授权能力没有接入。

本机已经构建镜像后，日常启动直接复用镜像，不必再次下载源码和基础镜像：

```bash
docker compose -f deploy/preview/compose.yaml up -d --no-build
docker compose -f deploy/preview/compose.yaml ps
```

在 `packages/assets/vault/.env` 中使用以下地址（默认值相同）：

```dotenv
STORAGE_PREVIEW_URL=http://127.0.0.1:8012
STORAGE_PREVIEW_SOURCE_ORIGIN=http://host.docker.internal:3001
```

`STORAGE_PREVIEW_SOURCE_ORIGIN` 是预览容器回读 Go 的地址，必须能从容器内访问。Linux 上 loopback 监听通常无法经宿主机网关访问；生产部署请将 Go 与预览服务放在私有容器网络，并把源地址设为 Go 的服务名，`STORAGE_PREVIEW_TRUST_HOST` 同步设为该主机名。Go 面向外部的端口由网关限制，不能为预览直接将存储 API 暴露到公网。macOS Docker Desktop 的 `host.docker.internal` 可用于本地开发，仍需验证连接。

没有新管理员密码、独立登录或手工签名密钥。Go 在 Redis 中自动管理 30 分钟预览票据，源文件读取和每个代理子资源都检查源版本与回收站。原始文件始终通过原来的下载入口获取。

## 生命周期和边界

- `POST /api/assets/vault/entries/:id/preview`：创建或复用持久任务，`{"retry":true}` 手动重新生成。
- `GET /api/assets/vault/entries/:id/preview`：`queued/running/ready/failed`；准备完成后返回 `pdf` 或 `frame` 地址。
- 原文件与派生 PDF 均支持 HEAD/Range；关闭浏览器不取消已经进入后台的转换。
- 新上传的支持格式在发布时自动排队准备预览；旧文件首次打开时创建任务。预览使用独立 Worker，上传与清理不会等待转换完成。
- 单文件最大 100 MiB；转换请求最长 2 分钟，瞬时故障最多自动尝试 3 次。PDF 阅读器最多 2000 页。
- 表格最大 25 MiB、100 个工作表、50000 行、512 列和累计 500000 个单元格范围。复用引擎自带的 x-spreadsheet/SheetJS，只读显示保存的值；没有公式缓存时显示“无缓存值”，不执行宏或重新计算。CSV/TSV 支持 UTF-8、带 BOM 的 UTF-16 和 GBK/GB18030。
- 移动/改名保留同格式的版本缓存；源内容、格式或引擎版本变化使缓存失效。
- 回收站立即拒绝源文件和派生内容；永久清理删除应用持有的 MinIO PDF。引擎的本地工作缓存由专用卷定时清理，属于内部临时副本。
- 不执行文档宏或 HTML/Markdown 脚本。引擎页面使用不具有应用同源权限的 iframe 沙箱，外部资源受 CSP 限制。
- PDF 适合静态阅读，PPT 动画、复杂图表与字体可能与原应用有差异；Excel 不执行用户宏，复杂公式和缓存值需用代表文件验证。

服务停止不会阻断上传、下载或不依赖引擎的预览。处理失败时页面保留明确错误、重试和原文件下载。

## 验证范围

已用合成 DOC、DOCX、PPT、PPTX、XLS、XLSX、CSV、PDF 和 Markdown 文件验证真实预览，并检查桌面/390px 视口、中文、PDF 搜索/翻页、工作表切换、空文件与损坏文件。其他已分流格式（例如 EPUB、OFD、邮件、压缩包）沿用引擎能力，仍需要代表性文件验收；不承诺任意格式或与原应用完全一致的版式、Excel 图表与 PPT 动画。

本机已构建并部署运行镜像，容器健康检查、中文字体、Go 回读和 DOCX/PPT/PPTX/XLS/XLSX/CSV 真实链路验证通过。受当前镜像源 403 与传输中断影响，本次使用同一官方源码经本机 Java 21/Maven 构建的 JAR，再按 Dockerfile 的相同运行阶段封装；完整多阶段源码容器构建仍需网络恢复后验证。日常启动复用现有镜像，使用 `up -d --no-build`；重新构建源码前需要保证 Docker 镜像源和 Maven 依赖网络可用。Ubuntu 安装源已改为官方 HTTPS，并启用有限重试。

## 更新

`previewEngine` 和 Docker 源版本应同步更新；验收后更改引擎版本使旧产物失效。不要将 kkFileView 示例上传、管理接口或任意 URL 代理直接开放给浏览器。
