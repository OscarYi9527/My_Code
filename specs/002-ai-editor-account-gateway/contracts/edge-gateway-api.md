# Contract: Edge and Gateway Model API

## 1. Local Edge Surface

Default debug origin: `http://127.0.0.1:47921`

Machine-readable status, handoff, Webview-ticket, logout, model and safe-error
examples are versioned in
`fixtures/edge-code-contract.json`. Server and Code contract tests must update
that fixture together with this document.

The Edge accepts requests only from loopback. Other local applications do not provide a separate
product API key; Edge attaches the account bound by AI Editor.

### Preserved endpoints

- `GET /live`: Edge process liveness.
- `GET /ready`: safe local readiness without Provider internals.
- `GET /v1/models`: account-filtered model catalog from Gateway.
- `POST /v1/responses`: streamed Responses API proxy.
- `POST /v1/chat/completions`: compatibility proxy where currently supported.

### Product-local endpoints

- `POST /ai-editor/handoff/start`
- `POST /ai-editor/handoff/complete`
- `GET /ai-editor/status`
- `POST /ai-editor/status/retry`
- `POST /ai-editor/webview-ticket`
- `POST /ai-editor/logout`

Product-local endpoints require a short-lived Edge-generated nonce or a Code IPC-mediated call.
They must reject non-loopback sockets and invalid Host/Origin values.

For the local HTTP transport, Electron main sends the nonce only in:

```http
X-AI-Editor-Local-Nonce: {opaque-local-secret}
```

The nonce is supplied to the Edge process and Electron main through a protected process/runtime
boundary. It must not enter renderer IPC payloads, URLs, Webview storage, diagnostics or logs.

## 2. Local Account Handoff

### `POST /ai-editor/handoff/start`

Creates a memory-only grant:

```json
{
  "state": "code-login-state"
}
```

Response:

```json
{
  "handoffId": "lh_opaque",
  "nonce": "one-time-local-secret",
  "expiresIn": 60
}
```

### `POST /ai-editor/handoff/complete`

```json
{
  "handoffId": "lh_opaque",
  "nonce": "one-time-local-secret",
  "state": "code-login-state",
  "deviceSessionId": "ds_opaque",
  "refreshToken": "opaque-refresh-token",
  "accessToken": "short-lived-token",
  "accessTokenExpiresIn": 300
}
```

Successful response:

```json
{
  "status": "completed",
  "bindingVersion": 1
}
```

Code must fetch `GET /ai-editor/status` after completion instead of treating this acknowledgement
as a safe status payload.

Rules:

- Serializes account replacement with `bindingVersion`.
- Captures old binding for already running Turns.
- Saves Refresh Token to OS secure storage, never to JSON/log.
- Clears request body buffers immediately after the handoff completes.

## 3. Safe Status

### `GET /ai-editor/status`

Ordinary response:

```json
{
  "state": "ready",
  "checkedAt": "2026-07-15T10:00:00Z",
  "account": {
    "display": "user@example.com",
    "role": "user"
  },
  "currentModel": "gpt-example",
  "availableCredits": "876.550000",
  "actions": []
}
```

Failure response:

```json
{
  "state": "service_unavailable",
  "checkedAt": "2026-07-15T10:00:00Z",
  "errorId": "err_opaque",
  "actions": ["retry"]
}
```

It must never include port, upstream account, route, circuit, credential, request URL or raw upstream
error details.

### `POST /ai-editor/logout`

Successful response is HTTP `204 No Content`. Code fetches `GET /ai-editor/status` after logout and
expects `login_required`. Logout does not stop Edge or revoke unrelated devices.

## 4. Edge-to-Gateway Authentication

Edge sends:

```http
Authorization: Bearer {five-minute-access-token}
X-AI-Editor-Device-Session: ds_opaque
X-AI-Editor-Turn-Id: turn_opaque
X-AI-Editor-Client: edge/2.x
```

Rules:

- A single-flight lock coalesces concurrent Access Token refresh.
- A request captures account/session/binding version before forwarding.
- Switching or logging out does not mutate the identity of an in-flight Turn.
- Gateway revalidates account, organization, credits and risk before routing; possession of an Access
  Token alone is not enough to start a Turn.

## 5. Gateway Model Endpoints

### `GET /v1/models`

Returns only enabled models authorized for the account. Provider ownership may use a safe public
category but must not expose credential IDs, account pool members, circuit details or internal cost.

### `POST /v1/responses`

Before upstream forwarding Gateway:

1. Authenticates Access Token and active device session.
2. Validates account and organization status/expiry.
3. Resolves requested model and permission.
4. Estimates per-Turn risk.
5. Atomically checks per-Turn overdraft and cumulative risk.
6. Creates/reuses idempotent `TurnRisk`.

Streaming requirements:

- Preserve Responses API streaming semantics.
- Capture usage without buffering the entire response.
- On normal completion, settle actual usage and release risk.
- When usage is absent, settle a conservative estimate and set `usageSource=estimated`.
- If the client disconnects after upstream forwarding, continue/reconcile settlement instead of
  silently releasing risk.

Safe errors:

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `login_required` | No valid local/central product session |
| 403 | `account_disabled` | Account or organization disabled |
| 403 | `account_expired` | Account expired |
| 409 | `credits_risk_limit` | Per-Turn or cumulative risk rejected |
| 409 | `password_change_required` | Bootstrap/reset password must be replaced |
| 409 | `provider_unavailable` | No route can safely serve the model |
| 503 | `account_service_unavailable` | Fail closed; retry may succeed |

No response exposes internal rates or risk thresholds to user/Level 2 roles.

## 6. Mode Contract

### standalone

- Existing local Provider credentials and `/admin` behavior remain.
- Product login is not imposed on the standalone compatibility mode.
- Existing tests must pass unchanged unless a test is explicitly expanded for mode selection.

### edge

- Rejects configuration of upstream Provider credentials.
- Requires Gateway origin from product configuration/development override.
- Does not serve the central admin UI.

### gateway

- Serves account/admin API, management UI and central `/v1`.
- Does not expose loopback-only Edge handoff endpoints.
- In local MVP binds `127.0.0.1`; production requires HTTPS deployment configuration.
