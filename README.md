# FlowCanvas

开源的无限画布 AI 创作工作台：把素材、提示词、模型和生成结果放在同一块画布上，用节点与连线组织图像、视频、音频、文本的创作流程，并沉淀自己的方法。

> **状态**：快速迭代中（v0.1.0）。数据结构和模型适配可能变化，适合单机/自托管；部署前请自行备份、控制访问、配置模型账号。

---

## 画布能做什么

| 类别 | 内容 |
| --- | --- |
| 生成节点 | 图片、视频、音频、文本 |
| 功能节点 | 脚本（分镜表）、ComfyUI 工作流、剪辑时间线、导演台、360 场景、故事板、拼图、语音工作台 |
| 资源入口 | 数字人、素材库、上传、从生成历史选择 |

- 拖拽、缩放、连线、分组、多选、搜索、定位、逐节点显示/隐藏、批量下载（zip）。
- Composer 在节点下方组合上游内容：`@` 引用素材、内嵌缩略图、一键连线。
- 版本快照：最多 5 份项目快照，可保存/恢复/删除。
- 画布外观：浅色/深色、网格（点/线/空白）、连线样式（曲线/直角/直线）、滚轮行为（缩放/Figma 平移）、缩放方向、工具栏停靠（底部/左/右）、对齐网格、辅助基准线等，按项目持久化。
- 节点操作细节：对齐（1-9 宫格）、非破坏性移动（拖拽不误触 Composer）、65% 缩放以下自动切 Leafer 远景渲染。

### 生成与模型

- 后端模型注册中心统一管理厂商、API Key、模型 ID 与能力；密钥不下发浏览器。
- 文生图/图生图/文生视频/首帧/首尾帧/多模态参考/文本/音频，按模型能力配置。
- 生成任务后端持续执行：关页恢复查询，超时结束可重试；Agent 编排任务不因关页中断。
- 各能力由「模型接入 / 功能开关」统一标记，未接入时画布提示「模型未接入」。

### 剧本 → 分镜 → 成片

- 脚本节点：正文/AI 拆解为幕、场、镜结构的分镜表（本地解析不耗模型）。
- 两段式生成：先出分镜帧图，再图生视频；支持按幕分组导出文本/分镜整图/ComfyUI 节点。
- 内置 8 位经典导演风格（斯皮尔伯格、库布里克、王家卫、诺兰等），按镜头语言组织提示词。
- 剪辑时间线串联多段素材；故事板输出电影感网格。
- Canvas Agent「任务规划」：一次输出创作计划，编译为布局好的画布节点与连线，服务端按拓扑派发执行。

### 语音与数字人

- 语音工作台（素材库「音色」页签）：音色管理、语音设计（描述生成音色）、声音克隆，本地 Qwen3-TTS 支撑，音色一键插入画布为音频节点。
- 数字人：分身形象照与口播工作流。

### 本地多媒体工具（不耗模型）

- 拼图：连接 ≥2 张图片节点，宫格合成整图并生成连线新节点。
- 视频：解析为分镜表、抽帧、关键帧（≤6 帧）、倒放、提取音轨、裁剪入出点、变速（0.25×–4×）、多视频同步预览。
- 图片：裁剪、分割、抠图、放大、角度旋转、外扩、光照、720 全景等，经悬停工具条使用。

---

## 技术栈

- `web/` — React 19 + Vite + TypeScript + Ant Design + Leafer
- `backend/` — Spring Boot（Java 21 / Maven），模型代理、账号工作区、生成任务
- `canvas-agent/` — 本地 MCP 服务（可选），对接 Codex / Claude Code

---

## 运行

### 环境要求

- Node.js 18+、pnpm（或 npm/Bun）
- Java 21 完整 JDK（含 javac）、Maven 3.9+

### 一键启动（WSL / Linux 推荐）

```bash
git clone https://github.com/KinoGao/FlowCanvas.git
cd FlowCanvas
./scripts/dev.sh      # 前端 9800 + 后端 9801 + 本地 TTS 8880/8881（存在则启，可跳过）
./scripts/dev-stop.sh # 停止
```

- 脚本要求 `JAVA_HOME` 指向完整 JDK（默认 `/home/gn/jdk21-full`，可用环境变量覆盖）。
- 日志：`.codex-runtime/{backend,web,tts,tts-design}.log`。
- 数据库默认 `DB_PATH`（WSL 下放原生文件系统，避免 /mnt 上 SQLite WAL 问题）。

### 手动启动

```bash
# 终端 1
cd backend && mvn spring-boot:run          # http://localhost:9801

# 终端 2
cd web && pnpm install && pnpm dev         # http://localhost:9800
```

### Docker

```bash
docker compose up -d                                   # 已发布镜像
docker compose -f docker-compose.local.yml up -d --build  # 本地构建
```

默认凭证可通过环境变量覆盖（`AUTH_CODE` / `ADMIN_CODE` / `MEDIA_SIGNING_SECRET`），生产部署前务必修改并配置公网媒体地址。

---

## 模型与安全

- AI 请求一律走后端代理；厂商需能访问后端公网媒体地址（首尾帧/参考视频/Agnes 等）。
- 在后台按实际接口填写尺寸、比例、时长、首尾帧、参考数量、音频等能力，不要假设模型间参数通用。
- **禁止**把含 API Key 的配置/环境变量提交到 Git。

---

## Canvas Agent（可选）

```bash
npx -y @basketikun/canvas-agent   # 或 cd canvas-agent && npm run dev
```

默认监听 `127.0.0.1:17371`，安装、鉴权与 MCP 配置见 [canvas-agent/README.md](canvas-agent/README.md)。

---

## 文档

- [快速开始](docs/content/docs/overview/quick-start.mdx)
- [核心功能](docs/content/docs/overview/features.mdx)
- [画布节点说明](docs/content/docs/canvas/canvas-node-manual.mdx)
- [画布快捷键](docs/content/docs/canvas/canvas-shortcuts.mdx)
- [后端本地开发](docs/content/docs/backend/local-development.mdx)
- [Docker 部署](docs/content/docs/overview/docker.mdx)
- [Render 部署](docs/content/docs/overview/render.mdx)

---

## 许可

[AGPL-3.0](LICENSE)
