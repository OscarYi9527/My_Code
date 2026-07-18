# Feature Specification: AI Editor 产品账号与中央 Gateway MVP

**Feature Branch**: `[002-ai-editor-account-gateway]`

**Created**: 2026-07-15

**Status**: Approved for planning

**Input**: 为 AI Editor 增加独立产品账号、组织与积分管理，把本地共享 Proxy 演进为
Edge + 中央 Gateway，同时保留 standalone 兼容模式，并把账号管理页面以内置专用标签页
集成到 Code。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 登录后使用 AI，本地编辑不受影响 (Priority: P1)

用户无需登录即可使用文件编辑、终端、Git 等本地能力；发送 AI 消息前必须通过 AI
Editor 产品账号校验。用户从 Code 左下角账户入口调用系统浏览器，以邀请码、邮箱和密码
注册或登录，完成后自动返回 Code。登录状态同时交给本机 Edge，使本机其他 Codex 客户端
也使用同一产品账号。

**Why this priority**: 这是产品账号、统一授权和计费的入口，同时必须确保账号服务故障
不会破坏编辑器的本地价值。

**Independent Test**: 在空白用户数据目录中验证未登录时可编辑文件但不能发送 AI Turn；
完成浏览器登录后，无需重启 Code 即可获得模型并收到 AI 回复。

**Acceptance Scenarios**:

1. **Given** 用户未登录，**When** 用户编辑文件、运行终端或执行 Git 操作，**Then**
   本地功能正常可用。
2. **Given** 用户未登录，**When** 用户发送新 AI Turn，**Then** 请求不被转发，并显示
   “需要登录”和登录入口。
3. **Given** 用户持有效邀请码，**When** 用户在系统浏览器完成注册或登录，**Then**
   浏览器通过一次性授权码返回 Code，Code 自动恢复到已登录状态。
4. **Given** 用户已登录，**When** 任一本机应用调用本地 Edge 的 `/v1` 接口，**Then**
   请求使用当前绑定的产品账号完成中央授权和计费。
5. **Given** 账号服务不可用，**When** 用户尝试发送新 Turn，**Then** 系统安全关闭 AI
   发送并提供重试，不影响本地编辑。
6. **Given** Turn 已经开始，**When** 账号在运行期间到期、被禁用或账号服务暂时不可用，
   **Then** 当前 Turn 允许完成，下一 Turn 被阻止。

---

### User Story 2 - Edge 通过中央 Gateway 统一路由 (Priority: P1)

本机 Edge 不保存任何上游 ChatGPT、API 或 Relay 凭据，只负责绑定本机产品账号并把模型
请求转发到中央 Gateway。Gateway 完成账号、积分、模型和 Provider 校验后再调用上游。
现有 standalone 模式继续工作，便于迁移和回归。

**Why this priority**: 如果上游凭据仍留在用户电脑，产品账号和中央计费可以被绕过，也
无法实现统一 Provider 管理。

**Independent Test**: 使用隔离测试 Edge 和 Gateway，在 Edge 数据目录中确认不存在上游
凭据；配置测试 Provider 后，任一本机 Codex 客户端均可通过 Edge 获取模型并完成回复。

**Acceptance Scenarios**:

1. **Given** Edge 已绑定产品账号，**When** 客户端请求模型目录或发送响应请求，**Then**
   Edge 把请求转发到 Gateway，并由 Gateway 返回该账号可用的模型和结果。
2. **Given** Edge 未登录，**When** 客户端调用 `/v1`，**Then** 返回明确的未登录错误；
   `/live` 和允许的本机管理入口仍可用。
3. **Given** Gateway 中没有可用 Provider，**When** 用户发送 Turn，**Then** 请求快速
   失败并显示可操作的安全错误，不静默改投未经授权的模型。
4. **Given** Proxy 以 standalone 模式启动，**When** 运行现有回归测试，**Then** 当前
   模型、账号池、路由、熔断和管理能力保持兼容。
5. **Given** 调试环境启动，**When** Gateway 与测试 Edge 运行，**Then** 现有共享 Proxy
   的端口、进程、数据和凭据不被读取、复制、修改或重启。

---

### User Story 3 - 在 Code 内查看账号和安全状态 (Priority: P1)

用户从 AI Editor 左下角用户头像或用户信息进入“我的账号”或“AI Editor 管理”。Code
打开单实例专用管理标签页，而不是通用浏览器标签页。普通用户在消息输入框下方只看到
安全汇总状态和上下文操作。

**Why this priority**: 用户需要在产品内完成账号、积分和故障处理，同时不能暴露上游
Provider、端口、熔断或凭据细节。

**Independent Test**: 分别使用普通用户、二级管理员和一级管理员登录，验证左下角入口、
专用标签页、状态栏文案和管理页面菜单严格符合角色权限。

**Acceptance Scenarios**:

1. **Given** 普通用户已登录，**When** 点击“我的账号”，**Then** 打开“AI Editor 管理”
   专用标签页，只显示个人资料、可用积分、设备会话和个人使用记录。
2. **Given** 管理标签页已打开，**When** 用户再次点击入口，**Then** 复用并聚焦原标签页。
3. **Given** 用户关闭管理标签页，**When** 再次打开，**Then** 自动建立新的短期管理会话，
   不要求重新登录产品账号。
4. **Given** 普通用户查看输入框下方状态，**When** 服务正常或异常，**Then** 只显示
   “AI 服务正常、需要登录、账号不可用、服务暂不可用”等安全汇总及对应操作。
5. **Given** 一级管理员查看状态，**When** 需要深入排障，**Then** 可以进入系统诊断；
   普通用户和二级管理员不能访问相同数据或 API。

---

### User Story 4 - 分级管理组织、用户和邀请码 (Priority: P2)

一级管理员管理全部组织、管理员和账号；二级管理员只能管理归属组织内的普通用户、
邀请码和使用情况。普通用户只能管理自己的账号。

**Why this priority**: 这是产品分销、组织隔离和运营管理的基础。

**Independent Test**: 创建两个组织及对应二级管理员，验证每个二级管理员只能查看和修改
本组织用户，越权 API 请求被服务端拒绝并写入审计。

**Acceptance Scenarios**:

1. **Given** 一级管理员，**When** 创建组织、一级管理员或二级管理员，**Then** 操作成功，
   且最后一个有效一级管理员不能被禁用或删除。
2. **Given** 二级管理员，**When** 创建邀请码，**Then** 邀请码固定绑定本组织并带 AI
   权限截止时间和使用次数；二级管理员不能创建跨组织邀请码。
3. **Given** 二级管理员，**When** 查看或修改其他组织账号，**Then** 服务端拒绝请求，
   即使客户端尝试直接调用 API。
4. **Given** 二级管理员，**When** 启用、禁用本组织普通用户或设置其可用积分，**Then**
   操作成功；提升角色、配置 Provider 或修改组织总积分被拒绝。
5. **Given** 新用户，**When** 使用有效邀请码、邮箱和密码注册，**Then** 自动加入邀请码
   所属组织，且账号 `expiresAt` 等于邀请码的 AI 权限截止时间；截止时间已到、无效或
   用尽的邀请码不能注册。

---

### User Story 5 - 按月分配积分并控制并发风险 (Priority: P2)

一级管理员为组织设置月度总积分和模型计费倍率；二级管理员在组织额度内为用户分配
可用积分。用户界面只显示积分，不显示 Provider 成本或隐藏风险参数。运行中的 Turn
按实际 Token 结算，并允许在受控范围内形成负积分。

**Why this priority**: 积分是实际计费单位，必须同时覆盖组织预算、用户分配、长请求和
并发 Turn 风险。

**Independent Test**: 为测试组织和用户配置月度积分、单次透支和累计风险限制，发起多个
并发 Turn，验证预检查、运行中风险占用、实际结算和月底清零。

**Acceptance Scenarios**:

1. **Given** 一级管理员设置组织月度积分，**When** 二级管理员分配用户积分，**Then**
   分配总额不能突破组织可分配范围。
2. **Given** 用户发送新 Turn，**When** 预计最坏成本超过单次最大透支，**Then** Turn
   在上游调用前被拒绝。
3. **Given** 用户存在多个运行中 Turn，**When** 新 Turn 使累计预计风险超过限制，**Then**
   新 Turn 被拒绝，已有 Turn 继续。
4. **Given** Turn 已开始，**When** 实际成本使积分变为负数，**Then** Turn 正常完成并
   结算实际成本，后续 Turn 按新余额和风险规则重新判断。
5. **Given** 新月开始，**When** 月度结算执行，**Then** 上月剩余积分不结转，新月使用
   一级管理员配置的组织月度额度。
6. **Given** 二级管理员或普通用户，**When** 查看积分，**Then** 不显示模型倍率、
   Provider 成本、单次透支或累计风险内部参数。

---

### User Story 6 - 一级管理员集中配置 Provider 和路由 (Priority: P2)

只有一级管理员可以在中央 Gateway 配置 ChatGPT、API 和 Relay 上游账号、模型目录、
路由、熔断和凭据。Edge 和其他角色均不能配置或读取完整上游凭据。

**Why this priority**: 中央 Provider 管理是统一模型供应、故障隔离和成本治理的核心。

**Independent Test**: 使用一级管理员重新配置隔离测试 Provider，验证模型目录动态更新、
真实流式回复和故障诊断；再验证其他角色和 Edge 无法读取或修改 Provider。

**Acceptance Scenarios**:

1. **Given** 一级管理员，**When** 新增或更新 Provider，**Then** 管理 API 永不回显完整
   凭据，只显示脱敏预览。
2. **Given** 二级管理员或普通用户，**When** 访问 Provider、路由、熔断、凭据或系统
   诊断 API，**Then** 服务端拒绝请求。
3. **Given** Gateway 模型配置变化，**When** Code 启动或用户手动刷新模型目录，**Then**
   可选模型与 Gateway 当前授权目录一致。
4. **Given** Provider 发生路由失败，**When** 一级管理员打开诊断，**Then** 可以查看
   脱敏的 Provider 状态、熔断状态和最近路由错误。
5. **Given** ChatGPT Provider 下存在多个上游账号，**When** 一级管理员打开 Provider
   页面，**Then** 每个账号以独立卡片显示真实额度窗口、运行健康、并发、冷却和脱敏标识，
   并可设置是否参与路由、权重、额度保护线及每日请求/Token 上限。
6. **Given** 一级管理员修改账号池策略或账号调度参数，**When** 下一次请求进入 Gateway，
   **Then** Gateway 沿用现有 standalone Proxy 的账号选择、额度保护、冷却和故障切换逻辑，
   且配置在 Gateway 重启后仍然有效。
7. **Given** API 或 Relay Provider 不提供上游余额查询接口，**When** 一级管理员查看该
   Provider，**Then** 页面显示 Gateway 统计的请求、Token 和结算积分，可选显示内部预算
   及剩余额度，并明确标识该预算不是上游官方余额。

---

### User Story 7 - 管理密码和设备会话 (Priority: P3)

用户可以修改自己的密码、查看设备会话并撤销设备。一级管理员可以为忘记密码的用户
生成一次性临时密码。产品登录会话短期授权、长期轮换，并可被管理员即时撤销。

**Why this priority**: 这是账号生命周期和设备失窃处置的基础安全能力。

**Independent Test**: 在两个设备会话登录同一账号，轮换 Refresh Token、撤销其中一个
设备并执行密码重置，验证旧令牌重放和已撤销设备无法继续发送新 Turn。

**Acceptance Scenarios**:

1. **Given** 用户已登录，**When** 修改密码，**Then** 新密码生效，旧密码不能登录。
2. **Given** 一级管理员生成临时密码，**When** 用户使用该密码登录，**Then** 必须立即
   修改密码，临时密码使用后失效。
3. **Given** Refresh Token 已完成轮换，**When** 旧 Token 被再次使用，**Then** 系统
   检测重放并撤销相关设备会话。
4. **Given** 管理员撤销设备或禁用账号，**When** 该设备尝试刷新或发送新 Turn，**Then**
   操作被拒绝。
5. **Given** 本机退出登录，**When** 任一本机应用调用 Edge `/v1`，**Then** 返回未登录；
   其他设备会话不自动退出。

---

### User Story 8 - 审计调用并保护敏感内容 (Priority: P3)

系统记录用于运营和合规的脱敏调用审计，包括用户提问、AI 回复、时间、模型和 Token
用量，但排除文件原文、API Key、系统提示词和敏感工具输出。管理员查看审计的行为本身
也必须被审计。

**Why this priority**: 组织管理员需要了解使用情况，但必须限制敏感代码和凭据泄露。

**Independent Test**: 构造包含系统提示、文件、API Key、工具输出和普通问答的请求，验证
审计只保留允许内容；验证 30 天正文清理和角色隔离。

**Acceptance Scenarios**:

1. **Given** AI Turn 完成，**When** 写入审计，**Then** 保存脱敏用户文本、AI 输出文本、
   调用时间、模型和 Token 用量，不保存系统/开发者消息、文件载荷、推理或工具输出。
2. **Given** 内容包含疑似 API Key、密码或 Token，**When** 写入审计，**Then** 敏感值
   被遮蔽。
3. **Given** 二级管理员查看审计，**When** 查询记录，**Then** 只能看到本组织用户。
4. **Given** 审计正文超过组织保留期，**When** 清理任务运行，**Then** 正文被删除，
   匿名聚合用量保留。
5. **Given** 管理员查看调用正文，**When** 请求成功或被拒绝，**Then** 查看行为写入
   不含秘密正文的管理员审计记录。

### Edge Cases

- 浏览器登录回调端口被占用、回调状态不匹配、授权码过期或被重复使用。
- Code 在领取授权码后、把设备会话交给 Edge 前崩溃。
- Edge 已保存 Refresh Token，但系统安全存储不可用或内容损坏。
- Access Token 过期时多个并发 Turn 同时触发刷新。
- Refresh Token 轮换响应丢失，客户端重试旧 Token。
- 用户在运行 Turn 时切换本机绑定账号或退出登录。
- Gateway 收到重复 Turn ID、客户端断线、上游缺失 Token 用量或流式响应中途失败。
- 组织月度额度变更与多个 Turn 结算同时发生。
- 邀请码最后一次使用发生并发注册。
- 二级管理员被转移组织、降级或禁用时仍持有旧管理会话。
- 管理 Webview 尝试跨源导航、打开新窗口或下载未经允许的文件。
- 数据保留清理与管理员正在查看审计正文同时发生。
- 调试脚本重复启动、残留 PID、端口冲突或健康检查失败。
- standalone、edge 和 gateway 模式使用相同机器时数据目录发生误配置。

## Requirements *(mandatory)*

### Functional Requirements

#### 产品登录与本机账号

- **FR-001**: System MUST 允许未登录用户使用文件编辑、终端和 Git，并在未登录时禁止
  发送新 AI Turn。
- **FR-002**: System MUST 使用系统浏览器完成邀请注册和登录，注册字段为邀请码、邮箱
  和密码；MVP 不执行邮箱验证。
- **FR-003**: 浏览器登录 MUST 使用 PKCE、随机 state、本机随机回调端口和一次性授权码，
  并拒绝过期、重放或状态不匹配的回调。
- **FR-004**: Access Token MUST 在 5 分钟后失效；Refresh Token MUST 滚动有效 30 天，
  每次刷新轮换并检测重放。
- **FR-005**: System MUST 支持多设备会话；连续 30 天未使用、管理员撤销、账号到期或
  禁用后必须重新登录。
- **FR-006**: 一台本机 Edge MUST 同时只绑定一个产品账号；切换账号时允许当前 Turn
  完成，后续请求使用新账号。
- **FR-007**: 退出本机账号后，Edge `/v1` MUST 返回未登录，健康检查和允许的本机入口
  继续可用。
- **FR-008**: Refresh Token MUST 保存在 Windows DPAPI 或 macOS Keychain；Access
  Token MUST 只保存在 Edge 进程内存。
- **FR-009**: AI Editor MUST 通过一次性本机交接把设备会话交给 Edge，不向其他本机
  客户端发放独立产品 API Key。
- **FR-010**: System MUST 在 Code 启动、窗口恢复、每 30 秒、每个新 Turn 前以及手动
  重试时检查账号与服务状态。
- **FR-011**: 账号或服务检查失败 MUST 阻止新 Turn，但 MUST NOT 强制中断已开始的 Turn。

#### Edge、Gateway 与模式兼容

- **FR-012**: Proxy MUST 支持 `standalone`、`edge` 和 `gateway` 三种显式运行模式。
- **FR-013**: standalone 模式 MUST 保持现有模型、Provider、路由、熔断、统计和管理
  行为的回归兼容。
- **FR-014**: Edge MUST 只监听允许的本机接口，不保存上游 Provider 凭据，并使用当前
  产品账号会话转发 `/v1` 请求到 Gateway。
- **FR-015**: Gateway MUST 在调用上游前校验账号、组织、模型权限、积分和风险。
- **FR-016**: 正式 Code 安装包 MUST 只携带 Edge；中央 Gateway、账号服务和管理 Web
  UI 不得部署到普通用户电脑。
- **FR-017**: 调试环境 MUST 使用独立端口和数据目录启动 Gateway 与测试 Edge，且不得
  停止、重启、读取、复制或修改共享 Proxy 的进程、数据和凭据。
- **FR-018**: 隔离 Gateway MUST 由一级管理员重新配置测试 Provider，不得自动导入
  共享 Proxy 的上游账号或秘密。
- **FR-019**: Code MUST 从 Gateway 授权后的模型目录动态展示模型，并支持启动刷新和
  用户手动刷新。

#### Code 状态与专用管理标签页

- **FR-020**: Code 左下角官方账户入口 MUST 替换为“AI Editor 账户”，未登录时提供
  登录和邀请码注册，登录后提供账号摘要、管理入口和退出登录。
- **FR-021**: 普通用户 MUST 能从左下角进入“我的账号”；二级和一级管理员 MUST 根据
  角色获得对应“AI Editor 管理”入口。
- **FR-022**: Code MUST 使用单实例专用管理标签页加载 Gateway 管理 UI，不显示通用
  地址栏、前进或后退控件。
- **FR-023**: Code MUST 使用一次性短期 Webview 票据建立 HttpOnly 管理会话；票据和
  产品 Token 不得写入 URL 或 localStorage，Refresh Token 不得进入 Webview。
- **FR-024**: 关闭管理标签页 MUST 只结束短期页面会话，不退出产品账号；重新打开时
  自动申请新票据。
- **FR-025**: 管理 Webview MUST 只允许配置的 Gateway 管理源；外部登录或帮助链接使用
  系统默认浏览器，并阻止任意跨源导航、新窗口和未经允许的下载。
- **FR-026**: 普通用户状态栏 MUST 只显示安全汇总状态、当前账号、当前模型和可用积分；
  不得显示端口、Provider、路由、熔断、凭据或最近路由错误。
- **FR-027**: 状态栏 MUST 根据状态提供登录、查看账号、重试或脱敏错误编号；只有一级
  管理员可进入系统诊断。

#### 角色、组织、邀请与账号生命周期

- **FR-028**: System MUST 支持一级管理员、二级管理员和普通用户三种角色，并在所有
  管理 API 服务端强制角色与组织授权。
- **FR-029**: 只有一级管理员可以创建组织、创建其他一级管理员、任命或撤销二级管理员，
  且不得禁用或删除最后一个有效一级管理员。
- **FR-030**: 二级管理员 MUST 只能查看和管理本组织普通用户、邀请码、用户积分及组织
  使用情况；不得提升角色、配置 Provider、查看底层计费参数或修改组织总积分。
- **FR-031**: 一级和二级管理员 MUST 能启用或禁用权限范围内的普通用户。
- **FR-032**: 二级管理员 MUST 能创建绑定本组织、带 AI 权限截止时间和使用次数的
  邀请码；新注册账号的 `expiresAt` MUST 使用该截止时间。一级管理员 MUST 能查看和
  撤销全部邀请码。
- **FR-033**: 初始一级管理员 MUST 使用固定登录名 `admin` 和只显示一次的一次性
  bootstrap 临时密码；首次登录必须修改密码并填写邮箱。
- **FR-034**: 用户 MUST 能修改自己的密码；一级管理员 MUST 能生成一次性临时密码用于
  重置密码，用户下次登录必须立即修改。

#### 积分、风险与用量

- **FR-035**: 积分 MUST 是实际结算单位，并按模型、实际输入/输出 Token 和一级管理员
  配置的倍率扣减。
- **FR-036**: 一级管理员 MUST 能设置组织月度总积分；二级管理员 MUST 能在组织范围内
  设置本组织用户可用积分。
- **FR-037**: 月度积分 MUST 在月度边界清零且不结转。
- **FR-038**: 一级管理员 MUST 能设置全局单次最大透支和累计风险默认值，并按组织覆盖；
  普通用户和二级管理员不得查看或修改这些参数。
- **FR-039**: 每个新 Turn MUST 分别通过单次最大透支和账号累计运行中风险检查；系统
  MUST 允许多个并发 Turn。
- **FR-040**: 运行中 Turn MUST 记录不可见的预计风险占用；完成后按实际用量结算并释放
  风险占用。
- **FR-041**: 已开始的 Turn MUST 允许结算为负积分，不得因结算结果中途截断回复。
- **FR-042**: Gateway MUST 使用幂等 Turn 标识避免重试造成重复风险占用或重复扣费。

#### Provider、审计与安全边界

- **FR-043**: 只有一级管理员可以新增、修改或撤销中央 Provider、模型路由和上游凭据；
  管理 API 永不返回完整凭据。
- **FR-044**: 普通用户只能访问自己的账号、积分、模型和 Turn 状态；二级管理员只能
  访问本组织用户与使用情况；一级管理员才能访问 Provider、路由、熔断、凭据和诊断。
- **FR-045**: System MUST 记录脱敏用户提问、AI 回复、调用时间、模型和 Token 用量，
  并排除系统提示词、文件载荷、推理内容、API Key 和敏感工具输出。
- **FR-046**: 二级管理员 MUST 只能查看本组织调用审计；所有管理员查看审计正文的行为
  MUST 被再次审计。
- **FR-047**: 审计正文默认保留 30 天；一级管理员 MUST 能按组织设置 7–180 天，过期
  正文删除后可保留匿名聚合用量。
- **FR-048**: 用户密码和临时密码 MUST 只保存抗离线破解的安全哈希；邀请码、授权码、
  Webview 票据和 Refresh Token MUST 只保存带服务器密钥的哈希并在使用后失效。
- **FR-049**: 日志、错误、诊断、审计和导出 MUST 遮蔽密码、Token、API Key、完整上游
  凭据及其他已识别秘密。
- **FR-050**: MVP 本机 Gateway 可以按已记录的临时边界保存明文上游凭据，但在完成
  `AI_EDITOR_POST_MVP_ENCRYPTION_TODO.md` 前不得公开部署或接入真实生产凭据。

### Key Entities

- **Account**: 产品用户身份、角色、状态、邮箱、有效期和首次登录要求。
- **Organization**: 二级管理员和普通用户的隔离边界、月度积分与风险覆盖配置。
- **Invitation**: 绑定组织、有效期、使用次数和撤销状态的一次性注册凭据。
- **Device Session**: 某设备的长期登录状态、滚动 Refresh Token 家族和撤销状态。
- **Authorization Grant**: 浏览器登录授权码、PKCE、Webview 票据和一次性本机交接。
- **Credit Period**: 组织每月积分池、用户分配、已结算余额和月度边界。
- **Turn Risk**: 运行中 Turn 的预计风险、幂等标识、状态和最终结算关联。
- **Usage Record**: 模型、输入/输出 Token、积分成本、调用时间和结算来源。
- **Audit Record**: 脱敏问答正文、管理查看行为、保留期限和组织范围。
- **Provider Credential**: 一级管理员维护的中央上游凭据及脱敏预览。
- **Model Route**: 模型目录、Provider 路由、倍率和可用状态。
- **Local Binding**: 本机 Edge 当前绑定的产品账号、设备会话和内存 Access Token。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 新用户可以在 3 分钟内从 Code 发起注册、在浏览器完成流程并返回 Code
  发送首个成功 AI Turn。
- **SC-002**: 未登录、账号过期、账号禁用或账号服务不可用时，100% 的新 Turn 在调用
  上游前被阻止，本地编辑、终端和 Git 仍可使用。
- **SC-003**: Code 启动后 10 秒内显示账号与 AI 服务汇总状态；后台状态变化在 35 秒内
  反映到界面。
- **SC-004**: 普通用户和二级管理员对越权管理接口的直接请求 100% 被服务端拒绝，并
  产生不含秘密正文的审计记录。
- **SC-005**: 在 20 个并发 Turn 的测试中，不出现重复扣费、重复风险占用或超过已配置
  累计风险后仍启动新 Turn 的情况。
- **SC-006**: 100% 的已完成 Turn 产生一条幂等用量结算；上游未返回用量时记录明确的
  “估算”标记而不是静默缺失。
- **SC-007**: 安全测试在数据库、管理 API、日志和审计导出中找不到测试密码、Refresh
  Token、授权码、Webview 票据或完整 API Key 明文。
- **SC-008**: 调试脚本可以重复启动和停止隔离 Gateway/Edge，健康检查通过率为 100%，
  且共享 Proxy 的 PID、数据文件哈希和 `/live` 状态保持不变。
- **SC-009**: standalone 模式现有自动化回归全部通过；Edge/Gateway 新代码行覆盖率不
  低于 80%。
- **SC-010**: Windows 开发版和 Windows 成品均通过登录、状态、管理标签页、模型刷新和
  真实流式回复验收；macOS 源码和打包链路没有引入平台专用阻断。

## Assumptions

- 当前 MVP 只在开发机本地运行 Gateway 和 SQLite；正式中央部署、域名、TLS、PostgreSQL
  运维和多实例扩容属于部署阶段。
- 正式版 Gateway 地址由产品配置固定为中央 HTTPS 地址；普通用户不能修改。调试版使用
  固定本机地址，仅开发启动参数可以覆盖。
- Gateway 调试默认地址为 `http://127.0.0.1:47920`，隔离测试 Edge 为
  `http://127.0.0.1:47921`；共享 Proxy `http://127.0.0.1:47892` 不参与开发验证。
- 正式安装包只分发 Edge；Gateway Web UI 由中央 Gateway 提供。
- 管理前端 MVP 使用 Gateway Web UI；把高频账号功能改造成 Code 全原生界面属于
  `AI_EDITOR_POST_MVP_NATIVE_ACCOUNT_UI_TODO.md`。
- 上游凭据信封加密按 `AI_EDITOR_POST_MVP_ENCRYPTION_TODO.md` 延期，但所有其他基础
  认证、哈希、安全存储、脱敏和访问控制要求均属于当前 MVP。
- 非重大实现细节使用项目推荐的安全默认值，不再逐项要求产品确认。
