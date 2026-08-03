---
title: 无限画布竞品增量调研（2026-08 更新版）
description: 第二轮增量调研——FigJam / tldraw / Excalidraw+ / boardmix / WHEE / 通义万相 / 可灵 3.0 等产品能力深挖，对已有 spec（infinite-canvas-competitor-research.md、canvas-commercial-readiness.md）的时效性验证、差异修正与可借鉴能力点清单
---

# 无限画布竞品增量调研（2026-08 更新版）

> 本报告是 `infinite-canvas-competitor-research.md`（2026-07 版）的**第二轮增量补充**：验证旧 spec 时效性、深挖新增产品、修正过时结论。
> 证据口径：外部产品结论基于公开网页抓取（web_fetch 200 / web_search 快照，**unverified 级**，未登录实测）；FlowCanvas 现状基于源码 read/grep（**verified 级**，带 file:line）。LibTV 25 宫格与即梦智能画布两项复核因搜索结果污染未获一手证据，维持未核实。

## 1. 调研对象与画布范式谱系更新

在第一轮谱系（AI 画布工作流 / 单次生成器 / 通用画布）基础上，补充四类划分：

| 产品 | 本轮新增/验证 | 范式归类 | 与 FlowCanvas 相关性 |
| --- | --- | --- | --- |
| **FigJam**（Figma） | 新增深挖 | 通用画布 + AI 辅助（图表生成/便签聚类） | 中（AI 辅助交互可借鉴） |
| **tldraw** | 新增深挖 | 画布 SDK（非成品） | 中（AI 集成模式、Padlet 案例） |
| **Excalidraw+** | 新增深挖 | 通用画布 + 生成式 AI | 中（只读分享链接语义 = P1-1 前置调研） |
| **boardmix**（博思白板） | 新增 | AI 协作白板（思维导图/流程图/一键 PPT） | 低（协作白板非节点工作流） |
| **WHEE**（美图） | 新增 | 单次生成器（中文海报差异化） | 低（海报能力单点可借鉴） |
| **通义万相**（阿里） | 新增 | 单次生成器 | 低（官方定位无画布节点工作流） |
| **可灵**（快手） | 时效更新 | 单次生成器（3.0 系列） | 低（storyboard 属模型层叙事能力） |
| LibTV / TapNow | 时效验证 | AI 画布工作流 | 最高（对标基线不变） |

> 证据：FigJam（figma.com/figjam + gongke.net/tools/figjam，均 200）；tldraw（tldraw.dev 200，官方定位"Build infinite canvas apps in React"SDK，Padlet 用其构建 Sandbox）；Excalidraw+（plus.excalidraw.com 200，含 Read-only link 与 Generative AI 说明）；boardmix（boardmix.cn 搜索快照）；WHEE（wheecn.com 搜索快照，2025-01 发布自称全球首个支持中文海报文字自定义）；通义万相（tongyi.aliyun.com/wanxiang 200，meta 描述列文生图/图生图/文生视频/图生视频/图像编辑）；可灵（klingai.com/global 200，导航为 Creative Studio 工具集，官方称 precise long-form storyboard control——属模型能力非画布 UI）。

## 2. 新增产品能力深挖（旧 spec 未覆盖）

### 2.1 FigJam（Figma）
- AI 为 coding agent 生成图表（generate diagrams that map out what your AI agent is building）、智能生成模板、便签一键聚类、生成行动项、Jambot 助手。
- 借鉴点：**便签聚类/行动项生成**可对应 FlowCanvas 脚本节点的 beat 整理；AI 生成图表对应"文本 → 结构化节点组"的插入形态。

### 2.2 tldraw
- 官方定位为画布 SDK；Padlet 使用其构建 Sandbox；三种 AI 集成模式（tldraw+AI / computer 等，详见旧 spec 轮次发现）。
- 借鉴点：**画布 SDK 化**是 FlowCanvas 无需跟随的方向（本项目自研 Leafer 层），但其 AI 集成模式（选择集 → 上下文注入 → 结果回填）与 FlowCanvas 本地 Agent 的"节点即上下文"同构，可作 Agent 交互参考。

### 2.3 Excalidraw+
- 只读分享链接：**分享内容而非场景编辑权**（Read-only link — Share just content, not the scene access）——这是 P1-1 分享链接的直接语义参考。
- 生成式 AI：Text to diagram、Wireframe to code。
- 借鉴点：P1-1 只读链接的权限语义（只读 ≠ 可编辑）可直接对齐；Text to diagram 对应脚本 → 分镜结构化的已有能力。

### 2.4 boardmix（博思白板）
- AI 驱动可视化协作平台：AIGC 生成、思维导图、流程图、实时协作、AI 一键生成 PPT。
- 借鉴点：模板体系（AI 一键生成 PPT 的结构模板菜单）与 ProcessOn 的"生成前结构模板菜单"同族——**生成动作前先选结构模板**的交互值得 FlowCanvas 快捷分镜菜单参考。

### 2.5 WHEE（美图）
- 中文海报：2025-01 发布，自称全球首个支持中文海报文字自定义。
- 借鉴点：中文海报文字自定义是中文用户高频需求，可登记为远期能力（v1 不做，避免范围膨胀）。

### 2.6 通义万相 / 可灵 3.0（时效验证）
- 通义万相：官方 meta 描述为文生图/图生图/文生视频/图生视频/图像编辑——**单次生成器平台，无画布节点工作流证据**，维持旧结论"不在同一赛道"。
- 可灵：已迭代至 VIDEO 3.0 / IMAGE 3.0 / Omni / Element Library 3.0 / Native 4K / Motion Control，但导航仍为 Creative Studio 工具集（video/image/sound/effects 生成器）——**仍无画布节点编排 UI**，storyboard control 属模型层叙事能力，维持旧结论。

## 3. 对 FlowCanvas 可借鉴能力点清单（10 项）

| # | 能力点 | 来源产品 | 建议去向 |
| --- | --- | --- | --- |
| 1 | 只读分享链接语义（分享内容而非场景编辑权） | Excalidraw+ | P1-1 分享链接实现时直接采用 |
| 2 | 生成前结构模板菜单 | ProcessOn / boardmix | 快捷分镜菜单扩展参考 |
| 3 | 文本直接生成范式（输入文本 → 生成结构化产物） | Napkin | 脚本 → 分镜已有同构，无需新增 |
| 4 | 便签聚类/行动项生成 | FigJam | 脚本节点 beat 整理远期参考 |
| 5 | AI 选择集上下文注入模式 | tldraw | 本地 Agent"节点即上下文"印证 |
| 6 | 中文海报文字自定义 | WHEE | 远期登记，v1 不做 |
| 7 | 智能生成模板（AI 出模板） | FigJam / boardmix | P2-2 模板市场参考 |
| 8 | AI 画布 SDK 化定位 | tldraw | 反参考：FlowCanvas 保持自研 Leafer |
| 9 | 便签一键聚类 | FigJam | 分镜表视图的相似 beat 合并远期参考 |
| 10 | 播放列表时间轴（顺序/裁切/切割） | TapNow（旧 spec） | P1-3 时间轴视频合成实现基线（不变） |

## 4. 与旧 spec 的差异修正（重要）

| 旧 spec 结论 | 现状 | 修正 |
| --- | --- | --- |
| §6#2 账号级模板持久化"待补" | **已实现**（d1aeda2 + aa3251e） | 从差距清单移除；旧计划（.rivet/plans 中文名文件）Wave 2 已过时 |
| 差距矩阵未登记 3D 导演台 | **已实现**：web/src/app/(user)/canvas/director/storyai/ 共 49 个文件（DirectorDesk.tsx portal 全屏 z-index:220、CameraPanel/CharacterPanel/ScenePanel/PropPanel/ObjectTreePanel 等） | 两份旧 spec 均为盲区，需登记进 §4 差距矩阵与 §6 实现建议 |
| 25 宫格快捷分镜"已实现"（旧 spec 声明） | **源码证实**：canvas-workflow-template.ts:14 twentyfive-grid rows=5 cols=5 | 维持已实现；LibTV 侧 25 宫格独立复核因搜索污染未核实（unverified） |
| 可灵"视频 3.0 storyboard" | 迭代至 3.0 系列仍无画布 UI | 维持"低相关"结论 |
| 快捷分镜专业工具（镜头聚焦/焦点编辑/角色三视图/画面推演）"待补" | **确认仍缺失**（web/src 全库 grep 零匹配）；director/ 目录下亦无（grep 聚焦/推演/三视图/焦点 零匹配） | 维持待补（P1-4） |
| 视频合成"雏形/待补齐" | 仅 canvas-toolbar.tsx:230 一个 Beta 入口 | 维持待补（P1-3） |

## 5. 未核实项（如实标注，未虚构证据）

- LibTV 25 宫格独立复核：web_search 被无关结果污染（汽车/乐谱/世界杯），未取得一手页面。
- 即梦"智能画布"性质核实：同样被污染。
- Excalidraw+ 只读链接、WHEE 中文海报等外部结论全部基于公开页面文字，交互细节需登录实测复核（建议作为 P1-1 分享链接实现的前置调研）。
