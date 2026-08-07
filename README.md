<p align="center">
  <img src="web/public/logo.svg" width="96" alt="FlowCanvas logo">
</p>

<h1 align="center">FlowCanvas</h1>

<p align="center">开源的无限画布 AI 创作工作台</p>

<p align="center">
  <a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
  <a href="https://render.com/deploy?repo=https://github.com/KinoGao/FlowCanvas"><img src="https://img.shields.io/badge/Render-Deploy-46e3b7?style=flat-square&logo=render&logoColor=111111" alt="Deploy to Render"></a>
  <a href="https://github.com/KinoGao/FlowCanvas"><img src="https://img.shields.io/github/stars/KinoGao/FlowCanvas?style=flat-square&logo=github" alt="GitHub stars"></a>
  <a href="VERSION"><img src="https://img.shields.io/badge/version-v0.2.0-2563eb?style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-f97316?style=flat-square" alt="License"></a>
  <a href="https://vercel.com/"><img src="https://img.shields.io/badge/Vercel-ready-000000?style=flat-square&logo=vercel" alt="Vercel ready"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-React-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite React"></a>
</p>

FlowCanvas 将素材、提示词、模型和生成结果放在同一块无限画布中。你可以通过节点与连线组织图像、视频、音频和文本工作流，持续调整、复用并沉淀自己的创作方法。

> [!WARNING]
> 项目仍在快速迭代，数据结构和模型适配可能发生变化。当前更适合单机或自托管场景；部署前请自行完成备份、访问控制与模型账号配置。

## 核心能力

### 无限画布与节点工作流

- 文本、图片、视频、音频与脚本节点，支持拖拽、缩放、连线、分组、命名和删除。
- 节点按画布创建顺序生成默认名称；素材结果会按原始比例展示，并在合理范围内约束尺寸。
- Composer 位于节点下方，用于将上游文本、图片、视频和音频组合为下一次生成的输入。
- 支持从视频截取首帧或当前帧，生成结果可继续作为后续节点的参考素材。
- 文本节点支持单击选中、双击进入编辑；键盘 `Delete` 可直接删除选中的节点。

### 多模型生成与运行时配置

- 后端全局模型注册中心统一管理厂商地址、API Key、模型 ID 与可用能力；密钥不会下发到浏览器。
- 支持按模型能力配置文生图、图生图、文生视频、首帧 / 首尾帧视频、多模态参考、文本与音频等工作流。
- Seedance 2.0 通过火山方舟 Agent Plan 接入；也可按 OpenAI 兼容协议接入已配置的图像、视频、音频或多模态模型。
- 生成任务在后端持续执行并保存状态。关闭画布后再次打开，同一画布中尚未完成的任务会恢复查询；超过 30 分钟未返回的任务会结束并提示重试。
- ComfyUI 作为独立节点接入，可用于编排本地或远程 ComfyUI 工作流。

### 素材、工作区与 Agent

- 画布、素材、媒体文件、生成记录和运行时配置由后端账号工作区保存；WebDAV 是可选的独立同步通道。
- 左侧资产面板可管理并复用图片、视频、音频与文本素材，节点悬停时可预览内容。
- 可选安装 Canvas Agent，通过 MCP 与 Codex 或 Claude Code 协作，在本地画布中执行创作辅助操作。

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
- pnpm（或 Bun）
- Java 21
- Maven 3.9+

### 本地开发

```bash
git clone https://github.com/KinoGao/FlowCanvas.git
cd infinite-canvas

# 终端 1：启动后端（默认 http://localhost:9801）
cd backend
mvn spring-boot:run

# 终端 2：启动前端（默认 http://localhost:9800）
cd web
pnpm install
pnpm dev
```

打开 [http://localhost:9800](http://localhost:9800)。首次使用时，先在后端管理配置中登记模型厂商、API Key、模型 ID 和能力选项，再进入画布创建节点。

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

## 模型与媒体配置说明

- AI 请求始终通过后端代理发出，浏览器只读取脱敏后的运行时模型目录。
- 需要引用图片、视频或音频的厂商，必须能够访问后端提供的公网媒体地址。使用首帧、尾帧、参考视频或 Agnes 等模型前，请正确配置 `backend/backend-config.yml` 中的公网访问地址与媒体路由。
- 不同厂商对尺寸、比例、时长、首尾帧、参考素材数量及音频的支持不同。请在后台模型能力配置中按实际接口填写，不要假设不同模型可以共用全部参数。
- 请勿将包含 API Key 的配置文件或环境变量提交到 Git 仓库。

## Canvas Agent（可选）

Canvas Agent 是独立的本地 MCP 服务，默认监听 `127.0.0.1:17371`。它可将 FlowCanvas 与 Codex、Claude Code 等本地编码助手连接起来。

```bash
cd canvas-agent
npm install
npm run dev
```

详细的安装、鉴权和 MCP 配置请参阅 [canvas-agent/README.md](canvas-agent/README.md)。

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
