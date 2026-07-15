# Implementation Plan: AI Editor 产品账号与中央 Gateway MVP

**Branch**: `[002-ai-editor-account-gateway]` | **Date**: 2026-07-15 |
**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from
`/specs/002-ai-editor-account-gateway/spec.md`

## Summary

在不破坏现有 Codex Agent Host 和 standalone Proxy 的前提下，建立一条可独立验证的
产品账号链路：

```text
AI Editor / other local Codex clients
→ local Edge Proxy
→ central account/model Gateway
→ ChatGPT/OpenAI/DeepSeek/Relay
```

`codex_proxy` 采用三模式兼容架构。现有 JavaScript Proxy 继续承担 standalone 能力；
新增轻量 Edge 适配和 TypeScript Gateway 模块化单体。Gateway 提供账号、组织、邀请、
设备会话、积分、风险、审计、Provider 和路由模块，并提供 React 管理 UI。Code 增加
系统浏览器 PKCE 登录、左下角产品账户入口、AI Turn 前置门禁、安全状态栏和受限专用
管理 Webview。

开发阶段使用隔离 checkout `D:\AI_prejoct\codex_proxy-dev`、Gateway `47920`、Edge
`47921` 和独立数据目录；共享 `47892` 不停止、不重启、不迁移凭据。服务器实现不再从
旧 `master@06cd8d5` 重复起步，而是先审计并继承 Black 已推送的
`feature/custom-api-urls@e3ed1d6`。正式安装包只携带 Edge，正式 Gateway 使用固定中央
HTTPS 地址。

## Team Ownership

### Black：服务器与管理平台负责人

Black 负责 `D:\AI_prejoct\codex_proxy-dev`，范围包括：

- 先把现有 `feature/custom-api-urls` 的管理模块化、额度治理、智能路由、诊断、迁移和
  测试映射到 T001–T120，能复用的代码不重复实现；
- Gateway TypeScript 服务、SQLite/PostgreSQL 数据层和迁移；
- standalone/edge/gateway 三模式与 Edge 本机账号绑定；
- 注册、登录、PKCE、Token 轮换和设备会话；
- 组织、邀请码、两级管理员、积分、风险和结算；
- 中央 Provider、模型路由、熔断和系统诊断；
- React 管理 Web UI、调用审计和数据保留；
- Proxy/Gateway/admin 自动化测试和服务端文档。

Black 维护以下接口合同的服务端实现：

- `contracts/auth-account-api.md`
- `contracts/edge-gateway-api.md`
- `contracts/admin-api.md`

### Oscar：Code 组件与产品构建负责人

Oscar 负责 `D:\AI_prejoct\My_code`，范围包括：

- `IAiEditorAccountService`、主进程/渲染进程 IPC 和系统浏览器登录回调；
- 左下角“AI Editor 账户”、账号状态栏和上下文操作；
- 新 Turn 发送前账号门禁，且不取消已运行 Turn；
- “AI Editor 管理”专用 Webview、固定源和导航安全策略；
- Code 与 Edge/Gateway 的开发地址覆盖及正式产品固定配置；
- Edge 运行时随 Code 打包、开发版和 Windows 成品同步验证；
- Code 侧测试、产品 checksum、安装包边界和总进度文档。

Oscar 维护 `contracts/code-edge-webview.md` 的 Code 端实现。

### 共同责任

- 接口合同变更必须由 Black 与 Oscar 双方确认后再修改实现。
- Oscar 在 My_Code 内维护可注入的账号 Transport 和本地合同模拟器，Code 组件开发不等待
  Black 提供 Mock 服务。
- Black 使用相同合同和测试样例独立实现真实 Edge/Gateway，不等待 Oscar 完成 UI。
- Black 不需要重置、覆盖或放弃现有 `feature/custom-api-urls`；Gateway 分支应从
  `e3ed1d6` 或其后经双方确认的稳定提交创建。
- 联调只使用 Gateway `47920` 和 Edge `47921`，双方都不得操作共享 `47892`。
- T112 端到端 quickstart 和 T113 共享 Proxy 不变性验证由双方共同签字确认。
- Black 不直接修改 Code 产品组件；Oscar 不直接修改 Gateway 业务逻辑，跨仓库修改通过
  明确 PR 交接。

### 并行开发检查点

1. **合同冻结**：双方确认 `contracts/`、错误码和共享 JSON 样例；随后各自独立编码。
2. **真实接口符合性**：Black 的 Edge/Gateway 通过同一合同测试后，Oscar 只替换 Mock
   Transport 为真实地址，不重写 UI。
3. **端到端验收**：T112/T113 才需要双方同时参与，完成真实登录、模型回复和共享 Proxy
   不变性确认。

## Technical Context

**Language/Version**:

- Code-OSS: 现有 TypeScript 5.x / Electron / Node 运行时。
- Proxy standalone/edge: Node.js ESM，保持当前 Node `>=18` 兼容。
- Gateway/admin: TypeScript 5.x，编译为 Node.js ESM；React + TypeScript。

**Primary Dependencies**:

- Existing Proxy: `undici`，现有原生 `http` 路由模块。
- Gateway HTTP: Fastify，使用 JSON Schema/TypeBox 做边界验证。
- Authentication: Node `crypto`、`jose`、`@node-rs/argon2`。
- Data access: Kysely repository layer；开发使用 `better-sqlite3`，生产使用 `pg`。
- Admin UI: React、Vite、React Router；管理会话只使用 HttpOnly Cookie。
- Code: 现有 VS Code service/IPC/editor/webview/command 基础设施，不引入独立登录网页
  容器或第三方账户扩展。

**Storage**:

- MVP 开发：隔离 SQLite 数据库。
- 正式中央服务：PostgreSQL。
- Edge：Windows DPAPI/macOS Keychain 保存 Refresh Token，Access Token 仅内存。
- 上游凭据：MVP 本机 SQLite 临时 `plaintext-v1`，公开部署前必须完成信封加密待办。

**Testing**:

- Existing Proxy: `node:test`，保持现有测试入口。
- Gateway/admin TypeScript: Jest + ts-jest，React 使用 jsdom 和 Testing Library。
- Code: VS Code 现有 Mocha/unit test runner、TypeScript typecheck、开发版与产品构建。
- E2E: PowerShell 隔离调试脚本、HTTP 合同测试、Windows Code UI 验收。

**Target Platform**:

- Edge/Code: Windows x64 MVP 验证，macOS arm64/x64 保持源码和打包兼容。
- Gateway 开发：Windows 本机 loopback。
- Gateway 正式：中央 HTTPS Linux/容器部署目标，PostgreSQL。

**Project Type**: 双仓库桌面应用 + 本地 Edge + 中央 Web/API 模块化单体。

**Performance Goals**:

- Code 启动后 10 秒内显示安全账号状态。
- 本机状态查询 p95 小于 250 ms；Gateway 账号预检查 p95 小于 500 ms（不含上游模型）。
- 30 秒轮询不产生重叠请求；并发刷新合并为单次 Token 刷新。
- 20 个并发 Turn 下风险占用和结算保持幂等。

**Constraints**:

- 只允许 Codex Agent Host 作为 AI Editor Provider。
- 不修改共享 Proxy `47892`；切换前必须再次获得用户批准并仅使用安全重启脚本。
- Code UI/runtime 改动必须同步验证 `out` 与 Windows `out-vscode-min`/成品。
- 普通用户不能修改正式 Gateway 地址。
- Refresh Token、密码和一次性凭据不得进入日志、URL、Webview localStorage 或 Git。
- 普通用户/二级管理员不能通过 API 获取 Provider、路由、熔断、凭据或系统诊断。

**Scale/Scope**:

- MVP 覆盖 3 种角色、多个组织、多个设备会话和多个并发 Turn。
- 本机验收至少覆盖 2 个组织、20 个用户、20 个并发 Turn、2 类 Provider 和 20 个模型。
- MVP 不包含邮箱验证、公开中央部署、KMS/信封加密、Code 全原生账号管理页和 macOS
  签名/公证。

## Constitution Check

*GATE: Passed before Phase 0 research; re-checked after Phase 1 design.*

### Principle Compliance

| Principle | Result | Evidence |
|---|---|---|
| Spec-driven development | PASS | `spec.md` 已批准，无待确认项 |
| Simplicity first | PASS | 保留 standalone；Edge、Gateway 和管理 UI 只增加必要边界 |
| Quality/testing ownership | PASS | 每个用户故事有独立验收，新增代码要求 >=80% 覆盖 |
| Observability/documentation | PASS | 安全错误编号、路由诊断、审计和本地进度文档均在范围内 |
| Security/responsible AI | PASS with temporary gate | 仅上游凭据信封加密延期，且公开部署被明确阻断 |
| OOP/interface-first | PASS | 存储、令牌、Provider、计费和审计使用接口与注入 |
| Framework constraints | PASS | 不改变 Codex Agent Host 主链，不整体迁移现有 Proxy |

### Gates

- [x] Spec gate: 50 条可测试功能要求，无 `[NEEDS CLARIFICATION]`。
- [x] Security gate: 密码、Token、票据、角色、审计和临时明文边界已定义。
- [x] Compatibility gate: standalone 与共享 `47892` 隔离要求已定义。
- [x] Cross-platform gate: DPAPI/Keychain 和 Windows/macOS 产品边界已定义。
- [x] Deployment gate: Gateway 公开部署在信封加密完成前被阻断。

## Project Structure

### Documentation (this feature)

```text
specs/002-ai-editor-account-gateway/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
├── contracts/
│   ├── auth-account-api.md
│   ├── edge-gateway-api.md
│   ├── admin-api.md
│   └── code-edge-webview.md
└── tasks.md
```

### Source Code: `D:\AI_prejoct\codex_proxy-dev`

```text
src/
├── server.js                       # existing standalone entry, compatibility adapter
├── mode.js                         # explicit standalone/edge/gateway mode parsing
├── edge/
│   ├── edge-server.js
│   ├── gateway-client.js
│   ├── local-account-store.js
│   ├── local-handoff.js
│   └── safe-status.js
├── routes/                         # existing upstream route implementation
└── ...                             # existing standalone modules remain in place

gateway/
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts
│   ├── config.ts
│   ├── common/
│   │   ├── errors.ts
│   │   ├── ids.ts
│   │   ├── clock.ts
│   │   └── redaction.ts
│   ├── db/
│   │   ├── database.ts
│   │   ├── migrations/
│   │   ├── repositories/
│   │   └── dialects/
│   ├── auth/
│   ├── organizations/
│   ├── invitations/
│   ├── credits/
│   ├── audit/
│   ├── providers/
│   ├── routing/
│   └── api/
├── admin-web/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── app/
│       ├── api/
│       ├── components/
│       └── pages/
└── tests/
    ├── unit/
    ├── contract/
    └── integration/

tools/
├── start-ai-editor-dev.ps1
├── stop-ai-editor-dev.ps1
└── reset-ai-editor-dev.ps1
```

### Source Code: `D:\AI_prejoct\My_code`

```text
src/vs/platform/aiEditorAccount/
├── common/
│   ├── aiEditorAccount.ts
│   └── aiEditorAccountIpc.ts
├── electron-browser/
│   └── aiEditorAccountService.ts
├── electron-main/
│   ├── aiEditorAccountMainService.ts
│   ├── loopbackCallbackServer.ts
│   └── gatewayOriginPolicy.ts
└── test/

src/vs/workbench/contrib/aiEditorAccount/browser/
├── aiEditorAccount.contribution.ts
├── aiEditorAccountMenu.ts
├── aiEditorManagementEditor.ts
├── aiEditorManagementInput.ts
└── aiEditorStatusContribution.ts

src/vs/workbench/contrib/chat/browser/agentSessions/
└── ...                             # new-Turn account gate integration

src/vs/platform/aiEditorProxy/
└── ...                             # Edge endpoint/configuration extension

scripts/
└── start-ai-editor-account-dev.ps1 # wrapper for isolated Proxy checkout
```

**Structure Decision**:

- `codex_proxy` 保持单仓库但把中央 Gateway 放入独立子包，避免正式 Edge 安装包携带数据库、
  管理 UI 和中央服务依赖。
- 现有 `src/server.js` 只增加模式分派和兼容适配，不把现有路由整体改写为 TypeScript。
- Code 新增独立 platform service 和 workbench contribution，不把账号逻辑塞入通用 Chat
  模型；Chat 只调用稳定的“是否允许新 Turn”接口。

## Phase 0 Research Decisions

详细依据见 [research.md](./research.md)。关键结论：

1. Gateway 使用 Fastify + TypeScript 模块化单体，Edge 保持轻量 Node ESM。
2. 使用 Kysely repository 隔离 SQLite/PostgreSQL 方言和事务。
3. 密码使用 Argon2id；短期 Access Token 使用签名令牌，Refresh Token 使用不透明随机值、
   轮换家族和服务器密钥哈希。
4. 浏览器登录使用 Authorization Code + PKCE；Code、Edge 和 Webview 使用不同的一次性
   交接票据，避免共享长期凭据。
5. 积分预检查使用幂等 Turn 风险预留，结算在事务内完成。
6. 审计只从结构化用户/助手文本中提取内容，排除文件、系统、推理和工具载荷。

## Phase 1 Design Artifacts

- [data-model.md](./data-model.md): 账号、组织、会话、积分、风险、审计和 Provider 实体。
- [contracts/auth-account-api.md](./contracts/auth-account-api.md): 注册、登录、刷新和设备接口。
- [contracts/edge-gateway-api.md](./contracts/edge-gateway-api.md): `/v1` 转发、预检和结算边界。
- [contracts/admin-api.md](./contracts/admin-api.md): 角色化管理 API 和诊断范围。
- [contracts/code-edge-webview.md](./contracts/code-edge-webview.md): Code IPC、本机交接和
  专用 Webview 合同。
- [quickstart.md](./quickstart.md): 不接触共享 `47892` 的端到端验收步骤。

## Post-Design Constitution Re-check

- 接口优先：数据库、凭据存储、时钟、Provider、计费和审计边界均有可替换接口。
- 不新增全局可变单例；服务由应用组合根创建和释放。
- 公共接口使用明确类型、错误码和脱敏日志。
- Gateway 独立子包是隔离中央依赖、防止 Edge 安装包膨胀所需，不属于无依据拆服务。
- 现有 Proxy 测试继续使用 `node:test`，Code 继续使用上游测试框架；新增 TypeScript
  Gateway/admin 使用 Jest + ts-jest，满足新增代码覆盖门禁。

## Complexity Tracking

| Complexity | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| 同仓库的独立 Gateway 子包 | 正式安装包只允许携带 Edge，中央数据库和 Web UI 不能进入用户机器 | 单 package 会把原生数据库、管理 UI 和中央凭据代码带入 Edge 制品 |
| SQLite/PostgreSQL 双方言 repository | 本机 MVP 与正式中央部署存储目标已明确不同 | 直接散落 SQL 会让迁移、事务和并发结算行为难以保持一致 |
| Code/Edge/Webview 三段一次性票据 | 长期 Refresh Token 不能进入 Code 页面或 Webview | 直接把 Token 放入 URL/localStorage 会扩大泄露与重放风险 |
| 运行中 Turn 风险预留 | 已确认允许并发 Turn、负积分和最大透支 | 仅在完成后扣费无法阻止并发请求无限扩大负余额 |
