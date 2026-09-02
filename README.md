<p align="center">
  <img src="web/public/logo.svg" width="96" alt="FlowCanvas logo">
</p>

<h1 align="center">FlowCanvas</h1>

<p align="center">开源的无限画布 AI 创作工作台</p>

<p align="center">
  <a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
  <a href="https://render.com/deploy?repo=https://github.com/KinoGao/FlowCanvas"><img src="https://img.shields.io/badge/Render-Deploy-46e3b7?style=flat-square&logo=render&logoColor=111111" alt="Deploy to Render"></a>
  <a href="https://github.com/KinoGao/FlowCanvas"><img src="https://img.shields.io/github/stars/KinoGao/FlowCanvas?style=flat-square&logo=github" alt="GitHub stars"></a>
  <a href="VERSION"><img src="https://img.shields.io/badge/version-v0.1.0-2563eb?style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-f97316?style=flat-square" alt="License"></a>
  <a href="https://vercel.com/"><img src="https://img.shields.io/badge/Vercel-ready-000000?style=flat-square&logo=vercel" alt="Vercel ready"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-React-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite React"></a>
</p>

FlowCanvas 将素材、提示词、模型和生成结果放在同一块无限画布中。你可以通过节点与连线组织图像、视频、音频和文本工作流，持续调整、复用并沉淀自己的创作方法。

> [!WARNING]
> 项目仍在快速迭代，数据结构和模型适配可能发生变化。当前更适合单机或自托管场景；部署前请自行完成备份、访问控制与模型账号配置。

## 核心能力

### 无限画布与节点工作流

- **生成节点**：图片、视频、音频与文本节点，支持拖拽、缩放、连线、分组、命名、删除与多选批量操作。
- **功能节点**：脚本（分镜表）、ComfyUI（连接自定义工作流）、剪辑时间线、导演台（3D 场景/机位）、360 场景、故事板、语音工作台，以及数字人、素材库、上传与生成历史入口。
- Composer 位于节点下方：把上游文本、图片、视频和音频组合为下一次生成的输入（`@` 引用素材、内嵌缩略图点击放大）。
- 节点管理面板：类型筛选、搜索、定位、放大预览、多选导出（zip）、逐节点显示/隐藏。
- 版本快照：顶栏「版本历史」可保存/恢复/删除最多 5 份项目快照。
- 画布体验：对齐网格、辅助基准线、相对/绝对坐标对齐、多选同步预览、远景 Leafer 高性能渲染、右键菜单与快捷键面板。

### 画布外观与交互（对齐 SHUO）

- 底部主工具栏（可切换左侧/右侧停靠），「+」、双击空白、右键空白三处入口统一为添加节点菜单。
- 画布外观面板：主题模式（浅色/深色）、网格样式（点/线/空白）、连接线样式（曲线/直角/直线）、滚轮行为（缩放/Figma 平移）、缩放方向、工具栏位置，以及对齐网格、辅助基准线、图片信息、显示连线等开关，按项目持久化。
- 参数胶囊体系：模型/厂商胶囊、画质·比例、张数、时长等参数胶囊能力感知禁用，Prompt 提交区对齐统一页脚设计。
- 视频节点：参考视频解析为分镜表、抽帧、关键帧、倒放、提取音轨、剪辑入出点、同步预览，全部本地处理不消耗模型。

### 多模型生成与运行时配置

- 后端全局模型注册中心统一管理厂商地址、API Key、模型 ID 与可用能力；密钥不会下发到浏览器。
- 支持按模型能力配置文生图、图生图、文生视频、首帧/首尾帧视频、多模态参考、文本与音频等工作流。
- 生成任务在后端持续执行并保存状态；关闭画布后再次打开会恢复查询未完成任务，页面关闭不中断 Agent 编排任务。
- 模型能力入口由「模型接入 / 功能开关」面板（设置）统一标记，未接入时保留结构并在画布中提示「模型未接入」。

### 素材、数字人与语音工作台

- 左侧资产面板管理图片、视频、音频与文本素材，节点悬停可预览内容，支持加入/下载/删除。
- 素材库：风格库、效果库、我的素材、音色、数字人页签；数字人可直接插入画布作为「分身口播」底图。
- 语音工作台（音色页签）：音色管理、语音设计（文字描述生成全新音色）、声音克隆；本地 Qwen3-TTS 服务（:8880 / :8881），音色可一键插入画布为音频节点。

### 脚本、分镜与 Agent

- 脚本节点：剧本正文 → AI/本地拆解为幕/场/镜分镜表，两段式生成（分镜帧图 → 图生视频），可导出文本/分镜整图/ComfyUI 节点。
- 内置影视制作提示词：8 位经典导演风格技能（斯皮尔伯格/库布里克/王家卫/诺兰等），按导演语言组织分镜提示词。
- Canvas Agent（可选）：本地 MCP 服务连接 Codex / Claude Code，支持对话操作与「任务规划」模式——一次规划输出创作计划，编译为确定性布局的画布节点并连线，服务端按拓扑派发、页面关闭后继续执行。
- 统一创作 /create 页：文字问答、图片、视频、音频同对话完成，流式工具自动执行。

## 界面预览

<table width="100%">
  <tr>
    <td width="50%"><img src="https://i.ibb.co/TDFvGWDT/image.png" alt="FlowCanvas 画布" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/zVwJq3YS/image.png" alt="FlowCanvas 节点工作流" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/PvY3qhhK/image.png" alt="FlowCanvas 模型配置" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/7D04LwN/image.png" alt="FlowCanvas 素材管理" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/bj30FtS5/5.png" alt="FlowCanvas 视频工作流" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/hxRvjw51/image.png" alt="FlowCanvas 节点生成" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/jkWsF8q1/image.png" alt="FlowCanvas 图片创作" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/XrnfXHx7/image.png" alt="FlowCanvas 画布视图" border="0"></td>
  </tr>
</table>

## 快速开始

### 环境要求

- Node.js 18+
- pnpm（或 npm / Bun）
- Java 21（需完整 JDK，含 `javac`）
- Maven 3.9+

### 本地开发（一键脚本，WSL / Linux 推荐）

```bash
git clone https://github.com/KinoGao/FlowCanvas.git
cd FlowCanvas

# 一键启动：后端(9801) + 前端(9800) + 本地 TTS 语音服务(8880/8881，可选)
./scripts/dev.sh

# 停止
./scripts/dev-stop.sh
```

脚本会：

1. 检查完整 JDK（`JAVA_HOME`，默认 `/home/gn/jdk21-full`，可覆盖）；
2. 后端 `mvn spring-boot:run`（默认端口 `9801`，日志 `.codex-runtime/backend.log`）；
3. 前端 Vite dev server（默认端口 `9800`，日志 `.codex-runtime/web.log`）；
4. 本地 TTS（`/home/gn/services/qwen3-tts`，端口 `8880`）与语音设计服务（端口 `8881`），目录存在则自动启动，否则跳过。

打开 [http://localhost:9800](http://localhost:9800)。首次使用先在后端管理配置中登记模型厂商、API Key、模型 ID 和能力选项，再进入画布创建节点。

### 手动启动

```bash
# 终端 1：后端（默认 http://localhost:9801）
cd backend
mvn spring-boot:run

# 终端 2：前端（默认 http://localhost:9800）
cd web
pnpm install
pnpm dev
```

### Docker Compose

```bash
# 使用已发布镜像
docker compose up -d

# 本地构建镜像
docker compose -f docker-compose.local.yml up -d --build
```

Compose 默认使用内部硬编码凭证（注册码 `gycode`、管理员授权码 `admincode`），可通过环境变量覆盖：

```bash
export AUTH_CODE=你的注册码
export ADMIN_CODE=你的管理员授权码
export MEDIA_SIGNING_SECRET=随机媒体签名密钥
```

前端服务默认运行在 `9800`，后端服务默认运行在 `9801`。生产部署前请根据自己的域名与网络环境配置数据库卷和后端公网媒体访问地址。

## 目录结构

```
FlowCanvas
├── web/                # 前端：React + Vite + TypeScript（画布在 src/app/(user)/canvas）
├── backend/            # 后端：Spring Boot（模型代理、账号工作区、生成任务）
├── canvas-agent/       # Canvas Agent：本地 MCP 服务（可选）
├── scripts/            # dev.sh / dev-stop.sh 一键启停
├── docs/               # 文档（MDX）
└── docker-compose*.yml # 容器部署
```

## 模型与媒体配置说明

- AI 请求始终通过后端代理发出，浏览器只读取脱敏后的运行时模型目录。
- 需要引用图片、视频或音频的厂商，必须能够访问后端提供的公网媒体地址。使用首帧、尾帧、参考视频或 Agnes 等模型前，请正确配置 `backend/backend-config.yml` 中的公网访问地址与媒体路由。
- 不同厂商对尺寸、比例、时长、首尾帧、参考素材数量及音频的支持不同。请在后台模型能力配置中按实际接口填写，不要假设不同模型可以共用全部参数。
- 请勿将包含 API Key 的配置文件或环境变量提交到 Git 仓库。

## Canvas Agent（可选）

Canvas Agent 是独立的本地 MCP 服务，默认监听 `127.0.0.1:17371`。它可将 FlowCanvas 与 Codex、Claude Code 等本地编码助手连接起来。

```bash
# 直接运行
npx -y @basketikun/canvas-agent

# 或本地开发
cd canvas-agent
npm install
npm run dev
```

详细安装、鉴权和 MCP 配置请参阅 [canvas-agent/README.md](canvas-agent/README.md)。

## 文档

- [文档首页](docs/content/docs/overview/quick-start.mdx)
- [核心功能](docs/content/docs/overview/features.mdx)
- [画布节点说明](docs/content/docs/canvas/canvas-node-manual.mdx)
- [画布快捷键](docs/content/docs/canvas/canvas-shortcuts.mdx)
- [后端本地开发](docs/content/docs/backend/local-development.mdx)
- [Docker 部署](docs/content/docs/overview/docker.mdx)
- [Render 部署](docs/content/docs/overview/render.mdx)

## 项目范围

FlowCanvas 的重点是开源、自托管的创作工作台：无限画布、节点工作流、模型适配、素材复用和本地 Agent 协作。积分、会员、社区、发布审核等平台商业化能力不在当前 v1 范围内。

## 支持项目

如果 FlowCanvas 对你有帮助，欢迎通过以下方式支持维护：

<a href="https://ifdian.net/a/basketikun">
  <img src="https://img.shields.io/badge/%E7%88%B1%E5%8F%91%E7%94%B5-%E8%B5%9E%E5%8A%A9%E4%BD%9C%E8%80%85-946ce6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAyMS4zNWwtMS40NS0xLjMyQzUuNCAxNS4zNiAyIDEyLjI4IDIgOC41IDIgNS40MiA0LjQyIDMgNy41IDNjMS43NCAwIDMuNDEuODEgNC41IDIuMDlDMTMuMDkgMy44MSAxNC43NiAzIDE2LjUgMyAxOS41OCAzIDIyIDUuNDIgMjIgOC41YzAgMy43OC0zLjQgNi44Ni04LjU1IDExLjU0TDEyIDIxLjM1eiIvPjwvc3ZnPg==&logoColor=white" alt="爱发电赞助" />
</a>

## License

本项目采用 [AGPL-3.0](LICENSE) 许可证发布。

## Star History

<a href="https://www.star-history.com/?repos=KinoGao%2FFlowCanvas&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=KinoGao/FlowCanvas&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=KinoGao/FlowCanvas&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=KinoGao/FlowCanvas&type=date&legend=top-left" />
 </picture>
</a>
