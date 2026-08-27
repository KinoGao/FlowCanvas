# 无限画布文档索引

## 项目介绍

- [快速开始](/docs/overview/quick-start)
- [功能介绍](/docs/overview/features)
- [Render 部署](/docs/overview/render)
- [Docker 部署](/docs/overview/docker)
- [第三方 GitHub 提示词仓库](/docs/overview/third-party-prompt-repositories)

## 操作手册

- [画布节点操作手册](/docs/canvas/canvas-node-manual)
- [画布快捷键](/docs/canvas/canvas-shortcuts)

## 开发与数据

- [本地开发](/docs/backend/local-development)
- [代理（转发）系统](/docs/backend/proxy-system)
- [画布数据结构](/docs/backend/canvas-data-structure)

## 商务合作

- [开源协议](/docs/business/license)
- [贡献者协议](/docs/business/cla)
- [商务合作](/docs/business/business)

## 支持与安全

- [漏洞提交](/docs/support/security)
- [打赏支持](/docs/support/donate)
- [广告赞助](/docs/support/sponsor)

## 项目进度

- [更新日志](/docs/progress/changelog)
- [待测试](/docs/progress/pending-test)
- [TODO](/docs/progress/todo)

## 研究与设计规格

- [LibTV、TapNow 与小云雀无限画布公开材料调研](superpowers/specs/2026-08-11-libtv-tapnow-xiaoyunque-interaction-research.md)
- [FlowCanvas 内部节点 UI / 交互动效自测证据](superpowers/specs/2026-08-11-node-ui-motion-evidence.md)
- [LibTV 与 TapNow 视觉交互调研](superpowers/specs/2026-08-09-libtv-tapnow-visual-interaction.md)
- [TapNow 画布交互对齐设计](superpowers/specs/2026-08-06-tapnow-canvas-interaction-parity.md)

## 说明

- 当前画布项目、“我的素材”和生成记录保存在后端账号工作区（单机 / 自托管 SQLite）。
- 模型厂商地址、API Key、模型 ID 与能力由后端全局模型注册中心统一管理，密钥不下发到浏览器，AI 请求经后端代理执行。
