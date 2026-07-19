# Gateway ↔ Provider Worker Internal API

版本：`aieditor-v1`
状态：PW0/PW1 已冻结；真实 Provider 与持久化 outbox 字段在 PW2 前另行扩展

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

PW1 只允许 `gpt-worker-mock`；PW2 才接真实 Provider 目录。

### `POST /internal/v1/responses`

### `POST /internal/v1/chat/completions`

- 正文为 Gateway 已校验的请求 JSON；
- 必须携带 Turn ID；
- 成功返回 `text/event-stream`；
- 返回头可包含：
  - `x-ai-editor-provider-id`
  - `x-ai-editor-idempotent-replay: true`
- 完成事件必须提供实际或明确标识为估算的输入/输出 Token；
- Worker 状态和错误不得回显请求原文或凭据。

幂等规则：

| 状态 | 行为 |
|---|---|
| 新 Turn ID | 创建执行并流式返回 |
| 相同 Turn ID、相同正文、正在运行 | `409 worker_turn_in_progress` |
| 相同 Turn ID、相同正文、已完成 | 重放缓存 SSE，不再次调用 Provider |
| 相同 Turn ID、不同正文或接口 | `409 worker_turn_conflict` |

### `GET /internal/v1/turns/{turnId}`

返回安全状态：

```json
{
  "turnId": "turn_example",
  "state": "completed",
  "createdAt": "2026-07-20T00:00:00.000Z",
  "updatedAt": "2026-07-20T00:00:01.000Z",
  "providerId": "provider-worker-mock",
  "usage": {
    "inputTokens": 10,
    "outputTokens": 20
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
- `worker_model_required`
- `worker_model_unavailable`
- `worker_request_too_large`
- `worker_response_too_large`
- `worker_invalid_json`
- `worker_mtls_required`
- `worker_loopback_required`
- `worker_not_found`
- `worker_internal_error`

Gateway 面向普通用户时只保留错误码、脱敏提示和可重试属性，不传递 Worker 原始错误
消息。

## 5. 后续兼容扩展

PW2/PW3 可在保持 `aieditor-v1` 兼容的前提下增加：

- Provider 配置和凭据引用同步；
- 订阅账号池安全摘要；
- Worker 持久化 execution/outbox ID；
- 用量签名回报和 Gateway 对账；
- Worker 池 ID、地区和路由决策摘要；
- 凭据版本和 KMS key version。

禁止静默改变已有字段含义；破坏性变更必须使用新版本并由 Oscar 与 Black 共同确认。
