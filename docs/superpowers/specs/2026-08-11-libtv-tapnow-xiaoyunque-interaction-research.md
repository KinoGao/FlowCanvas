# LibTV、TapNow 与小云雀无限画布交互调研

> 调研日期：2026-08-11
> 文档类型：竞品公开页面、官方帮助文档、公开作品材料与登录后工作台取证
> 研究对象：[LibTV](https://www.liblib.tv/)、[TapNow](https://www.tapnow.ai/zh)、[小云雀](https://xyq.jianying.com/)

## 0. 取证边界

本文只放竞品材料：官方页面、官方帮助文档、公开分享页、公开可见作品，以及本次在已登录竞品账号内实际看到的工作台截图。本文不放 FlowCanvas 本地项目截图，也不把 FlowCanvas 的实现状态写成竞品事实。

FlowCanvas 的内部 UI 自测另存为[内部 UI 自测证据](2026-08-11-node-ui-motion-evidence.md)，它与本竞品调研分开使用。

登录后取证只记录可见 UI、节点操作入口和状态差异，不读取、不保存账号凭据、Token 或其他敏感信息；本次没有触发付费生成、删除项目或其他不可逆操作。

## 1. 结论先行

| 产品 | 公开材料能确认的重点 | 不能从公开材料确认的内容 |
|---|---|---|
| LibTV | 无限画布、自由编排、视频创作入口、工作流/Skill 能力包装；已登录项目库和项目卡片入口 | 本次会话里已有项目卡片未进入画布，因此不对 LibTV 的节点级 UI、连接点、右键菜单和动效下结论 |
| TapNow | 无限画布、节点菜单、文字/图片/视频节点操作 UI、Agent 面板，以及选择、平移、缩放、连线等官方契约 | 生成中的完整进度动画、节点 hover 的全部变体和未开启的 Beta 能力 |
| 小云雀 | 已登录工作台、自由画布、添加节点菜单、文字/图片/视频/音频节点 UI 与音频生成面板 | 本次只对已看到的节点状态负责，不把未点击到的节点菜单或动态生成过程写成事实 |

核心判断：FlowCanvas 应吸收 TapNow 的空间关系和操作契约，参考 LibTV 的能力发现与工作流包装，同时借鉴小云雀从“灵感—故事—镜头—成片”的叙事层组织方式。三者的商业化、会员和社区机制不属于本次画布交互对齐范围。

## 2. 素材目录与证据类型

以下图片和 GIF 均来自竞品页面或竞品材料的归档，不是 FlowCanvas 项目截图。文件名带 `logged-in` 的图片表示本次登录后实际工作台取证；不带该后缀的图片来自公开页面、官方文档或公开材料。

| 产品 | 本地归档素材 | 公开来源 |
|---|---|---|
| LibTV | `assets/competitor-canvas-research/libtv-home.png`、`libtv-project.png`、`libtv-skills.png` | [LibTV 首页](https://www.liblib.tv/)、[项目入口](https://www.liblib.tv/project)、[工作流入口](https://www.liblib.tv/wappro?sourceid=040004) |
| TapNow | `assets/competitor-canvas-research/tapnow-home.png`、`tapnow-app-home.png`、`tapnow-canvas-overview.jpg`、`tapnow-empty-canvas.png`、`tapnow-node-pair.png`、`tapnow-multi-reference.png`、`tapnow-connected-results.png`、`tapnow-zoomed-workflow.png`、`tapnow-agent-open.gif` | [TapNow 官网](https://www.tapnow.ai/zh)、[官方画布文档](https://docs.tapnow.ai/zh/docs/canvas/explore-the-canvas)、[认识画布](https://docs.tapnow.ai/zh/docs/wo-de-hua-bu/ren-shi-hua-bu)、[Agent 文档](https://docs.tapnow.ai/en/docs/agent/tapnow-agent) |
| 小云雀 | `assets/competitor-canvas-research/xiaoyunque-01-home.jpg`、`xiaoyunque-02-workflow-showcase.jpg` | [小云雀官方入口](https://xyq.jianying.com/)、[公开分享页](https://xiaoyunque.jianying.com/s/PQiOHOQiGUE/)、[火山引擎产品介绍](https://www.volcengine.com/docs/85621/2306243?lang=zh) |

本次登录后新增的节点级取证见[第 6 节](#6-登录后工作台取证2026-08-11)，全部放在 `assets/competitor-canvas-research/` 下。文档不引用任何本地项目截图或本地运行地址作为竞品证据。

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

## 6. 登录后工作台取证（2026-08-11）

本节是本次登录后的实机取证，不是公开页面推断。截图只记录画布、节点、菜单和面板的可见状态；没有提交付费生成，也没有删除或覆盖已有作品。静态截图可以证明状态和层级，不能替代逐帧录屏，因此“动画”只在确实看到状态切换时描述为状态变化，不把过渡时长、缓动曲线或生成进度动画臆测成竞品事实。

### 6.1 小云雀：Agent 首页与自由画布并存

![小云雀已登录首页：创作 Agent、画布开关和工具入口](assets/competitor-canvas-research/xiaoyunque-home-logged-in.png)

登录后的首页不是单一输入框：左侧有创作、短剧 Agent、营销 Agent、资产和学习中心；主区域同时提供创作 Agent / 短剧 Agent、灵感输入、`@引用角色与素材`、画布开关、模型、技能、画幅和自动设置。工具卡里直接出现自由画布、三视图、一镜到底、首尾帧等内容入口。这里的产品策略是先给语义任务，再允许进入底层画布。

![小云雀已登录自由画布：空画布、快速新建节点与 Agent 面板](assets/competitor-canvas-research/xiaoyunque-free-canvas.png)

进入自由画布后，实际看到的结构是：

- 浅色点阵画布；顶部有项目名、保存状态、画幅、积分、分享等项目级信息。
- 左侧竖向工具栏包含“添加节点”“项目资产”“帮助”；视口工具包含重置、隐藏边、画布小地图、网格吸附、缩小、放大。
- 空状态中心有快速新建视频、图片、文本、音频四个入口；右侧固定 Agent 面板提供新对话和历史。

![小云雀添加节点菜单：文本、图片、视频、音频](assets/competitor-canvas-research/xiaoyunque-add-node-menu.png)

点击“添加节点”后，菜单按媒体类型分成文本、图片、视频、音频；文本下还能区分设置、台词、剧情说明。菜单是画布级创建入口，和空状态中心的四个快捷入口指向同一类节点创建动作。

![小云雀文本节点：选中后的富文本工具栏、缩放手柄和连接点](assets/competitor-canvas-research/xiaoyunque-text-node.png)

文本节点的实机状态细节：节点被选中后出现白色圆角卡片、缩放手柄和右侧连接点；卡片上方浮出富文本工具栏，包含标题层级、引用、粗体、斜体、下划线、删除线、链接、清除格式和全屏等操作。也就是说，文本节点不是只有一个输入框，而是“节点容器 + 节点内编辑态 + 画布连接态”三层 UI。

![小云雀图片节点：上传与资产库选择](assets/competitor-canvas-research/xiaoyunque-image-node.png)

图片节点的空状态保留两个明确入口：“上传”和“从小云雀资产库选择”。它把一次性上传和复用已有素材拆开，避免用户把资产库误认为普通文件选择器。

![小云雀视频节点：提示词、风格、模型与消耗信息](assets/competitor-canvas-research/xiaoyunque-video-node.png)

视频节点进入生成准备态后，节点内出现“描述你想要生成的短片内容，@引用素材”的提示词编辑区、风格入口、模型选择和消耗信息。当前截图可见 `2.0 Fast VIP` 与 30 的消耗提示，但没有提交生成，因此不对后续生成中、成功、失败或重试动画下结论。

![小云雀音频节点：音色描述、参考素材、模型、采样率与消耗](assets/competitor-canvas-research/xiaoyunque-audio-node.png)

音频节点的实机面板暴露了更完整的生成参数：音色描述输入、参考素材上传、`Seed Audio 1.0 新 vip`、`44100 Hz`、`1积分/3s`，以及 Enter / Ctrl+Enter 提交提示。它说明音频节点不是图片/视频节点的简单换皮，至少需要独立的音色、参考素材、采样率和时长成本信息。

### 6.2 TapNow：节点菜单、媒体节点 Composer 与 Agent 上下文

![TapNow 已登录首页：账号工作区、项目入口与功能卡](assets/competitor-canvas-research/tapnow-home-logged-in.png)

![TapNow 已登录工作空间：项目列表、个人/团队切换与新建入口](assets/competitor-canvas-research/tapnow-workspace-logged-in.png)

登录后 TapNow 先经过账号首页和工作空间，再进入具体画布。工作空间里可见教程项目、个人/团队切换、搜索、网格/列表视图、新建文件夹和新建项目；这层项目管理 UI 与画布节点 UI 是分开的。

![TapNow 首次进入画布：创作者类型引导弹层](assets/competitor-canvas-research/tapnow-canvas-logged-in.png)

首次进入教程画布时出现“你是哪类创作者？”引导弹层，并提供跳过新手教程。跳过后还出现一次“头脑风暴模式 / TapNow Agent 应用上线”推广弹层；关闭弹层后才进入可操作的空画布。这是登录后首次进入的真实状态，不应和空画布本身混为一张截图。

![TapNow 已登录空画布：点阵背景、快捷创建、视口工具与 Agent 入口](assets/competitor-canvas-research/tapnow-empty-canvas-logged-in.png)

空画布实际呈黑色点阵背景，顶部是项目名、积分、社区和分享；左侧竖栏包含加号、搜索、文件夹、列表、聊天、历史等入口；中心快捷入口包含文字生视频、图片换背景、首帧生成视频、音频生视频和模板；左下角有小地图、网格、适配和缩放控制，右下角是 Agent 浮动入口。空状态同时承担教学、创建和视口导航三种职责。

![TapNow 添加节点菜单：媒体节点、Beta 能力、图片编辑器与上传](assets/competitor-canvas-research/tapnow-add-node-menu-logged-in.png)

添加节点菜单的实机分层如下：

| 菜单项 | 可见子项或状态 |
|---|---|
| 文本 | 脚本、广告词、品牌文案 |
| 图片 | 宣传图、海报、封面 |
| 视频 | 宣传视频、动画、电影 |
| 音频 | 音乐、配音、音效 |
| 3D 世界 | Beta，当前不可用 |
| 剪辑时间线 | Beta，可见“时间轴串联多段素材”说明 |
| 图片编辑器 | 独立图片编辑入口 |
| 上传 | 支持图片、视频、音频和 3D 资产 |

![TapNow 文字节点：选中工具栏、连接点与底部生成 Composer](assets/competitor-canvas-research/tapnow-text-node-logged-in.png)

文字节点选中后，节点上方是深色富文本工具栏，包含文字颜色、标题层级、引用、粗体、斜体、列表等；节点左右两侧都有连接点；节点底部的 Composer 同时提供提示词输入、模型 `G 3.1 Flash Lite`、数量和 1 的消耗提示。节点编辑和生成 Composer 是同一节点内的两个操作层。

![TapNow 图片节点：上传入口、连接点与 Seedream Composer](assets/competitor-canvas-research/tapnow-image-node-logged-in.png)

图片节点包含上传入口和图片占位区，左右两侧保留连接点；底部 Composer 显示 `Seedream 5.0 Lite`、`1:1 · 2K`、数量和 5 的消耗提示。图片节点的参考输入、尺寸和模型信息没有被隐藏在二级设置里。

![TapNow 视频节点：视频占位、首尾帧参数与 Seedance Composer](assets/competitor-canvas-research/tapnow-video-node-logged-in.png)

视频节点同样有上传入口、视频占位区和左右连接点；底部 Composer 显示 `Seedance 2.0 Mini`、`首尾帧 · 16:9 · 480p · 5s`、音频开关、数量和 30 的消耗提示。这里能直接看到首尾帧、画幅、分辨率、时长和音频开关，不需要先打开一个全屏配置面板。

![TapNow Agent 面板：新建对话、建议卡片与画布上下文入口](assets/competitor-canvas-research/tapnow-agent-state-logged-in.png)

点击右下角 Agent 浮动入口后，右侧打开“新建对话”面板，显示当前账号问候、Brainstorm / 分析等建议卡片和输入 Composer；画布仍保持可见。这个状态支持“Agent 是画布侧栏，不是离开画布的独立聊天页”的判断。

### 6.3 LibTV：已登录项目库已确认，画布节点细节不作伪证

![LibTV 已登录项目库：账号状态、项目导航和项目卡片](assets/competitor-canvas-research/libtv-project-logged-in.png)

登录后的 LibTV 项目页实际显示了账号信息、20 积分、首页/项目/Skills/创作者挑战赛导航、“新建项目”入口和已有项目缩略图。尝试从侧栏与已有项目卡片进入具体项目时，本次会话仍停留在项目列表页，因此本次只确认“登录后的项目库与入口层级”，不把旧的公开项目图或 FlowCanvas 截图冒充 LibTV 画布节点 UI。

### 6.4 登录后证据能支持的交互结论

| 证据层 | 本次可以确认 | 本次不能确认 |
|---|---|---|
| 空画布 | TapNow 与小云雀都有可见的快捷创建入口、视口工具和 Agent/辅助入口 | 空状态提示的具体动画时长、缓动和所有响应式断点 |
| 添加节点 | 两者都把文本、图片、视频、音频做成明确的菜单项；TapNow 还暴露 Beta、时间线、图片编辑器和上传 | 未打开菜单项的完整二级流程 |
| 文本节点 | 选中态富文本工具栏、编辑占位、连接点和节点级 Composer | 内容输入后的自动排版、协同冲突和快捷键全量行为 |
| 图片/视频节点 | 上传/参考入口、媒体占位、模型、比例/分辨率/时长和消耗提示 | 实际生成中的进度、失败、重试、结果追加和连线动画 |
| 音频节点 | 小云雀独立音频面板的音色、参考素材、采样率、时长成本 | 音频生成、播放、波形和导出态 |
| Agent | TapNow 与小云雀都把 Agent 放在工作台上下文中 | Agent 真实执行后的节点创建、引用解析和撤销动画 |

因此，本轮已补齐“节点 UI、操作 UI、菜单 UI、Agent UI”的竞品实机证据；动画部分目前只保留状态切换证据，不把静态截图包装成动画录制。后续如果要补逐帧动效，需要单独做浏览器录屏/动图取证，不能从单张截图推断。

## 7. 三款产品的公开交互模型对比

| 交互层 | LibTV | TapNow | 小云雀 | 对 FlowCanvas 的启发 |
|---|---|---|---|---|
| 首次进入 | 新建画布、能力卡、Skill/工作流 | 进入画布后直接创建节点或召唤 Agent | 输入一句灵感或选择内容方向 | 空画布同时提供快捷创建和自然语言入口 |
| 核心空间 | 视频生产工作流 | 节点、连线和自由布局 | 故事/短剧/成片阶段 | 节点是底层，故事阶段是上层语义 |
| 关系表达 | 工作流和能力步骤 | 连接线、引用和来源节点 | 剧本、角色、镜头和结果阶段 | 结果追加、来源保留、关系可追溯 |
| 复杂度控制 | Skill、模板、工作流包装 | 缩放、分组、Agent、引用 | Agent 拆解生产阶段 | 默认简单，展开后逐阶段可检查 |
| Agent 位置 | 生产入口和能力编排 | 画布上下文层 | 内容创作主入口 | Agent 必须知道当前上下文，不能脱离画布 |
| 公开证据强度 | 首页和入口强，画布细节弱 | 官方画布文档最完整 | 入口和成片展示强，画布细节弱 | 对每条结论标注公开/官方文档/待核验 |

## 8. FlowCanvas 应吸收的交互原则

1. 空状态必须可行动：中心 CTA、双击/右键创建、节点加号和 Agent 入口统一进入同一创建逻辑。
2. 画布手势必须互斥：选择、框选、平移、缩放和右键菜单不能抢同一个动作。
3. 结果不覆盖来源：每次生成都保留来源、参数、引用和可回溯关系。
4. 能力卡和模板是启动层，不替代节点层；插入后要能看到节点和连线。
5. Agent 执行前展示目标、引用素材、模型、数量、比例、时长和影响范围。
6. 故事/分镜/成片是语义层，可以帮助新用户理解工作流，但不能隐藏底层节点。
7. 每条竞品结论都要能回到公开截图、官方文档或公开分享页；无法公开确认的内容明确写“待核验”。

## 9. 参考资料

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
