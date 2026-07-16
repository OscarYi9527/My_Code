---
description: "AI Editor 产品账号、Edge 与中央 Gateway MVP 的依赖有序任务清单"
---

# Tasks: AI Editor 产品账号与中央 Gateway MVP

**Input**: Design documents from `/specs/002-ai-editor-account-gateway/`

**Repositories**:

- **Code**: `D:\AI_prejoct\My_code`
- **Proxy**: `D:\AI_prejoct\codex_proxy-dev`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`,
`quickstart.md`

**Tests**: 本功能要求测试先行、Gateway/admin 新代码行覆盖率不低于 80%，并保持现有
standalone Proxy、Code 开发版和 Windows 成品回归。

**Organization**: 任务按用户故事分组。所有调试任务使用 `47920`/`47921` 和隔离数据
目录，不得停止、重启或迁移共享 `47892`。

## Ownership Assignment

### Black — Server / Edge / Gateway / Admin Web

Black 负责以下任务，共 **95 项**：

```text
T001–T007
T009–T021
T023–T026
T028–T033
T038–T046
T049–T050
T052–T055
T060–T089
T091–T098
T100–T109
T111
T120
```

主要工作目录：`D:\AI_prejoct\codex_proxy-dev`。

服务器当前事实基线为 `origin/feature/custom-api-urls@e3ed1d6`，不是旧
`origin/master@06cd8d5`。该分支已经包含管理页面模块化、账号额度治理、成本治理、
智能路由、运行诊断、迁移和拆分测试；开始新实现前必须先完成差异审计，并把已满足且
验证通过的任务标记完成，禁止重写同等能力。

### Oscar — Code Components / Packaging / Product Validation

Oscar 负责以下任务，共 **23 项**：

```text
T008
T022
T027
T034–T037
T047–T048
T051
T056–T059
T090
T099
T110
T114–T119
```

主要工作目录：`D:\AI_prejoct\My_code`。

### Black + Oscar — Joint Integration

双方共同负责以下任务，共 **2 项**：

```text
T112  完整隔离 quickstart：Black 准备 Gateway/Edge，Oscar 执行 Code/UI 与成品链路
T113  共享 47892 不变性：Black 确认服务端未接触，Oscar 记录 PID、/live 和数据哈希
```

### Coordination Rules

- Oscar 在 My_Code 内实现可注入 Mock Transport 和本地合同模拟器，覆盖状态、handoff、
  Webview ticket、logout 和模型目录；Code 组件开发不等待 Black。
- Black 独立实现真实 Edge/Gateway，并使用相同合同样例验证；服务器开发不等待 Oscar
  完成 Code UI。
- 接口路径、JSON 字段、状态码或安全语义变化时，先修改 `contracts/` 并由双方确认。
- 每人只更新自己负责的任务复选框；共同任务必须双方验证后才能标记完成。
- Black 的默认开发仓库为 `codex_proxy`，Oscar 的默认开发仓库为 `My_Code`，避免双方
  同时修改同一源文件。
- 双方只在“合同冻结、真实接口符合性、最终端到端验收”三个检查点同步阻塞。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可与同阶段其他任务并行，文件和未完成依赖不冲突。
- **[Story]**: 对应 `spec.md` 的用户故事。
- Proxy 路径相对 `D:\AI_prejoct\codex_proxy-dev`；Code 路径相对
  `D:\AI_prejoct\My_code`。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立隔离源码、构建、依赖和安全调试边界。

- [ ] T001 Audit `origin/feature/custom-api-urls@e3ed1d6` against T001–T120, record reusable modules/tests, and document the isolated source rule in `D:\AI_prejoct\codex_proxy-dev\ARCHITECTURE.md`
- [ ] T002 Create the Gateway TypeScript package and scripts in `D:\AI_prejoct\codex_proxy-dev\gateway\package.json` and `gateway\tsconfig.json`
- [ ] T003 [P] Create the React/Vite admin package in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\package.json` and `gateway\admin-web\vite.config.ts`
- [ ] T004 [P] Add Gateway/admin Jest and ts-jest configuration in `D:\AI_prejoct\codex_proxy-dev\gateway\jest.config.ts` and `gateway\admin-web\jest.config.ts`
- [ ] T005 Extend ignored local DB, PID, log and secret patterns in `D:\AI_prejoct\codex_proxy-dev\.gitignore`
- [ ] T006 [P] Add fixed development Gateway/Edge configuration schema in `D:\AI_prejoct\codex_proxy-dev\gateway\src\config.ts` and `src\edge\edge-config.js`
- [ ] T007 Add isolated start/stop/reset entry scripts in `D:\AI_prejoct\codex_proxy-dev\tools\start-ai-editor-dev.ps1`, `tools\stop-ai-editor-dev.ps1`, and `tools\reset-ai-editor-dev.ps1`
- [x] T008 Add the injectable contract simulator and safe Code-side wrapper in `D:\AI_prejoct\My_code\scripts\mock-ai-editor-edge.ts` and `scripts\start-ai-editor-account-dev.ps1` with state, handoff, Webview-ticket, model, path, port and data-root validation

  **Black Mock conformance (2026-07-16)**: Code Electron-main now supplies the protected local
  nonce Header, accepts logout HTTP 204, validates the handoff completion acknowledgement and then
  refreshes safe status. `scripts/connect-ai-editor-black-dev.ps1` validates and launches the real
  Black `47920/47921` Mock without replacing the injectable Oscar simulator.

**Checkpoint**: 依赖可以安装，调试脚本只识别 `47920`/`47921` 和隔离数据目录。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有用户故事共用的服务组合、数据库、错误、脱敏、模式和测试基础。

**⚠️ CRITICAL**: 本阶段完成前不得开始用户故事实现。

- [ ] T009 [P] Add deterministic clock, ID and keyed-digest interfaces in `D:\AI_prejoct\codex_proxy-dev\gateway\src\common\clock.ts`, `ids.ts`, and `digests.ts`
- [ ] T010 [P] Add stable safe errors and request IDs in `D:\AI_prejoct\codex_proxy-dev\gateway\src\common\errors.ts`
- [ ] T011 [P] Implement shared secret redaction and structured safe logging in `D:\AI_prejoct\codex_proxy-dev\gateway\src\common\redaction.ts` and `logging.ts`
- [ ] T012 Create the Kysely database abstraction and transaction boundary in `D:\AI_prejoct\codex_proxy-dev\gateway\src\db\database.ts`
- [ ] T013 [P] Implement SQLite and PostgreSQL dialect factories in `D:\AI_prejoct\codex_proxy-dev\gateway\src\db\dialects\sqlite.ts` and `postgres.ts`
- [ ] T014 Create initial SQLite/PostgreSQL migrations for all entities in `D:\AI_prejoct\codex_proxy-dev\gateway\src\db\migrations\`
- [ ] T015 [P] Add repository contract tests for both dialects in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\contract\repository-contract.test.ts`
- [ ] T016 Create Fastify application composition and lifecycle in `D:\AI_prejoct\codex_proxy-dev\gateway\src\app.ts` and `server.ts`
- [ ] T017 [P] Add authentication, authorization, no-store and safe-error HTTP middleware in `D:\AI_prejoct\codex_proxy-dev\gateway\src\api\middleware\`
- [ ] T018 Add explicit `standalone`/`edge`/`gateway` mode parsing without changing the standalone default in `D:\AI_prejoct\codex_proxy-dev\src\mode.js` and `src\server.js`
- [ ] T019 [P] Add mode selection and standalone compatibility tests in `D:\AI_prejoct\codex_proxy-dev\tests\test-proxy-modes.js`
- [ ] T020 Implement isolated PID/data-root/port guards and health checks in `D:\AI_prejoct\codex_proxy-dev\tools\start-ai-editor-dev.ps1`
- [ ] T021 Add reset target canonicalization and confirmation tests in `D:\AI_prejoct\codex_proxy-dev\tests\test-dev-scripts.ps1`
- [ ] T022 Split Edge and Gateway release allowlists in `D:\AI_prejoct\My_code\build\ai-editor-proxy\release.json` and `build\ai-editor-proxy\prepare-ai-editor-proxy.ts`

**Checkpoint**: Gateway 空服务、三模式、双数据库 repository 合同和隔离脚本基础全部通过。

---

## Phase 3: User Story 1 - 登录后使用 AI，本地编辑不受影响 (Priority: P1) 🎯

**Goal**: 跑通邀请注册、系统浏览器 PKCE 登录、设备会话交接、状态刷新和新 Turn 门禁。

**Independent Test**: 未登录可编辑但不能发 Turn；浏览器登录返回 Code 后可发真实 Turn；
账号服务失效时新 Turn 关闭、已有 Turn 不被中断。

### Tests for User Story 1

- [ ] T023 [P] [US1] Add authorization-code, PKCE, state, expiry and replay contract tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\contract\auth-code.test.ts`
- [ ] T024 [P] [US1] Add Argon2id password/bootstrap and registration tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\unit\password-registration.test.ts`
- [ ] T025 [P] [US1] Add Refresh Token rotation/replay integration tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\integration\refresh-rotation.test.ts`
- [ ] T026 [P] [US1] Add Edge local handoff and secure-store tests in `D:\AI_prejoct\codex_proxy-dev\tests\test-edge-account-handoff.js`
- [x] T027 [P] [US1] Add Code account service, loopback callback and Turn-gate tests in `D:\AI_prejoct\My_code\src\vs\platform\aiEditorAccount\test\`

### Implementation for User Story 1

- [ ] T028 [US1] Implement account/password/device/token repositories in `D:\AI_prejoct\codex_proxy-dev\gateway\src\db\repositories\auth-repository.ts`
- [ ] T029 [US1] Implement Argon2id password policy, bootstrap initialization and forced password change in `D:\AI_prejoct\codex_proxy-dev\gateway\src\auth\password-service.ts` and `bootstrap-service.ts`
- [ ] T030 [US1] Implement authorization code + PKCE and browser login/registration routes in `D:\AI_prejoct\codex_proxy-dev\gateway\src\auth\authorization-service.ts` and `gateway\src\api\auth-routes.ts`
- [ ] T031 [US1] Implement five-minute Access Token and rolling Refresh Token family rotation in `D:\AI_prejoct\codex_proxy-dev\gateway\src\auth\token-service.ts`
- [ ] T032 [US1] Implement Edge OS secure-store adapters, single-flight refresh and account binding in `D:\AI_prejoct\codex_proxy-dev\src\edge\local-account-store.js` and `gateway-client.js`
- [ ] T033 [US1] Implement loopback-only one-time account handoff in `D:\AI_prejoct\codex_proxy-dev\src\edge\local-handoff.js` and `edge-server.js`
- [x] T034 [US1] Add Code account service contracts and IPC in `D:\AI_prejoct\My_code\src\vs\platform\aiEditorAccount\common\aiEditorAccount.ts` and `aiEditorAccountIpc.ts`
- [x] T035 [US1] Implement main-process PKCE callback, system-browser login and Edge handoff in `D:\AI_prejoct\My_code\src\vs\platform\aiEditorAccount\electron-main\`
- [x] T036 [US1] Implement renderer account service, 30-second refresh and safe state events in `D:\AI_prejoct\My_code\src\vs\platform\aiEditorAccount\electron-browser\aiEditorAccountService.ts`
- [x] T037 [US1] Integrate fail-closed pre-Turn gate without cancelling running Turns in `D:\AI_prejoct\My_code\src\vs\workbench\contrib\chat\browser\agentSessions\agentHostChatContribution.ts`

**Checkpoint**: US1 可独立演示，未登录和服务故障不会影响本地编辑。

---

## Phase 4: User Story 2 - Edge 通过中央 Gateway 统一路由 (Priority: P1)

**Goal**: Edge 不保存上游凭据，通过 Gateway 完成模型目录、风险预检查、路由和流式结算，
同时保持 standalone 兼容。

**Independent Test**: 通过隔离 Edge 获取动态模型并完成两类真实 Provider 回复；Edge 数据
目录无上游凭据；standalone 现有测试全通过。

### Tests for User Story 2

- [ ] T038 [P] [US2] Add Edge `/v1/models` and `/v1/responses` proxy contract tests in `D:\AI_prejoct\codex_proxy-dev\tests\test-edge-proxy.js`
- [ ] T039 [P] [US2] Add Gateway auth/model/routing/stream compatibility tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\contract\v1-gateway.test.ts`
- [ ] T040 [P] [US2] Add in-flight account switch/logout identity tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\integration\binding-switch.test.ts`

### Implementation for User Story 2

- [ ] T041 [US2] Implement Edge `/live`, `/ready`, `/v1/models`, `/v1/responses` and compatibility forwarding in `D:\AI_prejoct\codex_proxy-dev\src\edge\edge-server.js`
- [ ] T042 [US2] Implement safe Edge-to-Gateway headers, stream piping and captured binding identity in `D:\AI_prejoct\codex_proxy-dev\src\edge\gateway-client.js`
- [ ] T043 [US2] Implement Gateway Access Token/account/organization/model preflight in `D:\AI_prejoct\codex_proxy-dev\gateway\src\routing\request-preflight.ts`
- [ ] T044 [US2] Create a compatibility adapter over existing Provider route modules in `D:\AI_prejoct\codex_proxy-dev\gateway\src\routing\standalone-route-adapter.ts`
- [ ] T045 [US2] Implement Gateway model catalog and central `/v1/models` route in `D:\AI_prejoct\codex_proxy-dev\gateway\src\routing\model-catalog.ts` and `gateway\src\api\v1-routes.ts`
- [ ] T046 [US2] Implement streaming `/v1/responses` forwarding and completion hooks in `D:\AI_prejoct\codex_proxy-dev\gateway\src\routing\responses-gateway.ts`
- [ ] T047 [US2] Update Code Agent Host proxy environment to use isolated Edge development override and fixed product Edge in `D:\AI_prejoct\My_code\src\vs\workbench\contrib\chat\browser\agentSessions\agentHostSessionStarter.ts`
- [ ] T048 [US2] Extend model startup/manual refresh tests for Gateway-backed Edge in `D:\AI_prejoct\My_code\src\vs\platform\aiEditorProxy\test\common\aiEditorProxy.test.ts`

**Checkpoint**: US2 可使用测试 Token 独立验证中央模型路由，standalone 无回归。

---

## Phase 5: User Story 3 - 在 Code 内查看账号和安全状态 (Priority: P1)

**Goal**: 完成左下角产品账户入口、安全状态栏和受限单实例管理 Webview。

**Independent Test**: 三种角色登录后看到正确菜单/状态；普通用户无法访问诊断；Webview
不泄露 Token 且跨源导航被阻止。

### Tests for User Story 3

- [ ] T049 [P] [US3] Add Webview ticket, HttpOnly session and expiry tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\integration\webview-session.test.ts`
- [ ] T050 [P] [US3] Add admin shell role navigation tests in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\app\app.test.tsx`
- [ ] T051 [P] [US3] Add Code account menu, status action and management editor tests in `D:\AI_prejoct\My_code\src\vs\workbench\contrib\aiEditorAccount\test\browser\`

### Implementation for User Story 3

- [ ] T052 [US3] Implement one-time Webview ticket and HttpOnly management session in `D:\AI_prejoct\codex_proxy-dev\gateway\src\auth\webview-session-service.ts` and `gateway\src\api\webview-routes.ts`
- [ ] T053 [US3] Implement Edge safe status and Webview ticket endpoints in `D:\AI_prejoct\codex_proxy-dev\src\edge\safe-status.js` and `edge-server.js`
- [ ] T054 [US3] Create React management shell, API client and role navigation in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\app\`
- [ ] T055 [US3] Implement ordinary user profile, credits, devices and usage pages in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\pages\account\`
- [ ] T056 [US3] Replace the lower-left account contribution with AI Editor account actions in `D:\AI_prejoct\My_code\src\vs\workbench\contrib\aiEditorAccount\browser\aiEditorAccountMenu.ts`
- [ ] T057 [US3] Implement safe status contribution and context actions under Chat input in `D:\AI_prejoct\My_code\src\vs\workbench\contrib\aiEditorAccount\browser\aiEditorStatusContribution.ts`
- [ ] T058 [US3] Implement the single-instance `AI Editor 管理` editor input/pane in `D:\AI_prejoct\My_code\src\vs\workbench\contrib\aiEditorAccount\browser\aiEditorManagementInput.ts` and `aiEditorManagementEditor.ts`
- [ ] T059 [US3] Enforce fixed-origin navigation, external-browser links, popup and download policy in `D:\AI_prejoct\My_code\src\vs\platform\aiEditorAccount\electron-main\gatewayOriginPolicy.ts`

**Checkpoint**: US3 在 Code 内完整可见，且页面可见性与 Gateway API 权限双重验证。

---

## Phase 6: User Story 4 - 分级管理组织、用户和邀请码 (Priority: P2)

**Goal**: 完成组织隔离、角色管理、邀请注册和最后一级管理员保护。

**Independent Test**: 两组织二级管理员无法交叉访问；邀请原子消费；最后一级管理员不能
禁用或删除。

### Tests for User Story 4

- [ ] T060 [P] [US4] Add role/scope/last-Level-1 authorization tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\contract\admin-authorization.test.ts`
- [ ] T061 [P] [US4] Add concurrent invitation use and expiry tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\integration\invitation-concurrency.test.ts`
- [ ] T062 [P] [US4] Add organization admin UI permission tests in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\pages\organization\organization.test.tsx`

### Implementation for User Story 4

- [ ] T063 [US4] Implement organization/account/invitation repositories with mandatory scope filters in `D:\AI_prejoct\codex_proxy-dev\gateway\src\db\repositories\organization-repository.ts`
- [ ] T064 [US4] Implement centralized role and organization authorization policies in `D:\AI_prejoct\codex_proxy-dev\gateway\src\organizations\authorization-policy.ts`
- [ ] T065 [US4] Implement organization, account status and role services with transactional last-Level-1 protection in `D:\AI_prejoct\codex_proxy-dev\gateway\src\organizations\organization-service.ts`
- [ ] T066 [US4] Implement organization-bound invitation creation, revoke and atomic consume in `D:\AI_prejoct\codex_proxy-dev\gateway\src\invitations\invitation-service.ts`
- [ ] T067 [US4] Expose role-scoped organization/account/invitation routes in `D:\AI_prejoct\codex_proxy-dev\gateway\src\api\admin-organization-routes.ts`
- [ ] T068 [US4] Implement Level 1 and Level 2 organization/user/invitation pages in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\pages\organization\`

**Checkpoint**: US4 的权限由 API/repository 强制隔离，不依赖前端隐藏。

---

## Phase 7: User Story 5 - 按月分配积分并控制并发风险 (Priority: P2)

**Goal**: 完成月度组织/用户积分、隐藏费率、单次透支、累计风险、幂等结算和月度清零。

**Independent Test**: 20 个并发 Turn 下不重复预留/扣费，超过风险只拒绝新 Turn，已有
Turn 可结算为负积分。

### Tests for User Story 5

- [ ] T069 [P] [US5] Add monthly credit allocation and rollover tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\unit\credit-period.test.ts`
- [ ] T070 [P] [US5] Add per-Turn/cumulative risk boundary tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\unit\risk-policy.test.ts`
- [ ] T071 [P] [US5] Add 20-Turn idempotent reservation/settlement concurrency tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\integration\turn-settlement-concurrency.test.ts`
- [ ] T072 [P] [US5] Add role-filtered credit UI tests in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\pages\credits\credits.test.tsx`

### Implementation for User Story 5

- [ ] T073 [US5] Implement credit period, allocation, rate, risk and usage repositories in `D:\AI_prejoct\codex_proxy-dev\gateway\src\db\repositories\credit-repository.ts`
- [ ] T074 [US5] Implement monthly period creation/reset and organization/user allocation rules in `D:\AI_prejoct\codex_proxy-dev\gateway\src\credits\credit-service.ts`
- [ ] T075 [US5] Implement model rate calculation with hidden Level 1 multipliers in `D:\AI_prejoct\codex_proxy-dev\gateway\src\credits\rate-service.ts`
- [ ] T076 [US5] Implement worst-case Token/risk estimation and policy resolution in `D:\AI_prejoct\codex_proxy-dev\gateway\src\credits\risk-estimator.ts`
- [ ] T077 [US5] Implement transactional idempotent Turn reservation and cumulative-risk checks in `D:\AI_prejoct\codex_proxy-dev\gateway\src\credits\turn-risk-service.ts`
- [ ] T078 [US5] Implement actual/estimated usage settlement, negative balance and risk release in `D:\AI_prejoct\codex_proxy-dev\gateway\src\credits\settlement-service.ts`
- [ ] T079 [US5] Integrate reservation/settlement into Gateway streaming lifecycle in `D:\AI_prejoct\codex_proxy-dev\gateway\src\routing\responses-gateway.ts`
- [ ] T080 [US5] Implement role-filtered organization/user credit and usage pages in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\pages\credits\`

**Checkpoint**: US5 可独立证明积分和并发风险规则，Level 2/用户看不到隐藏参数。

---

## Phase 8: User Story 6 - 一级管理员集中配置 Provider 和路由 (Priority: P2)

**Goal**: 迁移现有 Provider 能力到中央 Level 1 管理边界，动态提供模型目录和安全诊断。

**Independent Test**: Level 1 在隔离 Gateway 重新配置两类 Provider并收到真实回复；其他
角色不能读取 Provider/路由/诊断。

### Tests for User Story 6

- [ ] T081 [P] [US6] Add Provider credential masking and Level-1-only contract tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\contract\provider-admin.test.ts`
- [ ] T082 [P] [US6] Add route/circuit/diagnostic redaction tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\integration\provider-diagnostics.test.ts`
- [ ] T083 [P] [US6] Add Provider/admin UI role tests in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\pages\system\providers.test.tsx`

### Implementation for User Story 6

- [ ] T084 [US6] Implement Provider credential repository behind a `plaintext-v1` boundary in `D:\AI_prejoct\codex_proxy-dev\gateway\src\db\repositories\provider-repository.ts`
- [ ] T085 [US6] Implement Level 1 Provider/model/route administration services in `D:\AI_prejoct\codex_proxy-dev\gateway\src\providers\provider-service.ts` and `gateway\src\routing\route-service.ts`
- [ ] T086 [US6] Adapt ChatGPT login, API, DeepSeek and Relay routes for Gateway-owned credentials in `D:\AI_prejoct\codex_proxy-dev\gateway\src\providers\adapters\`
- [ ] T087 [US6] Implement Provider, model, routing and safe diagnostics admin routes in `D:\AI_prejoct\codex_proxy-dev\gateway\src\api\admin-provider-routes.ts`
- [ ] T088 [US6] Implement Level 1 Provider/model/routing/diagnostic pages in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\pages\system\`
- [ ] T089 [US6] Add non-production startup gate and plaintext credential warnings in `D:\AI_prejoct\codex_proxy-dev\gateway\src\providers\credential-policy.ts`
- [ ] T090 [US6] Verify model catalog refresh through Edge and Code in `D:\AI_prejoct\My_code\src\vs\workbench\contrib\chat\test\browser\agentSessions\agentHostLanguageModelProvider.test.ts`

**Checkpoint**: US6 的上游账号只存在隔离 Gateway，动态模型和真实路由通过。

---

## Phase 9: User Story 7 - 管理密码和设备会话 (Priority: P3)

**Goal**: 完成用户密码、一次性重置、设备列表/撤销、Token 重放处置和本机退出。

**Independent Test**: 两设备轮换/撤销和临时密码流程全部通过，退出只影响本机设备。

### Tests for User Story 7

- [ ] T091 [P] [US7] Add password change/reset/temporary reuse tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\integration\password-lifecycle.test.ts`
- [ ] T092 [P] [US7] Add multi-device list/revoke/logout tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\integration\device-session.test.ts`
- [ ] T093 [P] [US7] Add account security UI tests in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\pages\account\security.test.tsx`

### Implementation for User Story 7

- [ ] T094 [US7] Implement password change and Level 1 temporary reset services in `D:\AI_prejoct\codex_proxy-dev\gateway\src\auth\password-service.ts`
- [ ] T095 [US7] Implement device list, revoke, inactivity expiry and token-family revocation in `D:\AI_prejoct\codex_proxy-dev\gateway\src\auth\device-session-service.ts`
- [ ] T096 [US7] Expose own-device, password and Level 1 reset routes in `D:\AI_prejoct\codex_proxy-dev\gateway\src\api\account-security-routes.ts`
- [ ] T097 [US7] Implement account security/device pages and confirmation flows in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\pages\account\security.tsx`
- [ ] T098 [US7] Implement Edge logout/secure deletion and in-flight binding preservation in `D:\AI_prejoct\codex_proxy-dev\src\edge\local-account-store.js`
- [ ] T099 [US7] Wire Code logout and password-required actions in `D:\AI_prejoct\My_code\src\vs\workbench\contrib\aiEditorAccount\browser\aiEditorAccountMenu.ts`

**Checkpoint**: US7 可独立完成账号恢复和设备失窃处置。

---

## Phase 10: User Story 8 - 审计调用并保护敏感内容 (Priority: P3)

**Goal**: 保存允许的脱敏问答/用量，执行组织保留期和管理员查看审计。

**Independent Test**: 混合系统、文件、工具、秘密和普通文本的 Turn 只保留允许内容；
跨组织查询被拒绝；正文清理后聚合仍存在。

### Tests for User Story 8

- [ ] T100 [P] [US8] Add structured content extraction and secret masking tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\unit\conversation-sanitizer.test.ts`
- [ ] T101 [P] [US8] Add organization scope, admin-view audit and retention tests in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\integration\audit-retention.test.ts`
- [ ] T102 [P] [US8] Add audit UI role/body-deleted tests in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\pages\audit\audit.test.tsx`

### Implementation for User Story 8

- [ ] T103 [US8] Implement conversation/admin audit repositories in `D:\AI_prejoct\codex_proxy-dev\gateway\src\db\repositories\audit-repository.ts`
- [ ] T104 [US8] Implement structured user/assistant extraction and secret masking in `D:\AI_prejoct\codex_proxy-dev\gateway\src\audit\conversation-sanitizer.ts`
- [ ] T105 [US8] Implement conversation/admin event writers and denied-access audit in `D:\AI_prejoct\codex_proxy-dev\gateway\src\audit\audit-service.ts`
- [ ] T106 [US8] Implement organization retention cleanup with aggregate preservation in `D:\AI_prejoct\codex_proxy-dev\gateway\src\audit\retention-service.ts`
- [ ] T107 [US8] Expose role-scoped conversation/admin audit routes in `D:\AI_prejoct\codex_proxy-dev\gateway\src\api\audit-routes.ts`
- [ ] T108 [US8] Implement organization-scoped audit/usage pages in `D:\AI_prejoct\codex_proxy-dev\gateway\admin-web\src\pages\audit\`

**Checkpoint**: US8 满足内容边界、角色范围和 7–180 天保留要求。

---

## Phase 11: Polish & Cross-Cutting Validation

**Purpose**: 完成安全、回归、双构建、制品边界和本地进度闭环。

- [ ] T109 [P] Run secret scans against DB/API/log/export fixtures and add regression cases in `D:\AI_prejoct\codex_proxy-dev\gateway\tests\security\secret-leak.test.ts`
- [ ] T110 [P] Run boundary tests for callback ports, Unicode/path spaces, duplicate clicks, timeouts and process crashes in `D:\AI_prejoct\My_code\src\vs\platform\aiEditorAccount\test\`
- [ ] T111 Run existing standalone `npm test` and Gateway/admin coverage suites in `D:\AI_prejoct\codex_proxy-dev\`
- [ ] T112 Run the full isolated quickstart and save a sanitized report under `D:\AI_prejoct\My_code\.build\ai-editor-account-gateway\`
- [ ] T113 Verify shared `47892` PID, `/live` and selected data hashes remained unchanged using `D:\AI_prejoct\My_code\scripts\start-ai-editor-account-dev.ps1`
- [ ] T114 Run Code `npm run typecheck-client`, focused tests and `npm run compile`, then validate `D:\AI_prejoct\My_code\scripts\code.bat`
- [ ] T115 Run Code `npm run core-ci` and rebuild `out-vscode-min` plus `D:\AI_prejoct\VSCode-win32-x64`
- [ ] T116 Verify Windows product Workbench checksums and confirm the installer contains Edge but excludes Gateway/admin/database resources in `D:\AI_prejoct\My_code\scripts\verify-ai-editor-windows-release.ps1`
- [ ] T117 Validate login, status, management Webview, model refresh and real responses in `D:\AI_prejoct\VSCode-win32-x64\Code - OSS.exe`
- [ ] T118 [P] Run macOS source/type/package static checks for Keychain, fixed Gateway origin and Edge-only release rules in `D:\AI_prejoct\My_code\build\darwin\`
- [ ] T119 Update implementation status and test evidence in `D:\AI_prejoct\My_code\CODEX_PROXY_INTEGRATION_PROGRESS.md` and `DEVELOPMENT-PLAN.md`
- [ ] T120 Update the Proxy architecture/security/deployment documentation in `D:\AI_prejoct\codex_proxy-dev\ARCHITECTURE.md`, `SECURITY.md`, and `README.md`

**Completion Gate**: 不切换共享 `47892`。只有全部任务通过且用户再次明确批准后，才允许
使用 `D:\AI_prejoct\My_code\scripts\restart-ai-proxy.ps1` 执行正式切换。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: 可立即开始。
- **Phase 2 Foundational**: 依赖 Setup，阻塞所有用户故事。
- **US1**: 依赖 Foundational；提供产品身份和 Code 门禁。
- **US2**: 依赖 Foundational；可使用测试 Token 并行开发，最终与 US1 设备会话集成。
- **US3**: 依赖 US1 的安全账号状态和 Webview ticket API。
- **US4**: 依赖 US1 认证；可与 US2/US3 后半段并行。
- **US5**: 依赖 US2 请求生命周期和 US4 组织范围。
- **US6**: 依赖 US2 Gateway 路由和 US4 Level 1 授权。
- **US7**: 依赖 US1 设备会话，可与 US4–US6 并行。
- **US8**: 依赖 US2 Turn 生命周期、US4 组织范围和 US5 usage。
- **Polish**: 依赖计划纳入 MVP 的全部用户故事。

### Critical Path

```text
Setup
→ Foundational
→ US1 Login
→ US2 Edge/Gateway
→ US4 Organizations
→ US5 Credits/Risk
→ US8 Audit
→ Full validation
```

US3、US6、US7 可在其依赖满足后与关键路径并行。

## Parallel Opportunities

- T009–T011、T013、T015、T017 可在基础数据库接口确定后并行。
- US1 的 Gateway auth、Edge secure store、Code IPC 测试可并行先写。
- US3 React 页面与 Code editor contribution 可在 Webview 合同固定后并行。
- US4、US7 可在 US1 完成后由不同执行者并行。
- US5 风险测试与 US6 Provider 管理 UI 可在 US2 完成后并行。
- 每个故事中的 `[P]` 测试应先失败，再进入实现任务。

## Implementation Strategy

### Vertical Slice 1: Login Gate

1. 完成 Setup 和 Foundational。
2. 完成 US1。
3. 使用假的 Gateway model response 验证“未登录本地可用、登录后可发 Turn、服务故障
   fail closed”。

### Vertical Slice 2: Central Model Path

1. 完成 US2 和 US3。
2. 在隔离 `47920`/`47921` 配置一个测试 Provider。
3. 验证 Code、其他本机 Codex 客户端和内置管理标签页。

### Vertical Slice 3: Operable MVP

1. 完成 US4、US5、US6。
2. 验证两组织、积分/风险、动态模型和 Level 1 Provider 管理。

### Vertical Slice 4: Security and Compliance MVP

1. 完成 US7、US8。
2. 完成全部安全、保留、双构建和成品验收。
3. 保持共享 `47892` 不变，等待单独切换批准。

## Task Summary

- Total tasks: **120**
- Setup/Foundation: **22**
- US1: **15**
- US2: **11**
- US3: **11**
- US4: **9**
- US5: **12**
- US6: **10**
- US7: **9**
- US8: **9**
- Polish/validation: **12**

All tasks use the required checkbox, sequential ID, optional `[P]`, user-story label and explicit
file path format.
