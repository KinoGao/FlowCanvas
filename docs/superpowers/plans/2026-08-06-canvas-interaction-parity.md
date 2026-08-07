# 画布交互对齐（TapNow V2）实现计划

> 面向 AI 代理：使用 executing-plans 逐任务实现。
> 依据：docs/superpowers/specs/2026-08-06-tapnow-canvas-interaction-parity.md（已审查确认 V2 方案）。

**目标：** 对齐 TapNow 画布核心交互，消除"画布交互丑陋"痛点。五项：①连线/悬浮控件 token 化 ②保存状态栏 ③空画布中央提示+快捷生成 ④节点选中两侧 `+` 续创 ⑤Pin 视觉核对。

**架构：** 全部改动在 `web/src/app/(user)/canvas/` 与 `web/src/lib/canvas-theme.ts` 内；复用既有工厂（createCanvasNode/createCanvasConnection）与既有 store（use-canvas-store）数据链路，只加 UI 入口与视觉 token，不重构业务逻辑。

**技术栈：** React 19 + Leafer + Zustand + Tailwind（沿用现状）。

---

## 瑶光反证（计划期复现）

**关键断言清单**：

| 断言 | 证据类型 | 证据 |
|------|---------|------|
| canvasThemes 现无 connection 组 token | 已读 | canvas-theme.ts 全文（canvas/node/toolbar/ui 四组，无 connection） |
| leafer-edges.ts 连线色硬编码 #78716c/#67e8f9 | 已读 | leafer-edges.ts L7-L10 EDGE_COLOR/EDGE_ACTIVE_COLOR |
| 画布 store 在 canvas/stores/use-canvas-store.ts | grep | 文件存在（保存状态字段待实施时确认） |
| 空画布中央提示不存在 | grep | canvas-client-page.tsx 无空状态提示（仅 L1386 双击菜单） |
| 节点 hover 工具栏深色硬编码 | inventory | canvas-node.tsx L621-L640 bg-[#1f1f1f]/95（复核时以最新源码为准） |

**待验证假设**：
- use-canvas-store 的保存状态字段名/语义（实施波 2 第一步读文件确认，不确定则打探针）
- leafer-canvas.tsx 内部连线渲染是否复用 LeaferEdgeLayer（grep 显示仅 leafer-edges.ts 自引用，实施波 1 时读 leafer-canvas.tsx L300-L340 确认实际渲染路径）
- canvas-node.tsx 外壳选中态渲染位置（实施波 4 时读 L460-L500）

---

## 任务

### 波 1：连线/悬浮控件 token 化（低风险先行）

- [ ] 修改 `web/src/lib/canvas-theme.ts`：新增 `connection` token 组（light/dark）：`color`（默认取现 #78716c 语义：light rgba(60,60,67,.35) / dark rgba(255,255,255,.28)）、`activeColor`（#67e8f9 语义：light #0a84ff / dark #67e8f9）、`width`、`activeWidth`、`tempWidth`、`dash`。
- [ ] 修改 `web/src/app/(user)/canvas/components/leafer-edges.ts`：LeaferEdgeLayer 构造函数或 updateConnections 接受主题 token（默认参数保持现值，避免破坏现有调用）；EDGE_* 常量改为从参数取。
- [ ] 修改 `web/src/app/(user)/canvas/components/leafer-canvas.tsx`：连线视觉硬编码（L306-L333 附近）改用 canvasThemes connection token（读取 useThemeStore 已有模式）。
- [ ] 修改 `web/src/app/(user)/canvas/components/canvas-node.tsx`：hover 工具栏深色胶囊（L621-L640）改用 theme.ui.materialElevated / node.token（保持明暗一致）。
- [ ] 验证：`npx tsc --noEmit` 无错误；`npm exec -- tsx --test src/app/(user)/canvas/components/leafer-viewport.test.ts` 通过。
- [ ] 提交：`refactor(canvas): 连线与悬浮控件颜色 token 化（新增 connection 主题组，明暗主题一致）`

**调研背书**：EDGE_* 常量仅 leafer-edges.ts 内部使用（grep 确认无外部引用）；连线色此前 inventory 登记为跨主题风险点。hover 工具栏深色为 inventory §5.2 登记项。

### 波 2：保存状态栏（P0-3 补齐）

- [ ] 读 `web/src/app/(user)/canvas/stores/use-canvas-store.ts` 确认保存状态字段（saving/saved/error 语义与更新时机）。
- [ ] 修改 `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx` CanvasTopBar（L5625 附近）：标题旁显示保存状态（保存中… / 已保存 / 保存失败），极简扁平风格（AGENTS.md §8），走 theme token。
- [ ] 验证：`npx tsc --noEmit` 无错误。
- [ ] 提交：`feat(canvas): 画布顶部保存状态栏（保存中/已保存/失败，对齐 TapNow）`

### 波 3：空画布中央提示 + 快捷生成

- [ ] 修改 `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`：projectLoaded 且节点数为 0 时渲染中央提示层（"双击画布自由创作，或从模板开始" + 快捷按钮组：文生图/文生视频/首帧生视频/模板——按 FlowCanvas 实际能力映射，中文文案）。
- [ ] 按钮点击调用既有创建路径（createCanvasNode 工厂 + 对应 Composer 打开）。
- [ ] 验证：`npx tsc --noEmit` 无错误。
- [ ] 提交：`feat(canvas): 空画布中央提示与快捷生成入口（对齐 TapNow 空状态）`

### 波 4：节点选中两侧 `+` 续创（核心交互）

- [ ] 读 `web/src/app/(user)/canvas/components/canvas-node.tsx` 选中态渲染（L460-L500）与 ConnectionCreateMenu 菜单数据源。
- [ ] 修改 canvas-node.tsx：节点**选中**时左右两侧中点显示 `+` 圆钮（约 20px，theme token 配色）；点击弹出节点类型菜单（复用 ConnectionCreateMenu 数据/样式）；选择类型后 createCanvasNode(新节点位置=原节点右侧偏移) + createCanvasConnection 自动连线。
- [ ] 命中区隔离：`+` 按钮仅响应 click，不拦截拖拽起点（拖动判定阈值优先）。
- [ ] 验证：`npx tsc --noEmit`；`npm exec -- tsx --test` 画布相关测试通过。
- [ ] 提交：`feat(canvas): 节点选中态两侧 + 续创入口（点击创建并自动连线，对齐 TapNow）`

### 波 5：Pin 视觉核对 + 文档收尾

- [ ] 对照 TapNow Pin GIF（.rivet/scratch/tapnow-refs/shot-pin.gif）核对 canvas-color-group-bar.tsx 顶部 Pin 栏视觉（hover 显数量/点击定位），有差距则微调。
- [ ] 更新 `docs/content/docs/progress/todo.mdx`（移除已完成项）与 `docs/content/docs/progress/pending-test.mdx`（登记本批可测试变更）。
- [ ] 验证：`npx tsc --noEmit`。
- [ ] 提交：`docs: 画布交互对齐收尾（todo/pending-test 更新）`

---

## 验证命令（每波）

```bash
cd web && npx tsc --noEmit
cd web && npm exec -- tsx --test src/app/\(user\)/canvas/   # 画布相关测试
```

## 回归清单

- [ ] 明暗双主题下连线/悬浮工具栏观感（AGENTS.md §8 要求）
- [ ] 拖拽节点/连线创建手势不被 `+` 续创按钮误触（波 4 重点）
- [ ] 保存状态栏不引入新状态源（只读 store 现有字段）
- [ ] 空画布提示仅节点数为 0 时出现，不影响非空画布
