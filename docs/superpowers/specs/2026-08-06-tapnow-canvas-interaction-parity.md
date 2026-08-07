# TapNow 画布交互对齐 — 设计文档（带视觉证据版）

> 日期：2026-08-06
> 状态：待审查
> 目标：为"画布交互优化（当前太丑）"提供**带真实视觉证据**的对齐依据。此前调研（tapnow-ui-research.md）只有特征级文字、无 CSS/图片/动图，无法落地；本文档以官网动图逐帧分析与文档行为契约补齐该缺口。

---

## 背景与问题

### 问题建模

用户诉求：画布交互"太丑陋"，需要优化。此前已有两轮调研产出（tapnow-ui-research.md / flowcanvas-ui-inventory.md），但存在三个执行缺口：

1. **视觉参考缺失**：tapnow-ui-research.md 自述"官方文档对视觉数值规格无记载，一律采用特征级描述"——只有形容词（极简扁平、低视觉重量），没有色值/尺寸/布局截图，无法指导落地。该文件还在 dddc8a6 中被删除，当前 HEAD 已不存在。
2. **行为参考缺失**：交互（拖拽、连线、悬浮反馈、动效）是时序行为，静态文字无法表达。官方文档实际用 **GIF 动图**演示交互（本次发现），此前调研未拆帧分析。
3. **dddc8a6 只改了"壳"**：上一轮"对标 TapNow 黑白风格"仅动了全局主题（灰阶/8px 圆角/顶部导航），画布内部交互（节点续创、连线、悬浮工具栏、空画布状态）未对齐——这是"依然丑陋"的直接原因。

### 影响面

`web/src/app/(user)/canvas/` 全部交互组件：canvas-node.tsx、leafer-canvas.tsx、canvas-node-hover-toolbar.tsx、canvas-node-prompt-panel.tsx、canvas-toolbar.tsx、canvas-context-menu.tsx、canvas-color-group-bar.tsx 等。谁被影响：所有画布用户（创作主路径）。

---

## 调研发现（真实视觉证据）

### 素材清单（本地已抓取，.rivet/scratch/tapnow-refs/）

| 素材 | 来源 | 内容 | 状态 |
|---|---|---|---|
| hero-shot.jpg 1920x1080 | www.tapnow.ai/zh | 项目工作台页：深色主题、左侧纯图标导航栏（无文字）、项目卡片网格（细边框+内阴影、标题在底部） | 已分析 |
| shot-create-node（GIF 173 帧/13.8s） | docs 认识节点与连接 | **节点创建全流程** | 已拆帧分析 |
| shot-connect-nodes（GIF 388 帧/31s） | docs 认识节点与连接 | **连线交互全流程** | 已拆帧分析 |
| shot-multi-ref（GIF 221 帧/17.7s） | docs 认识节点与连接 | 多节点同时引用 | 已拆帧 |
| shot-history / pin / search | docs 整理画布 | 历史找回 / Pin 标记 / 节点搜索 | 已下载 |
| shot-img-*（9 个 GIF） | docs 生成和编辑图片 | 图像 Toolbar 工具演示（九宫格/裁剪/多角度/重绘/扩图/标注/切分） | 已下载 |
| shot-agent-*（4 个 GIF） | docs 和 Agent 对话 | Agent 面板打开/选图/@引用/上传 | 已下载 |
| motion-slow/default.webp（510+90 帧） | www.tapnow.ai/agent-motion | 官网光标交互微动画 | 已拆帧 |

> 官方素材 URL 模式：`https://files.tapnow.media/api/conversation/storage/uploads/{uuid}?variant_name=high`（文档页 `_next/image` 代理后）。重抓脚本见 .rivet/scratch/tapnow-refs/ 下载记录。

### 画布界面视觉（来自 create-node GIF 首帧，深色主题）

```
┌────────────────────────────────────────────────────────────┐
│ 左上：项目名 "Antarctic research" + 保存状态 "Saving..."    │
│                                    右上：6495 + Community   │
├───┬────────────────────────────────────────────────────────┤
│左 │  空画布中央提示（白色文字）：                            │
│侧 │  "Double click the canvas to generate freely,           │
│工 │   or view templates."                                   │
│具 │  提示下方一排快捷生成按钮：                              │
│栏 │  [Text to Video][Change Background][First-frame to      │
│＋ │   Video][Audio to Video][Templates]                     │
│搜 │                                                        │
│索 │                                                        │
│…  │                                                        │
├───┴────────────────────────────────────────────────────────┤
│ 底部控制栏（播放/暂停等）                                    │
└────────────────────────────────────────────────────────────┘
```

### 节点与生成面板视觉（来自 create-node 中段帧 + connect-nodes 帧）

1. **图片节点 = 内容 + 生成器一体**：节点下方内嵌 Prompt 输入框 + 模型选择（Seedream 5.0 Pro）+ 比例（4:3）+ 质量（1K），示例提示词直接显示在输入框（"use this image as a reference, change into cartoon style"）。
2. **Composer 生成面板**（创建节点后浮出）：Quality 质量（1K/2K 两档胶囊）、Aspect Ratio 比例宫格（3:4 / 16:9 / 9:16 / 3:2 / 2:3 / 21:9 / 4:3 / T1 共 8 格）、Prompt 输入、模型选择、生成数量（1x）、"8"（批量数）。
3. 保存状态栏：左上角实时显示 "Saving..." → "Saved to cloud"。

### 行为契约（文档抓取 + 帧分析）

| # | 交互 | TapNow 行为 | FlowCanvas 现状 | 差距 |
|---|---|---|---|---|
| 1 | 节点续创 | **选中节点 → 两侧出现 `+` → 点击 → 选类型 → 新节点自动连线** | hover 工具栏（CanvasNodeHoverToolbar） | **范式不同**（TapNow 是"选中态可见"而非 hover） |
| 2 | 连线 | 从节点右侧连接点按住拖到目标节点；空白处松手无连线则类型不兼容 | leafer-canvas onConnectStart/End + ConnectionCreateMenu | 已有，对齐点：连线视觉 token 化 |
| 3 | 多节点引用 | Shift 选中 → **选区右侧 `+` 拖到空白** → 菜单选类型 → 全部连接 | 参考条 + 面板内 @ 提及 | 交互入口不同 |
| 4 | 图片 Toolbar | 单击节点 → **节点上方**浮出 Toolbar（hover 显名称）：裁剪/多角度/重绘/打光 + `···` 更多（扩图/擦除/标注/增强/调整像素/抠图/快速切分） | CanvasNodeHoverToolbar（快捷分镜+图片工具组，localStorage 自定义开关） | 能力已有，需核对视觉对齐 |
| 5 | `/` 快捷指令 | Prompt 输入框内 `/` 打开指令菜单（↑↓ 切换、Enter/Tab 选择、Esc 关闭），如"多机位九宫格"（无参考图时置灰） | ComposerQuickPrompts（面板内快捷提示词） | 入口不同（框内 `/` vs 面板按钮） |
| 6 | 空画布状态 | 中央提示语 + 快捷生成按钮组（文生视频/换背景/首帧生视频/音频生视频/模板） | **无**（仅右键/双击菜单） | **缺失** |
| 7 | Pin 标记 | 节点工具栏圆点按钮选色 → 节点显示色标 → 顶部同色 Pin 分组栏（hover 显数量、点击定位节点） | canvas-pin-utils + canvas-color-group-bar.tsx **已有** | 已具备，核对视觉 |
| 8 | 历史找回 | 左侧工具栏历史图标 → 面板按类型/日期 → 点击放回画布中央并选中 | CanvasGenerationHistoryModal（从节点 generationRuns 汇总） | 入口/形态不同 |
| 9 | 节点搜索 | 左侧搜索图标 / ⌘F → 输入 → 类型过滤 → ↑↓+Enter → 画布自动移动+短暂高亮 → Esc 清空/关闭 | canvas-search-panel.tsx 存在（行为待核） | 待核验 |
| 10 | Agent 面板 | 右下角图标 / ⌘J；输入框 `+` → "从画布中选择"（已选图自动加入上下文，显示在输入框上方）/ "上传附件"；框内 `@` 精确引用 | CanvasAssistantPanel 右侧抽屉（online/local 双模式） | 面板形态不同 |
| 11 | 保存状态 | 左上角实时 "Saving..." / "Saved to cloud" | **无**（gap-inventory P0-3 已登记缺失） | **缺失** |

### 硬编码颜色问题（flowcanvas-ui-inventory 登记，本次复核仍存在）

- leafer-edges.ts L7-L10：连线色 #78716c / #67e8f9 硬编码
- leafer-canvas.tsx L306-L333：连线选中/关联/hover 色硬编码
- canvas-node.tsx L621-L640：hover 工具栏深色胶囊 bg-[#1f1f1f]/95

---

## 方案对比

| 方案 | 核心选择 | 优势 | 代价 | 结论 |
|---|---|---|---|---|
| V1 全量复刻 | 把 11 项差距全部对齐（含 Agent 面板形态、历史入口） | 与 TapNow 观感一致 | 改动面大（涉及 Agent/历史/搜索多模块），超出"画布交互"范围 | **淘汰**（范围失控） |
| V2 交互核心对齐 | 只对齐画布核心交互：①节点两侧 `+` 续创 ②空画布中央提示+快捷生成 ③保存状态栏 ④连线/悬浮控件 token 化 ⑤Pin 视觉核对 | 精准命中"交互丑陋"痛点；改动集中在 canvas/ 目录；每项独立可验收 | 不动 Agent/历史/搜索（留后续） | **存活（推荐）** |
| V3 只做样式 | 仅 token 化硬编码色 + 微调间距圆角 | 最小改动 | 不解决"交互范式"问题（用户已明确：交互需要行为对齐，不是图片/样式） | **淘汰** |

---

## 最终方案（V2）

### 边界标定

**会碰**：`web/src/app/(user)/canvas/components/`（canvas-node.tsx、leafer-canvas.tsx、leafer-edges.ts、canvas-node-hover-toolbar.tsx、canvas-client-page.tsx、canvas-toolbar.tsx）、`web/src/lib/canvas-theme.ts`（如有新 token）。

**不改**：Agent 面板（CanvasAssistantPanel）、生成历史入口、搜索面板、director 3D、后端、docs 内容页（除非有文档规范要求）。

### 注入点（当前行为 → 改后行为 → 为什么安全）

1. **节点两侧 `+` 续创**（核心）：
   - 注入点：canvas-node.tsx 节点外壳 + leafer-canvas.tsx 选中态渲染。
   - 当前：节点 hover 时右上浮出工具栏。
   - 改后：节点**选中**时左右两侧中点显示 `+` 圆钮（视觉对齐 TapNow），点击弹出节点类型菜单（复用 ConnectionCreateMenu 菜单形态），创建后自动连线到该节点。
   - 为什么安全：续创本质 = "创建节点 + 自动连线"，两条路径（createCanvasNode / createCanvasConnection 工厂）均已存在，只加 UI 入口。
   - 交互冲突点：节点拖动/连线拖出与 `+` 按钮点击需要命中区隔离（`+` 约 20px 圆形，拖动判定阈值 >5px 起步）。

2. **空画布中央提示 + 快捷生成按钮组**：
   - 注入点：canvas-client-page.tsx（projectLoaded 且 nodes.length === 0 时渲染）。
   - 改后：中央显示"双击画布自由创作，或查看模板" + 一行快捷按钮（文生图/文生视频/首帧生视频/模板）——按 FlowCanvas 实际能力映射（不照抄 TapNow 文案，保持中文）；点击即调既有创建路径。
   - 为什么安全：纯新增空状态 UI，不影响非空画布；按钮复用 createCanvasNode 工厂。

3. **保存状态栏**（P0-3 补上）：
   - 注入点：CanvasTopBar 标题旁。
   - 改后：根据 project-store 保存状态显示 "保存中…" / "已保存"（debounce 300ms/500ms 链路已有，仅缺 UI 呈现）。
   - 为什么安全：只读现有 store 状态字段，无新状态源。

4. **连线/悬浮控件 token 化**：
   - 注入点：leafer-edges.ts、leafer-canvas.tsx 连线色常量 → canvasThemes 新增 `connection` token 组；canvas-node.tsx hover 工具栏深色 → theme token。
   - 为什么安全：纯视觉替换，行为不变；明暗主题一致性收益（AGENTS.md 第 8 节要求）。

5. **Pin 视觉核对**：canvas-color-group-bar 与 TapNow 顶部 Pin 栏对照（hover 显数量、点击定位），有差距则微调。

### 数据流（节点续创）

```
用户选中节点 A ──选中态──▶ A 左右出现 + 钮
点击右侧 + ──▶ 弹出类型菜单（复用 ConnectionCreateMenu 数据/样式）
选择类型 B ──▶ createCanvasNode(B, pos=A.right+offset) ──▶ createCanvasConnection(A, B)
                              │
                              └─▶ 持久化（既有 project-store 链路，300ms debounce）
```

### 先例引用

- 节点类型菜单：`ConnectionCreateMenu`（canvas-client-page.tsx L1386 附近 "Dropped on empty space → show create node menu"）——复用其菜单数据源与视觉。
- 自动连线：`createCanvasConnection` 工厂（canvas-node-generation.ts 同目录工具），视频合成等路径已用过"创建+连线"组合。
- 空状态提示：画布列表页/其他页面已有空状态 UI 写法可参考。
- 主题 token：canvasThemes 结构（canvas-theme.ts，4 组 token），新增 connection 组沿用现有风格。

---

## 风险与应对

| 风险 | 应对 |
|---|---|
| `+` 续创与拖拽/连线手势冲突（命中区） | 按钮只响应 click（不响应 drag 起点），拖动判定阈值优先；实现后实测拖拽不误触 |
| canvas-client-page.tsx 是 6498 行大文件、有历史改动记录 | 改动集中在新增空状态渲染块，不重构既有逻辑；diff 保持最小 |
| 连线 token 化影响现有明暗主题观感 | 默认值取当前硬编码色，先保证行为/观感不变，再微调 |
| 保存状态栏的 store 字段语义不确定 | 实施前读 project-store 确认状态字段（saving/saved/error），不确定则先打探针 |
| 素材在 .rivet/scratch 会被清理 | spec 已固化关键视觉结论（上文字描述+URL 模式），重抓成本低 |

---

## 下一步

用户审阅本 spec 后：
- 若确认 V2，调用 writing-plans 生成分波执行计划（建议波次：①token 化+保存状态 → ②空画布提示 → ③节点 `+` 续创 → ④Pin 核对）。
- 若用户提供 TapNow 录屏，补充动效时序（缓动/时长）后微调方案。
