# Oscar → Black AI Editor Gateway 同步回执

日期：2026-07-17

## 1. 同步结论

- Black 的阶段 0 和阶段 1 交付已核对，可以继续复用，不需要从旧 `master` 重做。
- Black 的阶段 2 可以确认成“第一轮 Mock 合同交付完成”。
- Oscar 已完成第一轮 Code/Black Mock 联合验收，不再等待这批 Mock 接口。
- 阶段 2不能称为“真实账号链路完成”：真实 PKCE、Token 轮换、DPAPI/Keychain、
  组织积分、Provider 路由和 `/v1/responses` 仍未实现。
- T112/T113 是完整真实链路和共享 Proxy 不变性的最终联合验收，本轮不能勾选。

## 2. 双方同步坐标

```text
My_Code 仓库：
  分支：codex/account-gateway-mvp
  commit：ff20d206c

codex_proxy 仓库：
  分支：feature/ai-editor-account-gateway
  最新文档 commit：37e61d9bb6e705c40dc322b7319eb874508d18c2
  第一轮 Mock 运行时基线：84ab6445bb4b557dc379815776bcd784f34676c1
  依赖基线：feature/custom-api-urls@e3ed1d6

当前合同事实来源：
  My_Code@ff20d206c/specs/002-ai-editor-account-gateway/contracts/
```

Black 的 `AI_EDITOR_GATEWAY_OSCAR_HANDOFF.md` 仍引用旧
`My_Code@788f3921`，后续真实功能开发前需要改为上述最新合同坐标。

## 3. Oscar 已完成的 Code 任务

已完成并推送：

- T008：可注入合同模拟器、安全调试 wrapper 和 Black 隔离栈连接脚本；
- T022：legacy/Edge/Gateway 发布 allowlist 分离；
- T027、T034–T037：账号服务、IPC、系统浏览器回调、状态刷新和新 Turn 门禁；
- T051、T056–T059：左下角产品账号入口、安全状态、管理标签页和导航策略；
- T099：退出登录和强制改密入口；
- T110：并发回调、重复点击、超时和进程故障边界测试；
- T116/T118 基础设施：Windows/macOS 最终 Edge 发布门禁。

当前 Code 正式产品仍使用 `productTarget=legacy-standalone`。Black 未交付真实
Edge `/v1/responses` 前，不允许切换正式发布 target。

## 4. 第一轮 Mock 联合验收证据

Oscar 已使用真实 Black checkout
`D:\AI_prejoct\codex_proxy-gateway-dev@37e61d9` 完成过 Code 联调：

- Gateway `127.0.0.1:47920`、Edge `127.0.0.1:47921` 可隔离启动；
- `logout` 返回 204 后状态变为 `login_required`；
- handoff 返回 `status=completed` 和正数 `bindingVersion`；
- handoff 后状态变为 `ready`；
- `/v1/models` 返回 `gpt-mock`；
- Code Electron main 从受保护 nonce 文件读取 nonce，只放入
  `X-AI-Editor-Local-Nonce`，renderer 不接收 nonce；
- Code 开发版启动和 30 秒刷新未出现 `local_authorization_required`。

2026-07-17 又执行了一轮隔离复核：

- 五种 Mock 状态全部通过：
  `ready`、`login_required`、`account_unavailable`、
  `service_unavailable`、`password_change_required`；
- 不带 nonce 请求 `/ai-editor/status` 返回 HTTP 401；
- 验收结束后只停止 `47920/47921`；
- 共享 Proxy `47892` 始终为 PID `18120` 且 `/live=ok`。

本轮确认的是 Mock 合同兼容性，不包含真实浏览器账号登录、真实管理会话或真实 AI
回复。

## 5. Black 必须同步的合同更新

Black 审计时使用的是 `My_Code@788f3921`。此后合同有两次更新：

### `e415847c4`：按 Black Mock 行为冻结本机合同

- `/ai-editor/*` 使用 `X-AI-Editor-Local-Nonce`；
- handoff complete 返回 acknowledgement，Code 随后刷新安全状态；
- logout 成功返回 HTTP 204，Code 随后刷新安全状态。

Black 当前 Mock 已符合这些行为，只需更新合同基线和交接文档。

### `400c245b2`：管理标签页安全合同

- Webview ticket 只由 Electron main 获取和注入；
- Workbench renderer 只发送私有 view ID 和固定 route，不接收 ticket；
- bootstrap envelope 为 `ai-editor-management-bootstrap` version 1；
- 管理页面验证 `event.source`、固定 Gateway origin、版本和 route；
- 使用隔离的临时 BrowserView session；
- 关闭标签页时尽力调用 `DELETE /api/v1/webview/session`、清理临时存储并销毁 view；
- 管理标签页不能被通用 Browser、扩展或 Agent 上下文发现。

Black 后续 T049、T050、T054、T055 必须按该最新版合同实现，不能继续只返回 Mock
ticket。

## 6. Black 下一阶段应执行

### 第一优先级：真实账号链路

完成 T023–T026、T028–T033：

1. 注册、Argon2id 密码、bootstrap 强制改密；
2. Authorization Code + PKCE；
3. Access Token/Refresh Token 签发、轮换和重放撤销；
4. Edge Windows DPAPI/macOS Keychain 安全存储；
5. 真实一次性本机 handoff 和账号绑定。

交付时提供分支、完整 SHA、任务编号、测试命令、迁移和合同变化。Oscar 收到稳定
commit 后执行真实系统浏览器登录联合验收。

### 第二优先级：真实模型和回复链路

完成 T038–T046：

1. Edge `/v1/models` 和 `/v1/responses` 合同测试；
2. Edge-to-Gateway 身份和流式转发；
3. Gateway 账号/组织/模型预检；
4. 复用现有 Provider adapter；
5. 动态模型目录和真实 Responses 流式完成。

这批任务完成前，Mock `gpt-mock` 不能作为真实模型链路通过证据。

### 第三优先级：真实管理页面

按最新版 Webview 合同完成 T049、T050、T054、T055，提供 HttpOnly 管理 session、
角色导航和普通用户账号页面。

## 7. Oscar 后续动作

- Black 交付 T023–T033 后：验证真实 PKCE、Token handoff、状态刷新、退出和
  DPAPI/Keychain 边界；
- Black 交付 T038–T046 后：执行 T047、T048 和两类 Provider 真实流式回复验收；
- Black 交付 T049/T050/T054/T055 后：验证管理 bootstrap envelope、HttpOnly
  session 和角色页面；
- 只有生产 Edge、真实 Responses、固定中央 HTTPS Gateway 和最终发布门禁全部通过，
  才更新 `build/ai-editor-proxy/release.json` 的 commit 并切换
  `productTarget=edge`。

## 8. 后续每次同步格式

Black 每个集成检查点提供：

```text
codex_proxy 分支：
commit SHA：
完成的 Black 任务编号：
测试命令和结果：
数据库迁移：
API/JSON/状态码变化：
是否修改合同：
已知问题：
```

Oscar 回传：

```text
My_Code 分支：
commit SHA：
完成的 Oscar 任务编号：
Code 测试和构建结果：
实际 Edge/Gateway 地址：
联合验收结果：
共享 47892 不变性：
合同差异：
```

任何 endpoint、字段、状态码或安全语义变化必须先更新
`specs/002-ai-editor-account-gateway/contracts/` 并由双方确认，禁止分别静默兼容两套
合同。

## 9. 2026-07-17 真实认证和 Responses 交付复核

Black 本次已交付并由 Oscar 本机只读复核：

```text
codex_proxy 分支：feature/ai-editor-account-gateway
远程 HEAD：ebd18c6c0a2e781c46405c1e15e81a0aebb2f782
功能提交：5a0b75ffed8893767a4cf466db6c64ca3734d28e（T023–T046）
```

Oscar 在隔离 checkout 对该版本完成根测试 106/106、Gateway 测试 45/45、Admin 测试
1/1、`npm run check`、`npm run release:check` 和 `npm audit`（0 vulnerabilities）。

真实模式无凭据预检结果：

- 缺失本机 nonce 的 `/ai-editor/status`：HTTP 401；
- 带 nonce 的安全状态：`login_required`；
- Mock 控制路由 `/ai-editor/mock/state`：HTTP 404；
- 未登录 `/v1/models` 和 `/v1/responses`：HTTP 401；
- 未触发 Provider，隔离 Gateway/Edge 停止后端口已释放；
- 共享 `47892` 保持 PID `18120`、`/live=ok`。

这证明真实模式的隔离和 fail-closed 前置门禁符合预期，但不代表真实登录、Provider
转发或 SSE 联合验收已经完成。Oscar 将继续 T047 的开发态 Agent Host Edge override
审计；真实 PKCE 登录、隔离 Provider 配置和 T048/T090/T112/T113 的联合验收保持未完成。

### 待 Black 回传的合同动作

Black 最新交接文档仍引用旧 My_Code 合同基线 `0da3497`。当前 Code 合同基线已包含
`contracts/fixtures/edge-code-contract.json`。最终联合验收前请：

1. 更新交接文档至当前合同基线；
2. 在 Gateway/Edge 服务端合同测试中消费该 fixture，或明确给出等价验证的测试和 SHA；
3. 回传相应 commit SHA，不要修改既有 endpoint、状态码或安全语义而未先确认合同。

## 10. 2026-07-17 真实登录后强制改密缺口（需 Black 处理）

### Oscar 实际联调结果

```text
codex_proxy: feature/ai-editor-account-gateway@a066744
mode: real
result: PKCE 登录、授权码回调、Token 交换和 Edge handoff 成功
Edge safe status: password_change_required
Edge safe action: openAccount
```

Code 已按既定产品行为打开固定来源的 `AI Editor 管理` Webview。管理页中的
`AccountPage` 仅显示“请先修改临时密码并完善邮箱”，没有旧密码、新密码和邮箱输入控件，
也没有调用现有 `POST /api/v1/account/password/change`。因此用户无法从
`password_change_required` 进入 `ready`，新 Turn 会一直被正确地 fail-closed 阻止。

### 结论与请求

- 这不是 Code 登录、状态栏或管理 Webview 注入问题；Code 端 `T099` 的
  password-required 入口按预期工作。
- 这是 Black 侧管理页面/密码生命周期缺口：请优先完成 T091、T094、T096、T097 的
  最小闭环，至少交付普通用户本人改密与必填邮箱表单，并在成功后刷新账户状态。
- 不需要修改现有 Edge/Code 合同；可复用已有的
  `POST /api/v1/account/password/change`。如需新增字段、状态码或安全语义，必须先更新
  `contracts/` 并双方确认。
- 验收标准：bootstrap `admin` 登录后在管理 Webview 修改密码和邮箱成功；Code 状态由
  `password_change_required` 变为 `ready`；模型目录可刷新；新 Turn 才允许发送。

## 11. 2026-07-17 登录页视觉优化请求（Black 实施）

登录页位于 Black 仓库 `gateway/src/api/auth-routes.ts` 的 `authorizationPage()`，属于 Gateway
产品页面，不应由 My_Code 静默复制或重写。请在不改变 OAuth/PKCE、表单字段、POST 路径、
错误语义、CSP 或不存储凭据原则的前提下实施以下视觉优化：

- **视觉方向**：简约、专业、智能感；深墨蓝/石墨背景配低对比网格或柔和蓝紫径向光，不使用
  大面积渐变、营销插画或夸张动效。
- **布局**：单一 420–460px 登录卡片；顶部仅保留小型 `AI EDITOR` 标识、标题“登录 AI Editor”
  和一句简短说明。登录表单为默认主操作；邀请码注册折叠为次级区域，避免首屏两个等权表单。
- **输入与按钮**：统一 44px 高度、清晰标签、细边框和键盘 focus ring；主按钮全宽并有 loading/
  disabled 状态；密码字段可提供本地显示/隐藏，不保存密码。
- **反馈与无障碍**：为登录失败、邀请码无效和密码规则错误保留可读错误区域；对比度、焦点顺序、
  `autocomplete`、移动端单列和 `prefers-reduced-motion` 均需保持可用。
- **安全不变项**：不增加第三方字体/分析脚本/远程图片；不使用 localStorage；授权事务 ID 继续仅
  使用现有隐藏字段；不在 URL、页面日志或客户端状态中暴露密码、code、Token 或 ticket。

验收：Windows/macOS 系统浏览器中 360px–1440px 宽度无横向滚动；键盘 Tab 可完成登录；视觉
风格与 AI Editor 管理页一致；认证合同与现有 PKCE 自动化测试保持通过。
