# Implementation Plan: 双模式 AI 编辑器

**Branch**: `001-dual-mode-editor` | **Date**: 2026-06-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from [specs/001-dual-mode-editor/spec.md](./spec.md)

## Summary

基于 VSCode 开源代码（Code - OSS）构建一个支持双模式的 AI 编辑器：
- **开发模式**：保留 VSCode 完整 IDE 能力（编辑器、终端、搜索、文件浏览器），集成 AI 对话框
- **简约模式**：仅文件目录树 + 常驻 AI 对话框 + 简易编辑器，面向业务人员
- 集成 Codex 插件满血能力（对话、代码生成、审查、终端、文件操作）
- 独立后台服务器（认证、计量、版本推送、Skill 市场）
- 管理后台 Web 页面（邀请码管理、用量查看、版本管理）

技术路径：Fork Code-OSS → 保留编辑器核心 → 新增双模式 UI 框架 → 集成 Codex 插件通道 → 实现后台服务

## Technical Context

**Language/Version**: TypeScript 5.x (client) / Node.js 20+ (server)
**Primary Dependencies**: Electron, Code-OSS editor core, Monaco Editor, Codex plugin / local capability bridge
**Storage**: 客户端本地文件系统 + 后台 SQLite（认证/计量/邀请码）
**Testing**: Jest + ts-jest (client), Jest (server)
**Target Platform**: Windows 10+, macOS 12+（桌面端）
**Project Type**: desktop-app（Electron 客户端）+ web-service（后台服务器）+ web-app（管理后台）
**Performance Goals**: 启动 < 10s，模式切换 < 1s，对话渲染 < 500ms
**Constraints**: 复用 Code-OSS 编辑器核心不修改源码；适配 Codex 插件/本地能力框架协议
**Scale/Scope**: v1 邀请制单租户项目，预计百级用户

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | ✅ | spec.md 已完成，6 个 User Stories + 18 FR |
| II. Simplicity First | ✅ | 复用 Code-OSS 编辑器不重写；复用 Codex 插件存储不新造 |
| III. Quality & Testing | ✅ | Testing Protocol 已纳入；每轮任务后强制测试 |
| IV. Observability & Documentation | ✅ | 后台计量日志覆盖；JSDoc 要求已明确 |
| V. Security & Responsible AI | ✅ | 仅存凭证+计量不存内容；加密传输；AI 审查 |
| VI. OOP Design Rules | ✅ | 接口注入；SOLID；不可变性；DI 构造函数 |
| VII. Framework Constraints | ✅ | Code-OSS 源码只读复用；扩展通过新模块 |

### Gates

| Gate | Status |
|------|--------|
| Spec gate | ✅ Passed |
| Plan gate | ✅ All principles compliant |

## Project Structure

### Documentation (this feature)

```text
specs/001-dual-mode-editor/
├── plan.md              # This file
├── research.md          # Phase 0: 技术决策与研究
├── data-model.md        # Phase 1: 数据模型
├── quickstart.md        # Phase 1: 验证指南
├── contracts/           # Phase 1: 接口契约
│   ├── ipc-channels.md  # Electron IPC 通道
│   ├── auth-api.md      # 后台认证 API
│   └── admin-api.md     # 管理后台 API
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
# Electron 客户端 (Code-OSS fork)
# VSCode 源码保持不动，我们的自定义代码放在 app/ 目录
app/
├── main/                  # Electron 主进程扩展
│   ├── main.ts            # 应用入口
│   ├── window-manager.ts  # 窗口管理（开发/简约模式窗口）
│   ├── menu-service.ts    # 菜单配置（含模式切换）
│   └── services/
│       ├── auth-service.ts        # 登录认证（与后台通信）
│       ├── ipc-handler.ts         # IPC 消息路由
│       ├── update-service.ts      # 版本更新检测
│       └── codex-bridge.ts # Codex 插件 / 本地能力适配
├── renderer/              # 渲染进程（UI）
│   ├── editor/            # Code-OSS 编辑器核心（只读复用）
│   ├── views/
│   │   ├── dev-layout.ts      # 开发模式布局
│   │   ├── simple-layout.ts   # 简约模式布局
│   │   └── login-page.ts      # 登录/注册页
│   ├── components/
│   │   ├── ai-chat-panel.ts   # AI 对话框（共用）
│   │   ├── file-tree.ts       # 文件目录树（共用）
│   │   ├── simple-editor.ts   # 简易编辑器（简约模式）
│   │   └── mode-switcher.ts   # 模式切换组件
│   └── stores/
│       ├── app-state-store.ts    # 全局状态（模式、用户、登录态）
│       └── chat-store.ts         # AI 对话状态
├── common/                # 主/渲染进程共享
│   ├── interfaces/
│   │   ├── i-auth-service.ts
│   │   ├── i-storage-service.ts
│   │   └── i-codex-client.ts
│   ├── types/
│   │   ├── auth.types.ts
│   │   ├── chat.types.ts
│   │   └── mode.types.ts
│   └── utils/
│       ├── token-manager.ts
│       └── path-utils.ts
└── extensions/            # 扩展系统
    └── skill-marketplace.ts

# 后台服务器 (独立部署)
server/
├── src/
│   ├── index.ts           # 服务入口
│   ├── routes/
│   │   ├── auth.ts        # 登录/注册/令牌刷新
│   │   ├── admin.ts       # 管理后台 API
│   │   ├── update.ts      # 版本推送
│   │   └── marketplace.ts # Skill 市场
│   ├── models/
│   │   ├── user.ts
│   │   ├── invitation.ts
│   │   └── usage-record.ts
│   ├── services/
│   │   ├── auth-service.ts
│   │   ├── stats-service.ts
│   │   └── update-service.ts
│   ├── middleware/
│   │   ├── auth-middleware.ts
│   │   └── admin-middleware.ts
│   └── db/
│       ├── connection.ts
│       └── migrations/
├── admin-web/             # 管理后台前端（轻量 Web 页面）
│   ├── index.html
│   ├── dashboard.html
│   └── ...
└── tests/

test/
├── unit/
│   ├── common/
│   ├── renderer/
│   └── server/
├── integration/
│   ├── auth-flow.test.ts
│   └── mode-switch.test.ts
└── e2e/
    ├── simple-mode.test.ts
    └── dev-mode.test.ts
```

**Structure Decision**: 选项 A 为主（Electron 客户端 + 公共层），附加独立 `server/` 后台服务和 `admin-web/` 管理页面。客户端依赖关系：`main → common ← renderer`；`extensions → common/types`；后台服务独立部署无依赖。

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

无违规项。所有设计决策符合宪法原则。
