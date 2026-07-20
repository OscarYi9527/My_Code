# Gateway ↔ Provider Worker Internal API

版本：`aieditor-v1`
状态：PW0/PW1 基础合同、PW2 ChatGPT 订阅账号池及 T135 持久化
execution/outbox 与结算确认均已实现

## 1. 网络边界

- 本地开发 Worker：`http://127.0.0.1:47930`
- 生产 Worker：只允许独立 HTTPS origin，不允许路径、查询、用户名或密码
- 生产必须使用 mTLS；Worker 只信任指定 Gateway CA
- Worker 不公开 `/v1`、管理页面、通用 HTTP/SOCKS 代理或数据库端口
- `/live` 和 `/ready` 只返回最小健康信息；内部接口必须同时通过 mTLS 和请求签名

## 2. 签名请求头

| Header | 必填 | 说明 |
|---|---|---|
| `x-ai-editor-gateway-id` | 是 | 1–80 字符 Gateway allowlist ID |
| `x-ai-editor-request-id` | 是 | 单次请求跟踪 ID |
| `x-ai-editor-turn-id` | 执行/状态/取消必填 | Gateway 已校验的幂等 Turn ID；模型目录为空 |
| `x-ai-editor-timestamp` | 是 | Unix epoch milliseconds |
| `x-ai-editor-nonce` | 是 | 16–128 字符随机 base64url 值，只可使用一次 |
| `x-ai-editor-body-sha256` | 是 | 原始 HTTP 正文的十六进制 SHA-256 |
| `x-ai-editor-signature` | 是 | `v1=<hex HMAC-SHA256>` |

规范字符串：

```text
aieditor-v1
<UPPERCASE_METHOD>
<PATH_AND_QUERY>
<GATEWAY_ID>
<REQUEST_ID>
<TURN_ID_OR_EMPTY>
<TIMESTAMP_MS>
<NONCE>
<BODY_SHA256>
```

使用部署 Secret 对上述 UTF-8 字符串执行 HMAC-SHA256。Worker 必须：

1. 验证 Gateway allowlist；
2. 验证正文 SHA-256；
3. 使用常量时间比较签名；
4. 验证 timestamp，默认允许误差不超过 60 秒；
5. 在签名通过后原子消费 nonce；
6. nonce 重复返回 `409 worker_replay_detected`。

语言无关测试向量位于 Proxy：

`gateway/tests/fixtures/provider-worker-signing-v1.json`

## 3. Endpoint

### `GET /live`

不返回 Provider、账号、路由或凭据。

```json
{
  "status": "ok",
  "service": "ai-editor-provider-worker",
  "mode": "provider-worker"
}
```

### `GET /ready`

```json
{
  "status": "ready",
  "service": "ai-editor-provider-worker",
  "transport": "mtls"
}
```

开发回环 HTTP 的 `transport` 为 `loopback-development`，不能用于公网。

### `PUT /internal/v1/runtime/chatgpt-sub`

必须签名且 `x-ai-editor-turn-id` 为空。Gateway 只同步已由一级管理员配置的 ChatGPT
订阅通道，不得在该请求中混入 DeepSeek、OpenAI API 或 Relay 凭据。

```json
{
  "schemaVersion": 1,
  "provider": "chatgpt-sub",
  "enabled": true,
  "experimental": true,
  "responsesUrl": "https://chatgpt.com/backend-api/codex/responses",
  "accountStrategy": "headroom",
  "accounts": [
    {
      "id": "credential_example",
      "label": "订阅账号 A",
      "account_id": "upstream_account_example",
      "access_token": "[SECRET]",
      "refresh_token": "[SECRET]",
      "routing_enabled": true,
      "routing_weight": 1,
      "low_quota_threshold": 10,
      "daily_request_limit": 0,
      "daily_token_limit": 0,
      "reserved_models": [],
      "status": "active"
    }
  ],
  "modelIds": ["gpt-5.6-sol"]
}
```

规则：

- 生产必须同时使用 mTLS 和本合同 HMAC 签名；
- 请求正文、Header、错误和日志均不得回显凭据；
- Worker 当前只在内存中保存本次同步的明文凭据，不生成
  `codex-proxy-config.json`；
- 同一凭据版本重复同步时保留 Worker 内的刷新 Token、冷却、摘除和用量状态；
- 一级管理员更新凭据后，凭据摘要变化，Worker 必须使用新版本并清除旧版本运行状态；
- `enabled=false`、Provider 停用、账号全部退出路由或模型路由停用时，不再对外发布对应
  模型；
- `experimental=true` 是固定语义，表示订阅通道为试验通道且不承诺 SLA。

成功只返回安全计数，不返回账号、Token 或请求原文：

```json
{
  "schemaVersion": 1,
  "provider": "chatgpt-sub",
  "executor": "chatgpt-sub",
  "enabled": true,
  "accountCount": 2,
  "routableAccountCount": 1,
  "modelCount": 6,
  "experimental": true
}
```

### `GET /internal/v1/runtime/chatgpt-sub`

返回上述安全运行状态，不返回凭据。

### `GET /internal/v1/runtime/chatgpt-sub/accounts`

返回账号池脱敏摘要，字段与 Gateway 的 `SafeAccountPoolSnapshot` 一致，包括路由策略、
脱敏账号标识、参与路由开关、冷却、登录失效、并发、额度窗口、健康摘要和最近脱敏
路由决策。该结果只能由 Gateway 一级管理员接口继续向上提供；普通用户和二级管理员
不得访问。

### `POST /internal/v1/runtime/chatgpt-sub/accounts/{credentialId}/refresh-usage`

由一级管理员触发指定账号的上游用量刷新。成功只返回：

```json
{ "status": "refreshed" }
```

### `GET /internal/v1/diagnostics`

返回 Provider 健康、熔断和最近脱敏路由错误。Gateway 必须继续执行一级管理员权限检查，
不得向普通用户或二级管理员开放。

### `GET /internal/v1/models`

必须签名，`x-ai-editor-turn-id` 为空。返回 Worker 当前获准模型：

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-worker-mock",
      "object": "model",
      "owned_by": "ai-editor-provider-worker"
    }
  ]
}
```

Mock 执行器只返回 `gpt-worker-mock`。ChatGPT 订阅执行器只返回当前已启用、存在可路由
账号且由 Gateway 模型路由授权的 `gpt-*` 模型，`owned_by` 为
`chatgpt-sub-experimental`。

### `POST /internal/v1/responses`

### `POST /internal/v1/chat/completions`

- 正文为 Gateway 已校验的请求 JSON；
- 必须携带 Turn ID；
- 成功返回 `text/event-stream`；
- 返回头可包含：
  - `x-ai-editor-provider-id`
  - `x-ai-editor-execution-id`
  - `x-ai-editor-outbox-id`
  - `x-ai-editor-idempotent-replay: true`
- 完成事件必须提供实际或明确标识为估算的输入/输出 Token；
- Worker 状态和错误不得回显请求原文或凭据。

幂等规则：

| 状态 | 行为 |
|---|---|
| 新 Turn ID | 创建执行并流式返回 |
| 相同 Turn ID、相同正文、正在运行 | `409 worker_turn_in_progress` |
| 相同 Turn ID、相同正文、同进程内已完成 | 重放内存缓存 SSE，不再次调用 Provider |
| 相同 Turn ID、相同正文、Worker 重启前已完成 | `409 worker_turn_completed_pending_settlement`；通过 outbox 对账，不再次调用 Provider |
| Worker 重启前处于运行中 | `409 worker_turn_recovery_required`；禁止自动重跑可能已到达上游的 Turn |
| 相同 Turn ID、不同正文或接口 | `409 worker_turn_conflict` |

### `GET /internal/v1/turns/{turnId}`

返回安全状态：

```json
{
  "turnId": "turn_example",
  "state": "completed",
  "executionId": "exec_example",
  "outboxId": "outbox_example",
  "createdAt": "2026-07-20T00:00:00.000Z",
  "updatedAt": "2026-07-20T00:00:01.000Z",
  "providerId": "provider-worker-mock",
  "usage": {
    "inputTokens": 10,
    "outputTokens": 20
  },
  "usageReceipt": {
    "schemaVersion": 1,
    "outboxId": "outbox_example",
    "executionId": "exec_example",
    "turnId": "turn_example",
    "workerId": "worker-cn-test",
    "region": "local-development",
    "providerId": "provider-worker-mock",
    "inputTokens": 10,
    "outputTokens": 20,
    "completedAt": "2026-07-20T00:00:01.000Z",
    "signature": "v1=<hex HMAC-SHA256>"
  }
}
```

禁止字段：

- 用户邮箱、登录名或密码
- 邀请码、产品 Access/Refresh Token
- Provider API Key、订阅 Token、`auth.json`
- 用户问题、文件原文、系统提示词、推理或敏感工具输出

### `POST /internal/v1/turns/{turnId}/cancel`

- 签名 Turn ID 必须与路径一致；
- 对运行中 Turn 触发 `AbortSignal`；
- 返回 `202` 和安全状态；
- 已完成 Turn 不重新执行、不删除结算记录。

### `GET /internal/v1/usage/outbox?limit={1..100}`

必须签名且 `x-ai-editor-turn-id` 为空。只返回尚未收到 Gateway 结算确认的用量记录：

```json
{
  "schemaVersion": 1,
  "workerId": "worker-cn-test",
  "region": "local-development",
  "items": [
    {
      "schemaVersion": 1,
      "outboxId": "outbox_example",
      "executionId": "exec_example",
      "turnId": "turn_example",
      "workerId": "worker-cn-test",
      "region": "local-development",
      "providerId": "provider-worker-mock",
      "inputTokens": 10,
      "outputTokens": 20,
      "completedAt": "2026-07-20T00:00:01.000Z",
      "signature": "v1=<hex HMAC-SHA256>"
    }
  ]
}
```

用量回执签名规范字符串：

```text
aieditor-usage-v1
<OUTBOX_ID>
<EXECUTION_ID>
<TURN_ID>
<WORKER_ID>
<REGION>
<PROVIDER_ID>
<INPUT_TOKENS>
<OUTPUT_TOKENS>
<COMPLETED_AT_ISO8601>
```

Worker 使用部署签名 Secret 执行 HMAC-SHA256。Gateway 必须验证 schema、Worker ID、
地区、Token 非负整数及常量时间签名比较，验证失败不得结算。execution/outbox 文件只可
持久化上述安全元数据、请求正文摘要和确认状态，不得持久化用户正文、AI 回复、API Key、
订阅 Token 或 `auth.json`。

### `POST /internal/v1/usage/outbox/ack`

Gateway 在本地结算事务成功后发送签名确认，`x-ai-editor-turn-id` 为空：

```json
{
  "schemaVersion": 1,
  "acknowledgements": [
    {
      "outboxId": "outbox_example",
      "turnId": "turn_example",
      "settlementId": "usage_example",
      "settledAt": "2026-07-20T00:00:02.000Z"
    }
  ]
}
```

同一 `outboxId + settlementId + Gateway ID` 可幂等重试；不同 Gateway 或不同
`settlementId` 冲突返回 `409 worker_settlement_ack_conflict`。Gateway 在请求结束时
确认失败不会重复调用 Provider，后台每 15 秒重新拉取 outbox，依靠 Turn ID 幂等结算后
重试确认。

## 4. 安全错误

```json
{
  "error": {
    "code": "worker_replay_detected",
    "message": "safe operator message",
    "requestId": "req_example",
    "retryable": false
  }
}
```

冻结的 PW1 错误码：

- `worker_authentication_invalid`
- `worker_gateway_forbidden`
- `worker_request_expired`
- `worker_body_digest_invalid`
- `worker_signature_invalid`
- `worker_replay_detected`
- `worker_turn_mismatch`
- `worker_turn_not_found`
- `worker_turn_conflict`
- `worker_turn_in_progress`
- `worker_turn_cancelled`
- `worker_turn_completed_pending_settlement`
- `worker_turn_recovery_required`
- `worker_model_required`
- `worker_model_unavailable`
- `worker_request_too_large`
- `worker_response_too_large`
- `worker_invalid_json`
- `worker_mtls_required`
- `worker_loopback_required`
- `worker_not_found`
- `worker_internal_error`
- `worker_runtime_not_supported`
- `worker_runtime_configuration_invalid`
- `worker_provider_account_not_found`
- `worker_provider_authentication_failed`
- `worker_provider_rate_limited`
- `worker_provider_pool_unavailable`
- `worker_provider_upstream_failed`
- `worker_usage_invalid`
- `worker_outbox_limit_invalid`
- `worker_outbox_not_found`
- `worker_settlement_ack_invalid`
- `worker_settlement_ack_conflict`

Gateway 面向普通用户时只保留错误码、脱敏提示和可重试属性，不传递 Worker 原始错误
消息。

## 5. 后续兼容扩展

T136/PW3 仍需在保持 `aieditor-v1` 兼容的前提下增加：

- Worker 凭据版本和 KMS key version；
- 信封加密、刷新 Token 安全持久化、轮换和备份恢复；
- 多 Worker 池调度和更完整的脱敏路由决策摘要。

禁止静默改变已有字段含义；破坏性变更必须使用新版本并由 Oscar 与 Black 共同确认。
