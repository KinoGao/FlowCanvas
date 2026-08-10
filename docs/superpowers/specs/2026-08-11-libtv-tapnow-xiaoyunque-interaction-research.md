# LibTV、TapNow 与小云雀无限画布公开材料调研

> 调研日期：2026-08-11
> 文档类型：竞品公开页面、官方帮助文档与公开作品材料研究
> 研究对象：[LibTV](https://www.liblib.tv/)、[TapNow](https://www.tapnow.ai/zh)、[小云雀](https://xyq.jianying.com/)

## 0. 取证边界

本文只放竞品或公开产品材料：官方页面、官方帮助文档、公开分享页和公开可见作品。本文不放 FlowCanvas 本地项目截图，也不把 FlowCanvas 的实现状态写成竞品事实。

FlowCanvas 的内部 UI 自测另存为[内部 UI 自测证据](2026-08-11-node-ui-motion-evidence.md)，它与本竞品调研分开使用。

## 1. 结论先行

| 产品 | 公开材料能确认的重点 | 不能从公开材料确认的内容 |
|---|---|---|
| LibTV | 无限画布、自由编排、视频创作入口、工作流/Skill 能力包装 | 登录后的节点级 hover、连接点、右键菜单和完整动效 |
| TapNow | 无限画布是核心工作空间；节点、连线、选择、平移、缩放、Agent 引用有官方帮助文档 | 当前账号内所有最新菜单细节和部分生成中的状态动画 |
| 小云雀 | 一句话灵感入口、故事/短剧/视频 Agent、公开作品与工作流展示 | 公开页面不能证明它采用 TapNow 同样的通用节点画布和连线规则 |

核心判断：FlowCanvas 应吸收 TapNow 的空间关系和操作契约，参考 LibTV 的能力发现与工作流包装，同时借鉴小云雀从“灵感—故事—镜头—成片”的叙事层组织方式。三者的商业化、会员和社区机制不属于本次画布交互对齐范围。

## 2. 公开素材目录

以下图片和 GIF 均来自公开产品页面或公开产品材料的归档，不是 FlowCanvas 项目截图。

| 产品 | 本地归档素材 | 公开来源 |
|---|---|---|
| LibTV | `assets/competitor-canvas-research/libtv-home.png`、`libtv-project.png`、`libtv-skills.png` | [LibTV 首页](https://www.liblib.tv/)、[项目入口](https://www.liblib.tv/project)、[工作流入口](https://www.liblib.tv/wappro?sourceid=040004) |
| TapNow | `assets/competitor-canvas-research/tapnow-home.png`、`tapnow-app-home.png`、`tapnow-canvas-overview.jpg`、`tapnow-empty-canvas.png`、`tapnow-node-pair.png`、`tapnow-multi-reference.png`、`tapnow-connected-results.png`、`tapnow-zoomed-workflow.png`、`tapnow-agent-open.gif` | [TapNow 官网](https://www.tapnow.ai/zh)、[官方画布文档](https://docs.tapnow.ai/zh/docs/canvas/explore-the-canvas)、[认识画布](https://docs.tapnow.ai/zh/docs/wo-de-hua-bu/ren-shi-hua-bu)、[Agent 文档](https://docs.tapnow.ai/en/docs/agent/tapnow-agent) |
| 小云雀 | `assets/competitor-canvas-research/xiaoyunque-01-home.jpg`、`xiaoyunque-02-workflow-showcase.jpg` | [小云雀官方入口](https://xyq.jianying.com/)、[公开分享页](https://xiaoyunque.jianying.com/s/PQiOHOQiGUE/)、[火山引擎产品介绍](https://www.volcengine.com/docs/85621/2306243?lang=zh) |

## 3. LibTV：把创作目标包装成可发现的生产入口

### 3.1 首页与能力入口

![LibTV 首页公开材料：新建画布、能力卡片和入口层级](assets/competitor-canvas-research/libtv-home.png)

公开首页的有效信息不是运营文案，而是入口层级：新建画布、能力卡、Skill/工作流和 Agent 被放在同一套创作入口中。用户先看到“我现在可以做什么”，再进入具体的节点或模型参数。

### 3.2 项目空状态

![LibTV 项目公开材料：项目空状态和开始创作入口](assets/competitor-canvas-research/libtv-project.png)

项目空状态提供明确的下一步，而不是只显示空白列表。对无限画布产品来说，空项目要同时表达项目结构、创建动作和返回路径。

### 3.3 Skills / 工作流发现

![LibTV Skills 公开材料：分类、搜索和可复用能力卡片](assets/competitor-canvas-research/libtv-skills.png)

Skill 页把复杂能力包装成“可浏览、可搜索、可复用”的卡片。值得借鉴的交互链路是：

`自由描述想法 → 分类筛选 → 搜索 → 查看能力 → 插入或执行`

这比直接把所有模型和参数铺在画布上更适合新用户；但 FlowCanvas 仍应保持底层节点和连线可见，避免能力卡变成不可检查的黑盒。

### 3.4 LibTV 可借鉴与不可推断部分

- 可借鉴：以视频目标和生产阶段组织工作流；用 Skill、模板和快捷能力降低启动门槛；让 Agent 成为画布上下文入口。
- 不可推断：未登录公开页面无法证明具体节点菜单、连接点、右键行为和节点级动画。
- 不纳入范围：积分、会员、付费模型、社区发布和创作者激励。

## 4. TapNow：画布是主场，关系是核心信息架构

### 4.1 官网和工作空间入口

![TapNow 官网公开材料：黑色画布叙事和创意工作空间定位](assets/competitor-canvas-research/tapnow-home.png)

![TapNow 工作空间公开材料：Agent、推荐能力和内容入口](assets/competitor-canvas-research/tapnow-app-home.png)

TapNow 的品牌页面先建立“这是一个创意画布”的心智，再把模型、Agent、作品和模板放到工作空间中。画布不是结果展示的背景，而是承载输入、过程、结果和后续引用的主空间。

### 4.2 空画布和创建入口

![TapNow 空画布公开材料：双击提示和快捷创建入口](assets/competitor-canvas-research/tapnow-empty-canvas.png)

官方画布文档说明，创建节点至少存在三种入口：点击加号菜单、空白区双击、空白区右键。空画布中的提示同时承担教学和 CTA，用户不需要先阅读教程才能知道如何开始。

### 4.3 节点、连线和结果来源

![TapNow 节点关系公开材料：节点在画布中保持可移动和可编辑](assets/competitor-canvas-research/tapnow-node-pair.png)

![TapNow 多参考公开材料：多个输入作为并行上下文](assets/competitor-canvas-research/tapnow-multi-reference.png)

![TapNow 连接结果公开材料：批量结果和来源关系保持可追溯](assets/competitor-canvas-research/tapnow-connected-results.png)

TapNow 的节点不是单一表单，而是空间中的内容对象。源节点、参考节点、结果节点和连线共同说明“这个结果由什么产生”。多参考不是简单上传多张图，而是让不同素材作为同一任务的并行上下文。

官方文档可确认的关系规则包括：

1. 节点可以被选择、移动、框选和多选。
2. 连接用于表达下游节点对上游内容的引用。
3. 生成结果追加到画布，来源节点继续保留。
4. 删除连接不等于删除两端节点。
5. 连接、引用和 Agent 上下文需要保持一致，不能只画一条视觉线。

### 4.4 视口导航和复杂工作流

![TapNow 缩放后的公开工作流材料：多个节点在同一空间中组织](assets/competitor-canvas-research/tapnow-zoomed-workflow.png)

复杂工作流依赖平移、缩放、适配视图和小地图找回上下文。官方画布文档把普通滚轮/触控板滑动、捏合缩放、Ctrl/Cmd+滚轮、中键/右键平移和空白区框选区分开；这种手势分工本身就是产品的核心协议。

### 4.5 Agent 与画布上下文

![TapNow Agent 公开交互序列](assets/competitor-canvas-research/tapnow-agent-open.gif)

TapNow 的 Agent 不是独立聊天窗口，而是上下文层：用户可以引用当前选中的节点、附件或指定节点，Agent 的输出继续回到画布。对高成本动作，官方交互应先显示目标、计划和影响范围，再执行。

## 5. 小云雀：从一句灵感组织到故事、镜头和成片

### 5.1 官方公开入口

![小云雀官方公开首页材料：灵感输入和内容创作入口](assets/competitor-canvas-research/xiaoyunque-01-home.jpg)

小云雀的公开入口把“输入灵感 / 开始创作”放在首位，产品心智更接近内容创作 Agent，而不是先让用户学习节点图。公开材料可以确认它围绕短视频、故事/短剧、图片和成片组织创作。

### 5.2 公开作品与工作流展示

![小云雀公开作品/工作流材料：成片展示和工作流发现入口](assets/competitor-canvas-research/xiaoyunque-02-workflow-showcase.jpg)

作品展示承担两个任务：给用户看结果预期，也让用户发现可以复用的创作路径。对 FlowCanvas 的启发是，脚本、角色、场景、分镜和成片可以有更强的语义层，但底层仍应保留可检查的节点关系。

### 5.3 不能把公开页面扩大解释为通用无限画布

公开入口和作品页不能证明小云雀与 TapNow 具有相同的自由平移、缩放、框选、连接点和右键规则。登录后的工作台如果不可公开访问，应标为“待登录后核验”，不能用其他产品的截图替代。

## 6. 三款产品的公开交互模型对比

| 交互层 | LibTV | TapNow | 小云雀 | 对 FlowCanvas 的启发 |
|---|---|---|---|---|
| 首次进入 | 新建画布、能力卡、Skill/工作流 | 进入画布后直接创建节点或召唤 Agent | 输入一句灵感或选择内容方向 | 空画布同时提供快捷创建和自然语言入口 |
| 核心空间 | 视频生产工作流 | 节点、连线和自由布局 | 故事/短剧/成片阶段 | 节点是底层，故事阶段是上层语义 |
| 关系表达 | 工作流和能力步骤 | 连接线、引用和来源节点 | 剧本、角色、镜头和结果阶段 | 结果追加、来源保留、关系可追溯 |
| 复杂度控制 | Skill、模板、工作流包装 | 缩放、分组、Agent、引用 | Agent 拆解生产阶段 | 默认简单，展开后逐阶段可检查 |
| Agent 位置 | 生产入口和能力编排 | 画布上下文层 | 内容创作主入口 | Agent 必须知道当前上下文，不能脱离画布 |
| 公开证据强度 | 首页和入口强，画布细节弱 | 官方画布文档最完整 | 入口和成片展示强，画布细节弱 | 对每条结论标注公开/官方文档/待核验 |

## 7. FlowCanvas 应吸收的交互原则

1. 空状态必须可行动：中心 CTA、双击/右键创建、节点加号和 Agent 入口统一进入同一创建逻辑。
2. 画布手势必须互斥：选择、框选、平移、缩放和右键菜单不能抢同一个动作。
3. 结果不覆盖来源：每次生成都保留来源、参数、引用和可回溯关系。
4. 能力卡和模板是启动层，不替代节点层；插入后要能看到节点和连线。
5. Agent 执行前展示目标、引用素材、模型、数量、比例、时长和影响范围。
6. 故事/分镜/成片是语义层，可以帮助新用户理解工作流，但不能隐藏底层节点。
7. 每条竞品结论都要能回到公开截图、官方文档或公开分享页；无法公开确认的内容明确写“待核验”。

## 8. 参考资料

- [LibTV 官方首页](https://www.liblib.tv/)
- [LibTV 项目入口](https://www.liblib.tv/project)
- [LibTV 工作流入口](https://www.liblib.tv/wappro?sourceid=040004)
- [TapNow 官方站点](https://www.tapnow.ai/zh)
- [TapNow 官方画布概览](https://docs.tapnow.ai/zh/docs/canvas/explore-the-canvas)
- [TapNow 官方认识画布](https://docs.tapnow.ai/zh/docs/wo-de-hua-bu/ren-shi-hua-bu)
- [TapNow 官方 Agent 文档](https://docs.tapnow.ai/en/docs/agent/tapnow-agent)
- [小云雀官方入口](https://xyq.jianying.com/)
- [小云雀公开分享页](https://xiaoyunque.jianying.com/s/PQiOHOQiGUE/)
- [火山引擎：小云雀智能生视频 Agent 产品介绍](https://www.volcengine.com/docs/85621/2306243?lang=zh)
- [旧版 LibTV × TapNow 公开视觉材料归档](2026-08-09-libtv-tapnow-visual-interaction.md)
