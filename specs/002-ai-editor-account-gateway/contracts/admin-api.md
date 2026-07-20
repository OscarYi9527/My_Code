# Contract: Role-Based Administration API

Base path: `/api/v1/admin`

Every request requires a valid product management session or Bearer Token. Authorization is enforced
by the Gateway API and repository scope, not by hidden UI elements.

## 1. Role Matrix

| Resource/action | User | Level 2 | Level 1 |
|---|---:|---:|---:|
| Own profile, credits, devices, usage | Own | Own | Own |
| Organization users | No | Own organization | All |
| Enable/disable ordinary user | No | Own organization | All |
| User credit allocation | No | Own organization | All |
| Invitation create/list/revoke | No | Own organization | All |
| Organization create/disable | No | No | Yes |
| Organization monthly total credits | No | No | Yes |
| Appoint/revoke administrators | No | No | Yes |
| Model rates and hidden risk policy | No | No | Yes |
| Providers, credentials and routing | No | No | Yes |
| Circuit, readiness and route diagnostics | No | No | Yes |
| Cross-organization audit | No | No | Yes |

Denied requests return `403 forbidden` with a safe request ID and create an admin audit event.

Level 1 accounts do not consume a personal allocation and are not blocked by personal credit,
overdraft or cumulative-risk limits. Their management account page links directly to organization
creation/user management and organization credit allocation.

## 2. Organizations

- `GET /organizations`
- `POST /organizations`
- `GET /organizations/{organizationId}`
- `PATCH /organizations/{organizationId}`
- `PUT /organizations/{organizationId}/monthly-credits`
- `PUT /organizations/{organizationId}/risk-policy`

Level 2 calls are either denied or restricted to a safe summary of their own organization. Hidden
risk policy and model rates are omitted entirely from Level 2 schemas.

## 3. Accounts and Roles

- `GET /accounts`
- `GET /accounts/{accountId}`
- `PATCH /accounts/{accountId}`
- `POST /accounts/{accountId}/enable`
- `POST /accounts/{accountId}/disable`
- `PUT /accounts/{accountId}/credit-allocation`
- `POST /accounts/{accountId}/temporary-password`
- `PUT /accounts/{accountId}/role`
- `DELETE /accounts/{accountId}`

Rules:

- Level 2 listing is repository-filtered to its organization.
- Level 2 can only target ordinary users.
- Only Level 1 can assign/revoke Level 1 or Level 2.
- Disabling/deleting the last effective Level 1 fails atomically with
  `last_level1_protected`.
- Temporary password is returned once with `Cache-Control: no-store`.

## 4. Invitations

- `GET /invitations`
- `POST /invitations`
- `POST /invitations/{invitationId}/revoke`

Create request:

```json
{
  "organizationId": "org_opaque",
  "expiresAt": "2026-08-01T00:00:00Z",
  "maxUses": 10
}
```

Level 2 cannot choose an organization other than its own. Plain invitation code appears only in the
successful creation response and is not returned by list APIs. `expiresAt` is the AI access
deadline, not only a code-display or registration expiry: registration must complete before it, and
the created account receives the same value as `account.expiresAt`.

## 5. Credits and Usage

- `GET /organizations/{organizationId}/credit-periods/current`
- `GET /organizations/{organizationId}/usage`
- `GET /accounts/{accountId}/usage`
- `GET /accounts/{accountId}/turns`

Level 2 responses include:

- Actual request count.
- Input/output Token totals.
- User allocated, settled and available credits.

Level 2 responses exclude:

- Provider cost.
- Model rate/multiplier.
- Per-Turn overdraft policy.
- Cumulative active risk and thresholds.
- Provider/route identity beyond public model name.

## 6. Conversation and Admin Audit

- `GET /api/v1/admin/audit/conversations`
- `GET /api/v1/admin/audit/conversations/{auditId}`
- `GET /api/v1/admin/audit/admin-events`
- `PUT /api/v1/admin/organizations/{organizationId}/audit-retention`

Rules:

- Conversation query is organization-scoped for Level 2.
- Conversation list responses contain metadata only and never contain user or assistant bodies.
- Body access creates a separate `audit.conversation.view` admin event, including denied attempts.
- System/developer/file/tool/reasoning payloads are never returned because they are never persisted.
- Body deleted by retention returns metadata with `bodyDeletedAt`, not an empty ambiguous record.
- Level 1 may query all organizations or select one organization; Level 2 is always forced to the
  organization in the authenticated identity even if another query value is supplied.
- Retention accepts an integer `days` value from 7 through 180. Updating the policy recomputes the
  expiry of retained bodies; cleanup nulls only sanitized bodies and preserves model, time, account,
  organization and Token aggregates.

Conversation list shape:

```json
{
  "conversations": [{
    "id": "audit_opaque",
    "turnId": "turn_opaque",
    "accountId": "acct_opaque",
    "organizationId": "org_opaque",
    "modelId": "public-model",
    "inputTokens": 120,
    "outputTokens": 80,
    "createdAt": "2026-07-18T10:00:00.000Z",
    "bodyExpiresAt": "2026-08-17T10:00:00.000Z",
    "bodyDeletedAt": null,
    "redactionVersion": 1
  }]
}
```

The detail response adds only `userText` and `assistantText`. Both are nullable after retention
cleanup. Admin events include actor role at action time, organization scope, stable action, target,
outcome, safe error code and small sanitized metadata; they never contain conversation bodies.

## 7. Providers, Models and Diagnostics (Level 1 only)

- `GET /providers`
- `POST /providers`
- `PATCH /providers/{providerId}`
- `DELETE /providers/{providerId}`
- `POST /providers/{providerId}/credentials`
- `DELETE /providers/{providerId}/credentials/{credentialId}`
- `PATCH /providers/{providerId}/credentials/{credentialId}/routing`
- `POST /providers/{providerId}/credentials/{credentialId}/refresh-usage`
- `PUT /providers/{providerId}/account-routing-strategy`
- `PUT /providers/{providerId}/internal-budget`
- `POST /providers/{providerId}/chatgpt-login/start`
- `GET /providers/{providerId}/chatgpt-login/status`
- `POST /chatgpt-accounts/import`
- `POST /chatgpt-accounts/login/start`
- `GET /chatgpt-accounts/login/status`
- `GET /models`
- `PUT /models/{modelId}`
- `GET /diagnostics`
- `GET /diagnostics/providers`
- `GET /diagnostics/circuits`
- `GET /diagnostics/recent-route-errors`

The three `/chatgpt-accounts/*` routes are the product shortcut used by the dedicated management
page. They remain Level-1-only:

- `POST /chatgpt-accounts/import` accepts `{ "authJson", "label", "routingEnabled" }`.
- `authJson` MUST be valid JSON with non-empty `tokens.access_token`,
  `tokens.refresh_token` and `tokens.account_id`, and MUST be rejected above 256 KB.
- Gateway automatically reuses an existing ChatGPT Provider or creates the default
  `ChatGPT 订阅池`; the administrator does not create a Provider first.
- Import is an upsert keyed by the upstream `account_id`. Re-import rotates the stored credential
  while preserving the Gateway credential ID; it MUST NOT create duplicate account cards.
- New accounts default to `routingEnabled=false` unless explicitly enabled.
- Responses return only Provider/credential IDs, a masked account-ID preview, created/updated state,
  routing state, `envelope-v1` key version and monotonic credential version. Access Token, Refresh
  Token, ID Token, wrapped DEK, encrypted payload and full `authJson` are never returned.
- Shortcut official login accepts the same `label` and `routingEnabled` settings, automatically
  creates/reuses the pool, and imports the completed login through the same upsert operation.
- All allowed and denied shortcut operations create redacted admin audit events.

Credential responses contain only:

```json
{
  "id": "cred_opaque",
  "maskedPreview": "sk-...abcd",
  "storageFormat": "envelope-v1",
  "keyVersion": "kms-or-development-key-version",
  "credentialVersion": 2,
  "updatedAt": "2026-07-15T10:00:00Z",
  "lastUsedAt": "2026-07-15T10:01:00Z",
  "label": "订阅账号 A",
  "accountIdPreview": "acct-a...93fd",
  "status": "active",
  "routing": {
    "enabled": true,
    "weight": 8,
    "lowQuotaThreshold": 10,
    "dailyRequestLimit": 0,
    "dailyTokenLimit": 0,
    "reservedModels": []
  },
  "quota": {
    "source": "provider",
    "primary": {
      "usedPercent": 25,
      "remainingPercent": 75,
      "resetsAt": 1800000000,
      "windowMinutes": 300
    },
    "secondary": null,
    "updatedAt": "2026-07-15T10:01:00Z",
    "syncStatus": "synced",
    "syncError": null
  },
  "runtime": {
    "activeRequests": 1,
    "concurrencyLimit": 3,
    "cooldownUntil": null,
    "modelCooldowns": 0
  },
  "health": {
    "requests": 20,
    "successRate": 95,
    "p95LatencyMs": 820,
    "rateLimited": 1,
    "lastRequestAt": "2026-07-15T10:01:00Z",
    "lastErrorType": null,
    "lastErrorMessage": null
  }
}
```

Provider list responses also contain a safe account-pool summary with the active standalone-compatible
routing strategy, queue depth and recent redacted route decisions. ChatGPT quota windows are read from
the real upstream quota endpoint. When a Provider does not expose a quota endpoint, the response uses
`quota.source="unavailable"` and MUST NOT fabricate a remaining percentage.

Account-pool scheduling, quota reserve, cooldown, adaptive concurrency, daily request/Token limits,
reserved models and route-selection behavior reuse the existing standalone Proxy implementation. The
Gateway database remains the source of truth for administrator-controlled labels and routing policy;
runtime usage, cooldown and health state never reveal access/refresh Tokens.

For API/Relay Providers without an upstream quota endpoint, the Provider response includes Gateway
settlement totals:

```json
{
  "usage": {
    "requests": 20,
    "inputTokens": 12000,
    "outputTokens": 4000,
    "settledCredits": "80.000000",
    "internalBudgetCredits": "500.000000",
    "remainingCredits": "420.000000",
    "usedPercent": "16",
    "lastUsedAt": "2026-07-15T10:01:00Z"
  }
}
```

The internal budget is explicitly a Gateway accounting limit, not a fabricated upstream balance.
Clearing `internalBudgetCredits` removes the limit while preserving actual request, Token and settlement
history.

T136a local writes use `envelope-v1`; existing `plaintext-v1` records remain identifiable until the
idempotent migration command converts and verifies them. `keyVersion` is exposed only through these
Level-1-only Provider endpoints. Gateway production startup refuses a local development key provider,
and public production remains blocked until T136b supplies the selected KMS/Secret Manager adapter and
all real credentials have been verified as encrypted.

## 8. Initial Administration

The initialization command:

- Runs only against an empty database.
- Creates fixed login name `admin`.
- Generates a high-entropy one-time bootstrap password.
- Prints it once to the invoking console and never writes it to logs/files.
- Marks `mustChangePassword=true` and `mustProvideEmail=true`.
- Refuses to reset an existing database unless the explicit isolated-development reset command has
  already removed it.
