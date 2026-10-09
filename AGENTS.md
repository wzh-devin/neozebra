# Neozebra 项目规范

本文件适用于仓库内所有前端代码。新增或修改代码时必须遵守以下规则。

## 基本约束

- 未经用户明确要求，不启用多智能体协作。
- 不主动创建 Git worktree。
- 不主动创建 Git commit。提交必须等用户明确说明。
- 优先使用项目已有依赖、工具和组件。不要重复实现已有能力。
- 优先使用 shadcn/ui 官方组件、Radix UI 原语、项目已安装依赖和原生 HTML/CSS；只有现有方案无法表达产品特有视觉或行为时，才增加自定义实现。
- UI 交互、数据请求和外部副作用必须有明确的错误处理、空状态和加载状态。

## 组件化开发

- 页面、布局、业务功能和通用 UI 必须拆分为独立组件。
- 一个页面文件只负责组合该页面需要的布局和功能组件，默认只返回一个页面根组件。
- 页面组件不直接承载复杂数据处理、请求逻辑或大段视觉细节；这些逻辑应下沉到 feature、hook 或共享组件。
- 每个组件只负责一个清晰的视觉或业务职责。跨页面复用的组件放入 `components`，业务域专属组件放入对应 `features`。
- 不要为了未来可能复用而提前抽象。只有已经复用或职责明显独立时才抽取组件。
- shadcn/ui 生成的基础组件放在 `components/ui`，不得在其中加入具体业务逻辑。

## 函数规范

### 声明方式

- 具名函数统一使用 `const name = () => {}` 或带明确类型的箭头函数。
- 不新增 `function name() {}` 形式的具名函数。
- 多行 JSX 回调、事件回调和可复用逻辑必须提取为具名箭头函数，不要在 JSX 中堆叠复杂匿名函数。
- 简单的一行 `map`、`filter`、`sort` 回调可以保留内联形式。

### 文档注释

- 每个独立注释块或 `//` 注释前，与上方代码之间必须空一行；注释与所说明的函数或代码紧邻。
- 功能简单、参数和返回值含义明确的函数，可以使用简洁的 `//` 注释，不必编写 JSDoc。
- 复杂函数、组件和 hook 使用 JSDoc，包含描述、参数说明和返回值说明。`/**` 单独占一行，描述与 `@param` 之间空一行：

```ts
/**
 * 根据当前筛选条件返回可展示的 initiative 列表
 *
 * @param params - 筛选条件和原始数据
 * @returns 过滤后的 initiative 列表
 */
const getVisibleInitiativesList = (params: FilterParams): Initiative[] => {
  // ...
}
```

- 使用 JSDoc 时，无参数函数也必须说明参数栏为“无参数”。
- 使用 JSDoc 时，无返回值的函数使用 `@returns 无返回值`，并明确写出副作用（例如更新状态、触发通知或发起请求）。
- 组件函数同样需要 JSDoc，说明组件用途、参数和返回的 JSX。
- 复杂类型优先使用 TypeScript 类型，不要把重要参数写成 `any`。

### 命名方式

- 函数名使用 camelCase，并以动作或用途开头，例如 `get`、`build`、`format`、`render`、`update`、`handle`。
- 事件处理函数统一使用 `xxxHandler` 后缀，例如 `createInitiativeHandler`、`selectWorkspaceHandler`。
- 返回集合的函数使用与返回类型对应的后缀：
  - 数组或列表：`xxxList`
  - `Set`：`xxxSet`
  - `Map`：`xxxMap`
  - `Record` 或键值对象：`xxxRecord`
- 返回布尔值的函数使用 `isXxx`、`hasXxx`、`canXxx` 或 `shouldXxx`。
- React 属性和第三方库要求的命名遵循其公开 API，例如 `onClick`、`onOpenChange`，不要为了本规范强行改写外部 API。
- 组件使用 PascalCase；hook 使用 `useXxx`；类型和接口使用 PascalCase。

## 目录结构

前端代码统一放在 `apps/web/src` 下，采用按页面、业务域和共享能力分层的结构：

```text
apps/web/
├── public/                         # 不经过打包处理的静态文件
├── src/
│   ├── app/                        # 应用启动、路由、Provider、全局配置
│   │   ├── providers/              # Theme、Toast、Query 等 Provider
│   │   ├── router/                 # 路由定义
│   │   └── App.tsx                 # 应用根组件
│   ├── pages/                      # 按路由领域归组，只负责页面组合
│   │   ├── dashboard/              # Dashboard 页面与公开出口
│   │   ├── inbox/                  # Inbox 页面与公开出口
│   │   ├── task/                   # Task 页面与公开出口
│   │   ├── assets/
│   │   │   └── drive/              # Drive 列表与 Provider 页面
│   │   └── initiatives/            # initiatives 页面
│   ├── features/                   # 按业务域拆分的功能模块
│   │   └── initiatives/
│   │       ├── components/         # initiative 专属组件
│   │       ├── hooks/              # initiative 专属 hooks
│   │       ├── data/               # mock 数据和数据适配
│   │       ├── types.ts             # 业务类型
│   │       └── index.ts             # 对外导出
│   ├── components/
│   │   ├── ui/                     # shadcn/ui 组件，只放通用 UI
│   │   └── shared/                 # 跨 feature 复用的业务无关组件
│   ├── layouts/                    # 页面骨架和导航布局
│   │   └── workbench/              # 工作台外壳、侧栏与导航职责目录
│   ├── hooks/                      # 跨 feature 复用的 hooks
│   ├── services/                   # API、请求客户端和外部服务适配
│   │   └── mock/                   # 当前阶段的本地 mock 服务
│   ├── lib/                        # 无业务归属的工具、常量和配置
│   ├── types/                      # 跨业务域共享类型
│   ├── assets/                     # 需要经过构建处理的图片、字体等资源
│   ├── styles/                     # 分职责的全局样式入口和设计变量
│   │   ├── index.css               # 唯一全局样式入口，只负责导入
│   │   ├── tokens.css              # 设计 token 和 Tailwind 主题映射
│   │   ├── globals.css             # reset、基础元素和全局状态
│   │   └── utilities.css            # 少量跨模块复用 utility
│   └── main.tsx                    # 前端入口
├── package.json
└── vite.config.ts
```

### 依赖方向

- `pages` 按路由领域建立目录，不在根目录平铺不同领域的页面；同一领域的相关页面放在一起。
- 路由通过 `pages/<domain>/index.ts` 访问页面；页面通过对应 feature 的 `index.ts` 访问业务能力。
- `pages` 可以组合 `layouts`、`features` 和 `components/shared`。
- `features` 可以使用 `components/ui`、`components/shared`、`hooks`、`services`、`lib` 和 `types`。
- `components/ui` 不得依赖 `pages` 或具体 `features`。
- `layouts` 不得直接持有某个 feature 的业务数据；通过 children 或明确 props 接收内容。
- `services` 不得直接渲染 JSX；请求状态由 hook 或 feature 管理。
- 统一使用 `@/` 路径别名，避免跨层级 `../../` 导入。

## 文件和导出规范

- React 组件文件使用 PascalCase，例如 `InitiativeTable.tsx`。
- hook 文件使用 `useXxx.ts`，工具文件使用小写短横线或既有项目约定。
- 页面文件与路由名称保持一致，例如 `InitiativesPage.tsx`。
- 一个文件优先只导出一个主要组件、hook 或业务函数；多个相关类型可以一起导出。
- Feature 对外只通过 `index.ts` 暴露公开组件、hook 和类型，避免页面深入访问 feature 内部路径。
- Feature 内部组件按已经存在的职责归组，例如 Task 的 `collection`、`projects`、`items`、`editors`；内部直接导入具体文件，不经本 feature 的公开出口绕行。
- mock 数据必须标注为 synthetic/local mock，不得伪装成真实业务数据。

## 样式规范

- 严禁把整个应用、多个页面或多个业务域的样式全部写入一个 CSS 文件。单个全局样式文件超过一个清晰职责时，必须拆分。
- `src/styles/index.css` 只作为样式入口和导入编排文件，不承载大段页面或业务样式。
- 全局 CSS 统一按以下职责放置：
  - `src/styles/tokens.css`：颜色、字体、间距、圆角、层级、断点等设计 token，以及 Tailwind `@theme` 映射。
  - `src/styles/globals.css`：Tailwind 导入、基础 reset、`html/body/#root`、全局可访问性状态、选择文本和滚动条等基础规则。
  - `src/styles/utilities.css`：确实跨多个模块复用的少量 CSS utility；单个页面专用的 class 不得放这里。
- 页面和布局样式就近放置：
  - 页面专属样式放在 `pages/<domain>/<PageName>.module.css`。
  - 布局专属样式放在 `layouts/<layout>/<LayoutName>.module.css`，侧栏、导航等独立职责的样式与对应组件同目录。
  - feature 专属样式与组件就近放在 `features/<feature>/components/<responsibility>/<ComponentName>.module.css`，无需职责子目录的小模块直接放在 `components` 中；多个 feature 组件共享时才使用 `features/<feature>/styles/*.css`。
  - 跨业务复用组件的样式与组件同目录，优先使用 `<ComponentName>.module.css`。
- Tailwind class 适合少量局部布局和状态；重复、复杂或超过一行的视觉规则放入 CSS Module，避免在 JSX 中堆积超长 `className`。
- CSS Module 不得使用全局选择器污染其他模块；需要全局选择器时只能放在 `globals.css`，并说明作用范围。
- `components/ui` 中的 shadcn/ui 组件保持官方生成结构。主题覆盖写入 token 或上层组件样式，不把业务选择器塞进基础 UI 文件。
- 样式导入顺序固定为：`index.css` → `tokens.css` → `globals.css` → `utilities.css`；页面或组件的 CSS Module 由使用它的模块就近导入。
- 新增样式前先搜索已有 token、utility 和组件样式，优先复用，禁止为同一视觉规则创建重复变量或 class。

## 质量检查

完成代码后至少运行：

```bash
pnpm format:check
pnpm lint
pnpm build
```

修改 UI 后需要检查桌面和窄屏视口、键盘焦点、加载态、空态、错误态和核心交互。除非用户明确要求，不提交 Git 记录。
