# Neozebra Web

React + TypeScript + Vite 前端，使用项目已有的 shadcn/ui、Radix、Tailwind 和 CSS Modules。

## 目录与职责

```text
src/
├── app/                         # 启动、Provider、路由装配
├── pages/                       # 按路由领域组织的页面组合
│   ├── dashboard/
│   ├── inbox/
│   ├── task/
│   ├── assets/drive/            # Drive 列表和 Provider 文件空间
│   └── initiatives/             # 现有页面，当前未注册路由
├── features/                    # 按业务领域维护组件、状态、数据和类型
│   ├── dashboard/
│   ├── inbox/
│   ├── drive/
│   │   └── components/
│   │       ├── providers/       # 存储连接列表
│   │       └── files/           # 文件空间与树
│   ├── tasks/
│   │   ├── components/
│   │   │   ├── collection/     # 清单、筛选、日期卡片
│   │   │   ├── projects/       # 项目概览、详情与标记
│   │   │   ├── items/          # 任务行、分组、步骤与快速新增
│   │   │   └── editors/        # 任务、项目、阶段和日期编辑
│   │   ├── hooks/              # 规划状态、路由与 Context
│   │   ├── data/               # 规则、存储适配、synthetic/local mock
│   │   ├── utils/              # 本领域的焦点恢复
│   │   └── styles/             # 多个任务组件共享的样式
│   └── initiatives/
├── layouts/workbench/           # 工作台外壳、侧栏与导航
├── components/
│   ├── ui/                     # 官方基础组件
│   └── shared/
│       ├── page-frame/         # 跨页面的标题栏和内容骨架
│       └── command-menu/       # 跨页面的快捷导航菜单
├── hooks/                       # 跨领域 hooks
├── lib/                         # 无业务归属的基础工具
└── styles/                      # token、基础规则、utility 的独立入口
```

页面只组合 feature 提供的公开能力。路由从 `pages/<domain>/index.ts` 导入页面；跨 feature 从各自 `index.ts` 导入，模块内部直接访问具体文件。公开出口只导出当前调用方需要的能力。

CSS Module 跟随组件放置，现有共享样式保持在所属业务模块中。Task 的 `TaskPageContent` 是组件组合入口，`TaskEmptyState` 在清单和项目中复用，二者保留在 Task 组件根目录。

Dashboard、Inbox、Drive 使用 synthetic/local mock 数据。Task 默认空计划，使用浏览器本地存储；目录迁移不改变路由、存储键或数据格式。

## 开发与检查

在仓库根目录执行：

```bash
pnpm dev
pnpm format:check
pnpm lint
pnpm build
```

任务规则检查：

```bash
node --experimental-strip-types --test apps/web/tests/task-planner.test.ts
```

`tests/*.browser.mjs` 导出接收 CUA 浏览器标签页的具名检查函数；通过浏览器运行验证导航和菜单，不修改任务数据。详细代码约束见仓库根目录 [AGENTS.md](../../AGENTS.md)。
