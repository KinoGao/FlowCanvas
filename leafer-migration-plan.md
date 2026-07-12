# FlowCanvas 画布引擎迁移方案：@xyflow/react → LeaferJS

## 一、当前状态

### 版本现状

| 依赖 | 当前版本 | 目标版本 | 状态 |
|------|---------|---------|------|
| React | 19.2.5 | 19 | ✅ 已完成 |
| Zustand | 5.0.12 | 5 | ✅ 已完成 |
| Tailwind CSS | 4 | 4 | ✅ 已完成 |
| @xyflow/react | 12.11.2 | → 移除 | 🔄 待迁移 |

**三项"升级"已就绪，实际工作是对画布引擎做替换。**

### 当前 React Flow 使用全景

```
@xyflow/react 依赖链
├── globals.css            → @import "@xyflow/react/dist/style.css"   (移除)
├── react-flow-adapter.ts   → Edge, Node, NodeChange, Viewport 类型    (移除)
├── react-flow-canvas.tsx   → ReactFlow, Background, MiniMap, ...     (重写)
│   ├── 视口管理 (pan/zoom/minimap)
│   ├── 节点拖拽 + 运行时位置覆盖
│   ├── 选区系统 (框选/多选)
│   ├── 连线系统 (handle drag/drop)
│   ├── 键盘修饰键 (Space拖拽, Ctrl框选)
│   └── 背景渲染 (dot/lines)
├── react-flow-canvas-node.tsx → HandlConnecton (重写)
│   └── 连线把手 (left/right source/target)
└── react-flow-canvas-edge.tsx  → Bezier连线 + SVG动画 (重写)
    └── 选中动效 (dash轨迹动画)
```

### 当前画布核心数据模型（与引擎无关，保留）

```
CanvasNodeData { id, type, title, position, width, height, metadata }
CanvasConnection { id, fromNodeId, toNodeId }
ViewportTransform { x, y, k }
ContextMenuState { type, ... }
```

---

## 二、LeaferJS 能力分析

### LeaferJS 提供什么

| 能力 | 说明 |
|------|------|
| 高性能渲染 | 100万可交互矩形，60fps拖拽，320MB内存 |
| 场景树 | Group / Rect / Ellipse / Polygon / Line / Image / Text / Pen |
| 事件系统 | pointer.enter/leave/down/move/up, 冒泡, 命中检测 |
| 拖拽 | `draggable: true`，自动处理 pointer capture |
| 编辑器插件 | zoom/rotate/move/multi-select（需 @leafer-ui/draw） |
| 布局引擎 | Canvas 内 Flex 布局 |
| 动画 | 内置过渡动画，状态驱动 |
| 跨平台 | Web / Node.js / 小程序 |

### LeaferJS 不提供什么（需要自建）

| 缺失能力 | React Flow 原生提供 | 自建难度 |
|---------|-------------------|---------|
| 节点系统 | `Node` 类型 + `onNodesChange` | 🔴 高 |
| 连线系统 | `Edge` + `onConnect` + Bezier渲染 | 🔴 高 |
| 视口管理 | `Viewport` + pan/zoom + minimap | 🟡 中 |
| 框选 | `selectionOnDrag` + `SelectionRect` | 🟡 中 |
| Handles | `Handle` + 自动计算 sourcePosition/targetPosition | 🟡 中 |
| 连线创建流程 | `onConnectStart → onConnectEnd → onConnect` | 🔴 高 |
| 性能优化 | `onlyRenderVisibleElements` | 🟡 中 |
| 缩放比例 | `CanvasScaleCtx` context | 🟢 低 |

### 核心矛盾

LeaferJS 是 **Canvas 2D 渲染引擎**（对标 PixiJS / Konva.js），React Flow 是 **节点图框架**。

迁移 = 在 LeaferJS 之上从零重建一个节点图框架。

---

## 三、迁移范围与工作量评估

### Phase 1：基础视口引擎 (4-6天)

| 子任务 | 内容 | 预估 |
|--------|------|------|
| 1.1 视口系统 | Canvas 平移/缩放/边界检测，替代 ReactFlow panOnDrag + zoomOnScroll | 2天 |
| 1.2 坐标转换 | 屏幕坐标 ↔ 画布坐标（替代 ReactFlow screenToFlowPosition） | 0.5天 |
| 1.3 MiniMap | 基于 LeaferJS 重新渲染缩略图 | 1天 |
| 1.4 背景渲染 | Dot/Lines/Blank 三种模式替代 Background 组件 | 0.5天 |
| 1.5 键盘交互 | Space+拖拽平移, Ctrl+框选, 滚轮缩放 | 1天 |

### Phase 2：节点系统 (5-7天)

| 子任务 | 内容 | 预估 |
|--------|------|------|
| 2.1 节点基类 | LeaferJS Group 封装为可复用节点，带 id/data/position/size | 2天 |
| 2.2 节点渲染 | 五类节点（Image/Video/Audio/Text/Config）用 LeaferJS 原生元素重绘 | 2天 |
| 2.3 节点拖拽 | 替代 `onNodeDrag` + `runtimeOverrides` 机制 | 1天 |
| 2.4 节点选中 | 选中高亮/边框/手柄，替代 React Flow selection | 1天 |
| 2.5 批量操作 | 替代 `onNodesChange` + `applyReactFlowNodeChanges` | 1天 |
| 2.6 节点缩放 | 替代自定义 ResizeHandle（当前用 Pointer Events 实现） | 1天 |

### Phase 3：连线系统 (4-5天)

| 子任务 | 内容 | 预估 |
|--------|------|------|
| 3.1 连线渲染 | LeaferJS Line/Path 绘制 Bezier 曲线，替代 `BaseEdge` + `getBezierPath` | 1天 |
| 3.2 连线手柄 | 替代 `Handle` 组件 + `ReactFlowPosition`（source/target 连接点） | 1.5天 |
| 3.3 拖拽连线 | 替代 `onConnectStart → onConnectEnd → onConnect` 完整流程 | 2天 |
| 3.4 连线选中 | 选中动效（当前为 SVG animateMotion），迁移到 LeaferJS 动画 | 0.5天 |
| 3.5 连线删除 | 右键菜单 + Delete 键 | 0.5天 |

### Phase 4：交互与适配 (3-4天)

| 子任务 | 内容 | 预估 |
|--------|------|------|
| 4.1 右键菜单 | 现有 canvas-context-menu 适配新坐标系统 | 0.5天 |
| 4.2 节点信息 | metadata 面板、hover 工具栏适配 | 1天 |
| 4.3 生成流程 | AI 生成节点的 loading/error 状态渲染 | 1天 |
| 4.4 批量子节点 | batch child 动画迁移 | 1天 |
| 4.5 历史系统 | undo/redo 适配新的位置变更流 | 0.5天 |

### Phase 5：清理与验证 (2-3天)

| 子任务 | 内容 | 预估 |
|--------|------|------|
| 5.1 移除 @xyflow | 卸载 npm 包, 清理 import, 删除 adapter/edge/node 文件 | 0.5天 |
| 5.2 类型重构 | 移除 Edge/Node/Handle/Viewport 等类型依赖 | 1天 |
| 5.3 回归测试 | 全功能验证 | 1天 |
| 5.4 Bug 修复 | 交互问题修复 | 1天 |

### 总计：18-25 个工作日

---

## 四、风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 连线交互行为不一致 | 高 | 高 | 逐条对齐 React Flow 行为 spec |
| 节点内容渲染复杂（React 组件 → Canvas） | 高 | 高 | 保留 React DOM overlay 层用于富文本 |
| 性能回归（100+节点时） | 中 | 中 | LeaferJS 百万级性能，理论上远优于 React Flow |
| 3D 导演台不受影响 | 低 | 低 | DirectorThreeStage 是独立 Three.js 实例 |
| Zustand store 无变更 | 低 | 低 | 数据模型保留 CanvasNodeData/CanvasConnection |
| 生成/AI 流程被破坏 | 中 | 高 | 隔离变更范围，重点验证 |

---

## 五、架构决策

### 节点渲染：Canvas vs DOM Overlay

LeaferJS 原生只支持 `Image`、`Text`、`Rect` 等基础图形。当前 FlowCanvas 的 Image 节点有复杂的 React 内容（工具栏、loading spinner、批量子节点动画）。

**建议：混合架构**

```
┌─────────────────────────────┐
│  LeaferJS Canvas 层          │  视口、节点边框、连线、框选
│  (高频交互，原生性能)          │
├─────────────────────────────┤
│  React DOM Overlay 层        │  节点内容（图片/视频/文本编辑/工具栏）
│  (富交互，保留现有组件)         │  右键菜单、弹窗、面板
├─────────────────────────────┤
│  React UI Shell 层           │  工具栏、侧边栏、导演台、Agent面板
│  (不变)                       │
└─────────────────────────────┘
```

- LeaferJS 管理：视口变换、节点位置/大小/选中状态、连线绘制、框选
- React DOM 管理：节点内部内容（复用现有 canvas-node 组件）、UI 面板、对话框
- 同步机制：LeaferJS 视图状态 ↔ React state 通过事件桥双向同步

### 数据流

```
CanvasNodeData[] ──→ LeaferJS 场景树构建
    ↑                       │
    │                       ↓
Zustand Store          LeaferJS 事件
    ↑                       │
    └─── setNodes ←─────────┘  (拖拽/缩放/选中变化)
```

---

## 六、推荐执行路径

### 路径 A：激进替换（直接重建，18-25天）

一次性移除 React Flow，重写整个画布层。

**优点**：彻底，无残留依赖
**缺点**：风险高，开发期间画布不可用

### 路径 B：分层渐进（并行双引擎，12-18天有效工时）

1. 先建立 LeaferJS 视口壳层（替代 react-flow-canvas.tsx）
2. 节点内容层保留 React DOM overlay
3. 逐步将交互迁移到 LeaferJS
4. 最后移除 React Flow

**优点**：可增量开发，随时可回滚，画布始终可用
**缺点**：过渡期两套渲染并存

### 路径 C：保留 React Flow，只在特定场景用 LeaferJS

仅在需要高性能渲染时（如 100+ 节点、缩略图）使用 LeaferJS。

**优点**：风险最低
**缺点**：没完成"迁移"

### 推荐：路径 B

---

## 七、前置准备

在开始迁移前，需要先：

1. **理解 React Flow 交互契约**：列出所有画布交互行为（拖拽、缩放、连线、框选、双击、右键），作为验收标准
2. **建立 sandbox demo**：用 LeaferJS 搭建一个最小可用的节点画布原型（2-3个可拖拽节点 + 1条连线），验证技术可行性
3. **拆分 canvas-client-page.tsx**：将 6661 行的上帝组件拆分为独立模块，让迁移时可以聚焦画布层

> ⚠️ **如果 canvas-client-page.tsx 不先拆分，任何画布引擎迁移都极其危险。**
> 当前 77 个 useState、24 个 useEffect 几乎都与 @xyflow/react 的交互耦合在一起。

---

## 八、关键文件变更清单

| 操作 | 文件 |
|------|------|
| **移除** | `@xyflow/react` (package.json) |
| **移除** | `react-flow-canvas.tsx` |
| **移除** | `react-flow-canvas-node.tsx` |
| **移除** | `react-flow-canvas-edge.tsx` |
| **移除** | `react-flow-adapter.ts` |
| **移除** | `@import "@xyflow/react/dist/style.css"` (globals.css) |
| **新增** | `leafer-canvas.tsx` — LeaferJS 画布主组件 |
| **新增** | `leafer-viewport.ts` — 视口管理器 |
| **新增** | `leafer-node.ts` — 节点基类 |
| **新增** | `leafer-edge.ts` — 连线渲染器 |
| **新增** | `leafer-interaction.ts` — 交互处理器 |
| **重写** | `canvas-client-page.tsx` — 大量 @xyflow 相关代码 |
| **重写** | `canvas-node.tsx` — 移除 Handle/useUpdateNodeInternals |
| **重写** | `canvas-context-menu.tsx` — 坐标转换适配 |
| **新增** | `leafer-ui` + `@leafer-ui/draw` (package.json) |

---

*下一步：是否先做 sandbox 原型验证 LeaferJS 的可行性？还是直接按 Phase 1 开始？*
