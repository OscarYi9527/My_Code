# Research: AI Editor 产品账号与中央 Gateway MVP

## 1. 三模式迁移策略

**Decision**: 在 `codex_proxy` 中增加显式 `standalone`、`edge`、`gateway` 模式。
standalone 继续使用现有 `src/server.js` 和路由模块；Edge 只实现本机绑定、状态、令牌
刷新和透明转发；Gateway 作为独立 TypeScript 子包复用现有 Provider 路由能力。

**Rationale**:

- master 分支现有行为已经经过真实 ChatGPT/DeepSeek 和熔断回归。
- 直接把当前 Proxy 改造成只支持 Gateway 会破坏现有客户端和迁移路径。
- Edge 安装包必须排除中央数据库、管理 UI 和上游凭据管理依赖。

**Alternatives considered**:

- 整体重写 Proxy：回归面过大，不符合 MVP。
- 新建完全独立 Gateway 仓库：共享路由、模型和 Provider 修复会产生双份代码。
- 在 Code 内直接访问 Gateway：无法让其他本机 Codex 客户端共享产品账号。

## 2. Gateway HTTP 与模块边界

**Decision**: Gateway 使用 Fastify + TypeScript 模块化单体。模块按 auth、
organizations、invitations、credits、audit、providers、routing 拆分，统一在应用组合根
注入数据库、时钟、ID、哈希和日志接口。

**Rationale**:

- 登录、Cookie、流式代理、管理 API、限流和 JSON 验证需要稳定 HTTP 生命周期。
- Fastify 可以在不拆微服务的前提下提供 schema、hook 和插件隔离。
- 模块化单体符合当前规模，后续可按接口拆服务。

**Alternatives considered**:

- 继续在单个原生 `http.createServer` 中堆叠路由：账号和管理 API 数量较大，测试和授权
  容易遗漏。
- 立即拆微服务：部署、事务和本地调试成本与 MVP 收益不成比例。

## 3. SQLite 与 PostgreSQL 数据访问

**Decision**: 使用 Kysely repository layer。开发方言为 `better-sqlite3`，生产方言为
`pg`；领域服务只依赖 repository 接口。迁移分别生成 SQLite/PostgreSQL 可验证脚本，
共享相同的领域约束测试。

**Rationale**:

- 积分、风险、邀请使用次数和 Refresh Token 轮换都需要事务和条件更新。
- Kysely 保留显式 SQL 语义，同时提供 TypeScript 字段检查。
- repository 可以隔离 SQLite 与 PostgreSQL 的锁、时间和 upsert 差异。

**Alternatives considered**:

- 直接 SQL：短期简单，但双数据库和并发结算会快速产生重复分支。
- 重型 ORM：迁移抽象方便，但隐藏锁与原子条件，不利于积分结算审计。
- 在正式环境继续 SQLite：不适合中央多实例和并发写入目标。

## 4. 密码与令牌

**Decision**:

- 密码和临时密码：Argon2id，每条记录独立盐，参数通过配置升级。
- Access Token：5 分钟签名令牌，包含最小 subject/session/audience/expiry 信息。
- Refresh Token：256-bit 不透明随机值；数据库只保存带服务器密钥的哈希、家族、
  前序关系、过期和撤销状态。
- 邀请码、授权码、Webview 票据和本机交接令牌：高熵随机值，只保存服务器密钥哈希，
  单次使用。

**Rationale**:

- 密码需要抗离线破解；随机 Token 不需要慢哈希，但必须避免数据库泄露后直接使用。
- Refresh Token 家族和前序关系用于检测已轮换 Token 重放。
- 短期 Access Token 只存在 Edge 内存，减少数据库和日志传播。

**Alternatives considered**:

- 保存可逆 Refresh Token：数据库泄露即可接管设备。
- 所有凭据都用 Argon2id：高并发 Token 校验成本不必要。
- 长期 Access Token：无法满足管理员撤销和五分钟授权窗口。

## 5. 系统浏览器登录与本机交接

**Decision**:

1. Code 监听随机 `127.0.0.1` 回调端口并生成 state、verifier/challenge。
2. 系统浏览器打开 Gateway 授权页。
3. Gateway 返回一次性授权码；Code 校验 state 后用 verifier 换取设备会话。
4. Code 从 Edge 获取一次性本机 handoff nonce，把 Refresh Token 仅在内存中交给 Edge。
5. Edge 写入 DPAPI/Keychain，Access Token 保留内存；Code 清除临时凭据。

**Rationale**:

- 登录页面可以独立更新，不把密码输入交给 Code Webview。
- PKCE 和随机 state 防止授权码拦截与登录 CSRF。
- handoff nonce 防止任意本机进程向 Edge 静默覆盖账号绑定。

**Alternatives considered**:

- 自定义 URI scheme：需要安装注册、协议劫持保护和额外 macOS/Windows 打包处理。
- 在 Webview 输入密码：扩大密码处理面，不符合已确认的系统浏览器方案。
- Code 永久保存 Refresh Token：与“本机所有应用经 Edge 共用账号”的所有权模型冲突。

## 6. 管理 Webview 会话

**Decision**: Code 通过 Edge/Gateway 申请受 audience、账号、角色、有效期约束的一次性
Webview 票据，并用 `postMessage` 交给已加载的受信任管理页。页面通过 POST 换取
HttpOnly、SameSite 管理 Cookie。关闭标签页时尽力撤销页面会话；服务端短 TTL 负责
崩溃后的最终失效。

**Rationale**:

- URL、历史、Referer 和 localStorage 中不出现产品 Token。
- 页面 JavaScript 无法读取 HttpOnly Cookie 或 Refresh Token。
- Webview 会话与产品设备会话分离，关闭页面不退出本机账号。

**Alternatives considered**:

- URL query/fragment 直接携带 Access Token：容易被日志、截图和脚本泄露。
- 长期 Cookie：标签页关闭或角色变化后权限收敛过慢。
- Code 全原生页面：已记录为 MVP 后待办，当前投入过高。

## 7. 角色与组织授权

**Decision**: API 先认证，再由统一授权策略计算 role + organization scope。repository
查询必须带组织范围；敏感资源不存在和无权限统一返回不泄露资源存在性的错误。最后一个
有效一级管理员保护在事务内执行。

**Rationale**:

- 仅前端隐藏无法防止直接 API 越权。
- 查询层组织过滤降低控制器漏判风险。
- 最后一级管理员保护必须抵抗并发禁用/删除。

**Alternatives considered**:

- 每个路由手写角色判断：容易遗漏。
- 二级管理员读取全量后前端过滤：直接造成跨组织数据泄露。

## 8. 积分、透支和并发风险

**Decision**:

- 每个 Turn 使用客户端生成且 Gateway 校验的幂等 ID。
- 开始前根据模型费率、上下文 Token、最大输出和组织策略计算最坏风险。
- 在单个数据库事务中检查单次透支、累计运行风险和账号状态，并创建运行中 risk row。
- 流结束后按上游 usage 结算；缺失 usage 时使用保守估算并标记 `estimated`。
- 结算写 usage、扣积分、释放风险和记录审计在一个事务内完成。

**Rationale**:

- 允许并发 Turn 时，仅检查当前余额会产生竞态。
- 不预扣用户可见积分符合产品决定，但内部必须保留风险占用。
- 幂等行避免网络重试造成重复扣费。

**Alternatives considered**:

- 串行限制每用户一个 Turn：已被用户明确改为允许并发。
- 开始前直接扣可见积分：不符合已确认体验，且实际 Token 可能差异很大。
- 完成后才检查：无法控制无限并发负余额。

## 9. 审计提取与脱敏

**Decision**:

- 只从结构化 `user` 文本输入和最终 `assistant` 输出文本中提取正文。
- 排除 system/developer、文件对象、图片、推理、工具调用和工具结果。
- 在持久化前执行长度限制和秘密模式遮蔽；保存模型、Token、时间和组织范围。
- 审计正文与匿名聚合分表/分字段管理，正文按组织保留期清理。

**Rationale**:

- Codex 请求包含大量工作区和工具上下文，不能把整个请求当作用户提问保存。
- 保留正文和聚合的生命周期不同。
- 管理员查看正文属于敏感操作，必须有独立审计。

**Alternatives considered**:

- 保存完整请求/响应 JSON：会包含文件、系统提示和工具敏感内容。
- 只保存前 50 字：无法满足已确认的管理员调用内容查看需求。

## 10. 调试与正式发布隔离

**Decision**:

- 使用独立源码 checkout `D:\AI_prejoct\codex_proxy-dev`。
- 统一脚本启动 Gateway `47920`、Edge `47921` 和独立数据目录，执行健康检查并记录 PID。
- 首次空库自动初始化 `admin` 和一次性 bootstrap 密码；密码只输出到前台控制台。
- 只有显式 `--reset-data` 才能清空已验证位于隔离根目录内的数据。
- 正式 Code 构建只打包 Edge 允许清单；Gateway/admin/database 资源进入中央部署制品。

**Rationale**:

- 共享 `47892` 同时供当前 Codex 使用，任何自动停止或源码热替换都会中断开发会话。
- 独立制品清单可以防止中央凭据模块或本机调试数据库进入用户安装包。

**Alternatives considered**:

- 直接修改 `C:\Users\Oscar\.claude\proxy`：进程自动恢复时可能加载半成品。
- 自动复制共享账号：违反已确认的数据隔离和凭据安全决策。
- 在 Code 退出时停止 Edge：会中断其他本机 Codex 客户端。
