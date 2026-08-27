---
title: 画布商业化成熟度调研（增量报告）
description: LibTV / TapNow / Miro / FigJam / Canva / Notion 商业化成熟度维度调研——协作、权限、性能、稳定性、导出、模板六维标准，FlowCanvas 现状与缺口，P0/P1/P2 补全路线
---

# 画布商业化成熟度调研（增量报告）

> 本报告是 `infinite-canvas-competitor-research.md`（2026-07 版，功能差距矩阵）的**增量补充**：已有 spec 覆盖功能差距（节点/分镜/快捷工具/模板/时间轴），本报告聚焦**商业化成熟度六维**（协作、权限、性能、稳定性、导出、模板）——即"可完全商业化售卖"的画布产品所需的产品成熟度标准。
> 证据口径：外部产品结论基于公开网页抓取（unverified 级，标注来源）；FlowCanvas 现状基于源码 read/grep + git log（verified 级，带 file:line）。

## 1. 调研对象

| 产品 | 定位 | 本报告角色 |
| --- | --- | --- |
| LibTV（哩布哩布） | 无限画布 + 节点工作流，脚本→分镜→成片全流程 | 核心对标（功能维度，已有 spec §2） |
| TapNow（添科智能，tapnow.ai） | Creative OS：Agent + Apps + 画布 | 核心对标（功能维度，已有 spec §3） |
| Miro / FigJam / Canva / Notion | 通用闭源无限画布/白板 | 商业化成熟度参照（本报告重点） |

> 注：用户原述 "wapnow/tapnow" 已核实为 **TapNow**（tapnow.ai，"你的智能体创意画布"，AI 视觉创作引擎）。

## 2. 竞品能力深挖增量（LibTV / TapNow）

基于 TapNow 官方文档（docs.tapnow.ai，7+ 页 + sitemap 索引）、LibTV 官方 Skill 页及 aigc/nova/uisdc 三篇第三方评测，对已有 spec §2/§3 的增量补充：

### 2.1 LibTV 新增证据

| 能力 | 描述 | 证据 |
| --- | --- | --- |
| 画布一键整理 | 主画布整理/连线显隐视图切换 | LibTV 官网/skill 页（unverified） |
| OpenClaw 自动挡 | Agent 连续执行模式，自然语言驱动全流程 | LibTV skill 页（unverified） |
| 团队版工作流 | 工作流模板团队级共享 | LibTV 官网（unverified） |
| Skill 开源仓库 | 官方公开 skill 包仓库，可扩展 Agent 能力 | LibTV GitHub/官网（unverified） |

### 2.2 TapNow 交互细节补充

| 能力 | 交互细节 | 证据 |
| --- | --- | --- |
| 节点连线语义 | 连线 = 参考引用关系（非执行顺序）；下游节点 @ 引用上游图片；类型不兼容不连线；删除连线不删内容 | docs.tapnow.ai（unverified，与已有 spec §3 一致） |
| 播放列表时间轴 | 多视频节点接入同一时间线，拖边缘裁切、播放头切割（快捷键 C/Q/E）、导出原始/合并 MP4 | docs.tapnow.ai（unverified） |
| 素材三级体系 | 素材库（单条）→ 主体库（角色/产品一致性，@ 引用）→ 模板（节点组结构） | docs.tapnow.ai（unverified） |
| 生成确认模式 | 自动生成 vs 手动确认（先出确认卡片：模型/比例/时长/数量/参考） | docs.tapnow.ai（unverified） |
| 智能剪辑 | 画面变化自动识别镜头切换 → 拆成独立视频节点 | docs.tapnow.ai（unverified） |
| Brainstorm | 生成前创意开发入口：创意简报/剧本/分镜表/HTML Demo/Pitch Deck | docs.tapnow.ai（unverified） |

### 2.3 需修正的旧结论

- 已有 spec §3 提到 "AI 执行导演 / 多角度镜头控制" 营销术语——官方文档未出现，维持"未确认"标注；
- 灯光点位数字（LibTV 26 主光点位 vs TapNow 数字）存在来源冲突，按官方文档为准，第三方评测数字不可靠。

## 3. 商业化成熟度六维标准（参照 Miro / FigJam / Canva / Notion）

> 来源：Miro 定价页 + 帮助中心、Notion 帮助中心、Figma 帮助中心公开抓取（unverified 级）。Canva / ClickUp 白板页被 Cloudflare 403 拦截未取证；Miro / Figma 性能类帮助文章 403/404 未取证——**性能维度量化数据缺失**，按产品宣传口径估计并标注。

### 3.1 协作（实时协同）

| 标准 | 代表产品 | 公开证据 |
| --- | --- | --- |
| 多用户实时编辑（游标可见、多人同板操作） | Miro / FigJam | 官网宣传（unverified） |
| 评论/批注（锚定到元素） | Miro / FigJam / Canva | 帮助中心（unverified） |
| 版本历史（回滚到任意历史版本） | Miro / Notion | 帮助中心（unverified） |
| 在线状态/成员列表 | Miro | 官网（unverified） |

### 3.2 权限模型

| 标准 | 代表产品 | 公开证据 |
| --- | --- | --- |
| 角色分级（所有者/编辑者/查看者/访客） | Miro / FigJam / Notion | 帮助中心（unverified） |
| 分享链接（可设权限：任何人可看/可编辑、仅组织内） | Miro / FigJam | 帮助中心（unverified） |
| 团队空间/文件夹组织 | Miro / Notion | 帮助中心（unverified） |
| 访客/来宾模式（不占席位） | Miro / FigJam | 定价页（unverified） |

### 3.3 性能（大画布）

> ⚠️ 未取证：Miro 帮助文章（help.miro.com 403）、Figma 帮助文章（404）、Canva/ClickUp（Cloudflare 403）。量化标准（元素上限、画布尺寸、渲染策略）**无公开一手数据**，本报告不虚构数字。已知公开口径（低置信）：Miro 单板可容纳数千元素（官方宣传口径，unverified）；tldraw/开源参照非本报告范围。

### 3.4 稳定性与数据安全

| 标准 | 代表产品 | 公开证据 |
| --- | --- | --- |
| 自动保存（实时/节流） | Miro / Notion / FigJam | 帮助中心（unverified） |
| 崩溃恢复（会话恢复提示） | Figma / Miro | 帮助中心（unverified） |
| 离线编辑（WebDAV/本地缓存） | Notion（部分） | 帮助中心（unverified） |
| 数据导出（用户可带走数据） | 全部 | 帮助中心（unverified） |

### 3.5 导出

| 标准 | 代表产品 | 公开证据 |
| --- | --- | --- |
| 图片导出（PNG/JPEG，含选区） | Miro / FigJam | 帮助中心（unverified） |
| PDF 导出 | Miro / FigJam | 帮助中心（unverified） |
| 结构化导出（JSON/CSV/备份） | Miro / Notion | 帮助中心（unverified） |
| 媒体文件导出（视频 MP4 等） | 媒体类产品 | 帮助中心（unverified） |

### 3.6 模板体系

| 标准 | 代表产品 | 公开证据 |
| --- | --- | --- |
| 模板市场/公共模板库 | Miro / Canva / FigJam | 官网（unverified） |
| 个人模板（保存自己的结构复用） | Miro / FigJam | 帮助中心（unverified） |
| 团队模板（团队空间共享） | Miro | 帮助中心（unverified） |
| 模板插入不破坏现有内容 | TapNow（节点组形式） | docs.tapnow.ai（unverified） |

## 4. FlowCanvas 现状盘点（当前 HEAD 41ec43e）

来源：canvas 源码 read/grep（verified 级）。对照已有 spec §4 差距矩阵——**结论一致，无过期项**（spec 已随 41ec43e 提交同步更新）。

### 4.1 已实现能力（带证据）

| 能力 | 证据 |
| --- | --- |
| 7 类节点（文本/图片/视频/音频/脚本/组/其他） | canvas-node.tsx / types.ts（verified） |
| 三层连线渲染（吸附/流光/基准线） | leafer-edges.ts / leafer-canvas.tsx（verified） |
| 工具栏 + 节点浮动菜单 + 右键菜单 | canvas-toolbar.tsx / canvas-node-hover-toolbar.tsx / canvas-context-menu.tsx（verified） |
| 项目内工作流模板（工具箱保存/插入节点组+连线） | canvas-workflow-toolbox.tsx（verified） |
| zip 项目导出 | canvas-export.ts（verified） |
| 后端账号工作区同步 + WebDAV 独立通道 | services/api + backend（verified） |
| 生成链路（prompt 面板 → 生成任务 → 节点回填） | canvas-node-generation.ts / canvas-generation-runs.ts（verified） |
| 空间索引（canvas-spatial-index.ts 已实现但**未接线**） | canvas-spatial-index.ts（verified） |

### 4.2 商业化成熟度六维缺口

| 维度 | 现状 | 缺口 |
| --- | --- | --- |
| 协作 | ❌ 无实时协同、无游标、无评论、无版本历史 | 多人协作全缺 |
| 权限 | ❌ 无角色分级、无分享链接、无访客模式 | 权限模型全缺 |
| 性能 | 🟡 有空间索引（未接线）、Leafer 渲染 | 空间索引未启用；无规模化基准 |
| 稳定性 | 🟡 后端账号自动保存 | 无崩溃恢复提示、无离线策略 |
| 导出 | 🟡 仅 zip 项目导出 | 缺 PNG/PDF/JSON 单图与选区导出 |
| 模板 | 🟡 项目内模板 | 缺账号级持久化（已有 spec §6 已列）、缺模板市场 |

## 5. P0/P1/P2 补全路线

> 排序依据：商业化售卖底线（P0）→ 竞争力（P1）→ 锦上添花（P2）。工作量粗估按单人天（人日）。
> 用户决策裁剪（2026-07 确认）：协作维度**不做实时协同**，以**版本历史**为核心；权限维度**不做角色体系**，只要分享链接；**导出**不在路线内。其余按序保留。

### P0 — 商业底线（不做不可售卖）

| # | 做什么 | 为什么（对标） | 涉及文件（粗估） | 工作量 |
| --- | --- | --- | --- | --- |
| P0-1 | 账号级模板持久化：工具箱模板升级为后端账号工作区存储 | 对标 TapNow 模板体系 + 已有 spec §6#2 | backend Workflow API + canvas-workflow-toolbox.tsx | 2-3 人日 |
| P0-2 | 启用空间索引：canvas-spatial-index.ts 接线到渲染/命中检测 | 大画布性能是商业化命门（对标 Miro 千元素级） | leafer-canvas.tsx + canvas-spatial-index.ts | 1-2 人日 |
| P0-3 | 自动保存状态可见 + 崩溃恢复提示 | 对标 Miro/Notion 稳定性标准 | canvas-client-page.tsx | 1 人日 |

### P1 — 竞争力（显著拉开差距）

| # | 做什么 | 为什么（对标） | 涉及文件（粗估） | 工作量 |
| --- | --- | --- | --- | --- |
| P1-1 | 分享链接访问：画布只读/可编辑分享链接（后端 token 校验，不含角色体系） | 对标 FigJam 分享链接 | backend + canvas 路由 | 3-5 人日 |
| P1-2 | 版本历史：画布快照 + 回滚入口（协作核心，替代实时协同） | 对标 Miro/Notion | backend + canvas 前端 | 3-5 人日 |
| P1-3 | 时间轴视频合成可视化（多片段拼接/裁切/排序/导出） | 对标 TapNow 播放列表（已有 spec §6#3） | canvas 时间轴组件 | 5-8 人日 |
| P1-4 | 快捷分镜补全：镜头聚焦、焦点编辑、角色三视图、画面推演 | 对标 LibTV Slash（已有 spec §6#1） | canvas-node-generation.ts 扩展 | 3-5 人日 |

### P2 — 锦上添花（差异化）

| # | 做什么 | 为什么（对标） | 涉及文件（粗估） | 工作量 |
| --- | --- | --- | --- | --- |
| P2-1 | 评论/批注（锚定到节点） | 对标 Miro/FigJam 协作 | canvas 前端 | 5+ 人日 |
| P2-2 | 模板市场/公共模板库 | 对标 Miro/Canva | backend + 前端 | 5+ 人日 |
| P2-3 | 脚本富文本文档编辑 | 对标 LibTV 脚本节点（已有 spec §6#4） | canvas 脚本节点 | 3-5 人日 |

## 6. 附录：全局审查发现的画布代码质量问题（与调研无关，供后续修复）

星河集群全局审查（瑶光）对 leafer-canvas.tsx 等文件的静态审查发现：

| 级别 | 问题 |
| --- | --- |
| P1 | 小地图仅有开关按钮，渲染本体缺失，miniMapOpen 为死参数 |
| P2 | Group 浮动菜单与错误提示硬编码深色/红色（违反画布主题规范） |
| P2 | 模块级全局 _selectionRect 存在跨实例污染风险 |
| P2 | canvas-generation-loading 私有样式入 globals.css（违反 CSS 规范） |

> 以上为静态审查发现（unverified 级，需复现确认），不属于本调研范围，登记备查。
