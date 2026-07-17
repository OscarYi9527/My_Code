# Codex Agent Host 与本地 Proxy 集成进度

**更新日期**：2026-07-12

**当前阶段**：阶段 D 的 D01-D04 代码完成；实际 Windows 环境 Proxy 状态 IPC 已通过

**当前目标平台**：Windows；macOS 安装与 LaunchAgent 后续实现

## 1. 目标链路

```text
AI Editor
→ agent-host-codex
→ CodexAgent
→ codex app-server
→ local_multi_proxy
→ http://127.0.0.1:47892/v1
```

正式链路只允许使用 Codex Agent Host，不使用 Copilot 或 Claude Provider。

## 2. 已确认的产品决策

- Proxy 随 Code 安装包分发，Code 启动时自动检查并在必要时后台启动 Proxy。
- AI 对话默认运行在 Code 主窗口的 Chat Editor 中，不为普通用户打开独立 Agents Window。
- 独立 Agents Window 的标题栏、命令面板、会话转移和聊天提示入口不在产品 UI 中注册。
- 普通“新建 Chat Editor”默认创建 `agent-host-codex` 会话。
- External Proxy 模式不要求 Code 用户登录 ChatGPT 或 Copilot；上游凭据由 Proxy 管理。
- Code 退出时不关闭 Proxy，以便其他 Codex 客户端继续使用。
- 默认地址为 `http://127.0.0.1:47892`；高级设置仅允许 loopback 地址。
- 用户通过 `<Proxy>/admin` 配置凭据；任意一个上游可用即视为可用。
- 模型目录来自 `/v1/models`，请求中的 `body.model` 是最终模型事实来源。
- 工作区恢复最近使用的 Codex 会话；开发模式与简约模式共用同一 Thread。
- 保留 Codex Agent Host 原生多会话管理能力。
- 默认安全基线：工作区内可写，工作区外禁止写入，网络和高风险命令按需审批，破坏性操作必须确认。
- 统计和日志默认仅保存在本地；默认不记录提示词、文件内容、回复正文或终端输出。
- Proxy 中断后，只有明确未转发的请求可自动重试；已转发或状态不明的请求不得重放。
- 每个 Turn 使用独立工作区基线，不覆盖或错误归因对话前已有改动。

## 3. 本轮验收标准

- [x] Windows Code 启动时自动检测并启动本地 Proxy。
- [ ] 未配置上游时显示初始化提示并可打开 `/admin`。
- [ ] Codex Agent Host 只连接 `local_multi_proxy`。
- [ ] 模型列表来自 `/v1/models`，可选择模型并发送请求。
- [ ] AI 回复支持原生流式输出和工具调用。
- [ ] 开发模式与简约模式共用同一个 Codex Thread。
- [ ] Code 重启后恢复当前工作区最近使用的会话。
- [ ] Proxy 中断后按安全策略恢复。
- [x] TypeScript 类型检查通过。
- [x] 新增 Proxy 公共逻辑单元测试通过。
- [x] Windows 隔离 Electron UI 全链路验证通过。

## 4. 实施任务

### 阶段 A：现状审计与接口设计

- [x] A01 审计 Codex Agent Host 当前 `vscode-proxy` 强制路由。
- [x] A02 审计 Provider 注册、新建会话和恢复会话路径。
- [x] A03 审计 Proxy `/health`、`/v1/models`、`/v1/responses` 和 `/admin`。
- [x] A04 定义 Code 侧 Proxy 配置、状态与生命周期接口。
- [x] A05 定义 Turn 基线和中断恢复数据模型。

### 阶段 B：Proxy 配置与生命周期

- [x] B01 新增 Proxy 地址高级设置，默认 `http://127.0.0.1:47892`。
- [x] B02 当前版本只允许 `localhost`、`127.0.0.1` 和 `[::1]`。
- [x] B03 实现 `/live`、`/ready` 健康检查和上游状态解析。
- [x] B04 实现 Windows 产品安装位置发现，并支持开发验证环境变量。
- [x] B05 实现 Windows 隐藏、分离的后台进程启动。
- [x] B06 实现运行监控、自动重启、指数退避和三次失败熔断。
- [x] B07 新增打开管理平台、重启 Proxy 和显示状态命令。
- [x] B08 新增未初始化提示和故障修复提示。

主要实现文件：

- `src/vs/platform/aiEditorProxy/common/aiEditorProxy.ts`
- `src/vs/platform/aiEditorProxy/electron-main/aiEditorProxyMainService.ts`
- `src/vs/platform/aiEditorProxy/electron-browser/aiEditorProxyService.ts`
- `src/vs/workbench/contrib/aiEditorProxy/electron-browser/aiEditorProxy.contribution.ts`
- `src/vs/platform/aiEditorProxy/test/common/aiEditorProxy.test.ts`
- `src/vs/code/electron-main/app.ts`
- `src/vs/workbench/workbench.desktop.main.ts`

### 阶段 C：Codex Agent Host 路由

- [x] C01 默认启用 Codex Agent Host Provider。
- [x] C02 将 `codex app-server` Provider 指向 `local_multi_proxy`。
- [x] C03 保留用户独立 `CODEX_HOME` 和原生会话存储。
- [x] C04 从 `/v1/models` 加载模型目录。
- [x] C05 复用原生模型选择恢复，并在模型不存在时回退到 Proxy 首个模型。
- [x] C06 Workbench 只展示 Codex Agent Host Provider。
- [x] C07 应用 workspace-write、禁止额外目录、关闭默认网络和按需审批策略。

### 阶段 D：会话与模式集成

- [x] D01 按工作区保存最近使用的 Codex 会话。
- [x] D02 Code 启动时优先恢复已打开或工作区保存的 Codex 会话。
- [x] D03 开发模式与简约模式复用同一 Chat Editor/Codex Thread。
- [x] D04 保留原生多会话管理入口。
- [x] D05 验证新建、切换、重命名、归档和删除。

### 阶段 E：中断恢复

- [x] E01 建立每 Turn 工作区基线。
- [x] E02 记录 Agent Host 工具调用和命令执行状态。
- [x] E03 记录 Proxy 请求的未转发、已转发和已完成状态。
- [x] E04 仅自动重试可确认未转发的请求。
- [x] E05 实现“检查状态并继续”恢复流程。
- [x] E06 验证预先存在的 Git 改动不会被错误归因或覆盖。
- [x] E07 验证非 Git 工作区文件基线。

### 阶段 F：验证与打包

- [x] F01 TypeScript typecheck。
- [x] F02 Agent Host/Proxy 服务单元测试。
- [x] F03 模型目录与路由集成测试。
- [x] F04 会话恢复和模式切换集成测试。
- [x] F05 Proxy 崩溃和重启恢复测试。
- [x] F06 Windows 隔离 Electron UI 验证。
- [x] F07 更新开发计划、测试文档和安装包资源清单。

## 5. 2026-07-12 阶段 B 执行记录

### 已完成

- 新增三个设置：
  - `aiEditor.proxy.baseUrl`
  - `aiEditor.proxy.autoStart`
  - `aiEditor.proxy.diagnostics.enabled`
- 新增 Proxy 生命周期状态、Provider 状态和 IPC 服务。
- 主进程读取设置并严格校验 loopback URL。
- `/live` 判断进程存活，`/ready` 解析 DeepSeek、OpenAI API、ChatGPT Subscription 和 Relay。
- 查找安装包内 `ai-editor-proxy/src/server.js`；开发验证可使用 `VSCODE_AI_EDITOR_PROXY_ROOT`。
- 使用 Electron 可执行文件的 Node 模式隐藏启动 Proxy，子进程 detached/unref，Code 退出不终止 Proxy。
- 15 秒监控；Proxy 停止时自动恢复；三次失败后熔断并等待用户重试。
- 新增命令：
  - `AI Editor: Open Proxy Admin`
  - `AI Editor: Restart Proxy`
  - `AI Editor: Show Proxy Status`
- 未配置上游时提示“Configure Proxy”；连续启动失败时暂停并显示修复操作。
- 修复 IPC 同步返回值错误：跨进程 `getStatus()` 改为异步。

### 验证结果

- `npm run typecheck-client`：通过。
- `npm run valid-layers-check`：通过。
- `npm run transpile-client`：通过。
- 定向执行 `aiEditorProxy.test.js`：3 项通过。
- `git diff --check`：通过。
- 当前 Proxy：
  - `/live` 返回 `status: ok`
  - `/health` 返回可用上游
  - 默认端口为 `47892`
- Windows 隔离 Code-OSS：
  - Workbench 成功启动。
  - 三个新增命令已在命令面板注册。
  - 运行时状态 IPC 未完成验证，因为本地 `node_modules/@vscode/sqlite3` 缺少
    `build/Release/vscode-sqlite3.node`，主进程发生与本次改动无关的重复异常。
- Node 全量测试启动后，本次新增的 3 项测试通过；全量结果为
  `11635 passing / 77 failing`，失败主要来自缺失 SQLite 原生模块，另有本机
  Kerberos 凭据环境失败。该全量结果不计为通过。

### 2026-07-12 状态命令修复

- 修复 `AI Editor: Show Proxy Status` 在 `await` 后再次访问
  `ServicesAccessor` 导致的 `Illegal state` 错误。
- 命令现在会在异步调用前取得 Proxy 与通知服务，异步完成后仅使用已取得的服务实例。

### 2026-07-12 内嵌 Codex 对话入口

- 移除独立 Agents Window 的标题栏按钮、命令面板命令、会话转移入口和 handoff 提示。
- 移除 Agents Window 与 Copilot CLI 的聊天推广提示。
- `chat.editor.defaultProvider` 新增并默认使用 `codex`。
- 默认隐藏本地 Chat Harness 和 Extension Host Copilot CLI。
- 普通新建 Chat Editor 在 Provider 尚未完成注册时也会创建
  `agent-host-codex:/untitled-<uuid>`。
- 保留底层 Agent Host 多会话和 Agents Window 实现，但普通产品 UI 不暴露独立窗口入口。
- External 模式不声明 Copilot 受保护资源、不显示 Copilot 登录要求，也不执行
  Codex `account/login/start`；上游鉴权由 Proxy 完成。
- 定向测试：22 项通过。
- 用户实际 Windows 环境确认：
  `AI Proxy status: Ready. Address: http://127.0.0.1:47892. Restart attempts: 0.`

## 6. 当前执行位置

```text
需求确认：已完成
阶段 A：已完成
阶段 B：代码完成，基础静态验证和单元测试通过
阶段 C：代码完成，External Proxy 路由与模型目录已接入
阶段 D：D01-D04 代码完成，D05 等待 Electron 全链路验证
Windows 运行验证：实际环境状态 IPC 通过；隔离测试环境仍缺 SQLite 原生依赖
下一任务：重启最新构建，验证内嵌 Codex 模型选择、发送消息和会话恢复
```

## 6.1 2026-07-13 First-open Codex model verification

- Correction after testing with the user's persistent development profile:
  waiting only for the chat-session contribution was insufficient. Agent Host
  first advertised Codex with `models: []`, then published
  `deepseek-v4-pro` shortly afterwards. The AI Editor now waits for both the
  contribution and a non-empty Codex model catalog before opening the editor.
- Development mode now hides the auxiliary general-purpose Chat surface. The
  product conversation remains in the center Codex Chat Editor so users cannot
  mistake the global Chat model picker for the Proxy-scoped picker.
- Fixed the `AfterRestored` startup race by waiting until the
  `agent-host-codex` chat-session contribution is registered before opening
  the embedded editor.
- New untitled Codex editor resources are now bound to the current workspace
  folder before provisional Agent Host session creation.
- The Codex first-open welcome copy now describes the configured AI Proxy
  instead of the generic delegation flow.
- Windows isolated-workspace verification passed before sending any message:
  - embedded Codex Chat Editor opened without an editor-resolution error;
  - the model control was visible immediately;
  - the model menu contained only `DeepSeek V4 Pro`;
  - logs contained no `Codex requires a working directory` or
    `Unable to resolve resource agent-host-codex` error.
- Validation passed:
  - `npm run typecheck-client`
  - `npm run compile`
  - `npm run valid-layers-check`
  - `git diff --check`
- The existing Proxy at `http://127.0.0.1:47892` was user-started and was
  neither stopped nor restarted during this work.

## 7. 更新规则

每完成一个任务：

1. 将对应任务更新为 `[x]`。
2. 更新“当前执行位置”。
3. 记录主要修改文件。
4. 记录执行过的测试及结果。
5. 需求或架构变化时同步更新产品决策。

## 8. 2026-07-13 模型目录刷新与对话无回复诊断

### 已完成

- Codex Agent Host 新增统一 `refreshModels(provider)` 调用链：
  - Workbench 本地 MessagePort；
  - AgentService Provider 路由；
  - 远程 Agent Host 扩展 RPC；
  - Codex Provider 的 `/v1/models` 刷新。
- Codex 模型刷新会合并并发请求，不会重启或停止共享 Proxy。
- Code 启动恢复已有 Codex Editor、打开 Codex Editor、重新激活 Codex Editor 时会刷新模型目录。
- Codex AI 窗口标题栏新增“刷新模型目录”按钮，仅在 `agent-host-codex` 会话可见。
- 手动刷新成功后显示模型数量，失败时提示检查 AI Proxy。
- 外部模型刷新失败时保留上一次成功目录，避免瞬时网络故障清空模型选择器。

### 对话无回复根因与修复

- Windows 日志确认消息已进入 Agent Host：
  - `chat/turnStarted` 已产生；
  - 选择模型为 `gpt-5.6-sol`；
  - 请求目标为 `http://127.0.0.1:47892/v1/responses`。
- 当时两个 ChatGPT 账号都达到 10% 安全余量，Proxy 返回
  `503 account_pool_exhausted` 和 `Retry-After`。
- Codex 将该状态视为可重试故障，持续重试约 90 分钟，最终才显示 502，因此用户看到长时间无回复。
- Proxy 现改为返回非重试型 `409 account_pool_exhausted`，并提示检查账号额度/冷却状态或选择其他模型。
- 保留安全余量策略，不静默消耗受保护额度，也不把 GPT 请求自动改投其他模型。

### 验证

- `npm run typecheck-client`：通过。
- `npm run compile`：通过。
- AgentService 定向测试：`99 passing / 17 pending`，新增模型刷新路由测试通过。
- Proxy 测试：`45 passing`，新增账号池安全余量快速失败测试通过。
- 当前共享 Proxy PID `25288` 未停止、未重启。
- Proxy 源码修复需要在用户确认后重启 Proxy 才会加载；当前运行进程仍提供服务。

### 运行时验证补充

- 用户确认后已重启共享 Proxy，PID 从 `25288` 更新为 `32564`。
- 重启后 `/health` 返回 `status: ok`，`/v1/models` 仍为管理页勾选的 13 个模型。
- 已启动最新编译的 Windows Code-OSS，使用原持久化测试配置
  `.tmp-codeoss-user-data`。
- AHP 日志确认启动/恢复期间发起了 2 次 `refreshModels`（并发请求由 Provider 合并）。
- 最新 `root/agentsChanged` 包含全部 13 个 Codex 模型。
- 待用户在 UI 中完成：
  - 点击“刷新模型目录”并确认成功通知；
  - 分别使用 DeepSeek 与 GPT 模型发送最小消息；
  - 验证流式回复和错误快速显示。

## 9. 2026-07-13 系统语言中文化与 AI 对话布局优化

### 已完成

- Code 默认跟随操作系统首选语言：
  - 用户在 `argv.json` 明确指定语言时继续优先使用该设置；
  - 未指定时优先使用操作系统区域语言，再回退到
    `app.getPreferredSystemLanguages()`；
  - 简体中文系统自动解析为 `zh-cn`，其他系统不强制切换为中文。
- 随产品内置简体中文语言包：
  - 资源位于 `extensions/vscode-language-pack-zh-hans`；
  - Windows 安装包首次启动即可生成中文 NLS 缓存；
  - 不依赖用户首次启动后再从扩展市场下载安装语言包。
- 开发环境在执行 `core-ci` 生成 NLS 元数据后也可验证内置语言包。
- AI 对话底部的长选项栏已收纳为：
  - `Codex` Provider 标识；
  - `工作区可写/只读 · 网络开启/关闭`安全摘要；
  - 单一“会话设置”按钮。
- “会话设置”弹层分为：
  - “执行、权限与连接”；
  - “模型与安全”。
- 原有 Agent Host Picker 未被替换，只是移动到弹层中，因此仍保留：
  - 会话状态实时同步；
  - 审批、沙箱、网络、模式、风格和推理摘要选择；
  - 远程连接等既有能力。
- 完全访问或网络开启时，安全摘要使用警告色保持可见。

### Windows 产品验证

- `npm run typecheck-client`：通过。
- `npm run transpile-client`：通过。
- `npm run compile`：通过，0 errors。
- `npm run core-ci`：通过，桌面包提取 `21176` 条 NLS 消息。
- Windows 产品目录已生成到：
  - `D:\AI_prejoct\VSCode-win32-x64`
- 产品版隔离实例验证：
  - `_VSCODE_NLS_LANGUAGE = zh-cn`；
  - 文件、编辑、查看、资源管理器、欢迎页等全局界面显示中文；
  - AI 底栏显示中文安全摘要和“会话设置”；
  - 分组弹层可以打开，ARIA 展开状态正确；
  - 浏览器控制台没有本次功能相关错误。
- 验证截图：
  - `D:\AI_prejoct\My_code\screenshots\code-zh-session-settings.png`

### 已知构建环境问题

- `vscode-win32-x64-min-ci` 已完成产品文件打包，但最后的
  `prepareBuiltInCopilotRipgrepShim` 步骤因当前工作区缺少
  `extensions/copilot/node_modules/@github/copilot/sdk` 而返回失败。
- 该问题与中文语言包和会话设置布局无关；失败前生成的 Windows
  产品目录可正常启动，并已用于上述中文 UI 验证。
- 本轮未停止或重启共享 AI Proxy。

### 重开仍显示英文的复测与修正

- 用户复测时启动的是源码开发版：
  - `D:\AI_prejoct\My_code\.build\electron\Code - OSS.exe`
- 现场语言状态：
  - Windows 系统区域设置：`zh-CN`；
  - 当前 UI Culture/首选显示语言：`en-US`；
  - `Intl.DateTimeFormat().resolvedOptions().locale`：`zh-CN`。
- 原实现读取首选显示语言，因此选择了英文。
- 已改为优先读取系统区域语言，符合用户当前 Windows 设置；用户显式
  设置的 `argv.json.locale` 仍拥有最高优先级。

## 10. 2026-07-13 Windows 成品 Codex Agent Host 修复与验证

### 根因

- Windows 成品没有打包 `@openai/codex` 与 `@openai/codex-win32-x64`。
- 正式发布流水线才会写入 `product.agentSdks.codex`；本地生成的成品因此跳过 Codex Provider 注册。
- Agent Host 日志当时只有 `Registering agent provider: copilotcli`，导致恢复
  `agent-host-codex:` Chat Editor 时显示 `Failed to get model for chat editor`。

### 修复

- Windows/macOS 产品打包现在包含平台对应的 `@openai/codex` SDK 与原生运行时。
- Codex 原生二进制加入 ASAR 解包规则，确保成品中可以直接执行。
- 在没有内置 Copilot 扩展的 Codex-only 产品中跳过 Copilot ripgrep shim 准备步骤。
- 成品运行时只要能够解析随包 Codex SDK，即注册 Codex Provider，不再依赖发布流水线写入的
  `product.agentSdks.codex`。

### Windows 成品验证

- `npm run typecheck-client`：通过。
- `npm --prefix build run typecheck`：通过。
- `npm run core-ci`：通过。
- `vscode-win32-x64-min-ci`：产品目录生成完成；仅最终签名步骤因本机缺少
  `signtool.exe` 返回 `ENOENT`，不影响本地未签名成品验证。
- 成品包含：
  - `resources/app/node_modules/@openai/codex/package.json`
  - `resources/app/node_modules/@openai/codex-win32-x64/.../bin/codex.exe`
- 成品 Agent Host 日志确认：
  - `Registering agent provider: codex`
  - `[Codex] resolving SDK from bundled node_modules`
  - `accountType=none requiresOpenaiAuth=false`
  - 已恢复会话 `codex:/a455be23-ac69-47b2-9db5-1550112e71a6`，共 10 个 turns。
- 自动化 UI 验证确认：
  - 原有 `hi` Codex Chat Editor 成功恢复并打开，不再显示模型解析错误。
  - 全局界面保持简体中文。
  - 模型选择器显示 Proxy 模型，包括 `DeepSeek V4 Pro` 和
    `GPT-5.6 Sol (Subscription)`。
  - 使用 `GPT-5.6 Sol (Subscription)` 发送 `Reply only: OK`，收到回复 `OK`。
- 本轮未停止或重启共享 Proxy；仍使用 `http://127.0.0.1:47892`。

## 11. 2026-07-13 会话设置窄布局修复

### 根因

- `chat-secondary-toolbar` 使用容器查询，在宽度不超过 400px 时隐藏
  `.agent-host-chat-input-picker-label`。
- 会话设置弹层位于同一响应式容器中，因此 AI 编辑区较窄时，弹层里的设置值也被隐藏。
- 没有图标的通用设置项最终只剩分隔线，表现为“模型与安全”区域空白。

### 修复

- 弹层内的 Picker 标签不再受窄工具栏的图标化规则影响。
- 每个会话配置项在弹层内显示“设置名称：当前值”，例如：
  - `智能体模式：交互式`
  - `审批：需要时询问`
  - `沙盒：工作区写入`
  - `个人设置：默认`
  - `推理摘要：自动`
  - `网络：关`
- 远程会话访问按钮在空间足够时显示文字状态。
- 通用设置容器使用 100% 弹层宽度并允许换行，不再产生横向滚动。

### 验证

- `npm run typecheck-client`：通过。
- `npm run core-ci`：通过。
- Windows 成品 Workbench 已更新，并同步更新 JS/CSS 完整性校验值。
- 860px 窗口、224px 弹层验证：
  - 6 个可用配置项标签全部可见；
  - 弹层 `clientWidth=222`、`scrollWidth=222`，无横向溢出；
  - 通用配置自动换行为多行。
- 1200px 窗口、394px 弹层验证：
  - 所有配置项和远程会话访问状态均正常显示；
  - 弹层无横向滚动；
  - 未出现“安装似乎损坏”完整性警告。
- 验证截图：
  - `D:\AI_prejoct\My_code\screenshots\session-settings-after-fix.png`
  - `D:\AI_prejoct\My_code\screenshots\session-settings-after-fix-wide.png`
- 本轮未停止或重启共享 Proxy。

### 开发版输出同步验证

- `scripts\code.bat` 使用源码开发输出 `out`，不读取 Windows 成品的
  `out-vscode-min`。
- 执行 `npm run compile` 后，开发版已包含相同的会话设置布局修复。
- 使用 `.tmp-codeoss-user-data`、`.tmp-codeoss-extensions` 启动开发版验证：
  - 394px 弹层内 6 个会话配置项全部显示；
  - 显示 `Agent Mode: Interactive`、`Approvals: Ask When Needed`、
    `Sandbox: Workspace Write`、`Personality: Default`、
    `Reasoning Summary: Auto`、`Network: Off`；
  - 远程会话访问标签正常显示；
  - 弹层 `clientWidth=392`、`scrollWidth=392`，无横向溢出。
- 开发版未经过产品 NLS 索引转换，因此 `scripts\code.bat` 下这些新增界面文案使用
  英文回退；正式成品仍显示简体中文。
- 验证截图：
  `D:\AI_prejoct\My_code\screenshots\session-settings-dev-after-compile.png`

## 12. 2026-07-13 跨窗口持久开发准则

- 仓库级 `AGENTS.md` 已加入强制规则，新 Codex 窗口、上下文丢失和任务交接时均适用。
- 后续每项 AI Editor UI 或运行时修改必须同步并验证：
  - 开发版：`npm run compile` → `out` → `scripts\code.bat`；
  - Windows 成品：`npm run core-ci` → `out-vscode-min` →
    `D:\AI_prejoct\VSCode-win32-x64`，并保持产品完整性校验有效。
- 只验证其中一个版本不得标记任务完成。
- 新增统一 Proxy 安全重启脚本：
  `D:\AI_prejoct\My_code\scripts\restart-ai-proxy.ps1`。
- Proxy 重启仍需用户明确确认；确认后只能调用该脚本。
- 禁止直接使用 `Stop-Process`、`taskkill`、单独的停止脚本或
  `POST /admin/api/proxy/restart` 重启共享 Proxy。
- 安全脚本会先创建独立隐藏 Worker，再执行停止和启动，验证 `/live`，
  失败时额外尝试恢复启动，避免发起重启的 AI 会话中断后 Proxy 永久离线。

## 13. 2026-07-13 历史对话入口与 External Proxy 会话目录修复

### 根因

- 原生 `workbench.action.chat.history` 已注册到 Chat Editor 标题菜单，但没有加入
  `navigation` 分组，因此只出现在“更多操作”中；移除独立 Agents Window 后没有明显的
  历史会话入口。
- 全新用户配置首次显示欢迎引导时，通用 Chat 可用上下文可能尚未建立；即使 Codex
  Chat Editor 和 Proxy 模型已经可用，原生前置条件仍可能暂时隐藏历史按钮。
- `AgentSessionsPicker` 在首次实例化会话服务时立即读取列表，没有等待异步 Provider
  目录解析完成，首次打开可能只显示缓存会话或空列表。
- Codex `listSessions()` 仍要求旧架构的 GitHub Token。External Proxy 模式不要求
  ChatGPT/Copilot 登录，因此该判断直接返回空数组，导致工作台只能看到当前缓存会话，
  无法读取 `~/.codex` 中属于当前工作区的原生 Codex 历史。
- 原生会话打开器默认把可解析的历史会话放到 Chat View；这与本产品要求的中央
  Chat Editor 布局不一致。

### 修复

- Chat Editor 标题栏现在直接显示历史时钟按钮，排列在“新建聊天”之前。
- 历史命令在已启用 Chat 或当前活动编辑器为 Chat Editor 时均可用，避免首启必须先
  发送一次消息才能看到入口。
- 打开历史选择器前先等待目标 Provider 会话目录解析完成。
- 从 Codex Chat Editor 打开历史时只列出 `agent-host-codex` 会话，不混入其他
  Provider。
- External Proxy 模式允许在无 GitHub Token 时调用 Codex `thread/list`；内部
  Copilot 路由仍保留原鉴权要求。
- 从 Chat Editor 选择历史会话时强制在中央编辑器区域打开，不再显示右侧 Chat
  View 或独立 Agents Window。
- 内置简体中文语言包将入口和搜索提示更新为“历史对话...”与“按名称搜索历史对话”。

### 验证

- `npm run typecheck-client`：通过。
- `scripts\test.bat --grep "AgentSessionsPicker"`：1 项通过。
- `npm run compile`：通过，开发版 `out` 已同步。
- 开发版 `.tmp-codeoss-user-data` Electron 验证：
  - 标题栏历史按钮直接可见；
  - External Proxy 无登录状态下从 1 条工作台缓存恢复为 8 条当前工作区 Codex
    历史；
  - 列表只显示 Codex，并提供原生重命名、归档按钮；
  - 选择“解释400和404错误”后，中央编辑器标签和窗口标题同步切换；
  - `auxiliaryBarWidth=0`，未打开右侧 Chat View。
- 开发版全新用户配置验证：关闭首次欢迎引导并激活 Codex Chat Editor 后，历史按钮和
  “New Chat Editor”均在首次发送消息前直接可见。
- `npm run core-ci`：通过，`out-vscode-min` 已同步。
- `vscode-win32-x64-min-ci`：首次运行因 Windows SDK 的 `signtool.exe` 未加入
  PATH 返回 `ENOENT`；加入已安装的 x64 SDK 工具目录后重新运行，完整任务通过。
- Windows 成品 `D:\AI_prejoct\VSCode-win32-x64` 验证：
  - 10 项 `product.json` SHA-256 完整性校验全部匹配；
  - 中文界面正常，标题栏历史按钮可见；
  - 历史选择器列出 10 条当前工作区 Codex 会话；
  - 选择“读取 HANDOFF 继续处理”后在中央编辑器打开；
  - `auxiliaryBarWidth=0`，浏览器控制台 0 errors。
- Windows 成品全新用户配置验证：
  - 首次打开并激活 Codex Chat Editor 后直接显示“历史对话...”；
  - 搜索框显示“按名称搜索历史对话”，无需先发送消息；
  - 无 ChatGPT/Copilot 登录状态时列出 10 条当前工作区 Codex 会话；
  - 选择历史会话仍在中央编辑器打开，`auxiliaryBarWidth=0`。
- 对最终一次成功打包后的精确成品再次使用全新用户配置验证：
  - “历史对话...”首启可见；
  - “按名称搜索历史对话”返回 10 个结果；
  - 浏览器控制台 0 errors。
- 验证截图：
  - `D:\AI_prejoct\My_code\screenshots\history-conversations-dev.png`
  - `D:\AI_prejoct\My_code\screenshots\history-conversations-product-zh.png`
- D05 中“新建、切换”的运行验证已完成；为避免改变用户现有历史，本轮未实际执行
  重命名、归档和删除，相关原生按钮及命令路径保持不变，D05 暂不标记完成。
- 本轮未停止或重启共享 Proxy；结束时
  `http://127.0.0.1:47892/live` 状态仍为 `ok`。

## 14. 2026-07-13 Codex 当前文件夹任务面板

### 用户目标

- 在中央 Codex AI 窗口内显示当前文件夹执行过的任务。
- 用户选择任务后进入该任务的历史上下文。
- 每条任务末尾显示任务创建时间。

### 实现

- `workbench.action.chat.history` 在活动编辑器为 `agent-host-codex` 时，不再打开窗口外的
  Quick Pick，而是在当前中央 Chat Editor 内切换“当前文件夹任务”面板。
- 面板复用 Agent Host 原生会话目录，不新增历史存储：
  - 只显示 `agent-host-codex`；
  - 会话目录继续由 `AgentHostSessionListStore` 按当前工作区文件夹过滤；
  - 按创建时间分组和排序；
  - 打开时提供列表内搜索；
  - 选择任务后在中央编辑器打开对应上下文并自动关闭面板。
- 任务时间强制使用 `timing.created`，运行中任务也不会改为显示执行时长。
- 相对创建时间显示在任务行右侧；悬停标题显示精确本地创建时间。
- 新增简体中文文案：
  - `当前文件夹任务`
  - `关闭任务列表`
  - `创建时间：{0}`

### 主要文件

- `src/vs/workbench/contrib/chat/browser/widgetHosts/editor/chatEditor.ts`
- `src/vs/workbench/contrib/chat/browser/widgetHosts/editor/media/chatEditor.css`
- `src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsActions.ts`
- `src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsControl.ts`
- `src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsViewer.ts`
- `extensions/vscode-language-pack-zh-hans/translations/main.i18n.json`

### 验证

- `npm run typecheck-client`：通过。
- `scripts\test.bat --grep "AgentSessionsPicker"`：1 项通过。
- `npm run valid-layers-check`：通过。
- `npm run compile`：通过，开发版 `out` 已同步。
- 开发版真实 UI：
  - 当前工作区共识别 10 个 Codex 任务；
  - 面板内只显示 Codex 任务及创建时间；
  - 选择“读取 HANDOFF 继续处理”后进入对应历史上下文；
  - 面板自动关闭，`auxiliaryBarWidth=0`。
- `npm run core-ci`：通过。
- `vscode-win32-x64-min-ci`：通过。
- Windows 成品目录：`D:\AI_prejoct\VSCode-win32-x64`。
- 成品 `product.json` 中 10 项 SHA-256 完整性校验：10/10 匹配。
- Windows 成品真实 UI：
  - 面板标题显示“当前文件夹任务”；
  - 创建时间位于任务行右侧，并显示中文相对时间；
  - 精确时间提示示例为“创建时间：2026/7/13 18:50:43”；
  - 选择“Reply only: OK”后成功进入对应上下文；
  - 面板自动关闭，右侧 Chat View 未打开；
  - 浏览器控制台 0 errors。
- 截图：
  - `D:\AI_prejoct\My_code\screenshots\workspace-task-history-dev.png`
  - `D:\AI_prejoct\My_code\screenshots\workspace-task-history-product-zh.png`
- 本轮未停止或重启共享 Proxy；最终 `/live` 返回 `status: ok`。

## 15. 2026-07-14 D05 Codex 多会话生命周期完成

### 实现

- Codex 重命名会同步调用 `thread/name/set`，并继续保存本地标题。
- 归档和恢复会同步调用 `thread/archive` / `thread/unarchive`；首次操作历史会话前，会临时订阅该会话，保证操作通道已恢复。
- 删除使用 Codex 的归档能力，并将真实 `threadId` 写入不对用户暴露的
  `codex.deletedThreadIds` 墓碑；因此删除后的任务不会在刷新或冷启动时重新出现。
- 历史目录同时读取 active 和 archived 的 `thread/list` 结果，并包含 `appServer` 等 Codex Agent Host 创建来源。

### 运行验证

- 开发版实际创建并收到 `OK.` 回复的测试会话。
- 实际归档后，Agent Host 请求日志、Codex SQLite 均确认该会话已归档。
- 冷启动后，Agent Host 返回已归档会话；会话列表在滚动至底部后显示 **Archived** 分组及 2 条会话（此前未滚动的虚拟列表造成“未显示”的误判）。
- 删除、墓碑加载、重命名和归档同步路径的定向测试通过：`9 passing`。

### 构建与成品验证

- 开发版：`npm run typecheck-client`、`npm run compile` 通过；`scripts\test.bat` 定向测试 `9 passing`。
- Windows 成品：`npm run core-ci` 与 `npm run gulp vscode-win32-x64-min-ci` 通过。
- `D:\AI_prejoct\VSCode-win32-x64\resources\app\product.json` 的 10 项 SHA-256（Base64 无填充格式）校验全部匹配。
- 已启动 `D:\AI_prejoct\VSCode-win32-x64\Code - OSS.exe` 验证：简体中文界面、Codex Chat Editor、Proxy 模型选择、历史对话入口和“当前文件夹任务”面板均正常。
- 本轮没有停止或重启共享 Proxy。

## 16. 2026-07-14 E01 Codex Turn 工作区基线

### 实现

- Codex session 在成功 materialize 并取得工作区目录后，立即调用
  `IAgentHostCheckpointService.captureBaseline(...)`。
- 基线使用现有的私有 Git checkpoint ref；它记录 AI 首次执行前的完整工作树，
  因此对话开始前已有的 Git 改动不会被归因到 AI。
- 后续的 `AgentSideEffects` 保持在每个 Turn 结束时捕获增量 checkpoint；
  E01 现已覆盖 Codex Agent Host，而不仅是原有 Copilot 路径。
- 基线捕获为 best-effort：非 Git 文件夹或 Git 检查点异常只写日志，不会中断
  Codex 会话。

### 验证

- `npm run typecheck-client`：通过。
- `scripts\test.bat --grep "codexSessionConfigKeys"`：`2 passing`。
  测试启动时存在已有 `.build\electron` 占用警告，但定向测试结果为通过。
- `npm run compile`：通过，开发版 `out` 已同步。
- `npm run core-ci`：通过，成品 `out-vscode-min` 已同步。
- `npm run gulp vscode-win32-x64-min-ci`：通过（将 Windows SDK x64
  `signtool.exe` 临时加入 PATH 后完成）。
- 开发版和 Windows 成品均使用隔离用户目录成功启动；Windows 成品
  `product.json` 的 10/10 SHA-256 校验值匹配。
- 共享 Proxy 未重启；结束时 `/live` 返回 `status: ok`。

## 17. 2026-07-14 E02 工具与终端命令执行状态完成

### 已完成

- `AgentSideEffects` 已开始在本地会话数据库的
  `turn.executionRecords` 中记录工具调用状态：
  - `started`：工具已开始；
  - `running`：输入已确认并开始执行；
  - `completed` / `failed`：工具已结束。
- 记录内容包含 Turn、工具调用 ID、工具名称、显示名称、时间和最多 4096
  字符的工具输入（例如终端命令）。
- 不记录终端输出、AI 完整回复或项目文件内容，避免扩大本地状态的敏感数据范围。
- 记录按会话串行写入，防止同一 Turn 的并发工具完成时相互覆盖。

### 验证

- `npm run typecheck-client`：通过。
- `scripts\test.bat --grep "AgentSideEffects"`：`101 passing`。
- `npm run compile`：通过，开发版 `out` 已同步。
- `npm run core-ci`：通过，`out-vscode-min` 已同步。
- Windows 成品：
  - 用户关闭正在使用的成品窗口后，`npm run gulp vscode-win32-x64-min-ci` 通过；
  - 隔离用户目录启动 `Code - OSS.exe` 通过；
  - `product.json` 的 10/10 SHA-256 校验值匹配。
- 共享 Proxy 未停止或重启；结束时 `/live` 返回 `status: ok`。

## 18. 2026-07-14 E03 Proxy 请求状态完成

- Codex `turn/start` 通过原生 `responsesapiClientMetadata` 发送不含用户内容的
  `vscode_session_id` 与 `vscode_turn_id`。
- Proxy 使用这些匿名标识记录 `received`、`forwarded`、`completed` 和 `failed`，
  并提供本机 `/control/code-turns/<session>/<turn>` 查询接口。
- 已获用户明确批准后，使用 `scripts\restart-ai-proxy.ps1` 安全重启共享 Proxy；
  `/live` 恢复为 `status: ok`。
- Proxy 语法检查通过；其既有完整测试为 `58 passing / 2 failing`，失败项是账号
  额度粘性与缓存刷新测试，与本次请求状态改动无关。
- Code 侧 `typecheck-client`、`compile`、`core-ci` 和 Windows 成品打包均通过。

## 19. 2026-07-14 E04 安全自动重试

- Codex `turn/start` 发生异常时会查询本机 Proxy 的 Turn 状态。
- 仅当查询请求成功且 Proxy 返回 `state: null`（确认未收到该 Turn）时，使用相同
  Turn 标识自动重试一次。
- Proxy 已收到、已转发、已完成、已失败、状态格式错误或查询失败时均不重试，
  从而避免重复运行 AI 工具、终端命令或文件修改。
- `typecheck-client`、定向测试、`compile`、`core-ci` 和 Windows 成品打包通过。

## 20. 2026-07-14 GitHub Actions 依赖安装修复

### 根因

- GitHub Actions 的 `npm ci` 在安装依赖前失败，提示锁文件缺少
  `cpu-features`。
- 根目录 `package.json` 曾用 `ssh2.cpu-features: "0.0.0"` 覆盖一个不存在的
  npm 版本；该覆盖使锁文件省略了 `ssh2` 的可选依赖，但 npm 11 的 `npm ci`
  仍要求锁文件完整记录该依赖。

### 修复与验证

- 移除了无效的 `cpu-features: "0.0.0"` 覆盖。
- 锁文件补充了 `cpu-features@0.0.10` 及其可选依赖 `buildcheck@0.0.7`。
- 在隔离目录中使用与 GitHub Actions Node 24.15 对应的 npm 11.5.1 执行
  `npm ci --ignore-scripts`，安装成功；`npm ls cpu-features` 确认
  `ssh2@1.17.0 -> cpu-features@0.0.10`。
- 本次仅修改 CI 依赖清单，不涉及 AI Editor UI 或运行时逻辑，因此无需重新构建
  开发版和 Windows 产品版。

### 后续 CI 检查

- 修复提交触发的 Component Fixtures 已越过全部三次 `npm ci` 安装步骤，确认
  原锁文件问题已解决。
- 随后发现独立的 Linux 权限问题：缓存工作流直接执行
  `.github/workflows/node_modules_cache/cache.sh`，但该脚本在 Git 中为 `100644`，
  导致 `Permission denied`。已将其 Git 文件模式改为可执行的 `100755`；
  缓存归档恢复正常后，后续截图步骤即可生成其 manifest。
- Monaco 检查进一步确认根目录安装已通过，但根目录的 postinstall 会在 `remote`
  子项目再次执行 `npm ci`；其 `package.json` 也有同一个无效覆盖。已同步修复
  `remote/package.json` 与 `remote/package-lock.json`，并以 npm 11.5.1 的隔离
  `npm ci --ignore-scripts` 验证 `ssh2@1.17.0 -> cpu-features@0.0.10`。

## 21. 2026-07-14 E05 “检查状态并继续”恢复流程

### 实现

- Codex Turn 因 app-server 断连、thread/materialize/resume 失败、`turn/start`
  失败或 Codex 明确返回 failed 时，会在本地会话数据库记录需恢复的 Turn ID、失败
  原因和时间；不会记录用户提示词、终端输出或文件内容。
- 失败 Turn 的 AI 对话错误卡片提供“检查状态并继续”按钮；历史对话重新打开后也会
  还原该按钮。
- 点击按钮会创建一个新的 Turn，而不是重放失败 Turn。该新 Turn 使用不会受界面
  语言影响的内部确认标识，并向 Codex 提供：
  - 失败 Turn 的 Proxy 转发状态（未记录、已接收、已转发、已完成或不可用）；
  - 同一 Turn 的工具名称和最终/当前执行状态，不含工具输入和输出；
  - 强制恢复规则：先检查当前工作区，Git 工作区先检查 `git status --short` 与
    聚焦 `git diff`；不回滚文件，也不重放 started/running 或状态不明的命令/工具。
- 恢复元数据在被消费后清除；若新的恢复 Turn 再次失败，将记录新的 Turn，避免旧状态
  被错误复用。

### 验证

- `npm run typecheck-client`：通过。
- `npm run compile`：通过，开发版 `out` 已同步。
- `scripts\test.bat --grep "Codex recovery errors restore"`：`1 passing`，
  验证失败历史会话会恢复“检查状态并继续”按钮。
- 开发版：隔离用户目录通过 `scripts\code.bat` 启动，进程存活检查通过。
- Windows 产品版：`npm run core-ci` 与 `npm run gulp vscode-win32-x64-min-ci`
  通过；`D:\AI_prejoct\VSCode-win32-x64\Code - OSS.exe` 使用隔离用户目录启动
  检查通过；`product.json` 10/10 SHA-256 校验匹配。
- 本轮未停止或重启共享 Proxy；结束时 `/live` 返回 `status: ok`。

## 22. 2026-07-14 GitHub Actions 后续基线修复

- npm 安装和缓存脚本修复后的 CI 已实际进入 Monaco 浏览器测试与 Component
  Fixtures 截图阶段，确认此前依赖/权限故障已排除。
- Monaco 测试页只设置了 `window.instance`，但测试脚本使用了未定义的裸
  `instance` 标识符；已改为显式访问 `window.instance`。CI 随后暴露编辑器
  实例的异步初始化竞态，测试现已在每次加载页面后等待 `window.instance` 就绪。
- Component Fixtures 的两张 Inline Chat Zone Widget 截图哈希因既有 AI Editor
  UI 改动而变化；已按 CI 生成的标准 manifest 更新
  `blocks-ci-screenshots.md` 基线。
- 本机 Monaco 测试 TypeScript 编译通过；完整浏览器测试受本机未安装 Playwright
  Chromium 限制未执行，GitHub Actions 运行器具备该浏览器并会执行完整验证。

## 23. 2026-07-15 E06 对话前已有 Git 改动的基线归因验证

### 验证内容

- 新增真实 Git 仓库定向测试，分别准备 AI 对话开始前已经存在的：
  - 已暂存修改；
  - 未暂存修改；
  - 未跟踪文件。
- 创建 Turn 0 基线时断言 `git status --porcelain` 完全不变，确保基线捕获不会
  暂存、取消暂存、覆盖或丢弃用户已有改动。
- 随后模拟第一轮 AI 修改一个已有文件并新建一个文件，断言：
  - Turn 1 的 checkpoint 父引用是 Turn 0 基线；
  - Turn 0 到 Turn 1 的差异只包含 AI 后续修改的两个文件；
  - 对话前已存在的已暂存文件、未跟踪文件和原有未暂存修改不会被归因给 AI。

### 验证结果

- `npm run typecheck-client`：通过。
- `npm run compile`：通过，开发版 `out` 已同步。
- `scripts\test.bat --run src/vs/platform/agentHost/test/node/agentHostGitService.integrationTest.ts --grep "keeps pre-existing staged"`：
  `1 passing`。
- 本轮仅新增测试与测试辅助能力，没有修改产品运行时代码或 UI；Windows 成品的
  E05 验证与 `product.json` 10/10 checksum 校验继续有效，无需重新替换正在运行的
  用户成品窗口。
- 共享 Proxy 未停止或重启；验证后 `/live` 仍返回 `status: ok`。

## 24. 2026-07-15 E07 非 Git 工作区安全退化验证

### 验证内容与结果

- 新增非 Git 临时工作区定向测试，工作区只包含已有用户文件。
- 断言基线和 Turn checkpoint 都返回 `undefined`，不会伪造 Git checkpoint 或
  产生 Git 归因结果。
- 断言用户文件内容保持不变，确保非 Git 回退路径不会覆盖、删除或修改工作区文件。
- `npm run typecheck-client`：通过。
- `npm run compile`：通过，开发版 `out` 已同步。
- `scripts\test.bat --run src/vs/platform/agentHost/test/node/agentHostGitService.integrationTest.ts --grep "AgentHostCheckpointService - existing Git changes"`：
  `2 passing`（包含 E06 与 E07）。
- 本轮继续仅新增测试与测试辅助能力，未修改产品运行时代码或 UI；无需替换正在运行的
  Windows 成品窗口。共享 Proxy 未停止或重启。

## 25. 2026-07-15 F02 Agent Host / Proxy 服务定向测试

### 修复与验证

- 组合执行 Agent Host 服务测试时发现：工具确认测试仍使用一个会抛出
  `not implemented` 的空会话数据服务；E02 的工具执行状态记录会在该路径写入
  会话数据库，造成测试结束阶段出现未处理错误。
- 已将该测试夹具替换为内存 `TestSessionDatabase` 服务，保持生产运行时代码不变，
  并使工具确认和执行状态记录使用同一条可验证的持久化契约。
- `npm run typecheck-client`：通过。
- `npm run gulp compile`：通过，开发版 `out` 已同步。
- 定向服务测试：
  - AI Editor Proxy URL 与上游状态解析；
  - Codex Proxy 转发；
  - Codex app-server JSON-RPC 客户端；
  - Codex app-server 事件映射；
  - AgentSideEffects（含 E02 工具执行记录）；
  - E05 恢复操作历史映射。
- 合并定向测试结果：`212 passing`。
- 本轮只修改测试夹具，未修改产品运行时代码或 UI；无需替换正在运行的 Windows
  成品窗口。共享 Proxy 未停止或重启。

## 26. 2026-07-15 F03 模型目录与路由集成验证

### 验证结果

- 直接读取共享 Proxy 的 `GET /v1/models`，当前返回 **20 个**可选模型；数量相较
  之前的 13 个发生变化，证明目录来自 Proxy 当前管理配置而非 Code 内置静态列表。
- 同时覆盖并通过以下路由配置测试：
  - `buildAgentSdkEnv` 仅设置产品指定的 `external-local-proxy` 与
    `http://127.0.0.1:47892`；
  - `usesExternalCodexProxy` 仅接受显式产品模式，拒绝内部 Copilot 路径；
  - Codex session 配置范围与 app-server 路由契约。
- 定向测试结果：`44 passing`。
- 共享 Proxy `/live` 正常；本轮没有重启或停止 Proxy，也未修改产品运行时代码或 UI。

## 27. 2026-07-15 F04 会话恢复与模式切换集成验证

### 验证内容与结果

- 新增 `AiEditorModeLayoutContribution` 定向测试，确认：
  - 开发模式/简约模式切换重置编辑器组后，继续复用同一个 Codex session URI；
  - 当前工作区没有打开会话时，恢复该工作区保存的最后一个 Codex session；
  - 损坏、非 Codex 的工作区存储值会安全回退到新的 Codex 会话。
- 同时运行 Agent Host 会话恢复定向测试，验证历史消息、工具调用、并发恢复合并及失败后
  重试恢复。
- `npm run typecheck-client` 与 `npm run compile`：通过。
- 合并定向测试结果：`10 passing`。
- 本轮生产行为没有变化；仅为既有会话复用逻辑提供可回归测试入口。Windows 成品仍沿用
  已完成 E05 验证的构建，Proxy 未停止或重启。

## 28. 2026-07-15 F05 Proxy 自动恢复安全加固

### 已完成

- 移除了 Code 内部对 `/admin/api/proxy/restart` 的调用。该端点会先终止共享 Proxy，
  却不能保证替代进程已启动，可能使全部 Codex 客户端离线。
- “重启/重试”动作现在先检查 Proxy：
  - 已健康时复用现有共享进程，不强制终止；
  - 未存活时才进入既有的三次、有退避的自动启动恢复流程。
- 进一步将内部健康请求固定为只读 `GET`，防止后续代码意外重新通过该服务调用管理
  端重启接口。
- 新增主进程定向测试，覆盖健康共享 Proxy 不被强制重启、失活 Proxy 才进入恢复两种
  情况；与公共 Proxy 配置测试合计 `6 passing`。
- `npm run typecheck-client`、`npm run compile`、`npm run core-ci`：通过。
- 共享 Proxy 全程未停止或重启，`/live` 保持正常。

### Windows 成品验证

- `npm run gulp vscode-win32-x64-min-ci`：通过，已更新
  `D:\AI_prejoct\VSCode-win32-x64`。
- `product.json` 的 10 项 SHA-256（Base64 无填充）校验全部匹配。
- 成品 `Code - OSS.exe` 使用隔离用户目录启动成功；验证后仅关闭该次由自动验证启动的
  Code 进程，Proxy 仍返回 `/live: status=ok`。

## 29. 2026-07-15 F06 Windows 隔离 Electron UI 验证

### 布局并发修复

- `AiEditorModeLayoutContribution` 对模式布局应用进行串行化，避免 Workbench 启动恢复
  编辑器与用户模式切换同时执行 `reset/openEditor`。
- 前一次布局操作失败不会阻断后续模式应用；启动或切换期间的瞬时错误不会留下半应用
  布局。
- 新增定向回归测试，模拟开发模式尚未完成时收到简约模式切换，断言两个布局严格按顺序
  完成。

### 构建和自动化验证

- `npm run typecheck-client`：通过。
- 定向模式测试：`4 passing`。
- `npm run compile`：通过，开发版 `out` 已同步。
- `npm run core-ci`：通过，Windows 成品 `out-vscode-min` 已同步。
- `npm run gulp vscode-win32-x64-min-ci`：通过；临时将 Windows SDK x64
  `signtool.exe` 加入 `PATH`。
- Windows 成品目录已更新到 `D:\AI_prejoct\VSCode-win32-x64`。

### Windows 成品 UI 结果

- 使用隔离用户/扩展目录和 CDP `9368` 启动成品。
- 全局 UI 为简体中文，Codex Chat Editor 位于 Code 主窗口。
- 模式按钮下拉同时显示“切换到开发模式”和“切换到简约模式”。
- 选择简约模式后显示“是否切换到简约模式？”，点击“确认”后才切换。
- 简约模式验证：
  - Activity Bar 隐藏；
  - Explorer/Side Bar 保留；
  - Panel 和 Auxiliary Bar 隐藏；
  - 同一个 Codex Chat Editor 恢复到主编辑器组；
  - 顶层菜单只剩 `File`，子菜单只剩 `Open Folder...`。
- Renderer Console 为 `0 errors / 0 warnings`，没有 editor disposal 或 pane activation
  布局并发错误。
- 验证结束只关闭 PID `44260` 的隔离 Code 实例；共享 Proxy `/live` 保持 `ok`。

## 30. 2026-07-15 F07 计划、测试和发布资源清单

- 重写 `DEVELOPMENT-PLAN.md`，将产品主线更新为
  `Code-OSS → Codex Agent Host → codex app-server → codex_proxy`，记录已完成阶段、
  当前发布资源阶段和 MVP 后反馈项。
- 重写 `TEST-PLAN.md`，移除旧 `electron-app` 登录原型测试，改为双构建、Proxy、
  模型、中文 IME、模式切换、会话恢复、权限和中断恢复的 MVP 测试计划。
- 新增 `docs/ai-editor-release-resource-manifest.md`，明确：
  - Workbench、中文语言包和 Codex 平台运行时资源；
  - 独立 `codex_proxy` 仓库的干净制品格式；
  - 必需/排除文件、用户数据边界、版本元数据及 Windows/macOS 验收。
- 资源审计确认当前 Windows 成品尚未包含
  `resources/app/ai-editor-proxy/src/server.js`。健康共享 Proxy 的复用已经验证，但无
  预装 Proxy 的干净用户首次启动仍是发布阻断项。
- 下一开发任务为 G01：从独立 `codex_proxy` 仓库生成、校验并嵌入不含配置和凭据的
  Proxy 运行时制品。

## 31. 2026-07-15 G01 Windows Proxy 运行时制品闭环

### 双仓库制品生成

- `codex_proxy` 新增 MIT `LICENSE`，并完成两个本地提交：
  - `06a4262`：账号级熔断、最终失败计数和脱敏网络根因日志；
  - `d8c9097`：运行时目录与可写用户数据目录分离，实例锁按端口隔离。
- Code 新增 `npm run prepare-ai-editor-proxy`：
  - 只接受干净且已提交的独立 `codex_proxy` 工作树；
  - 仅复制 `src/`、包元数据、README/SECURITY/LICENSE；
  - 在隔离 `.build/ai-editor-proxy` 中安装生产依赖；
  - 排除配置、凭据、账号、日志、统计、备份和 Git 数据；
  - 生成包含 Proxy commit、版本、平台和逐文件 SHA-256 的
    `release-manifest.json`。
- Windows/macOS Code 打包流支持读取该制品；设置
  `VSCODE_REQUIRE_AI_EDITOR_PROXY=1` 时缺少或校验不匹配会直接阻止打包。

### 运行时数据边界

- Code 启动安装包内 Proxy 时传入独立 `CODEX_PROXY_DATA_DIR`，默认继续使用当前用户
  `~/.claude/proxy`，因此升级安装目录不会覆盖现有账号、API Key、配置和统计。
- `codex_proxy` 的配置、备份、DPAPI 密钥、统计、健康历史、请求日志、模型目录和
  thread route 已改为写入数据目录。
- 指定数据目录的实例锁包含端口号，不会因共享 47892 已运行而阻止隔离备用端口实例。
- Windows 安装目录只包含程序和生产依赖，不产生运行时用户数据。

### 验证

- Proxy：`npm run check` 通过，完整测试 `64 passing`，包含独立数据目录/端口锁子进程
  测试。
- Code：`npm run typecheck-client`、主进程定向测试 `3 passing`、
  `npm --prefix build run typecheck`、`npm run compile` 和 `npm run core-ci` 通过。
- Windows 产品打包在强制 Proxy 制品模式下通过。
- 成品包含 `resources/app/ai-editor-proxy/src/server.js`，Proxy 制品 248 个文件、
  未发现配置/凭据/日志/统计文件；`product.json` 10/10 checksum 匹配。
- 使用隔离 Code 用户目录、隔离 Proxy 数据目录和备用端口 `47903` 验证：
  - Code 从成品安装目录自动后台启动 Proxy；
  - 监听进程命令行指向
    `resources/app/ai-editor-proxy/src/server.js`；
  - `/live` 返回 `ok`；
  - 关闭 Code 后测试 Proxy 继续运行；
  - 验证后只清理该备用端口测试 Proxy，共享 `47892` 始终保持 `/live: ok`。
- 冷启动首次初始化超过原 10 秒窗口时会产生一次重复启动尝试；Code 启动等待已调整为
  30 秒。最终成品使用全新数据目录复测，等待超过 30 秒后启动日志仍只有 1 条，关闭
  Code 后备用端口 Proxy 保持 `/live: ok`。

## 32. 2026-07-15 G02 Windows 安装与升级闭环

### 安装器与发布门禁

- `product.json` 新增 `aiEditorProxyBundled: true`，产品打包不再允许静默生成缺少
  Proxy 的发布成品。
- 新增统一 Proxy 制品校验器，同时用于制品生成、Code 产品打包和 Windows 安装器打包：
  - 校验 schema、版本、Proxy commit、目标平台和入口点；
  - 校验文件集合和逐文件 SHA-256；
  - 校验 `package.json` 与发布清单版本一致；
  - 拒绝符号链接、凭据、配置、日志、PID、账号备份和配置备份。
- Windows Inno Setup 在非后台安装/升级前只清理
  `{app}\resources\app\ai-editor-proxy` 程序目录，用户数据继续位于安装目录外的
  `~/.claude/proxy`。
- 新增构建脚本定向测试，覆盖正确制品、平台不匹配、用户数据混入、程序文件被篡改和
  安装器路径边界，共 `5 passing`。

### 构建和成品验证

- `npm run prepare-ai-editor-proxy -- --platform win32-x64`：通过，制品固定为
  `codex_proxy 2.2.0`、commit
  `d8c9097d0690455a65d2e74c331d5c0d1b33b3ae`，包含 247 个受校验载荷文件和 1 个发布
  清单。
- `npm --prefix build run typecheck`、`npm run typecheck-client`、
  `npm run compile` 和 `npm run core-ci`：通过。
- 开发版通过 `scripts\code.bat` 使用隔离用户/扩展/共享数据目录启动，CDP 返回
  1 个 Workbench target；关闭该隔离实例后共享 Proxy `/live` 仍为 `ok`。
- `npm run gulp vscode-win32-x64-min-ci`：通过，
  `D:\AI_prejoct\VSCode-win32-x64` 已同步。
- Windows 成品的 Proxy 制品校验通过，未发现配置/凭据/日志/统计；`product.json`
  10/10 checksum 匹配。
- Windows 成品使用隔离目录启动成功；关闭成品后共享 Proxy `/live` 保持 `ok`。
- 用户级与系统级 Inno Setup 安装器均编译成功：
  - `.build/win32-x64/user-setup/VSCodeSetup.exe`
  - `.build/win32-x64/system-setup/VSCodeSetup.exe`

### 真实安装与升级保留测试

- 用户级安装器在工作区内的隔离目录完成首次静默安装、同版本重复安装模拟升级和静默
  卸载，三次进程退出码均为 `0`。
- 首次安装日志确认实际写入：
  - `resources/app/ai-editor-proxy/src/server.js`；
  - `@openai/codex-win32-x64/.../codex.exe`；
  - `extensions/vscode-language-pack-zh-hans`。
- 首次安装后在 Proxy 程序目录加入旧版本哨兵；重复安装后该文件已被删除，新的捆绑
  Proxy 清单和逐文件 SHA-256 再次校验通过。
- 独立 `CODEX_PROXY_DATA_DIR` 中预置配置、账号、DPAPI Key、统计、配置备份和账号备份；
  首次安装、重复安装和卸载后的逐文件 SHA-256 均与安装前完全一致。
- 验证期间共享 `http://127.0.0.1:47892` Proxy 始终保持 `/live: ok`，未执行停止或
  重启。

## 33. 2026-07-15 G03 Windows 发布候选验收

### 第三方许可证闭环

- 审计确认主产品 `ThirdPartyNotices.txt` 已包含 Codex/OpenAI 的 Apache-2.0 声明，
  但捆绑 Proxy 原制品只有自身 MIT `LICENSE`，缺少生产依赖 `undici` 的声明。
- `codex_proxy` 新增 `ThirdPartyNotices.txt`，包含 `undici 8.7.0` 的 MIT 许可证；
  提交 `73631a2` 已推送到 `OscarYi9527/codex_proxy` 的 `master`。
- Code 制品生成和校验器现在把 Proxy `ThirdPartyNotices.txt` 设为必需文件；缺少该
  文件会阻止产品和安装器打包。定向构建测试扩展为 `6 passing`。

### 统一 Windows 发布阻断脚本

- 新增 `npm run verify-ai-editor-windows-release` 和
  `scripts/verify-ai-editor-windows-release.ps1`，自动验证：
  - Windows 成品、用户级安装器和系统级安装器的 SHA-256；
  - `product.json` 的全部 Workbench checksum；
  - Codex Agent Host、Codex JS/Windows x64 运行时、简体中文语言包和 Proxy 资源；
  - Proxy 清单的平台、版本、文件集合和逐文件 SHA-256；
  - 主产品 Codex 声明和 Proxy `undici` 声明；
  - 已配置 Proxy 的 `/live`、`/ready`、`/v1/models`、`/admin`；
  - 空 Code 用户目录、空 Proxy 数据目录和备用端口的首次启动；
  - 可选的 ChatGPT Subscription 与非订阅模型真实 `/v1/responses`。
- 报告写入：
  - `.build/ai-editor-release/windows-x64-release-report.json`
  - `.build/ai-editor-release/windows-x64-release-report.md`
- 报告只保存版本、哈希、状态码、路由响应头和最多 120 字符输出预览，不保存账号、
  Token、API Key 或请求正文。

### 最终构建与验收结果

- Code 工具提交 `f4fb7871e` 已推送到 `origin/main`；基于该已提交版本重新运行：
  - `npm run typecheck-client`：通过；
  - `npm run compile`：通过，`scripts\code.bat` 隔离启动成功；
  - `npm run core-ci`：通过；
  - `npm run gulp vscode-win32-x64-min-ci`：通过；
  - Windows 用户级/系统级 Inno Setup：均重新编译成功。
- 最终成品版本：
  - Code `1.127.0`，commit
    `f4fb7871e803e735c81638c52749a2aadf794d95`；
  - Proxy `2.2.0`，commit
    `73631a22bca75731a98507ae6301e7a4b71506a0`；
  - Codex `0.142.0` / Windows x64 原生包 `0.142.0-win32-x64`；
  - 简体中文语言包 `1.127.0`。
- 最终统一报告：`PASS`
  - 产品 checksum：`10/10`；
  - Proxy 受校验载荷：248 个文件；
  - 已配置 Proxy 模型目录：20 个模型；
  - `/admin`：HTTP 200，标题“Codex Gateway · 管理控制台”；
  - `gpt-5.6-sol`：HTTP 200、`owned_by=chatgpt-sub`、回复 `OK`；
  - `deepseek-v4-pro`：HTTP 200、`owned_by=deepseek`、回复 `OK`。
- 空数据首次启动：
  - 初始 Proxy 数据文件数为 0；
  - Code 从成品内 `ai-editor-proxy/src/server.js` 后台启动备用端口 Proxy；
  - 未配置状态 `/ready` 返回 HTTP 503、`status=unavailable`；
  - `/v1/models` 返回 0 个模型，`/admin` 返回 HTTP 200；
  - 关闭 Code 后 Proxy 保持存活；验证后仅清理该备用端口测试进程。
- 正式用户级安装器进一步完成真实隔离安装：
  - 安装退出码 0；
  - 对安装后的产品重复执行空数据首次启动验收，结果 `PASS`；
  - 安装包内 Proxy 第三方声明存在且校验通过；
  - 静默卸载退出码 0。
- 两轮备用测试 Proxy 均已清理，无残留监听；共享
  `http://127.0.0.1:47892/live` 始终为 `ok`，未停止或重启。

## 34. 2026-07-15 GitHub Actions 公开仓库运行器修复

### 根因

- `Code OSS (node_modules)` 运行 `29318651259` 的 macOS 任务在执行 Checkout 前
  即被 GitHub 拒绝，注释明确指出账户付款失败或付费额度不足。
- 该任务使用付费大型运行器 `macos-14-xlarge`；Linux、Windows 和 Copilot 任务则
  使用仅微软内部可用的 `1ES.Pool` 自托管运行器。当前公开仓库没有这些运行器，
  因此任务会长期排队或被取消。
- 这次故障发生在用户代码、`npm ci` 和缓存脚本运行之前，不是新的源码或锁文件错误。

### 修复与本地验证

- `.github/workflows/pr-node-modules.yml` 已切换到公开仓库可用的标准 GitHub Hosted
  运行器：
  - Linux/Compile/Copilot Linux：`ubuntu-22.04`；
  - Windows/Copilot Windows：`windows-2022`；
  - macOS：`macos-14`，目标架构相应改为 `x64`。
- 工作流最小权限设置为 `contents: read`，下载内置扩展和安装依赖改用当前运行自带的
  `${{ github.token }}`，不再依赖仓库中不存在的 `VSCODE_OSS` Secret。
- 新增同一分支只保留最新运行的 concurrency 配置，避免后续连续推送继续积压过期任务。
- 本地缓存动作审核通过：Linux/macOS 使用标准环境的 `zstd`，Windows 使用标准环境的
  `7-Zip`，未发现额外微软内部服务依赖。
- `git diff --check` 与 `actionlint 1.7.12` 检查通过。
- 本轮只修改 CI 配置和进度文档，不涉及 AI Editor UI、运行时代码或 Proxy；无需重建
  `out` / `out-vscode-min`，也未停止或重启共享 Proxy。

### GitHub 在线验证

- 修复提交 `d9b3010208bb8f2f83859dcc48688faf870c3dbd` 已推送到 `origin/main`。
- `Code OSS (node_modules)` 运行
  [#24](https://github.com/OscarYi9527/My_Code/actions/runs/29402133955) 整体
  `success`：Compile、Linux、macOS、Windows、Copilot Linux 和 Copilot Windows
  六个任务全部通过。
- 18 个由旧的微软内部运行器配置造成的过期排队任务已取消；当前该工作流
  `queued=0`、`in_progress=0`。

## 35. 2026-07-15 G01-G03 macOS arm64 发布候选闭环

### 固定发布输入与跨平台 Proxy

- `build/ai-editor-proxy/release.json` 将发布输入固定到
  `OscarYi9527/codex_proxy`、版本 `2.2.1`、commit
  `06cd8d57dc39ab30be5d193f7678ca227ef1aa30`。
- Proxy 增加 macOS Chrome、Edge 和 Firefox 私密窗口识别；Proxy 源码执行
  `npm run check` 与完整测试通过，共 `65 passing`。
- 只更新了 Proxy 源码和发布制品，没有停止或重启共享 `47892` Proxy。

### macOS arm64 流水线与验收

- `.github/workflows/ai-editor-macos-release.yml` 使用标准 `macos-14` arm64 runner，
  从固定 commit checkout Code 和 Proxy，构建 `.app`、创建 DMG，并上传脱敏验收证据。
- `verify-ai-editor-macos-release` 验证 Workbench checksum、Codex arm64 原生运行时、
  中文语言包、Proxy 文件集合和逐文件 SHA-256。
- 空数据首次启动验证通过：
  - `/live` 返回正常；
  - 未配置状态 `/ready` 返回 HTTP 503、模型目录为空；
  - `/admin` 可访问；
  - 关闭隔离 Code 后测试 Proxy PID 不变且继续存活；
  - 只清理备用端口测试 Proxy，不接触共享 `47892`。
- GitHub Actions 运行
  [29409776010](https://github.com/OscarYi9527/My_Code/actions/runs/29409776010)
  为 `success`，21 个构建、验收和清理步骤全部通过。
- DMG 约 `226.67 MB`，artifact id `8340875744`，SHA-256：
  `edbb282e8dc05c5aaee7ad1b7da6501ca6c3183990e908a56c9ae86df26e1cc5`。
- 公开 CI 候选未签名，因此 `signatureVerified=false`；Developer ID 签名、公证、
  Intel x64 和 universal 成品留待后续平台阶段。

### Windows 同步回归

- Proxy 2.2.1 Windows 制品重新生成并重新打包，构建工具测试 `10 passing`。
- `npm run typecheck-client`、`npm run compile`、`npm run core-ci`、Windows 产品打包、
  Inno updater、用户级安装器和系统级安装器均通过。
- Windows 静态发布报告
  `.build/ai-editor-release/windows-x64-proxy221-static-report.json` 为 `PASS`：
  Workbench checksum `10/10`，Proxy 受校验载荷 248 个文件，模型目录 20 个。
- Windows 成品启动成功，共享 Proxy `/live` 保持 `ok`，未执行停止或重启。

## 36. 2026-07-15 Monaco Editor checks 干净检出修复

### 根因

- `test/monaco/dist/core.html` 存在于开发机，但被根 `.gitignore` 的 `dist` 规则忽略，
  从未进入 Git。
- GitHub Actions 的干净检出只由 Webpack 生成 JavaScript，不会生成入口 HTML；
  浏览器因此访问 404 页面。首个“`monaco` 不暴露为全局变量”测试会误通过，后续
  `window.instance` 永远不会创建。
- 之前加入 `waitForFunction(window.instance)` 只把立即的 undefined 错误变成稳定的
  20 秒超时，并未解决入口文件缺失。

### 修复与本地验证

- 将与 VS Code 上游一致的 `test/monaco/dist/core.html` 强制纳入 Git。
- `runner.js` 在启动浏览器前检查 HTML、主 bundle 和 worker bundle 均存在，缺失时
  直接给出资源绝对路径，不再把 404 误报为编辑器初始化超时。
- 页面加载统一校验 HTTP 200 后再等待 `window.instance`，普通 API 和无障碍测试复用
  同一个加载辅助函数。
- `npm run gulp editor-distro`、Webpack 打包和 Monaco TypeScript 编译通过。
- 本机使用已安装 Chrome 执行 Chromium 测试，`9 passing`；本机未安装 Playwright
  Firefox，完整 Chromium + Firefox 结果由 GitHub 标准浏览器环境验证。
- 本轮只修改 Monaco CI fixture、测试保护和进度文档，不涉及 AI Editor UI、运行时
  或 Proxy，无需重建 `out` / `out-vscode-min`，且未停止或重启共享 Proxy。

## 37. 2026-07-15 产品账号 MVP 与凭据加密延期决策

- macOS 签名、公证、Intel x64 和 universal 后续打包暂时暂停；当前优先开发应用内
  Proxy 管理、服务器状态检查和 AI Editor 产品账号。
- 产品账号正式架构仍以中央 HTTPS 模块化单体服务和 PostgreSQL 为目标；当前调试阶段
  先在本机运行账号/模型网关服务并使用 SQLite。
- 为优先验证 MVP，上游 ChatGPT/API/Relay 凭据的数据库信封加密暂缓实现，调试数据库
  临时使用 `plaintext-v1`。
- 产品用户密码哈希、Refresh Token 哈希与轮换、Windows Credential Manager/DPAPI、
  macOS Keychain、日志脱敏和本机监听边界仍属于 MVP 必做安全功能，不随信封加密延期。
- 新增 `AI_EDITOR_POST_MVP_ENCRYPTION_TODO.md`，记录明文调试边界、信封加密设计、
  KMS/密钥轮换、幂等迁移、验收标准、投入评估和公开部署阻断条件。

## 38. 2026-07-15 应用内账号管理界面决策

- MVP 采用 Gateway Web UI + Code 专用 Webview，不使用 VS Code Simple Browser，
  也不在当前阶段重复实现整套 Code 原生账号管理界面。
- 专用标签页标题为“AI Editor 管理”，固定到受信任的 Gateway 管理地址，不显示可编辑
  地址栏、前进、后退等通用浏览器控件，并复用单个标签页实例。
- 页面入口位于 AI Editor 左下角用户头像/用户信息菜单，不放在服务器状态子栏。
- 普通用户点击“我的账号”后复用同一标签页，只显示个人资料、积分、设备会话和个人
  使用记录；二级、一级管理员按既定角色增加对应管理功能。
- 页面可见性不能代替授权。账号、组织、积分、审计、Provider、路由和诊断权限必须由
  Gateway API 强制执行。
- 登录、退出和账号摘要保留 Code 原生入口；使用一次性登录交接，Refresh Token 不进入
  Webview。
- Webview 登录交接采用一次性短期票据：Code 使用当前设备会话向 Gateway 申请票据，
  页面再通过 POST 换取 HttpOnly 管理会话。票据和产品 Token 不写入 URL 或
  localStorage，页面脚本不能读取 Refresh Token。
- 关闭“AI Editor 管理”标签页不退出 AI Editor 产品账号；只结束或尽力撤销该 Webview
  的短期管理会话。再次打开时自动申请新票据，不要求用户重新登录。
- AI 消息输入框下方的服务器状态对普通用户只显示安全汇总结果，包括“AI 服务正常、
  需要登录、账号不可用、服务暂不可用”；不显示本机端口、Provider、路由、熔断、
  凭据状态或最近路由错误。
- 底层运行状态和诊断信息继续由 Gateway API 按角色保护，只允许一级管理员在管理页面
  查看，不能依赖 Code 或 Web UI 单纯隐藏。
- 状态栏上下文操作已确定：
  - “需要登录”显示登录入口；
  - “账号不可用”打开当前用户的“我的账号”页面；
  - “服务暂不可用”提供手动重试并显示脱敏错误编号；
  - “AI 服务正常”点击后只显示账号、当前模型和可用积分摘要；
  - 一级管理员额外显示“打开系统诊断”。
- 状态刷新时机确定为：Code 启动、窗口恢复、每 30 秒后台刷新、每个新 Turn 发送前
  强制检查，以及用户手动“重试”。检查发现账号到期、禁用或服务不可用时禁止新 Turn，
  但不强行中断已经运行的 Turn。
- 专用管理 Webview 采用受限导航策略：只允许配置的 Gateway 管理源；登录、帮助等
  外部链接使用系统默认浏览器；阻止 Webview 内任意跨源跳转、新窗口和未经允许的下载。
- Gateway 地址策略确定为：调试版固定 `http://127.0.0.1:47920`，仅开发启动参数可以
  覆盖；正式发布版固定产品中央 HTTPS 地址，普通用户不能修改，防止切换到未受控服务
  绕过产品登录、角色权限或统一计费。
- 正式安装包只随 Code 分发本地 Edge Proxy；中央 Gateway、产品账号服务和管理 Web UI
  不部署到普通用户电脑。调试阶段使用统一脚本在开发机后台启动 Gateway `47920` 与
  隔离测试 Edge `47921`，不接触共享 `47892`。
- 管理前端技术方案确定为 React + TypeScript + Vite，在 `codex_proxy` 同一仓库构建为
  Gateway 静态资源；保留现有 standalone 管理页和兼容行为，不为本次 MVP 整体重写
  当前 Proxy 主体。
- Gateway 后端采用渐进式 TypeScript：新增账号、组织、积分、审计和网关模块编译为
  JavaScript 运行；现有 standalone Proxy 保持当前实现，通过兼容适配层复用模型路由，
  避免本次 MVP 引入无关的整体迁移回归。
- 统一调试脚本首次检测到空 SQLite 数据库时自动执行一次性初始化，只在当前控制台显示
  初始一级管理员的随机强密码，不写入日志。普通重启保留全部数据；仅显式执行带警告的
  `--reset-data` 才允许清空隔离调试数据，且不得指向共享 `47892` 数据目录。
- 初始一级管理员使用固定登录名 `admin`，初始化阶段邮箱可为空；初始化生成的是一次性
  bootstrap 临时密码，不是可长期使用的管理员密码。首次登录必须立即设置正式密码并
  填写邮箱。MVP 只保存邮箱、不验证邮箱，后续接入邮箱验证后再要求完成验证。
- 按用户“非重大细节采用推荐方法”的授权，基础凭据存储确定为：正式密码与一次性临时
  密码使用 Argon2id；邀请码、授权码、Webview 一次性票据和 Refresh Token 只保存带
  服务器密钥的哈希。一次性凭据成功使用后立即失效，数据库不保存其可用明文。
- 隔离 Gateway `47920` 不自动读取、复制或迁移共享 Proxy `47892` 的上游账号和密钥。
  MVP 测试时由一级管理员在新管理页面重新完成 ChatGPT 登录并重新填写 API/Relay
  凭据，确保开发过程不触碰当前共享 Proxy 的数据或运行状态。

## 39. 2026-07-15 产品账号与 Gateway MVP 规格闭环

- 所有重大产品问题已经确认完成；用户授权非重大实现细节采用推荐安全默认值。
- 新增 `specs/002-ai-editor-account-gateway/`，包含：
  - 8 个可独立验收的用户故事和 50 条功能要求；
  - 完整数据模型与 SQLite/PostgreSQL repository 边界；
  - 登录/账号、Edge/Gateway、角色管理、Code/Webview 四组接口合同；
  - 不接触共享 `47892` 的端到端 quickstart；
  - 120 项按依赖、用户故事和双构建验收排序的实施任务。
- `.specify/feature.json` 已切换到新规格，requirements checklist 全部通过，无待确认
  标记；任务 ID `T001`–`T120` 连续且格式检查通过。
- 为避免共享 Proxy 自动恢复时加载半成品，已从 GitHub 在
  `D:\AI_prejoct\codex_proxy-dev` 创建干净隔离 checkout；当前为 `06cd8d5`，
  与 Code 发布清单的 Proxy 2.2.1 输入一致。
- 本轮只创建规格和隔离源码 checkout，未修改 Proxy 运行代码，未启动 `47920/47921`，
  未停止或重启共享 `47892`。

## 40. 2026-07-15 Black 与 Oscar 开发分工

- Black 负责服务器范围：`codex_proxy` 的 Gateway、Edge、三模式、账号、组织、积分、
  Provider、React 管理页面、审计和服务端测试，共 95 项任务。
- Oscar 负责 Code 产品范围：账号服务/IPC、系统浏览器回调、账户菜单、状态栏、Turn
  门禁、专用 Webview、Edge 产品打包、Code 双构建和 Windows 成品验证，共 23 项任务。
- T112 完整隔离 quickstart 和 T113 共享 `47892` 不变性验证由 Black 与 Oscar 共同
  完成。
- 详细任务 ID 映射已写入
  `specs/002-ai-editor-account-gateway/tasks.md`，技术责任边界已写入
  `specs/002-ai-editor-account-gateway/plan.md`。
- 双方以 `contracts/` 为接口事实来源。接口路径、字段、状态码或安全语义变化必须先
  更新合同并共同确认；联调仅使用 `47920`/`47921`。

## 41. 2026-07-15 Black 现有 codex_proxy 开发基线核对

- 远程已存在 Black（提交作者“小黑”）持续开发的
  `origin/feature/custom-api-urls`，当前提交为 `e3ed1d6`，比
  `origin/master@06cd8d5` 多 12 个提交。
- 现有分支已经覆盖大量与新 Gateway 计划可复用的基础：
  - 管理页面和管理服务模块化；
  - ChatGPT 账号级额度与熔断治理；
  - 成本定价、智能路由和运行诊断；
  - 配置迁移、运行时发布检查和拆分后的自动化测试。
- 因此服务器开发不得从旧 master 重置或重新实现同等功能。T001 调整为先审计 Black
  分支与 T001–T120 的覆盖关系，验证通过的现有能力直接复用并标记完成。
- 后续 Gateway 工作分支应从 `e3ed1d6` 或 Black 更新后的稳定提交创建；是否合并
  `master` 由现有分支测试和评审决定，当前不执行强制合并、rebase 或 reset。
- 本轮只执行 `git fetch` 和只读差异检查，未切换本地工作树、未修改 Black 分支，也未
  停止或重启共享 `47892`。

## 42. 2026-07-16 Black/Oscar 真并行计划修正

- 识别到旧计划把“Black 先提供 Mock Edge”设为 Oscar 的前置条件，会造成 Code 开发
  等待服务器，不是真正并行。
- 修正后由 Oscar 在 My_Code 内维护可注入 Mock Transport 和本地合同模拟器，独立覆盖
  安全状态、handoff、Webview ticket、logout 和模型目录。
- Black 依据相同 `contracts/` 和共享 JSON 样例独立实现真实 Edge/Gateway，不等待
  Oscar 完成 Code UI。
- 双方只在三个节点产生同步阻塞：合同冻结、真实接口符合性、T112/T113 最终端到端
  验收。
- T008 已调整为同时交付 `scripts/mock-ai-editor-edge.ts` 和安全调试启动 wrapper；
  AGENTS.md 的持久协作规则已同步修正。

## 43. 2026-07-16 Oscar T008 合同模拟器与账号合同基础

- 完成 T008：
  - 新增 `scripts/mock-ai-editor-edge.ts`，提供 loopback-only、内存态的安全合同模拟器；
  - 支持 safe status、状态切换、一次性 handoff、Webview ticket、logout、模型目录和
    管理页占位；
  - 新增 `scripts/start-ai-editor-account-dev.ps1`，只管理隔离 `47921` Mock，校验端口、
    PID、命令行和数据目录，后台进程使用隐藏窗口；
  - 脚本只读检查共享 `47892`，拒绝停止非 Mock 进程。
- 新增 Code 账号合同基础：
  - `IAiEditorAccountService`、安全状态、角色、动作、Turn 门禁和可注入 Transport；
  - 固定 IPC endpoint 常量及不可信状态响应解析；
  - 相关 T027/T034 尚未标记完成，仍需补齐 loopback callback、真实 IPC 注册和服务实现。
- 验证结果：
  - Mock Node 测试：4 passing；
  - Code 账号合同定向测试：6 passing；
  - 新增文件定向 ESLint：通过；
  - `npm run typecheck-client`：通过；
  - `npm run compile`：通过；
  - 全量 node test 调用因本机 Kerberos 无可用凭据出现 1 个既有环境失败，同时有
    11728 passing / 182 pending；与本次账号代码无关。
- Mock 启动、状态切换、复用和安全停止均通过；共享 Proxy PID `18120` 在测试前后不变，
  `/live` 持续为 `ok`。
- 本轮未注册 UI/runtime contribution，T008 仅为开发脚本，因此尚未运行
  `npm run core-ci` 或 Windows 成品打包；首次实际 Code runtime 接入完成时按双构建规则
  同步验证。
- 新增 `AI_EDITOR_POST_MVP_NATIVE_ACCOUNT_UI_TODO.md`，将全部 Code 原生账号管理界面
  记录为 MVP 后评估项。

## 44. 2026-07-16 Oscar T027/T034–T037 账号运行时与 Turn 门禁

- 完成 T027、T034、T035、T036、T037：
  - 在 Electron 主进程注册 AI Editor 账号服务和 IPC channel；
  - 实现受限 Edge/Gateway HTTP Transport，渲染层只接收安全状态和稳定错误 ID；
  - 实现随机 loopback 回调端口、PKCE、state 校验、系统浏览器登录、授权码换 Token 和
    一次性 Edge handoff；
  - 实现 30 秒后台状态刷新、窗口聚焦刷新、并发刷新合并和重复登录合并；
  - 在 Codex 新 Turn 创建会话、请求工作区信任及发送 `chat/turnStarted` 前执行
    fail-closed 账号门禁，拒绝新 Turn 时不取消已经运行的 Turn。
- 产品启用边界：
  - 开发版始终连接隔离 Mock Edge `47921` 和 Gateway `47920`；
  - 正式成品只有在产品配置包含固定 HTTPS `aiEditorAccountGatewayOrigin` 时才启用账号
    Turn 门禁；
  - 未配置中央 Gateway 的 Oscar 中间成品不会访问共享 `47892` 的账号接口，也不会改变
    当前 Codex/Proxy 路径；账号服务改为按需实例化，避免无意义的 404 和周期日志。
- 代码与测试验证：
  - 定向 ESLint：通过；
  - `npm run typecheck-client`：通过；
  - 账号 Electron 定向测试：19 passing；
  - Agent Host 账号门禁 Chromium/系统 Chrome 定向测试：1 passing；
  - `npm run compile`：通过；
  - 开发版通过 `scripts\code.bat`、隔离 profile 和 Mock Edge `ready` 状态启动，未发现
    `Unknown service`、模块加载或账号启动错误。
- Windows 成品验证：
  - `npm run core-ci`：通过；
  - `npm run gulp vscode-win32-x64-min-ci`：通过；
  - `D:\AI_prejoct\VSCode-win32-x64` 的 `product.json` Workbench checksum 为
    `10/10`；
  - 成品使用隔离 profile 启动成功，未发现 `Unknown service`、模块加载错误或
    `[aiEditorAccount]` 错误日志。
- 验证期间只关闭本轮隔离 Code/Mock 进程；共享 Proxy 始终为 PID `18120`，
  `http://127.0.0.1:47892/live` 持续返回 `ok`，未停止或重启。

## 45. 2026-07-16 Black 第一轮 Mock 合同符合性修复

- 已获取并只读审计 Black 的最新交接分支：
  - 分支 `feature/ai-editor-account-gateway`；
  - 运行时基线 `84ab6445bb4b557dc379815776bcd784f34676c1`；
  - 最新交接文档提交 `37e61d9bb6e705c40dc322b7319eb874508d18c2`；
  - 该分支仍堆叠依赖 `feature/custom-api-urls@e3ed1d6`，尚未更新正式 Proxy 发布基线。
- 首次真实联调发现并修复三处 Code/Black Mock 差异：
  - Black 的 `/ai-editor/*` 要求 `X-AI-Editor-Local-Nonce`，原 Code Transport 未发送；
  - Black logout 返回 HTTP 204，原 Code 期待安全状态 JSON；
  - Black handoff complete 返回 `status=completed` 与 `bindingVersion`，原 Code 将其误当
    安全状态解析。
- Code 主进程现在：
  - 仅在开发模式通过 `VSCODE_AI_EDITOR_ACCOUNT_EDGE_NONCE_FILE` 读取 nonce；
  - 每次请求重新读取并验证 32–4096 字节 nonce，支持 Edge 重启轮换；
  - nonce 只进入 Electron-main 请求 Header，不进入 renderer、IPC、URL 或日志；
  - logout 204 和 handoff acknowledgement 后均重新获取 `/ai-editor/status`。
- Oscar 自带 Mock 已改为与 Black 一致的 logout/handoff 响应，继续用于独立单元测试。
- 新增 `scripts/connect-ai-editor-black-dev.ps1`：
  - 校验 Black checkout 必须包含运行时基线、无 tracked 修改；
  - 数据根固定在 Black checkout 的 `.ai-editor-dev/`；
  - 只启动/停止隔离 `47920/47921`，拒绝占用进程不属于 Black checkout 的端口；
  - 验证 Gateway/Edge `/live`、nonce 文件和五种 Mock 状态；
  - 只打印 nonce 文件路径和 Code 环境变量，不打印 nonce；
  - 支持复用现有 Black 服务并切换 Mock 状态。
- 真实联调结果：
  - 建立独立 worktree `D:\AI_prejoct\codex_proxy-gateway-dev@37e61d9`；
  - Black Gateway PID `23660`、Edge PID `26508` 启动成功；
  - HTTP logout `204`、后续状态 `login_required`、handoff `completed`、
    `bindingVersion=2`、最终状态 `ready` 均通过；
  - Black Edge `/v1/models` 返回 `gpt-mock`；
  - Code 开发版通过 nonce 文件连接 Black Edge，启动及 30 秒刷新均无
    `local_authorization_required`、nonce 或账号错误日志。
- 联调还确认 Black 原始启动脚本在服务已运行时会先因端口占用退出，与交接文档的
  “重复启动复用”描述不一致；Oscar wrapper 已安全复用现有进程，该差异需要反馈 Black。
- 正式产品内存态 nonce 交接仍属于 T022/T047 的 Edge 打包/启动集成，不在当前 Mock
  联调中伪装完成；T047 继续等待 Black 的真实 `/v1/responses` T038–T046。
- 共享 Proxy 始终为 PID `18120` 且 `/live=ok`，未停止、重启、迁移或读取其凭据。
- 最终回归验证：
  - Code 账号 Electron 定向测试：`23 passing`；
  - Oscar Mock 测试：`4 passing`；
  - Black standalone/Edge、Gateway、Admin React 测试分别为
    `100 passing`、`16 passing`、`1 passing`，`npm run check` 通过；
  - `npm run typecheck-client`、定向 ESLint、`npm run compile` 和
    `npm run core-ci` 均通过；
  - `npm run gulp vscode-win32-x64-min-ci` 通过，Windows 成品 Workbench
    checksum `10/10`；
  - 开发版与 Windows 成品版均使用隔离 profile 启动通过，未发现账号服务、模块加载或
    `Unknown service` 错误。

## 46. 2026-07-16 Oscar T051/T056–T059/T099 产品账户与管理界面

- 完成 T051、T056、T057、T058、T059、T099：
  - 左下角账户入口在开发版或配置了正式 Gateway 的成品中替换为
    `AI Editor 账户`，普通用户、二级管理员、一级管理员只看到各自允许的菜单；
  - Chat 输入框下方显示安全账号状态，只包含账号显示名、当前模型、可用积分和稳定
    错误编号，不向普通用户暴露 Provider、路由、熔断、端口或凭据；
  - 新增单实例、只读的 `AI Editor 管理` 标签页，没有通用浏览器地址栏和导航控件；
  - 管理页使用私有 ephemeral BrowserView，并从浏览器发现、浏览器工具、扩展 Browser
    API、聊天附件和 Agent 上下文中排除；
  - 实现退出登录与 password-change-required 入口。
- 管理票据安全边界：
  - Workbench renderer 只提交固定 view ID 和 route，不接收一次性票据；
  - Electron main 通过 isolated world 注入
    `ai-editor-management-bootstrap` version 1 envelope；
  - 只允许 Gateway 同源 `/admin` 路由；已批准的登录/帮助链接交给系统浏览器，任意
    跨源跳转、新窗口和下载被阻止；
  - 关闭标签页时最佳努力调用 `DELETE /api/v1/webview/session`，清理 ephemeral
    BrowserView 存储并销毁私有视图，不退出产品设备会话。
- 本轮合同同步点已写入 `contracts/code-edge-webview.md` 与
  `contracts/auth-account-api.md`。Black 需要确认并实现：
  - 固定 `/admin` 管理入口；
  - `POST /api/v1/webview/session` 与 `DELETE /api/v1/webview/session`；
  - 页面校验 `event.source === window`、Gateway `event.origin`、type、version 和固定
    route enum 后再兑换一次性票据。
- 成品验证发现并修复一处启用边界回归：原账户菜单/状态 contribution 会在检查产品
  Gateway 配置前由依赖注入实例化账号服务，导致未配置 Gateway 的中间成品每 30 秒向
  共享 Proxy 请求账号状态并记录 `account_http_404`。现已改成通过启用判断后才延迟
  获取服务，并新增“禁用成品不实例化服务”回归测试。
- 最终验证：
  - 定向 ESLint、`npm run typecheck-client`、`npm run compile`：通过；
  - AI Editor Account Electron 测试：`42 passing`；
  - 开发版使用 Oscar Mock Edge `47921` 的 `ready` 状态验证：账户菜单、账号/模型/积分
    状态、单实例管理标签和 Gateway 不可用提示均正确；
  - 管理标签关闭后等待 75 秒，未再出现 `[LEAKED DISPOSABLE]`；
  - `npm run core-ci` 与 `npm run gulp vscode-win32-x64-min-ci`：通过；
  - `D:\AI_prejoct\VSCode-win32-x64` Workbench checksum：`10/10`；
  - 成品已包含管理 bootstrap 和 `/api/v1/webview/session` 撤销路径；当前
    `product.json` 未配置正式 Gateway，因此安全保留原生“账户”入口；
  - 成品隔离启动并持续运行 40 秒，未出现账号轮询、`account_http_404`、模块加载、
    `Unknown service` 或 leaked-disposable 错误。
- 所有开发/成品验证只关闭本轮隔离 Code 与 Mock。共享 Proxy 始终为 PID `18120`，
  `/live=ok`，未停止、重启、迁移或读取其凭据。

## 47. 2026-07-16 AI Editor 首次启动官方登录提示移除

- 使用全新开发 profile 复现用户反馈：首次打开会自动显示
  `Welcome to Visual Studio Code` 三步 Onboarding，第一步要求
  `Sign in to use GitHub Copilot`；标题栏同时显示官方 `Sign In` 按钮。
- 根因是 VS Code 2026 Welcome Onboarding 和 Chat Setup title-bar action 仍按默认产品
  行为注册，与 Codex Agent Host、Proxy 和 AI Editor 产品账号状态无关。
- 修复：
  - 将已有 `product.json` 的 `aiEditorProxyBundled=true` 纳入产品类型并作为 AI Editor
    产品标记；
  - AI Editor 产品不再自动显示 GitHub Copilot 登录 Onboarding；
  - AI Editor 产品不再注册标题栏官方 `Sign In`、账户菜单 Copilot 登录和对应标题栏
    开关；
  - 普通 VS Code 产品行为保持不变，扩展明确发起的按需 Authentication 授权能力仍保留。
- 验证：
  - 定向 ESLint、`npm run typecheck-client`、`npm run compile`：通过；
  - AI Editor Account 测试：`43 passing`；
  - 开发版使用全新 profile 启动：官方登录弹窗 `0`、标题栏官方 `Sign In` `0`，
    `AI Editor 账户` 与账号/模型/积分状态正常；
  - `npm run core-ci`、`npm run gulp vscode-win32-x64-min-ci`：通过；
  - Windows 成品 Workbench checksum：`10/10`；
  - Windows 成品使用全新 profile 启动：官方登录弹窗 `0`、标题栏官方
    `Sign In` `0`，中文 Workbench 正常，运行日志无模块、服务或 disposable 错误。
- 验证结束后只停止本轮隔离 Mock Edge；共享 Proxy 保持 PID `18120`、`/live=ok`，
  未停止或重启。

## 48. 2026-07-16 Oscar T110 账号边界与进程故障回归

- 完成 T110，并将既有与新增测试整理为明确的边界覆盖：
  - 两个并行登录流程分别监听 `127.0.0.1` 的随机端口，端口与 OAuth state 相互隔离；
  - Edge-local nonce 每次从绝对 Unicode/空格路径重新读取，支持安全轮换；
  - 重复点击登录合并为同一个登录操作，不重复打开授权流程；
  - loopback 回调在有界超时后关闭并返回稳定错误；
  - Edge 在两次状态请求之间退出时只返回 `account_edge_unreachable`，新 Turn 保持
    fail-closed；主进程 IPC 不可用时同样只暴露稳定的 `account_ipc_unavailable`。
- 验证：
  - 两个新增测试文件定向 ESLint：通过；
  - `npm run typecheck-client`：通过；
  - `npm run compile`：通过；
  - AI Editor Account platform Electron 测试：`33 passing`。
- 本轮只增加回归测试和进度记录，没有修改运行时代码、成品资源或 Proxy；共享
  `http://127.0.0.1:47892/live` 未停止或重启。

## 49. 2026-07-16 Oscar T022 Edge/Gateway 发布白名单分离

- 完成 T022，`build/ai-editor-proxy/release.json` 升级为 target-aware schema 2：
  - `legacy-standalone`：迁移期间维持现有 Proxy 2.2.1 成品可用；
  - `edge`：只允许包元数据、许可证、`src/launcher.js`、`src/mode.js` 和
    `src/edge/**`；
  - `gateway`：只允许编译后的 `gateway/dist/**`、`gateway/admin-web/dist/**` 和对应
    workspace 元数据。
- 构建与发布阻断：
  - `prepare-ai-editor-proxy --target` 只复制目标 allowlist；
  - Edge 安装生产依赖时强制 `--workspaces=false`，不会拉入 Gateway workspace；
  - 制品清单记录 target 和动态入口文件；
  - Edge 中出现 Gateway、管理后台、Provider route、凭据仓库、迁移脚本或数据库文件
    会直接失败；Gateway 中出现 `src/edge/**` 同样失败；
  - Code 产品打包、Windows 安装器和 macOS 验收均校验发布 target。
- 安全迁移边界：
  - 当前固定发布输入仍为 `codex_proxy 2.2.1@06cd8d5`，它没有生产 Edge，因此
    `productTarget` 明确保持 `legacy-standalone`；
  - 不会为了提前显示进度而把可用 AI 链路切换到 Black 尚未完成真实
    `/v1/responses` 的 Mock Edge；
  - Black 完成 T038–T046 并提供稳定 commit 后，由 T047/T116 更新发布 pin、切换
    `productTarget=edge` 并执行最终 Edge-only 验收。
- 验证：
  - 构建脚本定向 ESLint：通过；
  - PowerShell 发布脚本语法检查：通过；
  - `npm --prefix build run typecheck`：通过；
  - AI Editor Proxy 发布源/制品测试：`15 passing`；
  - 实际生成 Windows legacy 迁移制品：schema 2、target
    `legacy-standalone`、248 个校验文件；
  - `npm run compile`、`npm run core-ci`：通过；
  - `npm run gulp vscode-win32-x64-min-ci`：通过；
  - Windows 发布验收：`PASS`，Workbench checksum `10/10`、Proxy 文件
    `248`、共享模型目录 `20`，隔离空数据首次启动 `cleanStart=true`，测试 Proxy 在
    Code 退出后保持存活并由验收脚本安全清理。
- 共享 `http://127.0.0.1:47892/live` 始终为 `ok`，未停止或重启。

## 50. 2026-07-16 T116/T118 最终 Edge 发布门禁基础设施

### Windows 最终 Edge 负向门禁（T116 基础）

- `scripts/verify-ai-editor-windows-release.ps1` 新增 `-RequireEdgeTarget`：
  - 默认模式继续验收当前可用的 `legacy-standalone` 迁移产品；
  - 最终发布模式强制要求 `release.json productTarget=edge`、制品
    `target=edge`、schema 2 和 `src/launcher.js` 入口；
  - 最终发布模式拒绝 Gateway、管理后台、Provider route、凭据仓库、迁移脚本和
    SQLite/数据库资源。
- 边界判断提取到 `scripts/lib/ai-editor-final-edge-release.ps1`，并新增
  `scripts/test-verify-ai-editor-windows-final-edge.ps1`。
- 负向测试覆盖 legacy target、Gateway 文件、数据库文件和合法 Edge 文件集，共
  `4 passing`。
- 当前 Windows 迁移成品使用 `-RequireEdgeTarget` 时按预期失败：
  `Final Edge-only release requires release.json productTarget=edge; found legacy-standalone.`。
  这项失败是安全门禁生效，不是当前迁移成品回归。

### macOS 账号与 Edge 静态门禁（T118 基础）

- 新增 `build/darwin/verify-ai-editor-account-release.ts`，检查：
  - Edge/Gateway allowlist 相互隔离；
  - 最终产品必须使用 Edge target；
  - 正式 `aiEditorAccountGatewayOrigin` 必须是固定、非 loopback、无路径的 HTTPS origin；
  - 开发环境变量覆盖不能进入 built product；
  - 固定 Proxy 源码必须包含生产 Edge launcher/server/local account store；
  - macOS local account store 必须存在可静态识别的 Keychain 读、写、删除路径。
- 新增 `verify-ai-editor-account-release` npm 命令和 4 个 TypeScript 测试；macOS
  GitHub Actions 在打包前记录静态报告到
  `.build/ai-editor-release/macos-account-static-report.json`。
- 非最终模式允许 CI 继续构建迁移产品，但报告结果为 `BLOCKED`，不会伪装成最终
  Edge `PASS`；加入 `--require-final-edge` 后，任何阻塞项都会使发布任务失败。
- 对当前固定 Proxy `master@06cd8d5` 的真实检查准确报告四项前置条件：
  `productTarget` 仍是 legacy、正式 HTTPS Gateway 地址未冻结、生产 Edge 文件缺失、
  macOS Keychain store 缺失。
- T116、T118 任务复选框继续保持未完成；只有 Black 交付生产 Edge/Keychain、
  冻结中央 HTTPS Gateway、切换发布 pin 并让最终模式实际通过后才能勾选。

### 本轮验证

- `npm --prefix build run typecheck`：通过。
- AI Editor 构建/发布测试：`19 passing`。
- 新增 TypeScript 定向 ESLint：0 告警；3 个 PowerShell 文件语法解析通过。
- `npm run compile`、`npm run core-ci`：通过。
- `npm run gulp vscode-win32-x64-min-ci`：首次仅因本机 PATH 缺少
  `signtool.exe` 失败；临时加入 Windows SDK x64 目录后通过并更新
  `D:\AI_prejoct\VSCode-win32-x64`。
- Windows 默认迁移产品验收：`PASS`，Workbench checksum `10/10`、Proxy payload
  `248` 个文件、模型目录 `20`、`cleanStart=true`。
- `scripts\code.bat` 开发版已实际启动到 Workbench/Agent Host；验收后只关闭本轮
  启动的开发 Code 进程。
- 共享 Proxy `/live` 最终仍为 `ok`，本轮未停止或重启共享 Proxy。

## 51. 2026-07-17 Black 第一轮 Mock 同步回执

- 再次获取并只读核对 Black 远程分支：
  `feature/ai-editor-account-gateway@37e61d9bb6e705c40dc322b7319eb874508d18c2`；
  远程内容与 Black 的阶段 0、阶段 1、阶段 2 说明一致。
- Black 阶段 2的准确性质是“第一轮 Mock 合同交付完成”，其交接文档明确说明真实
  PKCE、Token 轮换、DPAPI/Keychain、组织积分、Provider 路由、管理 session 和
  `/v1/responses` 尚未实现。
- Oscar 侧此前已在 `e415847c4` 完成真实 Black Mock 联调，并在后续提交完成
  T008、T022、T027、T034–T037、T051、T056–T059、T099 和 T110；因此不需要等待或
  重复实现 Black 的第一轮 Mock。
- 2026-07-17 使用隔离 checkout 又复核一次：
  - 五种 Mock 状态全部通过；
  - 无 nonce 的 `/ai-editor/status` 返回 HTTP 401；
  - 只停止本轮 `47920/47921` Gateway/Edge；
  - 共享 `47892` 始终为 PID `18120` 且 `/live=ok`。
- 新增 `specs/002-ai-editor-account-gateway/OSCAR_TO_BLACK_SYNC.md`，作为可直接提供给
  Black 的同步回执，记录：
  - 当前双方分支和 SHA；
  - 第一轮 Mock 联调证据；
  - Black 审计基线之后 `e415847c4`、`400c245b2` 两次合同更新；
  - Black 下一步 T023–T033、T038–T046、T049/T050/T054/T055 的交付顺序；
  - Oscar 后续真实登录、真实 Responses、管理页面和最终 Edge 发布验收动作。
- T112/T113 继续保持未完成；第一轮 Mock 兼容不能替代完整真实链路联合验收。

## 52. 2026-07-17 Oscar 合同、隔离验收与模型刷新前置框架

### 机器可读合同

- 新增 `contracts/fixtures/edge-code-contract.json`，冻结五种安全账号状态、local
  nonce、状态重试、一次性交接、Webview ticket、logout、模型目录和安全错误字段。
- Oscar Mock Edge、合同测试和真实 Black 隔离验收共同消费该 fixture，避免 Markdown
  合同与可执行行为分别漂移；Black 后续服务合同测试应复用同一文件。
- Node 合同/Mock 测试共 `6 passing`。

### 统一隔离验收与清理

- 新增 `scripts/verify-ai-editor-account-gateway.ps1`：
  - 通过现有安全 connector 启动 Black Gateway `47920` 和 Edge `47921`；
  - 验证服务模式、缺失 nonce 的 401、安全状态、重试、handoff 一次性、Webview
    ticket、logout 和 `/v1/models`；
  - 扫描隔离日志，拒绝把 nonce、ticket、Token、密码或 fixture secret 写入报告；
  - 始终只停止隔离 `47920`/`47921`，并输出 `.build/ai-editor-account-gateway/`
    下的脱敏 JSON/Markdown 报告；
  - 比较共享 `47892` 的 PID、`/live`、程序哈希和选定数据哈希。
- 新增注入失败清理测试，证明失败路径仍释放 `47920`/`47921`、生成 `FAIL` 脱敏报告，
  且不改变共享 Proxy。
- Black `feature/ai-editor-account-gateway@37e61d9` 实际验收结果：
  `PASS`、15 项检查、隔离端口全部释放；注入失败清理测试 `1 passing`。

### T048/T090 模型目录刷新框架

- 新增共享模型目录解析/原子刷新 helper，并接入 Codex Agent Host：
  - 支持启动加载和手动刷新；
  - 支持运行中发现新增模型；
  - 解析富模型元数据并去重；
  - 401 或请求失败时立即清空旧可选模型，防止登出后继续显示无权限目录；
  - 登录或服务恢复后可重新加载模型。
- AI Editor Proxy 与 Workbench provider 定向 Electron 测试共 `11 passing`。
- T048/T090 仍保持未勾选：框架已完成，但最终真实 Gateway-backed Edge 验证需等待
  Black 的真实模型/Responses 链路。

### 双构建与安全边界验证

- `npm run typecheck-client`、定向 ESLint、PowerShell 语法和 `git diff --check`：通过。
- `npm run compile`、`npm run core-ci`、`npm run gulp vscode-win32-x64-min-ci`：通过。
- 开发版通过 `scripts/code.bat` 使用隔离 profile 启动到 Workbench renderer。
- Windows 成品验收：`PASS`，Workbench checksum `10/10`、Proxy payload `248`、
  模型目录 `20`、`cleanStart=true`。
- 最终共享 Proxy 仍为 PID `18120` 且 `/live=ok`；未停止、重启或迁移共享
  `47892`。T112/T113 仍等待 Black/Oscar 的完整真实链路联合验收后再勾选。

## 53. 2026-07-17 Oscar Code Mock UI 前置回归

- 新增 `scripts/verify-ai-editor-account-mock-ui.ts` 和
  `npm run verify-ai-editor-account-mock-ui`：
  - 仅当 `47921`、`49231` 空闲时，启动自身的内存 Mock Edge 和隔离
    `scripts\code.bat` profile；
  - 通过 CDP 实际打开 Chat，验证五种安全账号状态及相应的中文安全操作文本；
  - ready 状态验证账号、模型和积分摘要，并验证 `AI Editor 管理` BrowserView 仅打开
    Mock 固定 `/admin#account` 路由；
  - service-unavailable 状态实际触发一次重试；
  - 结束时只清理本轮 Mock 和 Code 进程，记录共享 `47892` PID、`/live` 不变性并输出
    脱敏 JSON/Markdown 报告。
- Mock 同时支持 `/admin`，使 BrowserView 路由可在不依赖 Black Gateway 的情况下进行
  Code 侧回归；它不是生产管理页、不会模拟真实认证或 `/v1/responses`。
- 本机实测结果：`PASS`，9 项检查通过，Mock `47921` 与 CDP `49231` 已释放，共享 Proxy
  保持 PID `18120` 且 `/live=ok`。
