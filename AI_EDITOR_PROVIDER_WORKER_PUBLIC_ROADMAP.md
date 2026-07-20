# AI Editor Provider Worker 与公网演进路线图

更新时间：2026-07-20
状态：PW0/PW1 已完成；PW2 的 ChatGPT 订阅账号池、持久化 execution/outbox、
签名用量对账与结算确认已完成自动化隔离验收，等待专用真实测试账号联合验收；
尚未购买服务器或公网部署

## 1. 已确认的决策

1. `codex_proxy` 继续使用同一仓库，不为 Provider Worker 新建第二套仓库。
2. 新增显式运行模式 `provider-worker`，并生成与 Edge、Gateway 分离的发布制品。
3. 本地开发默认使用：
   - Gateway：`127.0.0.1:47920`
   - Edge：`127.0.0.1:47921`
   - Provider Worker：`127.0.0.1:47930`
   - 共享 standalone Proxy：`127.0.0.1:47892`，开发期间不得被修改或重启。
4. 国内 Gateway 负责产品账号、组织、积分、风险、审计和路由决策。
5. 境外 Provider Worker 只负责被授权的境外 Provider 调用、流式转发、账号池调度、
   冷却、熔断及实际用量回报；它不是通用 VPN 或公开代理。
6. 国内 Provider 继续由 Gateway 直连，不绕行 Provider Worker。
7. ChatGPT 订阅通道已经具备并继续保留以下产品行为，不作为新功能重复开发：
   - 一级管理员总开关；
   - 上游账号是否参与路由的开关；
   - 自动冷却、故障摘除和恢复；
   - “试验通道”标识；
   - 不承诺可用性，故障不得拖垮国内模型和其他 API Provider。
8. 订阅通道迁移到 Worker 时必须通过兼容回归，不能改坏现有账号选择、额度保护、
   冷却和熔断逻辑。
9. Cloudflare Tunnel、Clash 等仅可用于预发布连通性试验，不进入正式生产依赖。
10. 正式用户仍按“邀请码封闭测试 → 10 人 → 30 人 → 100 人”分批开放。
11. **MVP 首次发行最多开放 30 人，1–30 人执行短期单 Gateway + 单 Worker 方案。**
12. 第 31 个用户进入前必须完成长期架构的核心门禁；不能在短期单机架构上直接扩到
    100 人。

## 2. 目标架构

### 2.1 30 人以内公网 MVP 短期架构

```text
AI Editor / 其他本机 Codex 客户端
  → 用户本机 Edge
  → 国内 HTTPS/WAF
  → 国内中央 Gateway
      ├─ 产品账号、组织、邀请码、积分、审计
      ├─ 国内 Provider 直连
      └─ mTLS + 单次请求签名
           → 境外 Provider Worker
               ├─ OpenAI API 等获准的境外 Provider
               └─ ChatGPT 订阅试验通道账号池
```

1–30 人短期基础设施：

- 一台国内云主机运行 SafeLine、Gateway 和必要的服务组件；
- PostgreSQL 使用独立数据库和独立数据卷；预算允许时优先使用托管 PostgreSQL；
- 一台位于 Provider 官方支持地区、具备固定公网 IP 的境外 Worker；
- Gateway 与 Worker 之间使用 mTLS、短期签名、时间戳、nonce 和 Turn 幂等 ID；
- 管理页面仍从 AI Editor 左下角“AI Editor 账户”进入，普通用户不能访问 Worker；
- Worker 公网只开放 Gateway 所需的 HTTPS 入口，不开放通用 HTTP/SOCKS 代理。
- 短期架构允许 Gateway、SafeLine 和 PostgreSQL 位于同一台国内云主机，但 PostgreSQL
  必须使用独立数据卷、最小权限和异机加密备份；
- 单 Gateway 或单 Worker 故障会造成对应服务暂时不可用，因此该阶段是邀请码 MVP，
  不承诺高可用 SLA；
- 用户数量硬上限为 30，达到上限后停止发放新邀请码，直到长期架构核心门禁通过。

### 2.2 31–100 人及后续长期生产架构

```text
国内 DNS / 托管 WAF / Anti-DDoS
  → 国内负载均衡
      → Gateway A
      → Gateway B
          ├─ 托管 PostgreSQL 主备
          ├─ Redis（短期状态、nonce 和限流）
          ├─ 审计/备份对象存储
          └─ Provider Worker 调度器
                ├─ Worker Pool A（Provider 支持地区）
                └─ Worker Pool B（第二地区/灾备）
```

长期增加：

- Gateway 至少两个实例，滚动升级时不停止全部 AI 请求；
- PostgreSQL 托管主备、时间点恢复和跨区域加密备份；
- Redis 保存短期 nonce、幂等状态、分布式限流及实例协调，不保存长期产品凭据；
- Provider Worker 至少两个实例，可按 Provider、地区和健康状态调度；
- Worker 使用所在云的 KMS/Secret Manager 保存上游凭据；
- Gateway 只保留 Provider 元数据和凭据引用，不持久化完整境外上游凭据；
- Worker 使用持久化 outbox 回报实际用量，网络中断后可与 Gateway 对账；
- 托管 WAF/CDN/Anti-DDoS 逐步替代单机 SafeLine；
- 增加集中指标、日志、链路追踪、告警、灾难恢复和密钥轮换。

长期架构分两层执行：

1. **31–100 人强制核心层**：双 Gateway、负载均衡、托管 PostgreSQL 主备、Redis、
   至少两台 Worker 或一主一热备、集中监控告警、自动备份恢复和滚动升级。
2. **100 人后增强层**：多地区 Worker、托管 WAF/CDN/Anti-DDoS、跨地域灾备、完善
   outbox/inbox 对账、7×24 小时运维和按实际负载拆分服务。

即使 30 人阶段运行稳定，也不能跳过第一层直接继续增加用户。

## 3. 代码组织

建议在 `codex_proxy` 内形成以下逻辑边界，实际目录以稳定分支现状为准：

```text
src/
  edge/
  standalone/
  provider-runtime/          # Provider 调用与响应规范化的共享内部模块

gateway/
  src/
    auth/
    organizations/
    credits/
    audit/
    routing/
    provider-worker-client/

provider-worker/
  src/
    server/
    internal-auth/
    providers/
    subscriptions/
    streaming/
    circuit-breaker/
    credential-store/
    usage-outbox/
```

### 3.1 必须共享的代码

以下能力应从现有 Proxy 提取或以内部模块复用，不能在 Worker 中另写一套不兼容实现：

- Responses、Chat Completions 和 Anthropic/DeepSeek 转换；
- SSE 流式事件处理；
- `function_call.id=fc_*` 与原始 `call_id` 兼容规则；
- Provider 错误分类与日志脱敏；
- 订阅账号选择、健康、并发、冷却、保护线及熔断；
- 模型目录去重和 Provider 能力映射。

### 3.2 发布制品边界

必须生成独立目标：

```text
edge
gateway
provider-worker
standalone
```

`provider-worker` 制品不得包含：

- Gateway 用户、组织、邀请码和积分数据库模块；
- React 管理后台；
- 产品账号密码、Refresh Token 或 PKCE 登录服务；
- Code 或 Edge 运行资源；
- 国内 Provider 凭据。

`edge` 制品不得包含 Worker、Gateway、Provider 凭据仓库或管理后台。

## 4. Gateway 与 Worker 内部合同

在编码前先冻结内部合同，建议至少包含：

1. Worker 健康和能力目录；
2. Provider 模型目录同步；
3. Responses/Chat Completions 流式执行；
4. Turn 取消；
5. Turn 状态与幂等结果查询；
6. 实际 Token 用量和结束原因回报；
7. Provider/账号池脱敏健康摘要；
8. 一级管理员触发的凭据导入、更新、撤销和轮换。

每次调用至少携带：

```text
request_id
turn_id
timestamp
expires_at
nonce
gateway_id
匿名 user_id / organization_id
允许的 Provider 和模型
请求体摘要
签名
```

安全要求：

- mTLS 双向证书认证；
- 单次请求签名有效期建议不超过 60 秒；
- nonce 只能使用一次；
- `turn_id` 保证网络重试不会重复调用或重复结算；
- Worker 不接收用户邮箱、密码、邀请码和产品 Refresh Token；
- Worker 返回的用量记录也必须签名；
- 请求正文、API Key、订阅 Token、系统提示词及敏感工具输出不得进入日志。

## 5. 凭据生命周期

### 开发阶段

- 只使用 Mock Provider 或专用测试凭据；
- 数据目录与共享 `47892` 完全隔离；
- 不复制现有共享 Proxy 的真实账号和 Token；
- 本地密钥文件必须被 Git 忽略。

### 公网邀请测试前

- 完成 AES-256-GCM 信封加密；
- 主密钥来自 KMS 或部署 Secret，不写入数据库和镜像；
- 明文凭据完成幂等迁移并删除；
- Gateway 管理 API 不回显完整凭据；
- Worker 凭据仓库和 Gateway 产品数据库分离；
- 完成密钥轮换、篡改、备份恢复和秘密扫描。

完整门禁继续以
`AI_EDITOR_POST_MVP_ENCRYPTION_TODO.md` 为准。任何真实凭据仍为
`plaintext-v1` 时，不得开放公网用户。

## 6. 分阶段实施计划

工期均为粗略开发日，不包含域名备案、采购审核和外部 Provider 审核等待时间。

### PW0：架构与合同冻结（1–2 日）

工作：

- 审计当前 Gateway 与 Provider 适配器；
- 定义 `provider-worker` 模式、内部 API、错误码和发布边界；
- 定义国内直连/Worker 路由字段；
- 建立 Mock 请求、SSE、取消、幂等和用量 fixtures；
- 确认现有订阅通道行为的兼容测试清单。

退出门禁：

- Oscar 与 Black 确认合同；
- 不改动共享 `47892`；
- 不需要购买境外服务器。

### PW1：本地 Provider Worker Mock（3–5 日）

工作：

- 本地 `127.0.0.1:47930` 启动、停止和健康检查；
- Gateway 与 Worker 的 mTLS 测试证书；
- 请求签名、时间窗口、nonce 防重放；
- SSE 透传、取消和背压；
- Turn 幂等与模拟用量回传；
- Gateway 断线、Worker 重启和重复请求测试；
- 单独的 Worker 发布目标和制品泄漏检查。

退出门禁：

- 全部使用 Mock Provider；
- Worker 制品不包含 Gateway/Edge 禁止内容；
- 无需购买境外服务器。

### PW2：复用真实 Provider Runtime（3–6 日）

工作：

- 提取并复用现有 Provider 调用、转换和流式逻辑；
- 接入 OpenAI API 等获准 API Provider；
- 迁移 ChatGPT 订阅试验通道账号池；
- 保留管理员开关、账号参与路由、自动冷却、熔断和试验标识；
- 国际通道不可用时，国内 Provider 和产品账号服务继续可用；
- 完成跨 Provider 工具历史专项回归；
- 持久化 execution/outbox、签名用量回执、Gateway 幂等结算和确认重试。

退出门禁：

- 本地或隔离网络中真实 Provider 回应通过；
- 订阅通道行为与现有 Proxy 一致；
- 只使用专用测试账号，不进入公开生产。

**人工事项预告**：进入本阶段真实链路验收前 7 天，需要准备获授权的测试 Provider
凭据；如需新购 API 额度或测试订阅，由 Oscar 人工完成，AI 不自动购买。

### PW3：生产安全与数据门禁（8–16 日，可与 PW2 后半段并行）

工作：

- 信封加密、KMS/Secret Manager、明文迁移和密钥轮换；
- PostgreSQL 生产配置、最小权限和连接加密；
- Worker 凭据仓库隔离；
- 秘密扫描、日志脱敏和审计；
- 加密备份、恢复演练；
- mTLS 生产证书签发和轮换；
- 防重放、限流、熔断和失败注入测试。

退出门禁：

- `AI_EDITOR_POST_MVP_ENCRYPTION_TODO.md` 的公网阻断项全部关闭；
- 数据库、日志、API 和备份均扫描不到测试明文凭据；
- 完成一次备份恢复和一次 Worker 密钥轮换演练。

**人工事项预告**：进入本阶段前 7–14 天，需要选定并开通 KMS/Secret Manager、
对象存储备份和生产 PostgreSQL 方案。

### PW4：预发布部署（3–5 日，随后至少 72 小时稳定性测试）

工作：

- 部署单实例国内 Gateway 和单实例境外 Worker；
- 配置固定 DNS、HTTPS、SafeLine、mTLS 和 IP/网络访问控制；
- 验证三网访问、20 个并发 SSE、单连接 30 分钟；
- 验证 Worker 断开只关闭境外模型；
- 验证升级、重启、回滚、告警和备份。

预发布入口可短期试验 Cloudflare Tunnel，但不能因此跳过正式域名、HTTPS、备案和
生产入口验收。

退出门禁：

- 连续 72 小时无阻断性故障；
- 20 个并发 Turn 不重复调用、不重复扣费；
- Worker 故障不影响登录、管理页和国内 Provider；
- Code 固定正式 Gateway origin 后通过 Windows 成品验收。

**人工事项预告**：进入本阶段前至少 7 天，需要境外固定 IP Worker 云主机；正式
国内入口如涉及 ICP，应提前 30–45 天启动域名、云主机和备案流程。

### PW5：邀请码公网 MVP（短期架构，硬上限 30 人）

放量顺序：

1. 内部账号；
2. 10 个邀请码用户，至少观察 3–7 天；
3. 30 个用户，至少观察 7 天；
4. 达到 30 人后停止发放新邀请码，不允许在短期架构上加入第 31 个用户。

每次扩容前检查：

- 登录成功率、SSE 中断率和 P95 首 Token 延迟；
- Provider 可用率和订阅账号冷却比例；
- 幂等冲突、重复调用和用量对账差异；
- 负积分、风险占用和结算一致性；
- 数据库、CPU、内存、磁盘和带宽；
- 告警、备份和恢复是否有效；
- 用户隐私说明和跨境数据提示是否满足上线要求。

ChatGPT 订阅通道在所有阶段继续标记为试验通道，不作为扩大用户数量的唯一前提。

如果产品确定会超过 30 人，应在 10 人阶段稳定后立即开始 PW6 的采购和部署准备，
不必等待人数实际达到 30。

### PW6：长期高可用演进（第 31 个用户前完成核心层）

#### PW6-A：31–100 人强制核心层

1. 增加第二个 Gateway 和国内负载均衡；
2. 迁移到托管 PostgreSQL 主备和时间点恢复；
3. 引入 Redis 和分布式限流/nonce；
4. 增加第二个 Worker 或热备 Worker，执行健康调度和故障切换；
5. 建立集中监控、日志、链路追踪和独立故障告警；
6. 验证 Gateway/Worker 滚动升级不会停止全部 AI 服务；
7. 完成数据库主备切换、Worker 切换和备份恢复演练；
8. 对 100 人目标负载进行至少 7 天预发布压力和稳定性测试。

PW6-A 全部通过并由 Oscar 明确批准后，才能从 30 人扩大到 100 人。

#### PW6-B：100 人后增强层

1. 增加第二地区 Worker，并按 Provider/地区进行健康调度；
2. 使用 outbox/inbox 完成断线后的用量可靠对账；
3. SafeLine 逐步升级或替换为托管 WAF/CDN/Anti-DDoS；
4. 建立跨地域灾备、证书轮换、KMS 轮换和安全响应流程；
5. 邮箱验证、用户自助找回和正式通知服务另行接入；
6. 根据真实负载决定是否拆分账号、计费、审计和路由服务，不提前微服务化。

## 7. 人工购买、订阅和外部流程门禁

| 人工事项 | 最迟启动时间 | 用于阶段 | 是否立即购买 | 备注 |
|---|---:|---|---|---|
| 产品域名及 DNS 控制权确认 | 现在 | PW4/PW5 | 先确认，再购买 | 只能使用 Oscar 实际拥有并可修改 DNS 的域名；第三方订阅服务域名不能使用 |
| 国内云账号实名认证、云主机和 ICP 备案准备 | PW4 前 30–45 天 | PW4/PW5 | 建议尽早启动 | 通常应在同一云厂商准备备案资源，具体条件以厂商当期规则为准 |
| 国内 4 vCPU / 8GB 云主机 | 备案启动时或 PW4 前 | PW4/PW5 | 尚不自动购买 | 建议 Ubuntu Server 24.04 LTS、80–100GB SSD、固定公网 IP、5–10Mbps 起 |
| 境外固定 IP Worker（2 vCPU / 4GB 起） | PW2 真实远程验收前 7 天 | PW2/PW4 | PW1 通过前不买 | 必须位于所用 Provider 官方支持地区，并确认云商允许该业务 |
| Provider API 账户/额度 | PW2 真实验收前 7 天 | PW2 起 | 按测试量购买 | 使用专用测试账户，禁止把凭据提交到 Git、聊天或日志 |
| ChatGPT 测试订阅账号 | PW2 真实验收前 7 天 | PW2/PW5 | 先复用合规的专用测试账号 | 不因架构迁移自动增加账号；根据真实冷却和负载再人工决策 |
| KMS/Secret Manager | PW3 开始前 7–14 天 | PW3 起 | 公网前必须开通 | 国内 Gateway 与境外 Worker可使用各自部署云的 KMS，密钥权限分离 |
| PostgreSQL 生产方案 | PW3 开始前 | PW3 起 | 需人工选择 | 预算允许优先托管主备；自建仅用于封闭 MVP，并要求异机加密备份 |
| 对象存储/异地备份 | PW3 开始前 | PW3 起 | 公网前必须开通 | 设置加密、版本、生命周期和恢复演练 |
| TLS 证书 | PW4 前 | PW4 起 | 通常可免费 | 可使用 ACME；生产环境必须实现自动续期和到期告警 |
| SafeLine | PW4 前 | PW4/PW5 | 开源版无需订阅 | 管理端不得直接公开，仍需云基础 DDoS 防护 |
| 托管 WAF/CDN/Anti-DDoS | 10 人稳定后评估，100 人后原则上启用 | PW5/PW6-B | 30 人内可不买 | 依据攻击流量、三网质量和运维成本升级 |
| 监控与通知服务 | PW4 前 | PW4 起 | 至少启用一种 | 初期可使用云监控和邮件；关键故障应有独立告警通道 |
| 事务邮件服务 | 邮箱验证开发前 | PW6 | 当前不用购买 | 当前邀请码注册仍不验证邮箱 |
| 第二 Gateway、负载均衡 | 10 人稳定且确定扩到 30 人以上时启动，最迟 30 人阶段开始前 | PW6-A | 30 人内可不买 | 第 31 个用户前必须部署并验收 |
| 第二/热备 Worker | 10 人稳定且确定扩到 30 人以上时启动，最迟 30 人阶段开始前 | PW6-A | 30 人内可不买 | 第 31 个用户前必须完成故障切换测试 |
| 托管 PostgreSQL 主备 | 10 人稳定且确定扩到 30 人以上时选型 | PW6-A | 短期可先自建 | 第 31 个用户前完成迁移和恢复演练 |
| Redis | PW6-A 开始时 | PW6-A | 30 人内可不买 | 用于分布式 nonce、限流和实例协调 |

### 人工事项通知规则

从本计划开始，每次开发阶段汇报必须增加一栏：

```text
下一阶段人工门禁：
- 需要 Oscar 操作的购买/订阅：
- 最迟完成时间：
- 未完成时被阻断的任务：
- 当前是否需要付款：是/否
```

规则：

1. 域名备案类事项至少提前 30–45 天提示；
2. 云主机、KMS、数据库、对象存储和 Provider 额度至少提前一个开发阶段提示；
3. 未经 Oscar 明确确认，不执行购买、付费、账号注册、凭据导入或生产切换；
4. 不在聊天中发送订阅 URL、API Key、密码、Token、二维码或 `auth.json`；
5. 采购前必须再次核对实际厂商、地区、价格、续费价和退出/迁移方式；
6. 开发未达到退出门禁时，不以“服务器已经购买”为由提前开放公网。

## 8. 生产发布硬门禁

以下任一项未完成，邀请码用户也不得进入公网生产：

- 正式 Gateway origin 不是用户拥有的备案 HTTPS 域名；
- 上游凭据仍以明文保存；
- Worker 或 Gateway 镜像含有真实凭据；
- PostgreSQL 未切换生产配置或没有可恢复备份；
- Gateway 与 Worker 未启用 mTLS、防重放和 Turn 幂等；
- Worker 暴露通用代理或管理端口；
- 普通用户/二级管理员能看到 Provider、路由、熔断、凭据或系统诊断；
- 订阅通道无法由一级管理员关闭或故障会拖垮其他 Provider；
- Windows 成品未切换并验证正式 Edge target；
- 共享 `47892` 在开发或验收中被误修改；
- 未完成隐私、日志保留和跨境数据处理边界审查。

## 9. 分工

### Black（服务器仓库）

- Provider Worker 模式、内部合同和发布目标；
- Provider Runtime 复用；
- Gateway 调度、mTLS、幂等、用量对账；
- Worker 凭据、账号池、熔断、冷却和安全测试；
- Gateway/Worker 部署、迁移和服务器文档。

### Oscar（Code 产品与人工基础设施）

- Code 正式 Gateway origin 和 Edge target；
- Windows/macOS 产品验收；
- 域名、云账号、备案、云主机、KMS、数据库、对象存储和 Provider 账户的人工决策；
- 邀请码分批放量和产品体验验收。

### 联合门禁

- 内部合同冻结；
- 真实 Gateway ↔ Worker 联调；
- 安全与凭据迁移验收；
- 预发布 72 小时稳定性；
- 10/30 人短期放量批准；
- 30 人到 100 人的长期架构切换批准。

## 10. 当前下一步

`PW0：架构与合同冻结` 和 `PW1：本地 Provider Worker Mock` 已完成，包括：

- `provider-worker` 模式和 `127.0.0.1:47930`；
- HMAC 请求签名、timestamp、正文摘要、Gateway allowlist 和 nonce 防重放；
- Turn 幂等、SSE、取消、状态和完成结果重放；
- Gateway Worker 客户端；
- 真实测试证书 mTLS 握手；
- 三进程隔离脚本和独立 Worker 制品门禁。

PW2 已先按用户决策完成 ChatGPT 订阅账号池迁移和 T135 对账：

- Gateway 通过签名内部接口同步一级管理员配置的订阅账号、路由开关和模型目录；
- Worker 直接复用现有 Proxy 的账号选择、并发租约、额度保护、429 冷却、401/403
  摘除、Token 刷新、SSE、用量提取和跨 Provider 工具 ID 修复；
- Worker 凭据当前仅在内存中保存，不读取或复制共享 `47892` 的账号与配置；
- 管理页继续显示一级管理员总开关、账号参与路由、脱敏健康和“试验通道”提示；
- Worker 已持久化不含正文和凭据的 execution/outbox，用量回执使用独立
  `aieditor-usage-v1` HMAC 签名；
- Gateway 已支持即时确认和每 15 秒后台对账，重启或网络失败不会重复执行上游 Turn；
- 重启前未完成的 Worker Turn 进入 `recovery_required`，禁止静默自动重跑。

下一步可先开发 T136 的本地信封加密、凭据版本和迁移测试；正式 KMS/Secret Manager
适配需要 Oscar 确认国内 Gateway 与境外 Worker 的云平台。专用真实订阅测试账号仍用于
Gateway → Worker → ChatGPT 联合验收。开始使用真实测试凭据或远程 Worker 前，再集中
确认测试账号、Worker 云地区和人工采购时间；当前不安装服务器、不购买云资源、不更改
共享 Proxy。
