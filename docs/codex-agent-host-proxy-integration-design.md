# Codex Agent Host 与本地 Proxy 集成设计

**状态**：阶段 A 设计完成，阶段 B、C 及 D01-D04 已实现

**日期**：2026-07-12

**进度文档**：[`CODEX_PROXY_INTEGRATION_PROGRESS.md`](../CODEX_PROXY_INTEGRATION_PROGRESS.md)

## 1. 目标

```text
AI Editor Chat Editor
→ agent-host-codex
→ CodexAgent
→ codex app-server
→ local_multi_proxy /v1/responses
→ ChatGPT Subscription / OpenAI API / DeepSeek / Relay
```

复用 Code-OSS 原生 Codex Agent Host 的会话、流式响应、工具调用、文件修改、终端和审批能力，只替换模型路由和产品入口。

## 2. 当前 Codex 路由问题

当前 `CodexAgent`：

- 强制使用 `model_provider="vscode-proxy"`。
- 启动内部随机端口 Proxy。
- 要求 GitHub Copilot Token。
- 从 Copilot CAPI 加载模型。
- Workbench 将 `requiresCopilotSignIn` 固定为 `true`。

AI Editor 当前使用普通 `ChatEditorInput.getNewEditorUri()`，不是
`agent-host-codex:/...`，因此还没有接入 Codex Thread。

## 3. 路由设计

内部保留两种模式：

```text
internal-copilot
external-local-proxy
```

AI Editor 产品默认使用 `external-local-proxy`。传给 `codex app-server`：

```text
model_provider="local_multi_proxy"
model_providers.local_multi_proxy.name="Local Multi-Upstream Proxy"
model_providers.local_multi_proxy.base_url="<proxyBaseUrl>/v1"
model_providers.local_multi_proxy.wire_api="responses"
model_providers.local_multi_proxy.requires_openai_auth=false
model_providers.local_multi_proxy.supports_websockets=false
```

External 模式不要求 Copilot Token，不启动内部 `ICodexProxyService`，也不调用
Copilot CAPI。

## 4. Proxy 配置与生命周期

设置：

```text
aiEditor.proxy.baseUrl = http://127.0.0.1:47892
aiEditor.proxy.autoStart = true
aiEditor.proxy.diagnostics.enabled = false
```

当前版本只允许：

- `localhost`
- `127.0.0.1`
- `[::1]`

派生端点：

```text
liveUrl   = <baseUrl>/live
readyUrl  = <baseUrl>/ready
modelsUrl = <baseUrl>/v1/models
apiUrl    = <baseUrl>/v1
adminUrl  = <baseUrl>/admin
```

生命周期状态：

```text
Stopped
→ Starting
→ RunningUnconfigured | Ready
→ Degraded
→ Restarting
→ Ready | Failed
```

主进程负责：

- 查找安装包内 Proxy 运行时。
- Windows 隐藏后台启动。
- 复用已占用目标端口且健康的现有 Proxy。
- 定期健康检查。
- 最多三次指数退避重启，随后熔断。
- Code 退出时不终止 Proxy。
- 不把凭据、提示词或文件内容写入 Code 日志。

## 5. 模型

External 模式读取：

```text
GET <proxyBaseUrl>/v1/models
```

解析规则：

1. 优先使用 `models` rich catalog。
2. 缺失时兼容标准 `data` 数组。
3. 保留 Proxy 返回顺序，第一个模型是 Proxy 默认模型。
4. 恢复用户最近选择且仍存在的模型。
5. 模型下线时回退到当前默认模型并通知用户。
6. 请求中的 `body.model` 是最终事实来源。

刷新规则：

1. Code 启动并恢复 Codex Chat Editor 时刷新一次。
2. 每次打开或重新激活 Codex Chat Editor 时刷新一次。
3. AI 窗口标题栏提供“刷新模型目录”按钮。
4. 所有刷新都通过 Codex Agent Host 请求 `GET /v1/models`，不重启 Proxy。
5. 并发刷新合并为同一个请求；刷新失败时保留上一次成功目录。
6. 模型 observable 更新后沿用 `root/agentsChanged` 通知模型选择器。

## 6. 会话

新会话 URI：

```text
agent-host-codex:/untitled-<uuid>
```

恢复顺序：

1. Workbench 已恢复的 Codex Chat Editor。
2. workspace storage 中最近 Session URI。
3. `thread/list` 中工作目录匹配的最近会话。
4. 新建 untitled Codex Session。

开发模式和简约模式只改变布局，不替换 Session URI。

### 6.1 产品窗口形态

- AI 对话承载在 Code 主窗口的 Chat Editor 编辑组内。
- 新建对话默认 URI 为 `agent-host-codex:/untitled-<uuid>`。
- 独立 Agents Window 不作为普通产品入口，不注册其标题栏按钮、命令面板命令、
  会话 handoff 或引导提示。
- 底层多会话列表、Thread 管理和 Agents Window 实现不删除，避免破坏原生会话能力。

### 6.2 鉴权边界

External Local Proxy 模式下，Code 和 `codex app-server` 不要求用户登录 ChatGPT
或 Copilot。`CodexAgent` 不声明受保护的 Copilot 资源，也不调用
`account/login/start`。ChatGPT Subscription、OpenAI API、DeepSeek 和 Relay 的
凭据由本地 Proxy 管理平台持有和使用。

### 6.3 First-open ordering and working directory

The AI Editor must not open an `agent-host-codex:/untitled-*` resource until
the Agent Host contribution has registered the `agent-host-codex` chat-session
type. Both contributions run after workbench restoration, so relying on
registration order creates a race and can make the resource fall through to a
plain text editor.

Before opening a new untitled Codex editor, Code records the current workspace
folder in `IAgentHostNewSessionFolderService`. This guarantees that eager
provisional session creation passes `workingDirectory` to Codex. The folder
picker may override this value in multi-root workspaces.

The initial model control is rendered from the Codex Agent Host custom-model
provider. Its catalog is sourced only from Proxy `GET /v1/models`; general
Workbench/Copilot models are not merged into this session type.

## 7. Turn 基线与恢复

每个 Turn 开始前独立记录：

- 工作目录和会话 ID。
- Git checkpoint 与对话前已有 staged/unstaged/untracked 改动。
- 非 Git 场景中被工具涉及文件的路径、mtime、大小和内容哈希。
- 已运行终端。
- 工具调用 ID、状态和影响资源。
- Proxy request ID 与分发状态。

Proxy 分发状态：

```text
Created
ReceivedByProxy
ForwardedUpstream
ResponseStarted
Completed
FailedBeforeForward
FailedAfterForward
```

只有 `Created` 和 `FailedBeforeForward` 可自动重试。已转发或不确定的请求禁止重放。
恢复操作“检查状态并继续”创建新 Turn，先核对现状，不自动回滚文件，也不重复状态不明的命令。

### 7.1 账号池不可用的快速失败

当 ChatGPT Subscription 账号全部忙碌、冷却或达到安全余量时，Proxy 不返回
Codex 会长期自动重试的 `503`。该本地路由冲突返回非重试型
`409 account_pool_exhausted`，并提示用户打开 Proxy 管理页检查额度/冷却状态或选择
其他模型。短暂的账号并发占用仍可在 Proxy 内部最多等待一分钟；只有确认没有可安全
使用账号时才快速失败。

## 8. 实施顺序

1. Proxy 设置、校验、生命周期和 UI。
2. Agent Host 接收 External Proxy 配置。
3. `CodexAgent` 增加 External 模式并解除 Copilot 鉴权。
4. 从 `/v1/models` 加载模型。
5. AI Editor 改用 `agent-host-codex` Session。
6. 工作区最近会话恢复。
7. Codex Turn baseline。
8. Proxy 请求状态账本。
9. 中断恢复编排。
10. Windows 安装包与完整端到端验证。
