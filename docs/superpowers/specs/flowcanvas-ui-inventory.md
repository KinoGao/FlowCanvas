# FlowCanvas 画布 UI 现状盘点（tapnow 复刻前置调研）

> 目的：为复刻 tapnow 的 UI 提供当前项目画布 UI 的权威现状清单。
> 盘点时间：2026-06（基于当前 worktree 源码）。
> 锚点纪律：本文所有 `file:line` 均经 read_file / grep 核实；无法核实的标注「待核实」。
> 覆盖范围：`web/src/app/(user)/canvas/`、`web/src/lib/canvas-theme.ts`、`web/src/lib/app-theme.ts`、`web/src/components/layout/`、`web/src/stores/use-theme-store.ts`。

---

## 1. 画布页面信息架构现状

### 1.1 路由与页面容器

| 文件 | 行号（已核实） | 职责 |
|---|---|---|
| `web/src/app/(user)/canvas/page.tsx` | — | 画布列表页（项目列表） |
| `web/src/app/(user)/canvas/[id]/page.tsx` | — | 单个画布路由页，加载后挂载 canvas-client-page |
| `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx` | L4725 起 `<main>` | 画布主工作台（6498 行大文件） |

canvas-client-page.tsx 是整个画布的唯一主组件，页内不拆 Manager 壳，直接在 `<main className="creative-os-shell relative flex h-full min-h-0 overflow-hidden">` 中按层叠顺序渲染全部浮层（L4725-L4763）：

```
main.creative-os-shell（背景 = theme.canvas.background，注入 --creative-* CSS 变量）
└─ section.creative-os-canvas（相对定位，flex-1）
   ├─ CanvasTopBar（项目标题栏，L4749）
   ├─ LeaferCanvas（画布核心容器，L4767 附近；children 内渲染全部 CanvasNode）
   ├─ 节点 Composer 浮动面板（dialogNode && composerPosition，z-[70]）
   ├─ DirectorStudio 3D 导演台浮层（z-[220]，lazy 加载 StoryAiDirectorDesk）
   ├─ CanvasAssetManagerPanel（资产管理面板）
   ├─ ConnectionCreateMenu（连线创建节点菜单）
   ├─ CanvasNodeHoverToolbar（节点悬浮快捷工具栏）
   ├─ CanvasToolbar（顶部工具栏）
   ├─ CanvasZoomControls（左下角缩放 + 小地图开关）
   ├─ CanvasNodeContextMenu（右键菜单）
   ├─ 图片编辑对话框（crop / mask / split / upscale / angle）
   ├─ 预览 Modal（图片详情 / 360 全景）
   ├─ CanvasWorkflowToolbox（工作流模板工具箱）
   └─ CanvasGenerationHistoryModal（生成历史）
└─ CanvasAssistantPanel（右侧助手抽屉，仅 projectLoaded && assistantMounted 时渲染）
```

顶部导航：`web/src/components/layout/app-top-nav.tsx` L13 `AppTopNav`，在 `/canvas/[id]` 路径（正则 `/^\/canvas\/[^/]+/`）下隐藏全局 header，画布内改用 `CanvasTopBar` 承担标题/返回/删除/新建职责（使用处 L4749、定义 L5625）。

### 1.2 各浮层/面板定位

| 面板 | 组件 | 位置与层级 | 备注 |
|---|---|---|---|
| 顶部工具栏 | `CanvasToolbar`（canvas-toolbar.tsx L41） | 画布顶部通栏 | 极简扁平、无边框阴影，按钮组用 `Divider`/`DividerBlock` 分组 |
| 节点悬浮工具栏 | `CanvasNodeHoverToolbar`（canvas-node-hover-toolbar.tsx L54） | 节点上方跟随视口变换定位 | 懒加载；含快捷分镜、图片工具组等 |
| 右侧助手面板 | `CanvasAssistantPanel`（canvas-assistant-panel.tsx L204） | `<main>` 直接子节点，右侧抽屉 | 支持 online/local agent 双模式 |
| 缩放控件 | `CanvasZoomControls`（canvas-zoom-controls.tsx L18） | 左下角 dock（`absolute bottom-4 left-4`） | 资产管理/小地图/重置/缩放百分比弹层 |
| 右键菜单 | `CanvasNodeContextMenu`（canvas-context-menu.tsx L11） | 全局 z-[80] | canvas/node/connection 三种 type |
| 工具箱 | `CanvasWorkflowToolbox`（canvas-workflow-toolbox.tsx L11） | antd Modal，宽 560 | 账号级模板保存/插入/删除 |
| 生成历史 | `CanvasGenerationHistoryModal` | antd Modal | 从节点 generationRuns 汇总 |

---

## 2. 节点视觉现状

### 2.1 节点类型（types.ts L20-L27，已核实）

```ts
export enum CanvasNodeType {
    Image = "image", Text = "text", Config = "config",
    ComfyUI = "comfyui", Video = "video", Audio = "audio", Group = "group",
}
```

注：Script / VideoComposition / Director / Panorama360 不是独立枚举，而是挂在 `metadata.canvasTool`（"script" | "videoComposition" | "director" | "panorama360"）上（types.ts L56）。

### 2.2 节点外壳（canvas-node.tsx）

- `CanvasNode` 为 `React.memo` 组件（canvas-node.tsx L165），带自定义比较器 `canvasNodePropsEqual`。
- 主题获取：`const theme = canvasThemes[useThemeStore((state) => state.theme)]`（L208，已核实）——每个节点独立订阅主题 store，非透传 props。
- 外壳样式（L467-L497，已核实）：
  - `background`: 非 editorManaged 时 Group 用 `theme.ui.controlFill`，有图/视频内容用 `rgba(14,14,14,.45)` 深色底（图片/视频容器需深底衬托），否则 `theme.node.panel`。
  - `borderColor`: 选中/连接目标/焦点相关 → `theme.ui.accent`；Group 子节点/普通态 → `theme.ui.hairline`。
  - `boxShadow`: 选中态 `0 0 0 2px ${theme.ui.accent}` + `theme.ui.shadow`；Group 选中 `0 0 0 2px ${theme.ui.accentSoft}`。
  - 选中态判定 `isActive = isConnectionTarget || isSelected || isFocusRelated`（L216，已核实）。
- 硬编码常量 `selectionBlue = "#0a84ff"`（L22）——与主题 accent 同值，但属硬编码副本，改主题 accent 时需同步。
- 节点 hover 时右上角浮出编辑工具栏（L621-L640）：`bg-[#1f1f1f]/95` 深色胶囊、`text-white/75`——此处**硬编码深色**，不走主题 token。

### 2.3 各类型节点内容渲染

| 渲染器 | 行号（已核实） | 视觉要点 |
|---|---|---|
| `ImageNodeContent` | canvas-node.tsx L1100 | 图片、批量根/子节点、加载态（`--canvas-generation-glow` 等 CSS 变量） |
| `VideoNodeContent` | canvas-node.tsx L1211 | 视频首帧 + 播放/静音控件 |
| `AudioNodeContent` | canvas-node.tsx L1420 | 音频波形占位 + 播放控件 |
| `ImageContent` | canvas-node.tsx L1434 | 图片主体 + 加载/错误占位 |
| `ImageInfoBar` | canvas-node.tsx L1519 | 图片尺寸/格式信息条 |
| `BatchFrame` | canvas-node.tsx L1533 | 批量节点包裹框（展开/折叠动画） |
| `ResizeHandle` | canvas-node.tsx L1561 | 四角缩放手柄 |
| `ConnectionHandleDot` | canvas-node.tsx L1583 | 连线锚点（左右两侧） |

空内容占位样式（L801-L838 附近）：居中 icon（`theme.toolbar.activeBg` 圆角块）+ 说明文字（`theme.node.placeholder`）+ 上传按钮（`theme.toolbar.itemHover`），背景 `theme.node.fill`。

### 2.4 节点编辑面板（canvas-node-prompt-panel.tsx）

- 主组件 `CanvasNodePromptPanel`（L75）——这是业务代码起点，import 区在前 40 行，锚点不指向 import。
- 子组件：`ComposerQuickPrompts`（L43 定义常量 `COMPOSER_QUICK_PROMPTS`）、`ImageComposer`（L373）、`VideoComposer`（L550）、`ComposerPopover`（L818）、`GenerationRunStrip`（L834）、`ComposerToolbarButton`（L899）、`ComposerOptionMenu`（L916）。
- 主题接入方式（交叉验证修正）：**主组件 `CanvasNodePromptPanel` 在 L80 组件内订阅主题**（`const theme = canvasThemes[useThemeStore((state) => state.theme)]`），与节点外壳（canvas-node.tsx L208）同模式；**子组件**（ComposerQuickPrompts L51、ImageComposer/VideoComposer L357/L535、GenerationRunStrip L834 等）通过 props 接收 `theme: (typeof canvasThemes)[keyof typeof canvasThemes]`——子组件是显式传 theme，主组件是订阅 store。
- 支持模式：text / image / video / audio / comfyui，视频含风格预设（`VIDEO_STYLE_PRESETS`）与运镜预设。
- 面板弹出为节点旁 Composer 浮动层（canvas-client-page.tsx L4880 起，`{dialogNode && composerPosition && !isNodeDragging`），带滚动滞回与运行中滚动位置保持逻辑。

---

## 3. 主题体系

### 3.1 canvasThemes 结构（web/src/lib/canvas-theme.ts，共 83 行，已核实）

- L1 `CanvasColorTheme = "light" | "dark"`；L2 `CanvasBackgroundMode = "dots" | "lines" | "blank"`。
- L4 起 `canvasThemes` 常量，`as const` 收尾（L81），L83 导出 `CanvasTheme` 类型。
- 每个主题四组 token：

| 组 | light 区间 | dark 区间 | 主要 token |
|---|---|---|---|
| `canvas` | L6-L12 | L44-L50 | background、dot、line、selectionStroke、selectionFill |
| `node` | L13-L23 | L51-L61 | label、fill、panel、stroke、activeStroke、placeholder、text、muted、faint |
| `toolbar` | L24-L31 | L62-L69 | panel、border、item、itemHover、activeBg、activeText |
| `ui` | L32-L41 | L70-L79 | material、materialElevated、hairline、shadow、accent、accentSoft、controlFill、danger |

要点：`canvasThemes.light` 引用需覆盖 L5-L41（不只开头几行），dark 覆盖 L43-L79——上轮审查发现"只引用开头"的偏差，本次已按完整区间核实。

### 3.2 明暗切换（web/src/stores/use-theme-store.ts，共 19 行，已核实）

- zustand + persist，`theme` 默认 `"dark"`，持久化 key `"infinite-canvas:theme_store"`（L16-L19）。
- 注意：文件仅 19 行，任何引用行号不得超过 L19（上轮审查的越界问题）。
- 切换入口：`CanvasToolbar` 内 `CanvasThemeButton`（canvas-toolbar.tsx L41 组件内），用 `AnimatedThemeToggler`（`@/components/ui/animated-theme-toggler`）动画切换。

### 3.3 应用级 antd 主题（web/src/lib/app-theme.ts）

- L4 起 `neutral` 常量（light L5-L15 / dark L17-L29），L31 `getAntThemeConfig(dark)` 返回 `ThemeConfig`。
- 通过 `ConfigProvider`（app-providers.tsx）注入；CSS 变量 key `infinite-canvas-dark` / `infinite-canvas-light`。
- antd token 与画布 canvasThemes 是**两套独立体系**：antd 管组件库（Menu/Select/Table/Button），canvasThemes 管画布自绘 UI（节点/工具栏/浮层）。

### 3.4 硬编码颜色排查（跨主题风险点）

| 位置 | 行号 | 颜色 | 说明 |
|---|---|---|---|
| canvas-node.tsx | L22 | `#0a84ff` | selectionBlue 常量，与 accent 同值但独立副本 |
| canvas-node.tsx | L485 | `rgba(14,14,14,.45)` | 图片/视频节点深色底（功能需要，跨主题一致） |
| canvas-node.tsx | L621-L640 | `bg-[#1f1f1f]/95`、`text-white/75` | 节点 hover 编辑工具栏深色硬编码 |
| leafer-edges.ts | L7-L10 | `#78716c` / `#67e8f9` | 连线默认/激活色硬编码（EDGE_COLOR / EDGE_ACTIVE_COLOR / EDGE_WIDTH / EDGE_ACTIVE_WIDTH），不走主题 |
| leafer-canvas.tsx | L306-L333 | `#e0e4e8` / `#67e8f9` / `#a5f3fc` / `#86909c` / `#e0f2fe` | 连线视觉（选中/关联/hover）硬编码 |
| canvas-context-menu.tsx | L115 | `#f87171` | 危险操作红色硬编码（MenuButton danger） |

结论：画布节点/面板/工具栏主体已全面走 canvasThemes token；**连线层（leafer-edges / leafer-canvas）与少量悬浮控件仍有硬编码色**，明暗切换时连线色不随主题变化，是复刻/改主题时需一并处理的点。

---

## 4. 已有交互能力清单

| 能力 | 实现位置（已核实） | 说明 |
|---|---|---|
| 节点连线 | leafer-canvas.tsx（`onConnectStart/onConnectEnd/onConnect`，L1433-L1437 连接创建阈值逻辑）；leafer-edges.ts 渲染连线 | 从节点左右 handle 拖出连线；空白处松手弹 `ConnectionCreateMenu` 创建新节点；连接吸附半径 48/64 |
| 快捷分镜 | canvas-node-hover-toolbar.tsx `onQuickStoryboard`；canvas-client-page.tsx L1674-L1678（`groupVariant: "storyboard"`）；utils/canvas-script-beats.ts | 文本/脚本节点一键拆分为分镜组 |
| 模板打组 | CanvasWorkflowToolbox + utils/canvas-workflow-template.ts；canvas-client-page.tsx L1911-L1923（保存）、L1950-L1954（插入） | 账号级模板 API（saveCanvasTemplate / insertWorkflowTemplate / deleteCanvasTemplate） |
| 跨画布复制 | canvas-client-page.tsx L89-L93 | 模块级剪贴板单例，跨 [id] 路由实例仍可粘贴；媒体走 storageKey 引用后端存储 |
| 批量生成 | canvas-node.tsx BatchFrame（L1533）/ canvas-client-page 批量状态 | isBatchRoot / batchChildIds，展开折叠动画 |
| 框选 | leafer-canvas.tsx `onSelectionBox`（L1387-L1424）+ renderSelectionBox（L1531） | replace/add/toggle 三种模式 |
| 对齐辅助线 | canvas-client-page alignmentGuides / snapToGrid / alignmentGuidesEnabled | 拖拽吸附 + 参考线 |
| 缩放/小地图 | CanvasZoomControls（canvas-zoom-controls.tsx L18）+ leafer-viewport.ts（clampCanvasZoom / stepCanvasZoom） | 百分比输入、快捷键缩放 |
| 素材引用（@提及） | canvas-resource-mention-textarea.tsx + CanvasResourceMentionTextarea | 面板 prompt 内 @ 引用其他节点素材 |
| 右键菜单 | canvas-context-menu.tsx | canvas 空白（添加节点）/ node（复制/删除）/ connection（删除） |
| 快捷键 | canvas-client-page.tsx L2307-L2311（拦截 ⌘S/⌘P）；CanvasShortcutsModal（canvas-toolbar.tsx L447） | 完整快捷键面板 |
| 3D 导演台 | director/storyai/（React Three Fiber + drei，DirectorCanvas.tsx） | 独立 3D 编辑器浮层，z-220 |
| 助手 Agent | canvas-assistant-panel.tsx（L204）+ canvas-agent-chat-ui.tsx | online/local 双模式，工具调用驱动画布 |
| 撤销/重做 | canvas-client-page historyState.canUndo/canRedo | 工具栏按钮 + 快捷键 |
| 文件拖拽上传 | leafer-canvas.tsx `onDrop` | 图片/视频/音频/文本/SRT |

---

## 5. 可复刻面判断（tapnow 借鉴落点）

按"当前 FlowCanvas 已具备、tapnow 可作为对照/可复刻"的维度分级：

### 5.1 直接可复刻（结构成熟、主题一致）

1. **画布外壳信息架构**：`creative-os-shell` + CSS 变量注入 + 浮层层叠顺序（canvas-client-page.tsx L4725 起，CanvasTopBar 使用处 L4749、定义 L5625）——可作为复刻后的页面骨架蓝本。
2. **极简扁平工具栏**：CanvasToolbar 无边框无阴影、`DividerBlock` 分组、hover 轻微反馈——已符合 AGENTS.md 第 8 节"极简扁平"规范，tapnow 工具栏可直接参考此写法。
3. **主题双体系**：canvasThemes（画布自绘）+ antd ConfigProvider（组件库）分离清晰，明暗切换全站一致——复刻时沿用该双轨，不引入第三套颜色。
4. **节点悬浮工具栏**：CanvasNodeHoverToolbar 视口变换定位 + 工具组按节点类型动态组装 + 图片工具自定义开关（localStorage 持久化）——交互范式可直接照搬。
5. **左下缩放 dock**：CanvasZoomControls 的 zoom-cluster 样式（资产管理/小地图/重置/百分比弹层）紧凑且不占空间，符合"不占用过多画布空间"约束。
6. **节点 Composer 面板**：CanvasNodePromptPanel 的快速提示词、风格预设、生成运行条（GenerationRunStrip）是 tapnow 生成面板的理想对照物。

### 5.2 有条件可复刻（需先清理硬编码）

7. **连线视觉**：leafer-edges.ts / leafer-canvas.tsx 连线颜色硬编码（见 3.4），复刻 tapnow 连线样式前应先把连线色并入 canvasThemes（如 `connection` 组），否则明暗主题下连线观感不一致。
8. **节点 hover 工具栏深色胶囊**：canvas-node.tsx L621 附近硬编码深色，若 tapnow 主题非深色底需改为 token 化。

### 5.3 差异化落点（tapnow 可反哺 FlowCanvas 的区域）

9. **助手面板（CanvasAssistantPanel）**：当前为右侧独立抽屉、与主画布并列；tapnow 若采用更紧凑的助手浮层或可折叠 dock，可作为改进参考。
10. **工作流工具箱（CanvasWorkflowToolbox）**：当前是标准 antd Modal；tapnow 若以更可视化的模板缩略图/网格呈现，可提升模板选择效率。
11. **素材引用交互**：当前仅面板内 @ 提及；tapnow 若在节点连线层直接呈现引用关系，可作为交互增强方向。
12. **脚本分镜（canvas-script-beats）**：脚本节点 → 分镜表 → 快捷分镜 链路已通；tapnow 若在分镜表上做拖拽排序/批量生成预览，是明确的增强落点。

### 5.4 不属于本任务范围（v1 之外）

- 商业化（积分/会员/付费模型/社区）不在 FlowCanvas v1 范围（AGENTS.md 第 12 节），复刻 tapnow UI 时不做商业化入口。

---

## 附：锚点核实记录

- canvas-theme.ts：L1/L2/L4/L6/L13/L24/L32/L43/L44/L81/L83 全部经 grep+read_file 核实，light/dark 区间覆盖完整。
- use-theme-store.ts：文件实长 19 行，本文引用仅 L16-L19，未越界。
- canvas-node-prompt-panel.tsx：锚点指向 L75（CanvasNodePromptPanel）及 L373/L550/L818 等业务子组件，均非 import 区。
- canvas-client-page.tsx（6498 行）：L4725-L4763 布局、L4880 起 Composer 浮层、L4749/L5625 CanvasTopBar、L1674/L1911/L1950 等均经 read_file 核实；大文件行号如后续变更需重新核对。
- leafer-canvas.tsx / leafer-edges.ts：L1433-L1437、L306-L333、L7-L10 经 grep 核实。
- 标注「待核实」项：无（本次盘点全部锚点已核实）。

> 备注：canvas-client-page.tsx 为主工作区用户改动文件（git-status 含该文件），如行号漂移以最新源码为准；本清单落盘时以当前 worktree 内容为权威。
