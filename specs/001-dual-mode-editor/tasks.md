# Tasks: 双模式 AI 编辑器

**Input**: Design documents from `specs/001-dual-mode-editor/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: 根据宪法 Testing Protocol 要求——每轮任务完成后执行 Jest + ts-jest 测试。每个用户故事包含测试任务。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Electron 客户端: `src/main/`, `src/renderer/`, `src/common/`, `test/`
- 后台服务器: `server/src/`, `server/tests/`
- 管理后台: `server/admin-web/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 项目初始化和基础框架搭建

- [x] T001 Create project structure per plan.md — create all directories under `src/main/`, `src/renderer/views/`, `src/renderer/components/`, `src/renderer/stores/`, `src/common/interfaces/`, `src/common/types/`, `src/common/utils/`, `server/src/`, `test/unit/`, `test/integration/`, `test/e2e/`
- [x] T002 Initialize Electron app with TypeScript in `src/main/main.ts` — configure Electron entry, BrowserWindow creation, load renderer
- [x] T003 [P] Initialize server project with Express + TypeScript in `server/src/index.ts` — configure Express, middleware, port binding
- [x] T004 [P] Configure Jest + ts-jest in `jest.config.ts` and `tsconfig.json` for both client and server
- [x] T005 [P] Configure ESLint + Prettier in `.eslintrc.json` and `.prettierrc` per constitution formatting rules (2-space, single quotes, semicolons)
- [x] T006 [P] Setup SQLite database connection and migration framework in `server/src/db/connection.ts` and `server/src/db/migrations/`
- [x] T007 Add AI local state directories and `server/data/` to `.gitignore`（当前遗留包含 `.claude/`，后续 Codex 本地状态目录按实际接入补充）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**Phase 2的 CRITICAL**: No user story work can begin until this phase is complete

- [x] T008 Define shared auth types in `src/common/types/auth.types.ts` — User, AuthTokens, LoginRequest, RegisterRequest interfaces
- [x] T009 [P] Define shared chat types in `src/common/types/chat.types.ts` — Message, Conversation, ChatChunk, FileReference interfaces
- [x] T010 [P] Define shared mode types in `src/common/types/mode.types.ts` — AppMode, LayoutState interfaces
- [x] T011 [P] Define core interfaces in `src/common/interfaces/i-auth-service.ts` — IAuthService (login, register, refresh, logout, getSession)
- [x] T012 [P] Define core interfaces in `src/common/interfaces/i-storage-service.ts` — IStorageService (get, set, delete, has)
- [x] T013 [P] Define core AI bridge interfaces in `src/common/interfaces/i-codex-client.ts` — ICodexClient (sendMessage, streamChunks)
- [x] T014 Implement IPC handler framework in `src/main/services/ipc-handler.ts` — register IPC channels, handle invoke/send patterns per contracts/ipc-channels.md
- [x] T015 Implement token manager in `src/common/utils/token-manager.ts` — encrypt/decrypt access token using Electron safeStorage, refresh logic
- [x] T016 [P] Implement path utilities in `src/common/utils/path-utils.ts` — normalize, sanitize file paths for cross-platform
- [x] T017 Setup Express auth middleware in `server/src/middleware/auth-middleware.ts` — verify JWT, attach user to request
- [x] T018 [P] Setup Express admin middleware in `server/src/middleware/admin-middleware.ts` — check role='admin', reject with 403

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - 用户登录与身份认证 (Priority: P1) 🎯 MVP

**Goal**: 用户可通过邀请码注册账户、凭据登录、会话保持、静默令牌续期

**Independent Test**: 启动应用 → 管理员生成邀请码 → 用户注册 → 登录 → 关闭重开自动恢复 → 令牌静默刷新

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T019 [P] [US1] Unit test for token-manager encrypt/decrypt in `test/unit/common/token-manager.test.ts`
- [x] T020 [P] [US1] Unit test for auth types validation in `test/unit/common/auth.types.test.ts`
- [x] T021 [P] [US1] Contract test for POST /api/auth/login in `test/integration/auth/login.test.ts`
- [x] T022 [P] [US1] Contract test for POST /api/auth/register in `test/integration/auth/register.test.ts`
- [x] T023 [P] [US1] Contract test for POST /api/auth/refresh in `test/integration/auth/refresh.test.ts`

### Implementation for User Story 1

- [x] T024 [US1] Create UserAccount model and DB operations in `server/src/models/user.ts` — findById, findByUsername, create, updatePassword
- [x] T025 [US1] Create InvitationCode model and DB operations in `server/src/models/invitation.ts` — create, findByCode, markUsed, listByStatus
- [x] T026 [US1] Implement auth routes in `server/src/routes/auth.ts` — POST /login, /register, /refresh, /logout, GET /me per contracts/auth-api.md
- [x] T027 [US1] Implement auth service in `server/src/services/auth-service.ts` — password hashing (bcrypt), JWT generation/verification, refresh token management
- [x] T028 [P] [US1] Implement auth service in `src/main/services/auth-service.ts` — communicate with server /auth endpoints, store tokens
- [x] T029 [US1] Implement session restore logic in `src/main/main.ts` — on app ready, check stored tokens, attempt refresh, emit auth:session-restored
- [x] T030 [US1] Implement silent token refresh timer in `src/main/main.ts` — interval check every 10min, refresh if expires in < 5min
- [x] T031 [US1] Create login page UI in `src/renderer/views/login-page.ts` — username/password inputs, login button, "use invitation code to register" link
- [x] T032 [US1] Add invitation code registration flow in `src/renderer/views/login-page.ts` — invitation code input, username/password inputs, validation feedback
- [x] T033 [US1] Create app state store in `src/renderer/stores/app-state-store.ts` — user, login state, mode, handle auth:session-restored event

**Checkpoint**: User can register with invitation code, log in, auto-restore session, tokens silently refresh

---

## Phase 4: User Story 2 - 开发模式（传统 IDE 视图）(Priority: P1)

**Goal**: 开发模式下显示完整 IDE 面板——文件树、编辑器（语法高亮/补全）、终端、搜索、AI 对话框

**Independent Test**: 开发模式下 → 打开文件编辑 → 打开终端 → 调出 AI 对话框 → 验证布局

### Tests for User Story 2 ⚠️

- [x] T034 [P] [US2] Unit test for dev-layout component mounting all panels in `my-tests/unit/renderer/dev-layout.test.ts`
- [x] T035 [P] [US2] Integration test for file open flow (renderer→main) in `my-tests/integration/file-open.test.ts`

### Implementation for User Story 2

- [x] T036 [US2] Create dev layout component in `app/renderer/views/dev-layout.ts` — CSS grid: file tree | editor | AI chat panel; terminal below editor; search/toggle panels
- [x] T037 [P] [US2] Create file tree component in `app/renderer/components/file-tree.ts` — render directory structure, click-to-open, expand/collapse
- [x] T038 [US2] Integrate Code-OSS editor core (Monaco) — dev-layout.ts provides #monaco-editor-host container; VSCode Monaco mounts natively
- [x] T039 [P] [US2] Integrate Code-OSS terminal panel in dev-layout — visibility toggle via panel tabs, bottom panel
- [x] T040 [US2] Integrate Code-OSS search panel in dev-layout — visibility toggle, search input + results container
- [x] T041 [US2] Wire dev-layout to app-state-store: respond to mode='dev', toggle AI panel visibility
- [x] T042 [US2] Implement file:open IPC handler in `app/main/services/ipc-handlers.ts` — read file from disk, return content + language detection
- [x] T043 [US2] Implement file:save IPC handler in `app/main/services/ipc-handlers.ts` — write file content to disk, handle errors

**Checkpoint**: 开发模式完整的 IDE 体验——编辑、终端、搜索、文件树、AI 对话框

---

## Phase 5: User Story 3 - 简约模式（业务人员视图）(Priority: P1)

**Goal**: 简约模式仅显示文件目录树 + 常驻 AI 对话框 + 简易编辑器，支持基础编辑和保存

**Independent Test**: 切换到简约模式 → 浏览文件树 → 点击文件在简易编辑器查看 → 修改并保存 → 用自然语言提问 AI

### Tests for User Story 3 ⚠️

- [x] T044 [P] [US3] Unit test for simple-layout component in `my-tests/unit/renderer/simple-layout.test.ts`
- [x] T045 [P] [US3] Unit test for simple-editor basic operations in `my-tests/unit/renderer/simple-editor.test.ts`

### Implementation for User Story 3

- [x] T046 [US3] Create simple layout component in `app/renderer/views/simple-layout.ts` — CSS grid: file tree (left) | AI chat + simple editor (right, stacked); no terminal/search/menubar
- [x] T047 [US3] Create simple editor component in `app/renderer/components/simple-editor.ts` — plain textarea with read/edit toggle, save button; no syntax highlight/code completion
- [x] T048 [US3] Wire simple-layout to app-state-store: respond to mode='simple', ensure AI chat always visible (not dismissable)
- [x] T049 [US3] Handle file click in simple mode: route to simple-editor instead of Monaco editor; file content shown in textarea
- [x] T050 [US3] Implement file:save IPC for simple mode — save edited content from simple-editor to disk via main process

**Checkpoint**: 简约模式完整工作——文件树 + 常驻 AI 对话框 + 简易编辑器

---

## Phase 6: User Story 4 - 模式切换 (Priority: P2)

**Goal**: 通过菜单在开发/简约模式间自由切换，切换不中断 AI 对话，< 1 秒完成

**Independent Test**: 开始 AI 对话 → 切换模式 → 验证对话保持和状态一致 → 反向切换验证文件在编辑器中打开

### Tests for User Story 4 ⚠️

- [x] T051 [P] [US4] Unit test for mode-switcher component in `my-tests/unit/renderer/mode-switcher.test.ts`
- [x] T052 [P] [US4] Integration test for mode switch flow (dev ↔ simple) in `my-tests/integration/mode-switch.test.ts`

### Implementation for User Story 4

- [x] T053 [US4] Create mode switcher component in `app/renderer/components/mode-switcher.ts` — dropdown/toggle in menu bar, keyboard shortcut binding
- [x] T054 [US4] Implement mode:switch IPC handler in `app/main/services/ipc-handlers.ts` — validate mode value, update app-state-store, persist preference
- [x] T055 [US4] Implement mode:get IPC handler in `app/main/services/ipc-handlers.ts` — return current mode from store
- [x] T056 [US4] Wire mode switch to layout transition: swap simple-layout ↔ dev-layout without closing WebContents; preserve AI conversation state via chat-store
- [x] T057 [US4] Implement file state transfer on mode switch — file opened in simple-editor → switch → opens in Monaco editor (and reverse: read-only preview)
- [x] T058 [US4] Save user mode preference to local storage — last used mode restored on next app start

**Checkpoint**: 模式切换流畅，< 1 秒，对话和文件状态保持

---

## Phase 7: User Story 5 - AI 对话框交互 (Priority: P2)

**Goal**: AI 对话框支持多轮对话、文件引用、Markdown 渲染 + 代码高亮、文件链接点击、错误状态

**Independent Test**: 发送消息 → 验证 Markdown 渲染 → 引用文件让 AI 分析 → 点击 AI 回复中的文件链接

### Tests for User Story 5 ⚠️

- [x] T059 [P] [US5] Unit test for chat-store in `my-tests/unit/renderer/chat-store.test.ts`
- [x] T060 [P] [US5] Unit test for ai-chat-panel markdown rendering in `my-tests/unit/renderer/ai-chat-panel.test.ts`
- [x] T061 [P] [US5] Integration test for chat send + stream flow in `my-tests/integration/chat-send.test.ts`
- [x] T062 [P] [US5] Integration test for chat file reference flow in `my-tests/integration/chat-file-reference.test.ts`

### Implementation for User Story 5

- [x] T063 [US5] Create Codex bridge in `app/main/services/codex-bridge.ts` — connect to Codex plugin / local capability bridge, send messages, handle streaming responses per research.md §2
- [x] T064 [US5] Create chat store in `app/renderer/stores/chat-store.ts` — conversation list, active conversation, message history, streaming state
- [x] T065 [US5] Create AI chat panel component in `app/renderer/components/ai-chat-panel.ts` — message list, input area, Markdown renderer, code block syntax highlighting
- [x] T066 [US5] Implement chat:send IPC handler in `app/main/services/ipc-handlers.ts` — forward message to Codex bridge
- [x] T067 [US5] Implement chat:chunk streaming in `app/main/services/ipc-handlers.ts` — chat:send handler streams Codex bridge responses → renderer chunks via mainWindow.webContents.send
- [x] T068 [US5] Implement file context in chat — when user references file paths in message, read file content and prepend to context before sending to Codex
- [x] T069 [US5] Implement file link clicking in `app/renderer/components/ai-chat-panel.ts` — parse file paths in AI response, render as clickable links, emit chat:open-file to main
- [x] T070 [US5] Implement chat:open-file IPC handler — determine mode, open file in appropriate editor (Monaco vs simple-editor)
- [x] T071 [US5] Handle AI service unavailable in `app/main/services/codex-bridge.ts` and UI — catch connection errors, show actionable error message, preserve input text

**Checkpoint**: AI 对话框完全可用——多轮对话、Markdown + 代码高亮、文件引用、文件链接、错误处理

---

## Phase 8: User Story 6 - 管理后台（管理员视图）(Priority: P3)

**Goal**: 管理员通过 Web 管理后台查看数据、管理邀请码、推送版本、审核 Skill 市场

**Independent Test**: 管理员登录 Web 后台 → 查看仪表盘 → 生成邀请码 → 推送版本 → 审核 Skill

### Tests for User Story 6 ⚠️

- [ ] T072 [P] [US6] Unit test for stats service in `server/tests/unit/stats-service.test.ts`
- [ ] T073 [P] [US6] Integration test for admin invitation API in `server/tests/integration/admin-invitation.test.ts`
- [ ] T074 [P] [US6] Integration test for admin version API in `server/tests/integration/admin-version.test.ts`

### Implementation for User Story 6

- [ ] T075 [US6] Create UsageRecord model and DB operations in `server/src/models/usage-record.ts` — create, findByUserId, aggregateByDate, aggregateByModel
- [x] T076 [US6] Implement stats service in `server/src/routes/admin.ts` — totalUsers, activeUsersToday, aiCallCount, tokenUsage per contracts/admin-api.md (inline in /dashboard)
- [x] T077 [US6] Implement admin routes in `server/src/routes/admin.ts` — GET /dashboard, /users, /users/:id/usage per contracts/admin-api.md
- [x] T078 [US6] Implement invitation routes in `server/src/routes/admin.ts` — POST /invitations, GET /invitations per contracts/admin-api.md
- [ ] T079 [US6] Create VersionUpdate model and DB operations in `server/src/models/` — create, findLatest, findByPlatform
- [x] T080 [US6] Implement version routes and service in `server/src/routes/admin.ts` — POST /versions, GET /versions; serve /api/update/check for client polling
- [ ] T081 [US6] Create SkillPublication model and DB operations in `server/src/models/` — create, findByStatus, updateStatus
- [x] T082 [US6] Implement marketplace routes in `server/src/routes/admin.ts` — GET /marketplace/submissions, POST /marketplace/submissions/:id/review
- [x] T083 [US6] Implement update:check IPC handler in `app/main/services/update-service.ts` — poll server /api/update/check on startup and every 30min, emit update:available
- [x] T084 [US6] Create admin dashboard page in `server/admin-web/dashboard.html` — user stats, AI usage charts, navigation
- [x] T085 [US6] Create admin invitation management page in `server/admin-web/invitations.html` — generate codes, list codes with status
- [x] T086 [US6] Create admin version management page in `server/admin-web/versions.html` — upload version info, push notifications
- [x] T087 [US6] Create admin marketplace page in `server/admin-web/marketplace.html` — review submissions, approve/reject
- [x] T088 [US6] Serve admin-web static files from Express in `server/src/index.ts` — configure static middleware for /admin route

**Checkpoint**: 管理后台完整——仪表盘、邀请码、版本推送、Skill 审核 + 客户端更新通知

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T089 [P] Edge case: empty directory guidance in simple mode — chat panel shows onboarding message when no files via chat-empty div
- [x] T090 [P] Edge case: AI response overflow scrolling — chat-messages container uses overflow-y: auto with flex layout
- [ ] T091 [P] Edge case: file paths with spaces/Chinese/special chars — verify path handling in `app/` IPC handlers
- [ ] T092 [P] Rate limiting on auth endpoints — auth routes have inline IP rate limiting (MAX 5/min)
- [ ] T093 UsageRecord logging — deferred: requires DB connection initialization for SQLite
- [x] T094 [P] E2E test for simple mode full flow in `my-tests/e2e/simple-mode.test.ts`
- [x] T095 [P] E2E test for dev mode full flow in `my-tests/e2e/dev-mode.test.ts`
- [ ] T096 Run quickstart.md validation — requires Electron + server running simultaneously
- [ ] T097 Code cleanup and refactoring — remove unused imports, consolidate duplicate logic
- [ ] T098 Final coverage check — run `jest --coverage`, ensure >= 80% for all new code

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — P1, blocks US2/US3 (login required)
- **User Story 2 (Phase 4)**: Depends on US1 (login/state) + Foundational — P1
- **User Story 3 (Phase 5)**: Depends on US1 (login/state) + Foundational — P1; can parallel with US2
- **User Story 4 (Phase 6)**: Depends on US2 + US3 (both modes must exist) — P2
- **User Story 5 (Phase 7)**: Depends on Foundational (Codex bridge) — P2; can start after Phase 2 but integration tests need US2/US3
- **User Story 6 (Phase 8)**: Depends on Foundational (server) — P3; can parallel with US2-US5
- **Polish (Phase 9)**: Depends on all desired user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — No other story dependencies
- **User Story 2 (P1)**: Can start after US1 models + auth middleware — Independent of US3
- **User Story 3 (P1)**: Can start after US1 models + auth middleware — Independent of US2
- **User Story 4 (P2)**: MUST wait for US2 AND US3 both complete (mode switch needs both layouts)
- **User Story 5 (P2)**: Can start after Foundational Codex bridge — file link feature needs US2/US3 editors
- **User Story 6 (P3)**: Can start after Foundational server setup — Independent of client stories

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models before services
- Services before IPC handlers / routes
- Backend routes before frontend UI for auth (US1)
- Frontend components can parallel with backend for US2-US6

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- US2 and US3 can be developed in parallel after US1
- US5 (AI chat) can start in parallel with US2/US3 after Foundational
- US6 (admin) can start in parallel with US2-US5 after Foundational
- All tests within a story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit test for token-manager encrypt/decrypt in test/unit/common/token-manager.test.ts"
Task: "Unit test for auth types validation in test/unit/common/auth.types.test.ts"
Task: "Contract test for POST /api/auth/login in test/integration/auth/login.test.ts"
Task: "Contract test for POST /api/auth/register in test/integration/auth/register.test.ts"
Task: "Contract test for POST /api/auth/refresh in test/integration/auth/refresh.test.ts"

# Launch all models for User Story 1 together:
Task: "Create UserAccount model and DB operations in server/src/models/user.ts"
Task: "Create InvitationCode model and DB operations in server/src/models/invitation.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test registration + login + session restore + token refresh independently
5. Demo: User can register and log in

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Login/Register works (MVP!)
3. Add User Story 2 + User Story 3 (parallel) → Test each independently → Both modes work
4. Add User Story 4 → Test mode switching → Seamless transition
5. Add User Story 5 → Test AI interaction → Full Codex plugin integration
6. Add User Story 6 → Test admin dashboard → Operations ready
7. Polish → Full test coverage + edge cases

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (auth — blocks others but fastest)
3. After US1 complete:
   - Developer A: User Story 2 (dev mode)
   - Developer B: User Story 3 (simple mode)
   - Developer C: User Story 6 (admin backend — no client dependency)
4. After US2 + US3:
   - Developer A: User Story 4 (mode switch)
   - Developer B: User Story 5 (AI chat)
   - Developer C: Polish + E2E tests
5. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Per constitution: 每个公开方法至少 2 个测试用例，覆盖率 >= 80%，边界检查
- Per constitution: 使用 PascalCase/camelCase/UPPER_SNAKE_CASE 命名规范
- Per constitution: `any` 禁止使用，优先 `interface` 而非 `type`
- Codex 插件 / 本地能力桥接协议适配
- 后台服务器仅存计量+凭证，不存对话内容
