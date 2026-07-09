# Research: 双模式 AI 编辑器

**Date**: 2026-06-28
**Feature**: [spec.md](./spec.md)

## 1. Code-OSS 集成策略

**Decision**: Fork Code-OSS 仓库，保留编辑器核心源码为 vendor 只读层，所有定制通过新增 src/ 模块扩展。

**Rationale**:
- Code-OSS 的编辑器核心（Monaco Editor）是独立模块，可通过 npm 包引用
- VSCode 的 workbench 布局是基于 grid 的 flex 系统，覆盖 CSS 和 layout service 即可实现双模式
- 完全不动 Code-OSS 源码符合宪法 VII. Framework Constraints
- 后续可跟踪上游更新（git subtree 或定期 merge）

**Alternatives considered**:
- 直接 clone + 修改源码 → 无法跟踪上游更新，维护成本高
- 用 Electron + Monaco 从零搭建 → 失去 VSCode 终端/搜索/扩展系统，工作量大 10x
- 通过 VSCode Extension API 实现 → 无法做到简约模式（Extension API 不暴露 workbench 布局）

**Implementation approach**:
- `src/renderer/editor/` 以只读方式引用 Code-OSS 的编辑器组件
- 布局系统在 `dev-layout.ts` / `simple-layout.ts` 中通过 CSS grid 控制面板显隐
- 终端/搜索/调试面板通过 visibility 控制，开发模式显示，简约模式隐藏

## 2. Codex 插件集成协议

**Decision**: 通过 Codex 插件提供的本地能力桥接或插件命令通信，客户端连接本地可用的 Codex 通道，发送聊天请求并以流式读取响应。

**Rationale**:
- 当前需求已更正为适配本地 Codex 插件/本地能力框架
- 与当前桌面环境的 Codex 插件使用同一能力入口，避免重复认证
- HTTP + SSE 协议简单可靠，Electron 客户端原生支持

**Alternatives considered**:
- 直接调用 Anthropic API → 绕过代理框架，不满足宪法要求
- WebSocket 连接 → 代理框架目前是 HTTP，需额外适配
- 子进程 stdio 通信 → 每次启动独立 AI CLI 开销大，不适合频繁对话

**Protocol details (based on Codex plugin / local capability bridge)**:
- 代理监听本地端口，提供 `/v1/messages` 端点
- 支持 SSE 流式响应（`text/event-stream`）
- 认证通过代理自身的 token 机制（session 级 token）
- 对话历史由 Codex 插件本地存储管理

## 3. 双模式 UI 架构

**Decision**: 单窗口单 WebContents，通过 CSS 布局切换面板显隐实现模式切换，非多窗口方案。

**Rationale**:
- 单窗口切换更快（< 1s 满足 SC-002），无需跨 WebContents IPC
- 共享同一状态 store，AI 对话自然保持连续
- 简约模式本质是"隐藏高级面板"，不是完全不同的 UI 框架
- 多个 WebContents 会增加内存开销

**Alternatives considered**:
- 两个独立 BrowserWindow → 切换涉及窗口 hide/show + 跨窗口 IPC，状态同步复杂
- BrowserView 分层 → 已被 Electron 弃用

**Layout model**:
```
开发模式 grid:         简约模式 grid:
+---+--------+----+    +-----+---------+
| F | Editor  | AI |    | F   | AI      |
| i |         |    | => | i   | Chat    |
| l |---------+    |    | l   | + Simple|
| e | Terminal| C  |    | e   | Editor  |
|   |         | h  |    |     |         |
+---+---------+ a  |    +-----+---------+
              | t  |
              +----+
F=File Tree, AI=AI Chat, Simple Editor=简易编辑器
```

## 4. 认证与会话架构

**Decision**: JWT access token (short-lived, 15min) + refresh token (long-lived, 30d)，客户端通过 credentials 登录获取 token pair，access token 过期后静默 refresh。

**Rationale**:
- 满足 FR-012 "静默续期，不频繁弹出登录页" 的要求
- refresh token 可撤销（服务端存储在数据库），管理员可强制下线用户
- 适配 Codex 插件/本地能力框架的认证方式

**Alternatives considered**:
- Session cookie → 跨进程（main/renderer）携带不便
- 仅 access token 无 refresh → 需要用户频繁重新登录，违反 FR-012
- OAuth2 完整流程 → v2 迭代，v1 用简单 JWT

**Token 安全**:
- Access token 存在 Electron 主进程的 `safeStorage` 中
- Refresh token 存在服务端数据库，客户端通过 httpOnly cookie 传递
- 密码使用 bcrypt 哈希存储

## 5. 邀请码系统设计

**Decision**: 服务端生成随机邀请码（UUID v4 + checksum，如 `INV-xxxx-xxxx-xxxx`），管理员在后台创建时可设有效期和最大使用次数。注册时客户端提交邀请码验证，验证通过后标记为已使用。

**Rationale**:
- 满足 FR-002 邀请制要求，防止开放注册
- UUID 保证唯一性和不可猜测性
- 有效期和次数限制防止码泄露后被滥用

**Invitation code lifecycle**:
```
Created → Active → Used (消费) / Expired (过期)
```

## 6. 后台服务器架构

**Decision**: Node.js + Express.js 轻量服务，SQLite 单文件存储，与 Codex 插件/本地能力框架共存于本地或独立服务器。

**Rationale**:
- Node.js 与 Electron 技术栈一致，降低维护成本
- SQLite 零配置，符合邀请制百级用户规模，数据量小
- 部署简单：单个可执行或 node 进程 + 一个 .db 文件

**Alternatives considered**:
- Go/Rust 高性能服务 → 过度设计，百级用户不需要
- PostgreSQL → 运维复杂，SQLite 足够
- 完全内嵌 Electron 中 → 不符合"独立后台服务器"要求（FR-014）

**Deployment model**:
- 开发环境：后台运行在 localhost:3001
- 生产环境：独立云服务器，配置域名和 HTTPS
- 管理后台：`server/admin-web/` 静态页面由同一 Express 进程托管

## 7. 管理后台技术选择

**Decision**: 轻量 Web 页面（纯 HTML + vanilla JS + 简洁 CSS），由 Express 托管静态文件，通过 API 获取数据。

**Rationale**:
- 管理后台是内部工具，不需要前端框架
- 复用同一 Express 进程，无额外部署
- 与编辑器客户端完全解耦

## 8. 版本更新推送机制

**Decision**: 客户端启动时轮询后台 `/api/update/check` 接口，返回最新版本号和下载地址。后台推送时通过 WebSocket 或轮询通知。v1 使用轮询方案（简单可靠）。

**Rationale**:
- Electron 内置 `autoUpdater` 模块，适配此流程
- 轮询间隔设为 30 分钟，避免频繁请求

## 总结

| 领域 | 决策 | 关键依赖 |
|------|------|----------|
| 编辑器 | Fork Code-OSS，只读复用 | Monaco Editor |
| AI 集成 | Codex 插件 / 本地能力桥接 | Codex 插件 |
| UI 模式 | 单窗口 CSS 布局切换 | CSS Grid |
| 认证 | JWT access + refresh token | bcrypt, jsonwebtoken |
| 邀请码 | UUID v4 + 有效期/次数 | 无 |
| 后台 | Node.js + Express + SQLite | better-sqlite3 |
| 管理后台 | 纯静态 Web 页面 | Express 托管 |
| 版本更新 | 启动轮询 + 后台推送 | Electron autoUpdater |
