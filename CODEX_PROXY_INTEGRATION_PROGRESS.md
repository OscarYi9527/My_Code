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

- [ ] Windows Code 启动时自动检测并启动本地 Proxy。
- [ ] 未配置上游时显示初始化提示并可打开 `/admin`。
- [ ] Codex Agent Host 只连接 `local_multi_proxy`。
- [ ] 模型列表来自 `/v1/models`，可选择模型并发送请求。
- [ ] AI 回复支持原生流式输出和工具调用。
- [ ] 开发模式与简约模式共用同一个 Codex Thread。
- [ ] Code 重启后恢复当前工作区最近使用的会话。
- [ ] Proxy 中断后按安全策略恢复。
- [x] TypeScript 类型检查通过。
- [x] 新增 Proxy 公共逻辑单元测试通过。
- [ ] Windows 隔离 Electron UI 全链路验证通过。

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
- [ ] E04 仅自动重试可确认未转发的请求。
- [ ] E05 实现“检查状态并继续”恢复流程。
- [ ] E06 验证预先存在的 Git 改动不会被错误归因或覆盖。
- [ ] E07 验证非 Git 工作区文件基线。

### 阶段 F：验证与打包

- [x] F01 TypeScript typecheck。
- [ ] F02 Agent Host/Proxy 服务单元测试。
- [ ] F03 模型目录与路由集成测试。
- [ ] F04 会话恢复和模式切换集成测试。
- [ ] F05 Proxy 崩溃和重启恢复测试。
- [ ] F06 Windows 隔离 Electron UI 验证。
- [ ] F07 更新开发计划、测试文档和安装包资源清单。

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
