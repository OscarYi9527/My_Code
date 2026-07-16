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

## 当前优先级调整（2026-07-15）

- macOS 签名、公证、Intel x64 和 universal 后续打包暂时暂停。
- 当前开发优先级切换为应用内 Proxy 管理、服务器状态检查和 AI Editor 产品账号 MVP。
- 产品账号 MVP 使用本机账号/网关服务和 SQLite 跑通流程，正式环境再迁移中央 HTTPS
  服务和 PostgreSQL。
- 产品账号与管理界面的 MVP 由 Gateway 提供 Web UI，Code 通过固定地址、无通用浏览器
  控件的“AI Editor 管理”专用 Webview 标签页内嵌。
- 管理入口位于 AI Editor 左下角用户头像/用户信息菜单；普通用户和管理员复用同一
  标签页，由 Gateway API 按账号角色和组织强制授权。
- Code 使用已登录设备会话向 Gateway 申请一次性短期 Webview 票据，并由管理页面通过
  POST 换取 HttpOnly 会话；产品 Token 不进入 URL、Webview localStorage 或页面脚本，
  Refresh Token 不向 Webview 暴露。
- 关闭“AI Editor 管理”标签页只结束对应的短期管理页面会话，不退出本机产品账号；
  再次打开时由 Code 自动申请新票据，无需用户重新登录。
- AI 消息输入框下方只向普通用户显示“AI 服务正常、需要登录、账号不可用、服务暂不
  可用”等安全汇总状态；端口、Provider、路由、熔断、凭据和底层诊断只允许一级
  管理员在管理页面查看。
- 状态栏提供上下文操作：需要登录时进入登录；账号不可用时打开“我的账号”；服务
  暂不可用时允许重试并显示脱敏错误编号；服务正常时只展示账号、当前模型和可用积分
  摘要；一级管理员额外显示“打开系统诊断”。
- Code 启动、窗口恢复和每 30 秒后台刷新账号/服务状态，并在每个新 Turn 发送前强制
  检查；同时提供手动重试。状态变化不强行中断已经运行的 Turn。
- 专用管理 Webview 只允许导航到配置的 Gateway 管理源；登录、帮助等外部链接交给
  系统默认浏览器，并阻止 Webview 内任意跨源跳转、新窗口和未经允许的下载。
- 调试版 Gateway 地址固定为 `http://127.0.0.1:47920`，只允许开发启动参数覆盖；
  正式版固定使用产品中央 HTTPS Gateway 地址，普通用户不能修改，避免绕过产品登录、
  权限和计费。
- 正式 Code 安装包只携带本地 Edge Proxy，不在普通用户电脑部署中央 Gateway、账号
  服务或管理 Web UI；调试阶段才由统一脚本在开发机同时启动 Gateway `47920` 和隔离
  测试 Edge `47921`，共享 Proxy `47892` 保持不变。
- Oscar 已完成 T022 发布白名单分离：构建清单分别定义迁移期 standalone、Edge 和
  Gateway target，Edge 不能包含 Gateway、管理后台、Provider route、凭据仓库或数据库
  资源，并以 `--workspaces=false` 防止安装 Gateway 依赖。当前固定发布输入仍是
  `codex_proxy 2.2.1`，因此 `productTarget=legacy-standalone`；只有 Black 的生产 Edge
  和真实响应链路稳定后，T047/T116 才允许把正式产品切换到 `edge`。
- `codex_proxy` 保留现有 standalone 管理页和兼容链路；同一仓库新增 React +
  TypeScript + Vite 管理前端，构建后由 Gateway 作为静态资源提供，不整体重写现有
  Proxy 主体。
- Gateway 新增的账号、组织、积分、审计和网关模块使用 TypeScript 编写并编译为
  JavaScript；现有 standalone Proxy 暂不整体迁移，通过兼容适配层复用路由能力。
- 统一调试脚本检测到空数据库时自动初始化一级管理员，并只在当前控制台显示一次随机
  强密码；后续启动不得重置数据，只有显式、带警告的 `--reset-data` 才能清空隔离的
  调试数据库。
- 初始一级管理员固定登录名为 `admin`，初始化时生成一次性 bootstrap 临时密码且不要求
  真实邮箱；首次登录必须立即设置正式密码并填写邮箱。MVP 保存邮箱但暂不验证，后续
  接入邮箱验证后再要求完成验证。
- 用户正式密码和一次性临时密码只保存 Argon2id 哈希；邀请码、授权码、Webview 一次性
  票据和 Refresh Token 只保存带服务器密钥的哈希，不在数据库中保存可直接使用的明文。
- 隔离 Gateway `47920` 不自动读取、复制或迁移共享 Proxy `47892` 的上游账号与密钥；
  MVP 测试由一级管理员在新管理页面重新登录 ChatGPT，并重新填写 API/Relay 凭据。
- 已建立完整功能规格、技术计划、数据模型、接口合同、验收指南和 120 项实施任务，见
  `specs/002-ai-editor-account-gateway/`；实现按登录门禁、中央模型链路、组织与积分、
  Provider 管理、安全审计四个垂直切片推进。
- Oscar 已完成 Code 账号 IPC、系统浏览器 PKCE 壳层、30 秒状态刷新和新 Turn
  fail-closed 门禁，并完成 Black `feature/ai-editor-account-gateway@84ab644` 第一轮
  Mock 合同适配。开发态账号请求使用 Electron-main 独占的
  `X-AI-Editor-Local-Nonce`，logout 204 和 handoff acknowledgement 后重新刷新安全
  状态。
- Oscar 已完成账户菜单、安全状态操作、受限单实例管理 BrowserView、退出登录与
  password-required 入口（T051、T056–T059、T099）。管理票据只在 Electron main
  获取并注入，Workbench renderer 不接收票据；管理页关闭时按 `/api/v1/webview/session`
  最佳努力撤销会话、清理临时存储并销毁私有 BrowserView。
- 下一 Oscar 顺序调整为：等待 Black 完成真实认证 T023–T033 后执行登录端到端；等待
  Black 完成 `/v1/responses` T038–T046 后再执行 T047、T048 和 T090，避免提前切换
  Edge 导致 AI 对话不可用。双方下一次同步点是本轮 Webview bootstrap envelope 与
  `/api/v1/webview/session` 合同确认。
- 当前 Windows 中间成品尚未配置正式 HTTPS `aiEditorAccountGatewayOrigin`，因此继续
  显示原生“账户”入口且不实例化账号服务、不轮询共享 Proxy；待中央 Gateway 地址冻结
  后再启用成品账户 UI，禁止为本地演示静默写入不安全 HTTP 地址。
- `aiEditorProxyBundled=true` 作为 AI Editor 产品标记：首次启动不显示 GitHub Copilot
  官方登录 Onboarding，标题栏也不注册官方 `Sign In` 主动入口；第三方扩展明确发起的
  按需 Authentication 授权能力仍保留，不影响本地编辑功能。
- Oscar 已完成 T110 账号边界回归：并发登录使用相互隔离的随机 loopback 回调端口；
  Unicode/空格 nonce 路径、重复登录点击、回调超时、Edge 进程退出和主进程 IPC
  不可用均返回稳定的 fail-closed 状态，不泄露底层网络或进程错误。
- Code 原生账号管理界面延期到 MVP 后评估，见
  `AI_EDITOR_POST_MVP_NATIVE_ACCOUNT_UI_TODO.md`。
- 上游凭据的信封加密延期到 MVP 验证后实施，具体边界、迁移和发布阻断条件见
  `AI_EDITOR_POST_MVP_ENCRYPTION_TODO.md`。

## 已完成的发布资源闭环

### G01 Proxy 运行时制品（Windows + macOS arm64 已完成）

- [x] 以独立仓库 `OscarYi9527/codex_proxy` 为源码来源。
- [x] 构建时生成不包含配置、账号、日志和备份的干净运行时制品。
- [x] 制品包含 `src/`、`package.json`、生产依赖、许可证、版本和逐文件校验值。
- [x] Windows 成品将制品放入 Code 可发现的 `ai-editor-proxy` 目录。
- [x] 发布构建拒绝未提交的 Proxy 工作树，不能静默复制个人运行目录。
- [x] macOS arm64 成品接入并验证对应制品。

### G02 安装与升级（Windows + macOS arm64 已完成）

- [x] Windows 用户级/系统级安装器安装 Code、Codex Agent Host 运行时、中文语言包和
  Proxy。
- [x] 产品和安装器打包均强制校验 Proxy 平台、清单、文件集合和逐文件 SHA-256。
- [x] 首次启动自动复用健康 Proxy；不存在时后台启动安装包内 Proxy。
- [x] Windows 重复安装/升级替换旧 Proxy 程序文件，不覆盖用户的账号、API Key、
  统计、配置和备份。
- [x] macOS arm64 `.app`/DMG 完成同等的制品、后台启动和退出后常驻验证。

### G03 发布验收（Windows + macOS arm64 未签名候选已完成）

- [x] 使用正式用户级安装器，在无预装 Proxy、空 Code 用户目录和空 Proxy 数据目录完成
  Windows 首次启动。
- [x] 验证 `/live`、`/ready`、`/v1/models`、`/v1/responses` 和 `/admin`。
- [x] 验证 ChatGPT Subscription `gpt-5.6-sol` 和非订阅
  `deepseek-v4-pro` 的真实流式回复。
- [x] 汇总既有模式切换、会话恢复、中断恢复结果，并重新校验 Windows 产品完整性。
- [x] 生成成品/安装器资源与版本清单、SHA-256 报告，并补齐 Proxy 生产依赖第三方声明。
- [x] macOS arm64 在标准 GitHub Hosted runner 完成未签名 `.app`/DMG 同等级发布验收。

### 下一平台阶段

- [ ] 使用 Apple Developer ID 完成签名、公证，并在公证后重新执行资源验收。
- [ ] 在 Intel macOS 环境完成 x64 成品同等级验收。
- [ ] 在 x64、arm64 都通过后生成并验证 universal 发布候选。

## MVP 后反馈项

- “文件编辑器是否固定避开 AI Chat 编辑器组”暂不修改，待 MVP 用户反馈后决定。
- 将普通用户高频账号操作改造为 Code 原生 Workbench 界面，复杂管理能力继续使用
  Gateway Web UI；具体范围见 `AI_EDITOR_POST_MVP_NATIVE_ACCOUNT_UI_TODO.md`。
- `server/` 旧登录/邀请码原型不属于当前 External Proxy MVP 启动链路。
