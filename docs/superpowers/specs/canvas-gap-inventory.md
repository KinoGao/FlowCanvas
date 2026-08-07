---
title: FlowCanvas 未实现功能权威清单（gap inventory）
description: 对照当前源码（HEAD d1aeda2）逐条核验两轮调研 spec 的差距矩阵与 P0/P1/P2 补全路线的当前状态，输出带 file:line 证据的未实现功能清单，供实现计划与后续集群直接引用
---

# FlowCanvas 未实现功能权威清单

> 核验时间：2026-08（第二轮星河集群汇总）
> 核验方法：源码 read/grep（verified 级，带 file:line）+ git log（HEAD d1aeda2）+ 两轮 worker 交叉核验（天璇/天权 findings）+ 监管者独立复核
> 工作区注意：canvas-node.tsx / leafer-canvas.tsx / globals.css 三个文件有**其他会话未提交改动**，任何实现任务涉及这三个文件时需先确认冲突（见实现计划）。

## 1. 补全路线核验结果（P0/P1/P2，共 10 项）

| # | 项 | 对标 | 状态 | 证据（file:line） |
| --- | --- | --- | --- | --- |
| P0-1 | 账号级模板持久化 | TapNow 模板体系 | ✅ **已完成**（d1aeda2 + aa3251e） | web/src/services/api/canvas-templates.ts:34/42/53（listCanvasTemplates/saveCanvasTemplate/deleteCanvasTemplate）；backend CanvasTemplateController.java:14；entity/CanvasTemplate.java 存在 |
| P0-2 | 启用空间索引接线 | Miro 千元素级性能 | ❌ **未实现** | web/src/app/(user)/canvas/utils/canvas-spatial-index.ts:14/19/34 仅定义 buildSpatialIndex/querySpatialIndex，**全 web/src 零引用**（grep 无调用方） |
| P0-3 | 自动保存状态可见 + 崩溃恢复提示 | Miro/Notion 稳定性 | ❌ **未实现** | web/src/app/(user)/canvas/[id]/canvas-client-page.tsx 无「保存中/保存成功/保存失败/自动保存」状态 UI（grep 零命中，仅有模板保存 message） |
| P1-1 | 分享链接访问（只读/可编辑） | FigJam 分享链接 / Excalidraw+ 只读链接 | ❌ **未实现** | backend entity 无 CanvasShare（glob entity/*.java 11 个实体无分享表）；无 /api/share 路由 |
| P1-2 | 版本历史（快照+回滚） | Miro/Notion 版本历史 | ❌ **未实现** | backend entity 无 CanvasSnapshot；无版本快照接口 |
| P1-3 | 时间轴视频合成可视化 | TapNow 播放列表 | ❌ **未实现** | 仅 web/src/app/(user)/canvas/components/canvas-toolbar.tsx:230 一个「视频合成 Beta」入口（grep 视频合成/timeline/时间轴 唯一命中），无可视化时间轴组件 |
| P1-4 | 快捷分镜专业工具（镜头聚焦/焦点编辑/角色三视图/画面推演） | LibTV Slash 快捷 | ❌ **未实现** | web/src 全库 grep「镜头聚焦/焦点编辑/角色三视图/画面推演」零匹配；director/ 目录 grep「聚焦/推演/三视图/焦点」亦零匹配 |
| P2-1 | 评论/批注（锚定节点） | Miro/FigJam | ❌ 未实现 | 无评论相关组件/API |
| P2-2 | 模板市场/公共模板库 | Miro/Canva | ❌ 未实现 | 仅有账号级模板 API（P0-1），无公共模板维度 |
| P2-3 | 脚本富文本文档编辑 | LibTV 脚本节点 | ❌ 未实现 | 脚本工作台为纯文本编辑（见 todo.mdx 登记） |

## 2. todo.mdx LibTV 对标后续清单核验

| 待办项 | 状态 | 证据 |
| --- | --- | --- |
| 项目级工作流/故事板切换 + 全局素材引用视图 | ❌ 未实现 | 无多画布组织视图（todo.mdx 原文登记） |
| 脚本富文本文档编辑 | ❌ 未实现 | 同 P2-3 |
| 主画布整理/连线显隐 | ❌ 未实现 | 画布无视图切换/连线显隐开关（appearance 设置仅有网格吸附/辅助基准线两项，见 pending-test.mdx） |
| 可用的视频时间轴 | ❌ 未实现 | 同 P1-3 |
| 快捷分镜专业工具 | ❌ 未实现 | 同 P1-4 |
| 账号级工作流模板持久化 | ✅ 已完成 | 同 P0-1 |

## 3. 已实现但旧 spec 未登记的盲区（实现计划需注意，勿重复实现）

| 能力 | 证据 |
| --- | --- |
| **3D 导演台子应用**（director/storyai） | web/src/app/(user)/canvas/director/ 共 49 个文件：DirectorDesk.tsx（portal 全屏 z-index:220）、DirectorCanvas.tsx、CameraPanel/CharacterPanel/ScenePanel/PropPanel/ObjectTreePanel 等——**两份旧 spec 均未登记** |
| 25 宫格快捷分镜 | canvas-workflow-template.ts:14 twentyfive-grid（rows=5 cols=5） |

## 4. 画布代码质量问题（canvas-commercial-readiness.md §6 登记，静态发现 unverified 级）

| 级别 | 问题 | 备注 |
| --- | --- | --- |
| P1 | 小地图仅有开关按钮，渲染本体缺失，miniMapOpen 为死参数 | 静态发现，需复现确认 |
| P2 | Group 浮动菜单与错误提示硬编码深色/红色（违反画布主题规范） | 静态发现 |
| P2 | 模块级全局 _selectionRect 跨实例污染风险 | 静态发现 |
| P2 | canvas-generation-loading 私有样式入 globals.css（违反 CSS 规范） | globals.css 有其他会话改动，修复时注意冲突 |

## 5. 优先级建议（供实现计划引用）

- **本轮实现范围建议**：P0-2、P0-3（商业底线，工作量 2-3 人日）→ P1-1、P1-2（用户决策核心：版本历史+分享链接，6-10 人日）→ P1-4（快捷分镜专业工具，3-5 人日）→ P1-3（时间轴，5-8 人日）→ P2 视余量。
- **P1-3 范围边界**：「导出」已被用户决策裁减——时间轴实现只做**合成预览与媒体产出**，不做数据导出；若「导出合并 MP4」与裁减冲突，实施前需与用户确认语义边界。
- **P1-4 与 3D 导演台的关系**：director/storyai 不是快捷分镜专业工具的实现（grep 已排除），两者可并行；但镜头聚焦/角色三视图与导演台镜头/角色面板存在交互重叠，实施时先确认是否需要复用导演台组件。
