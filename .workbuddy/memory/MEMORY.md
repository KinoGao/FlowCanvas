# FlowCanvas 项目长期记忆

## 3D 导演台（DirectorStudioOverlay）约定
- 角色模型为**多角色数组** `directorCharacters: DirectorCharacter[]`（见 `web/src/app/(user)/canvas/[id]/types.ts`），不要回退到单角色 `directorCharacter` 字段/变量。
- `DirectorThreeStage` 必须保持 **WebGL renderer 实例稳定**：mount 时创建一次，用 `propsRef`（每帧更新最新 props）+ `rebuildRef` + 第二个 `useEffect([scene,characters,...])` 只重建场景图。否则每次拖拽 onChange 会重建 renderer、丢失 pointer capture，拖动失效。
- 3D 舞台的画布尺寸必须用 `renderer.setSize(w, h)`（不要传 `false`），否则 HiDPI 屏画布溢出。
- 720° 全景：通过 `scene.panoramaVisible && scene.panoramaUrl`（由导演台"导入"按钮经 `onImportPanorama` 写入）渲染为 BackSide 球。
- 画幅比例存在 `scene.aspectRatio`，影响 3D 取景框与 `directorShotDataUrl` 截图比例。
- **`DirectorThreeStage` 必须有持续 rAF 渲染循环**（即使默认不渲染），原因有二：①`THREE.TextureLoader().load()` 异步加载，贴图就绪后无人 `render()` 则永远不显示（这是"导入全景图不显示"的根因）；②`OrbitControls` 开阻尼时 `update()` 会持续改相机。用 `needsRender` 标志 + `scheduleRender()` 触发单次重绘，rAF 循环里 `viewMode==="director"` 时调 `orbit.update()` 并据其返回值决定是否重绘。
- 全景球材质要设 `fog:false`：场景 fog 远平面 42、球半径 60，相机在球内时远处球面会被糊成背景色导致全景发白。
- **OrbitControls 仅 `director` 视角启用**：拖拽角色/机位时 `onPointerDown` 置 `orbit.enabled=false`、`onPointerUp` 恢复；`rebuildScene` 重建时若 `drag.type` 非空也不重启用 orbit，否则拖角色时视角会跟着乱转。重置视角用 `resetSignal` prop + `orbitRef`/`scheduleRenderRef` 跨 effect 触发。
- `LegacyDirectorStudioOverlay` 是死代码，**不要修改**，它不依赖被移除的单角色 API。
- **角色是"真骨骼模型"不是几何体木偶**：默认资源 `web/public/models/Xbot.glb`（Three.js 官方 CC0，Mixamo 骨骼）。`loadDirectorModel()` 模块级缓存 + `GLTFLoader` 异步加载；`buildRiggedCharacter()` 用 **`SkeletonUtils.clone`**（蒙皮网格多实例必须用它，否则多角色共享骨骼串味）、每片 mesh `material.clone()` 着色、选中 `emissive` 高亮。模型未就绪时回退 `addMannequin` 占位人偶。
- **⚠️ rigged 模型缩放必须靠蒙皮后实测，严禁硬编码单位**：Xbot 顶点在局部小空间，真实身高靠骨骼蒙皮撑开 → 蒙皮后实测 **1.81 单位**（已是米制，不是厘米！）。`computeModelScale(gltf)` 用 `SkinnedMesh.computeBoundingBox()`（套蒙皮）测真实高度并归一化到 1.8；结果存 `cachedDirectorModelScale`，`buildRiggedCharacter` 用它。曾因误把骨骼 translation 之和（177）当天生高度、硬编码 `scale=0.01` 把模型缩成不可见——此坑已填，换模型时务必沿用动态测量。
- **⚠️ Mixamo 骨骼名在 GLTFLoader 加载后无冒号**：GLB JSON 里是 `mixamorig:Head`（有冒号），但 GLTFLoader 加载后 `THREE.Bone.name` 是 `mixamorigHead`（**无冒号**）。`findBone` 候选名必须用无冒号形式，否则全部匹配失败、姿势完全不生效。曾因误补冒号导致 20 个预设全部失效——此坑已填。
- **姿势驱动骨骼**：`applyDirectorPose()` 把 pose 参数映射到 `mixamorig*` 骨骼（**注意无冒号**）。Xbot 静止是 T-pose，左右臂 base 角用 ±90° 从 T-pose 落到体侧；**肘部(ForeArm)弯曲用 Z 轴不是 X 轴**（实测 X 不生效），左肘负 Z 弯曲、右肘正 Z 弯曲(镜像)。若可视化发现手臂外翻/上举，翻转左右臂 base 符号即可（单点修改）。
- 体型比例 `TYPE_FACTORS` 用 **uniform 单值缩放**（非均匀会剪切蒙皮），`male/female/child/tall/short/heavy/slim` 各一系数，配 `char.scale` 实现不同比例角色同框。
- 替换默认模型：改 `DEFAULT_DIRECTOR_MODEL_URL` 常量 + 在 `applyDirectorPose` 调整骨骼名映射（建议保留 `mixamorig*` 与通用别名回退）。

## 一般约定（来自 AGENTS.md）
- 改完代码用户自己构建，我不跑 build / 类型检查。
- 优先沿用项目现有技术栈（React19 / **LeaferJS** / antd / Tailwind / Zustand / three），不引入平行替代品。
- 不直接改无关文件、不回滚用户已有改动。

## 画布引擎迁移（2026-07-10）

- **@xyflow/react → LeaferJS**：画布引擎已完成从 React Flow 到 LeaferJS 的迁移。
- **LeaferJS 承担**：视口背景、连线渲染（Bezier）、框选矩形（通过 `LeaferEdgeLayer` / `LeaferCanvas`）
- **React DOM 承担**：节点内容（保留 `CanvasNode` 组件）、连接手柄（`data-handle` 属性）、边点击目标（`data-connection-id`）
- **视口管理**：CSS transform 实现 pan/zoom，`leafer-viewport.ts` 提供坐标转换工具
- **已删除文件**：`react-flow-canvas.tsx` / `react-flow-canvas-node.tsx` / `react-flow-canvas-edge.tsx` / `react-flow-adapter.ts`
- **@xyflow/react 已从 package.json 卸载**；`globals.css` 中的 React Flow CSS import 已移除
- **LeaferJS 技术要点**：
  - `leafer-ui` 为主包（含 Leafer/Rect/Line 等基本元素）
  - `@leafer-ui/draw` 为编辑器插件
  - 组件初始化：`new LUI.Leafer({ view: containerElement })`
  - 元素添加：`app.add(element)` / `element.remove()` / `app.clear()`
  - 性能：百万级图形 / 60fps 拖拽 / 320MB 内存
