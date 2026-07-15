# AI Editor（Code-OSS）开发计划

## 产品架构

产品基于 Code-OSS 原生 Workbench，不再以 `electron-app/` 原型作为产品主线。

```text
Code-OSS Workbench
→ 内嵌 Codex Chat Editor
→ Codex Agent Host
→ codex app-server
→ http://127.0.0.1:47892/v1
→ codex_proxy 多上游路由
```

核心约束：

- 只允许使用 Codex Agent Host，不接入独立 Agents Window 作为普通入口。
- 普通用户不需要登录 ChatGPT/Copilot；上游凭据由 Proxy 管理平台维护。
- Code 退出时不关闭共享 Proxy。
- 开发版 `out` 与 Windows 成品 `out-vscode-min` 必须同步构建和验证。
- Proxy 只能在用户明确批准后通过 `scripts\restart-ai-proxy.ps1` 安全重启。

## 已完成阶段

### 阶段 1：Code-OSS 与双模式 Workbench

- Code-OSS Windows 构建环境可用。
- `dev` / `simple` 模式服务、持久化状态、切换菜单和二次确认已完成。
- 开发模式保留完整 Activity Bar、Explorer、菜单和编辑能力。
- 简约模式隐藏 Activity Bar、Panel 和 Auxiliary Bar，保留 Explorer、Editor Area。
- 简约模式顶层菜单只保留 `File → Open Folder...`。
- 模式切换期间的布局应用已串行化，避免 Workbench 恢复编辑器时发生并发释放。

### 阶段 2：Codex Agent Host 与本地 Proxy

- Codex Agent Host 随产品启用并作为唯一 AI Provider。
- `codex app-server` 固定连接 External Local Proxy。
- Proxy 默认地址为 `http://127.0.0.1:47892`，高级设置允许本地地址调整。
- 模型目录动态读取 Proxy `/v1/models`，支持启动刷新和手动刷新。
- AI 对话使用原生 Chat Editor，支持流式回复、工具调用和中文 IME。
- Windows 成品随包携带 Codex JS 启动器、平台原生二进制和简体中文语言包。

### 阶段 3：会话与工作区恢复

- 工作区恢复最近使用的 Codex 会话。
- 保留 Codex Agent Host 原生多会话、新建、切换、重命名、归档和删除能力。
- 历史对话入口和“当前文件夹任务”面板已完成。
- 开发模式和简约模式复用同一个 Codex Session URI。

### 阶段 4：安全基线与中断恢复

- 默认工作区可写、工作区外禁止写入、网络关闭、按需审批。
- 每个 Turn 捕获 Git 基线，保留对话前已有 staged/unstaged/untracked 改动。
- 非 Git 工作区安全退化，不覆盖或删除用户文件。
- 记录工具/终端执行状态和 Proxy 请求转发状态。
- 仅确认未转发的请求允许自动重试。
- 不确定或已转发请求使用“检查状态并继续”创建新 Turn 核对现状。

### 阶段 5：Windows MVP 验证

- TypeScript、定向单元测试、开发版编译和 Windows 成品编译通过。
- Windows 成品为中文界面，Codex Chat、Proxy 模型、会话恢复正常。
- 模式切换二次确认、简约布局和简约菜单已通过隔离 Electron UI 验证。
- 产品运行期间复用健康共享 Proxy，不调用危险的管理端重启接口。

## 当前阶段：发布资源闭环

### G01 Proxy 运行时制品（Windows 本地闭环已完成）

- [x] 以独立仓库 `OscarYi9527/codex_proxy` 为源码来源。
- [x] 构建时生成不包含配置、账号、日志和备份的干净运行时制品。
- [x] 制品包含 `src/`、`package.json`、生产依赖、许可证、版本和逐文件校验值。
- [x] Windows 成品将制品放入 Code 可发现的 `ai-editor-proxy` 目录。
- [x] 发布构建拒绝未提交的 Proxy 工作树，不能静默复制个人运行目录。
- [ ] macOS 成品接入并验证对应制品。

### G02 安装与升级（Windows 已完成）

- [x] Windows 用户级/系统级安装器安装 Code、Codex Agent Host 运行时、中文语言包和
  Proxy。
- [x] 产品和安装器打包均强制校验 Proxy 平台、清单、文件集合和逐文件 SHA-256。
- [x] 首次启动自动复用健康 Proxy；不存在时后台启动安装包内 Proxy。
- [x] Windows 重复安装/升级替换旧 Proxy 程序文件，不覆盖用户的账号、API Key、
  统计、配置和备份。
- [ ] macOS 完成同等的制品、后台启动和退出后常驻验证。

### G03 发布验收

- 在无预装 Proxy 的干净 Windows 用户环境完成首次启动。
- 验证 `/live`、`/ready`、`/v1/models`、`/v1/responses` 和 `/admin`。
- 验证至少一个 ChatGPT Subscription 模型和一个非订阅模型。
- 验证模式切换、会话恢复、中断恢复和产品完整性校验。
- 生成安装包资源清单、版本清单和第三方许可证。

## MVP 后反馈项

- “文件编辑器是否固定避开 AI Chat 编辑器组”暂不修改，待 MVP 用户反馈后决定。
- 后续将 Proxy 管理平台集成进 Code；MVP 仍通过本地 `/admin` 打开。
- `server/` 旧登录/邀请码原型不属于当前 External Proxy MVP 启动链路。
