# AI Editor 产品账号与 Gateway MVP——下一步开发同步

更新时间：2026-07-15

## 一、项目现状

AI Editor 是基于 **Code-OSS** 改造的桌面编辑器，目前 AI 链路已经可以运行：

```text
AI Editor
→ Codex Agent Host
→ 本机共享 Proxy（127.0.0.1:47892）
→ ChatGPT / OpenAI API / DeepSeek / Relay
```

已完成的基础能力包括：

- 开发模式与简约模式。
- Codex Agent Host AI 对话。
- Proxy 动态模型目录和真实模型回复。
- 历史会话恢复与多会话管理。
- 中文界面和中文输入法。
- Windows 成品构建和 Proxy 随安装包分发。

**新一阶段尚未开始正式编码**，目前已经完成产品账号和中央 Gateway 的需求确认、技术
规格及任务拆分。

## 二、名词解释

| 名词 | 解释 |
|---|---|
| **AI Editor** | 我们基于 Code-OSS 开发的编辑器产品。 |
| **Code-OSS** | VS Code 的开源基础版本，是 AI Editor 的界面和编辑器基础。 |
| **Codex Agent Host** | AI Editor 中唯一允许使用的 AI 智能体运行方式，负责会话、工具和文件操作。 |
| **Proxy** | 接收 Codex 请求并选择 ChatGPT、DeepSeek、API 等上游模型的代理程序。 |
| **Provider** | 实际提供模型能力的上游渠道，例如 ChatGPT 订阅、OpenAI API、DeepSeek 或 Relay。 |
| **standalone 模式** | 当前 Proxy 的兼容模式。上游账号和路由都保存在本机，继续用于旧客户端和回归测试。 |
| **Edge Proxy** | 安装在普通用户电脑上的轻量 Proxy。它不保存上游模型账号，只绑定产品账号并转发请求。 |
| **Gateway** | 中央账号和模型网关，负责登录、组织、积分、Provider、模型路由、计费和审计。 |
| **产品账号** | AI Editor 自己的用户账号，与官方 VS Code、ChatGPT、Copilot 账号无关。 |
| **Turn** | 用户发送一条 AI 消息到 AI 完成回复的完整调用过程。 |
| **积分** | 产品实际计费单位，根据模型、输入 Token、输出 Token 和模型倍率计算。 |
| **风险占用** | Turn 运行期间预估的最大积分风险，只用于阻止无限并发透支，不直接显示给用户。 |
| **PKCE** | 系统浏览器登录的安全机制，防止登录授权码被其他程序截获使用。 |
| **Webview** | Code 内嵌网页的容器，用来显示“AI Editor 管理”页面，但不显示普通浏览器地址栏。 |
| **一级管理员** | 全局管理员，可管理所有组织、积分池、Provider、模型路由和系统诊断。 |
| **二级管理员** | 组织管理员，只能管理所属组织的用户、邀请码、用户积分和使用情况。 |

## 三、目标架构

新架构将调整为：

```text
AI Editor / 其他本机 Codex 客户端
→ 本机 Edge Proxy
→ 中央 Gateway
→ ChatGPT / OpenAI API / DeepSeek / Relay
```

Proxy 将支持三种运行模式：

1. **standalone**
   - 保留当前 Proxy 行为。
   - 用于迁移、兼容和回归测试。

2. **edge**
   - 安装到普通用户电脑。
   - 不保存任何上游账号或 API Key。
   - 自动使用本机最近登录的 AI Editor 产品账号。

3. **gateway**
   - 部署在中央服务器。
   - 负责产品账号、积分、Provider、路由和审计。
   - 调试阶段暂时运行在开发者电脑。

## 四、已确认的产品规则

### 1. 登录与本地功能

- 未登录仍可使用文件编辑、终端和 Git。
- AI 对话必须登录产品账号。
- 使用邀请码、邮箱和密码注册。
- MVP 暂不验证邮箱。
- 登录在系统默认浏览器中完成，然后安全返回 Code。
- 每次发送新 Turn 前强制校验账号。
- 每 30 秒后台刷新一次账号和服务状态。
- 账号服务不可用时禁止新 Turn，但不影响本地编辑。
- 已经运行的 Turn 不会因账号状态变化被强行中断。

### 2. 本机账号绑定

- 每台电脑的 Edge 同时只绑定一个产品账号。
- 本机其他 Codex 应用调用 Edge 时，自动使用这个账号。
- 切换账号时允许当前 Turn 完成，后续 Turn 使用新账号。
- 退出登录后 `/v1` 返回未登录，但 Edge 健康检查仍可使用。

### 3. 管理入口

入口位于 AI Editor 左下角的用户头像/用户信息菜单：

- 普通用户：进入“我的账号”。
- 二级管理员：增加组织用户、邀请码和组织使用情况。
- 一级管理员：增加 Provider、路由、积分池和系统诊断。

点击后打开单实例 **“AI Editor 管理”** 专用 Webview 标签页。

### 4. 服务器状态

AI 输入框下方只向普通用户显示：

- AI 服务正常。
- 需要登录。
- 账号不可用。
- 服务暂不可用。
- 脱敏错误编号和重试入口。

端口、Provider、路由、熔断、凭据和最近路由错误只有一级管理员能够查看。

### 5. 积分

- 一级管理员给组织设置月度总积分。
- 二级管理员在组织额度内给用户分配积分。
- 月底清零，不结转。
- 允许多个并发 Turn。
- 每个 Turn 发送前检查单次最大透支。
- 同时检查所有运行中 Turn 的累计风险。
- 已接受的 Turn 可以在完成后把积分扣成负数，但下一 Turn 会重新校验。

## 五、安全规则

- Access Token 有效期 5 分钟，只保存在 Edge 内存。
- Refresh Token 滚动有效 30 天。
- Refresh Token 保存在 Windows DPAPI 或 macOS Keychain。
- 用户密码和临时密码使用 Argon2id 哈希。
- Refresh Token、邀请码和一次性授权码不以可用明文保存。
- Token 不进入 URL、Webview `localStorage` 或日志。
- Webview 只能访问固定 Gateway 地址。
- 外部登录和帮助链接使用系统浏览器。
- 普通用户和二级管理员的权限必须由 Gateway API 强制限制，不能只靠隐藏页面菜单。

### 暂缓项

MVP 调试数据库暂时允许以明文保存上游 Provider 凭据，但：

- 只允许本机调试。
- 不允许部署到公网。
- 不允许接入正式用户或生产凭据。
- 信封加密已记录为 MVP 后强制待办。

## 六、隔离开发环境

开发期间使用：

```text
中央 Gateway：http://127.0.0.1:47920
测试 Edge：    http://127.0.0.1:47921
共享 Proxy：   http://127.0.0.1:47892
```

必须遵守：

- 不停止或重启共享 `47892`。
- 不读取、复制或修改共享 Proxy 的上游账号和密钥。
- 测试 Provider 由一级管理员在新 Gateway 中重新登录或填写。
- 新 Proxy 源码位于：`D:\AI_prejoct\codex_proxy-dev`
- Code 源码位于：`D:\AI_prejoct\My_code`

## 七、团队分工

### Black：服务器部分

Black 主要负责 `D:\AI_prejoct\codex_proxy-dev`：

- 现有开发基线为 `feature/custom-api-urls@e3ed1d6`，不得从旧 master 重置或重复开发。
- 该分支已有管理模块化、额度/成本治理、智能路由、诊断、迁移和拆分测试，需先映射到
  新任务清单并复用。
- Gateway、Edge 和 standalone 兼容模式。
- 登录、Token、组织、邀请码和设备会话。
- SQLite/PostgreSQL、积分、风险和结算。
- Provider、模型路由、熔断和诊断。
- React 管理页面、调用审计和保留期。
- 服务端测试与服务端部署文档。

对应任务：T001–T007、T009–T021、T023–T026、T028–T033、T038–T046、
T049–T050、T052–T055、T060–T089、T091–T098、T100–T109、T111、T120。

### Oscar：Code 组件部分

Oscar 主要负责 `D:\AI_prejoct\My_code`：

- Code 账号服务、IPC 和浏览器登录回调。
- 左下角账户菜单、状态栏和 Turn 门禁。
- 专用管理 Webview 与导航安全。
- Code 与 Edge/Gateway 的连接配置。
- Edge 随产品打包和 Windows 双构建验证。
- Code 测试、checksum、安装包和进度文档。

对应任务：T008、T022、T027、T034–T037、T047–T048、T051、T056–T059、
T090、T099、T110、T114–T119。

### 双方共同负责

- T112：完整隔离 quickstart 联调。
- T113：确认共享 Proxy `47892` 的 PID、状态和数据保持不变。
- 所有接口合同变更必须先由双方确认。
- Black 先提供 Mock/最小 Edge 接口，Oscar 可并行开发 Code，不必等待服务器全部完成。
- 新 Gateway 分支应从 Black 当前稳定分支创建，而不是从 `master@06cd8d5` 创建。

## 八、下一步实施阶段

### 阶段 1：基础环境

对应任务：T001–T022

- 建立 TypeScript Gateway。
- 建立 React 管理前端。
- 建立 SQLite 数据库和迁移。
- 增加三种 Proxy 运行模式。
- 完成统一隔离调试脚本。
- 保证 standalone 现有功能不受影响。

### 阶段 2：首个登录闭环

对应任务：T023–T037

- 邀请码注册。
- 系统浏览器 PKCE 登录。
- Access/Refresh Token 轮换。
- 登录会话安全交接给 Edge。
- Code 启动和每 30 秒刷新账号状态。
- 新 Turn 登录门禁。

**阶段验收：** 未登录可以编辑但不能发 AI；登录后可以发送 AI 请求。

### 阶段 3：中央模型链路与 Code 界面

对应任务：T038–T059

- Edge 转发 `/v1/models` 和 `/v1/responses`。
- Gateway 完成账号和模型校验。
- 左下角“AI Editor 账户”。
- 输入框下方服务器状态。
- 专用“AI Editor 管理”Webview。
- 模型目录动态刷新。

**阶段验收：** Code 和其他本机 Codex 客户端可通过 Edge 使用中央 Gateway。

### 阶段 4：完整业务管理

对应任务：T060–T108

- 组织、用户、邀请码和两级管理员。
- 月度积分、透支和并发风险。
- 中央 Provider、模型和路由。
- 密码重置、设备会话和退出登录。
- 调用审计、脱敏和保留期清理。

### 阶段 5：成品验证

对应任务：T109–T120

- Proxy/Gateway 自动化测试。
- 新代码覆盖率不低于 80%。
- 验证共享 `47892` 全程未变化。
- Code 开发版构建验证。
- Windows 成品构建和安装包验证。
- 确认正式安装包只包含 Edge，不包含 Gateway、数据库或中央凭据模块。

全部完成后，再单独申请是否切换共享 `47892`。

## 九、相关文档

- 完整需求：`D:\AI_prejoct\My_code\specs\002-ai-editor-account-gateway\spec.md`
- 技术计划：`D:\AI_prejoct\My_code\specs\002-ai-editor-account-gateway\plan.md`
- 数据模型：`D:\AI_prejoct\My_code\specs\002-ai-editor-account-gateway\data-model.md`
- 完整任务：`D:\AI_prejoct\My_code\specs\002-ai-editor-account-gateway\tasks.md`
- 验收步骤：`D:\AI_prejoct\My_code\specs\002-ai-editor-account-gateway\quickstart.md`
