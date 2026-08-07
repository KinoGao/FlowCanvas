# AGENTS.md

本文档用于约束本项目中的 AI / 自动化开发行为。开发时优先遵循本文件，其次遵循用户当前消息。

## 1. 项目定位与对标

### 1.1 项目定位

- **FlowCanvas**（仓库名 `infinite-canvas`）是一款面向图片 / 视频创作的**开源工作台**。
- 核心形态：**无限画布 + 节点式工作流**。
- 用户场景：创作者在画布上编排节点、组合素材、批量生成内容，把画布当作可重排、可复用、可分享的创作空间。
- 部署形态：单实例、单机 / 单服务器使用，不强求多租户。

### 1.2 对标产品：LibTV

**LibTV**（https://www.liblib.tv/，由 LiblibAI 哩布哩布推出）定位是**一站式 AI 视频创作平台**。FlowCanvas 把 LibTV 视为最重要的对标参考，但**不复制其商业化能力**。

| LibTV 关键能力 | FlowCanvas 现状 / 规划 |
| --- | --- |
| 无限画布 + 节点连线 | ✅ 已实现（基于 LeaferJS） |
| 五大基础节点：文本 / 图片 / 视频 / 音频 / 脚本 | 🟡 文本 / 图片 / 视频 / 音频 已实现；**脚本节点是 v1 优先补齐项** |
| 9 宫格 / 25 宫格分镜、剧情推演、镜头聚焦、焦点编辑 | 🟡 通过 `/` 快捷功能逐步对齐 |
| 多模型集成（Seedance 2.0、可灵 3.0、Wan 2.6、Seedream 5.0 等） | ✅ 后台全局模型注册中心 + 后端代理；Seedance 2.0 走火山方舟 |
| 工作流打组 → 保存为模板 → 工具箱复用 | ⏳ v1 待办 |
| 时间轴视频合成（多片段拼接 + 音视频混合） | 🟡 已有视频合成弹窗雏形，需补齐时间轴交互 |
| Agent Skill / MCP（自然语言驱动创作） | ✅ 本地 Canvas Agent（Codex / Claude Code MCP） |
| 项目 / 画布 / 素材账号同步 | ✅ 后端账号工作区自动保存；WebDAV 作为独立可选通道保留 |
| 跨画布复制（带连线） | ⏳ v1 待办 |
| 社区、分享、积分、付费模型 | ❌ **不在 v1 范围**（FlowCanvas 是开源单机工具） |

**对齐原则**：

- 优先复刻 LibTV 已被验证有效的**创作流形态**（无限画布 + 节点工作流 + 工具面板），不发明新的核心形态。
- **不强求对齐 LibTV 的商业化能力**（积分、社区、付费模型、发布审核）——这些是平台属性，不属于 FlowCanvas v1。
- 文档、CHANGELOG、UI 文案里提到"待办"或"已实现"时，**对照上表判断是否过度承诺**。
- 引入与 LibTV 同名术语（如"脚本节点""工作流""工具箱"）时，**保持语义一致**，不要重新定义。

## 2. 技术栈（锁定，不要随意替换）

### 2.1 前端（`web/`）

| 类别 | 选型 | 版本 |
| --- | --- | --- |
| 构建 | Vite | 7 |
| 框架 | React + React DOM | 19 |
| 语言 | TypeScript | 5 |
| 画布 | LeaferJS（`leafer-ui`） | 2 |
| UI 库 | Ant Design + `@ant-design/icons` | 6 |
| 路由 | React Router | 7 |
| 状态 | Zustand（业务状态）+ TanStack Query（服务端状态） | 5 / 5 |
| 样式 | Tailwind CSS + `tw-animate-css` + `tailwind-merge` + `class-variance-authority` + `clsx` | 4 |
| 动效 | `motion`（Framer Motion 续作） | 12 |
| 代码编辑器 | `@uiw/react-codemirror` + `@codemirror/lang-json` | 4 / 6 |
| HTTP | `axios` | 1 |
| 工具库 | `lucide-react`（图标） / `nanoid`（ID） / `dayjs`（时间） / `fflate`（压缩） / `file-saver`（下载） / `copy-to-clipboard` | — |
| 持久化 | 后端账号工作区（正常业务）/ `localforage`（一次性旧数据迁移、WebDAV 缓存）/ `localStorage`（登录态、UI 偏好、会话锁等极小状态） | — |
| 包管理 | `pnpm`（`pnpm-lock.yaml`）或 `bun`（`bun.lock`），按个人习惯二选一 | — |

> 引入新依赖前先检查 `web/package.json` 是否已有同类；如需新增，优先挑已经在依赖图里的小工具。

### 2.2 后端（`backend/`）

| 类别 | 选型 | 版本 |
| --- | --- | --- |
| 框架 | Spring Boot | 3.4.3 |
| Web | `spring-boot-starter-web` + `spring-boot-starter-webflux` | — |
| 数据 | `spring-boot-starter-data-jpa` + Hibernate 6 | — |
| 方言 | `hibernate-community-dialects` | — |
| 数据库 | SQLite（`org.xerial:sqlite-jdbc`） | 3.47 |
| 运行时 | Java | 21 |
| 构建 | Maven（`spring-boot-maven-plugin`） | — |
| 包结构 | `controller / service / repository / entity / dto / config / middleware` | — |

数据库文件位置：`${DB_PATH:./data/app.db}`；端口：`${PORT:9801}`；鉴权码：`${AUTH_CODE}`。

### 2.3 本地代理（`canvas-agent/`，独立 npm 包 `@basketikun/canvas-agent`）

| 类别 | 选型 | 版本 |
| --- | --- | --- |
| 语言 | TypeScript | 5.8 |
| 运行时 | Node.js | ≥ 18 |
| 协议 | `@modelcontextprotocol/sdk`（同时提供 stdio MCP + HTTP token 服务） | 1 |
| Web | Express | 5 |
| CLI 桥接 | `@openai/codex`（Codex app-server stdio），预留 `claude -p --output-format stream-json` 适配 | — |
| 校验 | `zod` | 3 |
| 监听 | 默认 `127.0.0.1:17371`，首次连接时记录 Origin 绑定 | — |

发布：与仓库主版本号解耦，推送 `main` 后 GitHub Actions 自动发布到 npm（需 Secrets `NPM_TOKEN`）。

### 2.4 部署 / 基础设施

| 类别 | 选型 |
| --- | --- |
| 容器 | Docker（多阶段：`oven/bun:1.3.13` 构建前端 → `nginx:1.29-alpine` 托管） |
| 反向代理 | Nginx（前端端口 9800，SPA fallback + 静态资源长缓存） |
| 编排 | `docker-compose.yml`（远程镜像） / `docker-compose.local.yml`（本地构建） |
| 部署平台 | Render（`render.yaml` 已配）/ Vercel 兼容 |
| 端口约定 | 前端 9800 / 后端 9801 / Canvas Agent 17371 |

## 3. 目录结构与职责

```
FlowCanvas/
├── web/                  # Vite 前端 SPA
│   └── src/
│       ├── app/          # 路由 + 页面（(user) 分组）
│       │   └── (user)/
│       │       ├── canvas/    # 画布页面及节点实现
│       │       ├── image/     # 我的图片
│       │       ├── video/     # 我的视频
│       │       ├── prompts/   # 提示词库
│       │       ├── comfyui/   # ComfyUI 代理面板
│       │       └── assets/    # 素材
│       ├── components/       # 全局组件 + 跨页面 UI（含 layout/ ui/ prompts/）
│       ├── stores/           # Zustand 全局 store
│       ├── services/         # 网络与本地持久化服务
│       │   └── api/          # 后端 API 客户端（按域分文件：image / video / audio / prompts / comfyui / backend）
│       ├── hooks/            # 跨页面复用 hook
│       ├── lib/              # 工具函数 / 主题 / 模型适配（image-utils / seedream / seedance / zip 等）
│       ├── constant/         # 全局常量
│       ├── types/            # 共享类型
│       └── app/globals.css   # 全局 CSS（只放基础变量 / 重置 / 通用样式）
├── backend/              # Spring Boot 后端
│   └── src/main/java/com/infinitecanvas/backend/
│       ├── controller/    # AiProxy / ComfyUiProxy / Config / Health / Prompt / PublicImage / TemporaryUpload / WebDavProxy / Workflow
│       ├── service/       # Config / PublicImage / Workflow
│       ├── repository/    # JPA 数据访问
│       ├── entity/        # 实体 + 枚举
│       ├── dto/           # ApiResponse / ConfigResponse
│       ├── config/        # AppConfig
│       └── middleware/    # AuthFilter
├── canvas-agent/         # 本地 MCP + HTTP 代理（独立 npm 包）
├── data/                 # 运行时数据（SQLite + workflow + public-images）
├── docs/                 # 用户文档（content/docs/...）
├── AGENTS.md / README.md / CLA.md / SECURITY.md / VERSION / CHANGELOG.md
└── docker-compose*.yml / Dockerfile / nginx.conf / render.yaml
```

## 4. 基本原则

- 先读现有代码，再动手修改，优先沿用项目已有结构和写法。
- 写代码保持最少行数，能简单实现就不要引入复杂抽象。
- 标准格式、协议、解析、压缩、加密、日期等通用能力优先使用成熟稳定的库，不要手写底层实现，除非用户明确要求或项目已有实现必须沿用。
- 不要为了"兼容更多场景"写大量分支，只实现当前明确需要的功能。
- 项目尚未上线，不需要兼容旧数据；表结构或字段调整时直接按新设计修改，不写旧字段兼容、数据迁移兜底或删除旧表的清理逻辑，除非用户明确要求。
- 每次写完代码，不需要检查语法，不需要执行构建，用户会自己做。
- 不要改无关文件，不要顺手重构。
- 如果工作区已有用户改动，不要回滚，不要覆盖；只在必要范围内追加修改。
- 选型时**优先匹配第 2 节技术栈**，不要无理由引入 Vue、Svelte、Pinia、Redux、Next.js 等平行替代品。

## 5. 反复提醒沉淀

- 如果开发过程中总是遇到某个问题，或者用户反复提醒同一个注意事项，需要把该注意事项补充到本文件。
- 补充时写成明确、可执行的规则，避免只写模糊描述。
- 新规则应放到最相关的章节；找不到合适章节时放到"项目注意事项"。

## 6. 后端规范

- 后端使用 Java + Spring Boot + JPA + SQLite。
- `controller/` 只处理 HTTP 入参、调用 service、返回 `OK` / `Fail`。
- `service/` 放业务逻辑、默认值、校验、时间、ID、鉴权等处理。
- `repository/` 只做数据库访问和 JPA 查询。
- `entity/` 只定义数据结构、枚举和简单模型方法。
- 列表接口优先沿用分页和标签筛选方式。
- 业务接口保持 `{ code, data, msg }` 的响应结构（参考 `dto/ApiResponse`）。
- 新增数据表时同步更新 `docs/backend-database.md`。

## 7. 前端规范

- 前端使用 Vite、React、React Flow、React Router、TypeScript、Ant Design、Tailwind、Zustand。
- 编写 Ant Design 相关代码时，参考 https://ant.design/llms-full.txt 理解组件 API、示例和设计规范，并优先结合项目当前 antd 版本与既有写法。
- API 请求统一放在 `web/src/services/api/`。
- 全局或跨页面状态优先放在 `web/src/stores/`。
- 已经放在全局 store 或全局 hook 中的状态/动作，组件需要时直接使用对应 store/hook，不要为了"纯组件"层层透传 props；避免一个组件传递过多参数。
- 全局组件、全局常量、全局配置等全局性质的内容不要作为 props 或参数层层传递；哪里需要就在哪里直接从对应全局入口获取。
- 多个页面重复出现的 UI 副作用动作，例如复制文本并提示、下载并提示、统一确认弹窗，优先抽成 `web/src/hooks/` 下的全局 hook；不要放进 store，除非它确实是需要共享/订阅的状态。
- 画布相关状态和组件放在 `web/src/app/(user)/canvas/` 内部。
- 页面里只有一个主业务组件时直接写在 `page.tsx`，不要单独拆 `Manager` 组件再传一堆 props。
- 不要新增只做简单转发的组件，例如只 `return <X>{children}</X>` 或只换个名字透传 props；直接在使用处使用真实组件或把逻辑写进当前文件。
- 页面私有 hook 放在对应页面目录下，例如 `admin/assets/use-admin-assets.ts`；只有多个页面真实复用的 hook 才放到外层 `hooks/`。
- 管理后台页面私有组件放到各自页面目录的 `components/` 下，例如 `admin/assets/components/`、`admin/prompts/components/`；不要为了单页面使用放到 `admin/components/` 共享目录。
- 管理后台主题、背景、卡片阴影、表格配色等统一在 `web/src/lib/app-theme.ts`、`AppProviders` 或必要的全局 CSS 作用域中配置；页面私有组件不要自己写 `dark ? ...` 主题分支。
- 组件优先使用函数组件和现有 hooks，不新增大型状态管理方案。
- UI 图标优先使用 `lucide-react` 或项目已经使用的 Ant Design 图标。
- 页面文案保持中文。
- 不要在组件里堆太多无关逻辑；复杂逻辑优先抽成同目录工具函数或小组件。
- 样式优先由组件自己管理；组件私有样式优先使用 Tailwind className 或少量内联 style，不要为单个组件新增大量全局 CSS。
- 全局 CSS 只放基础变量、全局重置、跨页面通用样式和少量第三方组件必要覆盖；不要在 `globals.css` 堆页面私有样式。
- 代码尽量短小直接，少拆不必要组件，少做多层 props 传递，避免为了抽象堆出更多代码。
- 正常业务数据必须写入后端账号工作区，不得新增“本地浏览器保存模式”，也不得在后端失败时静默回退到 `localforage`。
- `localforage` 仅允许用于一次性旧数据迁移和 WebDAV 显式同步通道的传输缓存；`localStorage` 仅用于登录状态、UI 偏好、画布会话锁、Canvas Agent 设置等极小状态，不要保存业务列表、生成记录、图片、base64 或大 JSON。

## 8. 画布 UI 规范

- 做 canvas 前端 UI 时必须遵循当前画布主题。
- 优先使用 `canvasThemes`、`useThemeStore` 或 Ant Design `ConfigProvider` token。
- 不要硬编码黑白、stone、slate 等颜色导致浅色/深色主题不一致。
- 新增画布按钮、弹窗、浮层时，尽量复用已有工具栏、节点面板、Modal 的视觉风格。
- 画布顶部工具栏和状态信息优先采用极简扁平风格：无边框、无阴影、无胶囊背景，融入整体背景，弱化按钮感，仅保留轻微 hover 反馈，保持简洁现代、低视觉重量。
- 图片节点尺寸逻辑要尊重原始比例，除非功能明确要求自由变形。
- 批量生成、多图展示、助手面板等画布交互要尽量简洁，不要占用过多画布空间。
- 画布节点命名、连线行为、拖拽手势**与 LibTV 保持视觉一致**（特别是文本 / 图片 / 视频 / 音频节点的图标和默认尺寸），便于从 LibTV 迁移过来的用户上手。

## 9. 对齐 LibTV 的 v1 优先级（不要再讨论顺序）

| 序号 | 能力 | LibTV 对应 | 状态 |
| --- | --- | --- | --- |
| 1 | 无限画布 + 节点连线 | 画布 | ✅ 已实现 |
| 2 | 文本 / 图片 / 视频 / 音频 节点 | 五大基础节点 | ✅ 已实现 |
| 3 | 脚本节点 + 分镜表 | 脚本节点 | 🚧 优先（脚本工作台 + 分镜表视图 + 逐 beat 生成已实现） |
| 4 | `/` 快捷功能（九宫格、剧情推演、镜头聚焦、焦点编辑、四宫格、25 宫格连贯分镜等） | 图像 / 视频生成器快捷 | 🚧 优先（节点浮动菜单快捷分镜已实现：四宫格/九宫格/25宫格；镜头聚焦/焦点编辑待补） |
| 5 | 工作流打组 → 保存为模板 → 工具箱复用 | 创建工作流 | 🚧 项目内模板已实现（工具箱保存/插入节点组+连线），账号级模板持久化待补 |
| 6 | 时间轴视频合成（多片段拼接 + 音视频混合 + 快捷键） | 视频合成 | 🟡 雏形 / 待补齐 |
| 7 | 多模型切换面板（Seedance、可灵、Wan、Seedream 等 OpenAI 兼容） | 模型选择 | ✅ 基础完成 |
| 8 | 本地 Agent 入口 + Codex MCP | Agent Skill | ✅ 已实现 |
| 9 | 跨画布复制（带连线） | 跨画布复制 | ✅ 已实现（内存剪贴板跨画布实例共享） |
| 10 | 项目 / 画布 / 素材账号同步 | 自动保存 + 多端 | ✅ 后端账号工作区已实现，WebDAV 独立保留 |
| 11 | 工作流整组执行（一键重跑整组节点） | 整组执行 | 🟡 已实现待测试（打组/连通节点按连线拓扑序重跑，组操作条与节点悬浮工具栏均有入口） |
| 12 | `/` 快捷补全：镜头聚焦、焦点编辑、电影级光影矫正、角色三视图、画面推演（-3 秒后 / -5 秒前） | `/` 快捷功能 | 🟡 已实现待测试（图片节点浮动菜单「快捷功能」，以当前图为参考走图生图编辑） |
| 13 | 图像工具集：高清放大、扩图、局部重绘、擦除、抠图、裁剪、宫格切分、720° 全景、多角度生成、打光调节 | 图像生成器工具 | 🟡 已实现待测试（放大 / 裁剪 / 宫格切分 / 蒙版局部重绘（含 AI 擦除）/ 多角度 / 扩图 / 抠图 / 720° 全景 / 打光调节） |
| 14 | 风格库（分类浏览 + 关键词搜索 + 自定义风格模板） | 风格库 | 🟡 已实现待测试（图片节点风格库：6 大分类 31 项预设 + 跨分类关键词搜索 + 当前提示词保存为账号级自定义风格） |
| 15 | 摄像机控制（相机型号 / 镜头 / 焦距 / 光圈） | 写实生图相机参数 | 🟡 已实现待测试（图片节点 Composer「摄像机」弹层，参数转写为提示词片段） |
| 16 | 视频主体库（多图 / 视频建可复用主体，跨镜头角色一致性） | 主体库 | ⏳ 待办 |
| 17 | 运镜控制（20+ 预设运镜：推 / 拉 / 摇 / 俯仰 / 环绕 / 跟随等） | 运镜控制 | 🟡 已实现待测试（视频节点 Composer「运镜库」24 项预设，生成时追加运镜提示词） |
| 18 | 视频工具集：视频高清放大 + 补帧、视频解析（拆成分镜表）、视频剪辑快捷键 | 视频工具 | ⏳ 待办 |
| 19 | 时间轴完整交互：独立音频轨（BGM / 配音、静音开关）、I/O 出入点、方向键精剪 | 视频合成 | 🟡 雏形已有多片段拼接，交互待补齐（与第 6 项合并推进） |
| 20 | 音频生成（TTS 文本转语音 / 文本生成音乐） | 音频模型 | ⏳ 待办（音频节点已有，缺生成能力接入） |
| — | 画布分享链接（只读 / 可编辑，无角色体系） | 分享 | ⏳ 待办（见商业化成熟度清单 P1；实时协同以版本历史替代，已决策不做） |
| — | 团队实时协作、统一团队资产库 | 团队版 | ❌ 单机定位不做 |
| — | 积分、付费模型、社区、发布审核 | 商业化 | ❌ v1 不做 |

新增"对标 LibTV"的功能时，**先在本表登记**，避免重名但语义不一致。

## 10. 文档规范

- README 保持简洁，只放项目介绍、核心功能、快速开始和文档入口。
- `docs/index.md` 放给 AI 使用的文档索引，不要再放到 `docs/content/docs/` 内容目录里。
- 详细功能介绍写到 `docs/content/docs/overview/features.mdx`。
- 后续待办写到 `docs/content/docs/progress/todo.mdx`。
- 已实现但还需要用户测试确认的事项写到 `docs/content/docs/progress/pending-test.mdx`。
- `docs/content/docs/progress/pending-test.mdx` 用来记录这个版本实际做了哪些可测试变更；`CHANGELOG.md` 的 `Unreleased` 只保留对这些变更的版本级归纳，避免逐条照搬实现细节。
- 每次 todo 事项完成后，先从 `docs/content/docs/progress/todo.mdx` 移到 `docs/content/docs/progress/pending-test.mdx`，不要直接写进正式功能说明；用户确认测试通过后再更新 `docs/content/docs/overview/features.mdx`。
- 每次任务完成前，都要根据实际变更检查并更新 `docs/content/docs/progress/todo.mdx` 和 `docs/content/docs/progress/pending-test.mdx`；如果功能或待办没有变化，也要确认无需修改。
- 接口响应规则写到 `docs/content/docs/backend/api-response.mdx`。
- 数据库结构写到 `docs/content/docs/backend/backend-database.mdx`。
- 文档不要写过期日期；除非用户明确要求记录具体时间。
- LibTV 相关说明（无论在 README、CHANGELOG 还是 features 里）**只描述对标的能力本身**，不要把"积分 / 会员 / 发布"等商业化能力误写成已规划功能。

## 11. 发版本流程

- 发版本时，先把 `CHANGELOG.md` 的 `Unreleased` 变更整理成新的版本记录，并保留空的 `Unreleased` 标题。
- 按当前版本号提升一个版本，更新根目录 `VERSION`。
- 将当前未提交的代码全部提交到 Git。
- 提交完成后，给当前提交打最新版本号对应的 tag，例如 `v0.0.5`。
- 发版本流程中不要执行编译、测试或构建，除非用户明确要求。
- `canvas-agent` 独立发版，**不跟仓库主版本号绑定**；推送 `main` 后由 GitHub Actions 检查 npm 版本后自动 publish。

## 12. 项目注意事项

- 正常用户业务必须使用后端账号工作区：画布、素材、配置、媒体文件和生成记录均按账号保存；未登录、工作区加载中或后端不可用时应锁定用户页面，不得展示空白本地工作区或回退浏览器数据。
- 后台全局模型注册中心保存厂商地址、API Key、请求模型和能力配置；创作端只读取脱敏运行时模型目录，AI 请求经后端代理执行，不得把私有 API Key 下发到浏览器。
- WebDAV 保留为用户显式选择的独立保存/同步通道，不依赖后端账号工作区；`localforage` 在该通道中只承担缓存和传输职责。
- 浏览器中已有的旧画布、素材、媒体与旧配置只允许通过一次性迁移导入当前账号；迁移成功后以后端数据为权威，不做持续的本地与后端双向合并。
- Docker 静态资源路径目前仍是待办项，文档中不要过度承诺生产部署已经完全验证。
- **LibTV 的商业化能力（积分、会员、付费模型、发布社区、创作者激励）不在 FlowCanvas v1 范围**，不要把它写进待办或功能列表；如果用户在对话里提到"我们也要做积分"，先提醒这是 v1 之外的事。
- LibTV 官方主推的 Seedance 2.0 在本项目里**通过火山方舟 Agent Plan 接入**，不是直接对接即梦；写文档或文档截图时按这一条说，不要写成"对接字节即梦"。
- 现有 AGENTS.md 第 4 / 6 / 7 / 8 / 10 / 11 节内容基本沿用，只补强了第 1 / 2 / 3 / 9 / 12 节。

## 13. 提交规范

- **每次代码修改完成后，必须执行 `git commit` 提交**，不得把改动留在工作区跨任务或跨会话。
- 提交信息**必须使用中文**，说明本次修改了哪些地方（模块 + 改动内容），格式建议：
  - `fix: 修复 ComfyUI 代理未认证 SSRF（/view 公开路径限制 baseUrl）`
  - `feat: 画布工具箱模板切换为账号级 API`
  - `refactor(canvas): Slash 快捷分镜改为节点上方浮动菜单`
- 一次提交包含当前所有相关改动；若改动跨越多个独立主题（如安全修复 + UI 改造），可拆分为多个提交，每个提交说明一个主题。
- **每次修改完成、提交之前，必须验证本次修改通过且没有影响其他业务流转**：
  - 前端改动：运行类型检查（`tsc --noEmit`）无错误；涉及 UI 时检查深浅主题与画布交互是否正常。
  - 后端改动：运行编译（`mvn compile`）无错误；涉及鉴权 / 代理 / 接口的改动，回归验证相关业务链路（如登录、生成、上传、媒体加载）未被破坏。
  - 涉及共享模块（工具函数、store、鉴权过滤器、全局样式）的改动，额外确认调用方行为不变。
- 提交前运行 `git status` 与 `git diff` 检查：确认没有误提交无关文件（本地密钥、临时脚本、日志等）；未跟踪的临时产物不要 `git add -A` 盲目纳入。
- 若工作区存在与本次任务无关的他人改动（来自用户或其他 agent），**不强行回退**；提交前先向用户确认是否一并提交。
