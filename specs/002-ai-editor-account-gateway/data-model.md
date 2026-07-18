# Data Model: AI Editor 产品账号与中央 Gateway MVP

## 1. Conventions

- IDs use opaque UUID/ULID strings and are never derived from email or organization names.
- All timestamps are UTC instants; monthly credit boundaries use the organization billing timezone,
  defaulting to `Asia/Shanghai` for the local MVP.
- Mutable rows include `version` or an equivalent compare-and-set field where concurrent updates are
  possible.
- Secrets are never used as primary keys. Lookup uses a server-keyed digest.
- Soft-deleted or disabled security principals remain available to audit references.
- SQLite and PostgreSQL implementations must pass the same repository contract tests.

## 2. Identity and Organization

### Account

| Field | Meaning | Rules |
|---|---|---|
| `id` | Product account ID | Immutable |
| `loginName` | Bootstrap/admin login name | `admin` reserved for initial Level 1 |
| `email` | User email | Unique when present; MVP not verified |
| `emailVerifiedAt` | Future verification marker | Null in MVP unless migrated |
| `role` | `level1`, `level2`, `user` | Role changes audited |
| `organizationId` | Organization scope | Required for Level 2/user; nullable for global Level 1 |
| `status` | `active`, `disabled`, `expired` | New Turns require `active` |
| `expiresAt` | Product access expiry | Null means no explicit expiry |
| `mustChangePassword` | Forced password change | True for bootstrap/reset password |
| `mustProvideEmail` | Forced email entry | True for initial `admin` |
| `createdAt`, `updatedAt` | Lifecycle timestamps | UTC |
| `disabledAt`, `disabledBy` | Administrative disable audit | Nullable |
| `version` | Optimistic concurrency | Increment on mutation |

**Invariants**:

- At least one effective Level 1 account must remain active and unexpired.
- Level 2 and user accounts must belong to exactly one organization.
- A disabled/expired account cannot refresh tokens or start new Turns.

### PasswordCredential

| Field | Meaning | Rules |
|---|---|---|
| `accountId` | Credential owner | One current credential per account |
| `passwordHash` | Argon2id encoded hash | Never log or return |
| `kind` | `permanent`, `bootstrap`, `temporary` | Temporary kinds force replacement |
| `createdAt` | Creation time | UTC |
| `usedAt` | First successful use | One-time kinds only |
| `expiresAt` | Optional temporary expiry | Enforced before login |
| `passwordVersion` | Revocation generation | Increment on change/reset |

### Organization

| Field | Meaning | Rules |
|---|---|---|
| `id` | Organization ID | Immutable |
| `name` | Display name | Unique among active organizations |
| `status` | `active`, `disabled` | Disabled blocks all new Turns |
| `billingTimezone` | Monthly boundary timezone | Valid IANA timezone |
| `auditRetentionDays` | Body retention | 7–180, default 30 |
| `overdraftPerTurnOverride` | Hidden policy override | Nullable; Level 1 only |
| `cumulativeRiskOverride` | Hidden policy override | Nullable; Level 1 only |
| `createdAt`, `updatedAt` | Lifecycle timestamps | UTC |
| `version` | Optimistic concurrency | Increment on mutation |

### Invitation

| Field | Meaning | Rules |
|---|---|---|
| `id` | Invitation record | Immutable |
| `organizationId` | Bound organization | Required |
| `codeDigest` | Keyed digest of invitation code | Plain code shown once |
| `createdBy` | Level 1/Level 2 account | Must be in scope |
| `expiresAt` | Registration and AI access deadline | Required; the created account copies this value to `Account.expiresAt` |
| `maxUses` | Allowed registrations | Positive integer |
| `useCount` | Successful registrations | Atomic increment |
| `status` | `active`, `revoked`, `exhausted`, `expired` | Derived/updated |
| `createdAt`, `revokedAt`, `revokedBy` | Audit fields | UTC |

**State transition**:

```text
active → exhausted
active → expired
active → revoked
```

Registration consumes a use and creates the account in one transaction.

## 3. Authentication and Device Sessions

### DeviceSession

| Field | Meaning | Rules |
|---|---|---|
| `id` | Device session ID | Referenced by Access Token |
| `accountId` | Session owner | Required |
| `deviceName` | User-visible device label | Sanitized |
| `platform` | `windows`, `macos`, `other` | Informational |
| `createdAt`, `lastUsedAt` | Activity | UTC |
| `expiresAt` | Rolling inactivity deadline | 30 days after last rotation |
| `revokedAt`, `revokedBy`, `revokeReason` | Revocation | Nullable |
| `passwordVersion` | Version at issuance | Refresh rejects stale version |

### RefreshToken

| Field | Meaning | Rules |
|---|---|---|
| `id` | Token row | Immutable |
| `sessionId` | Device session | Required |
| `familyId` | Rotation family | Stable across rotation |
| `tokenDigest` | Keyed digest | Unique, never return after issuance |
| `parentTokenId` | Previous token | Nullable for first token |
| `issuedAt`, `expiresAt` | Validity | Rolling 30 days |
| `consumedAt` | Successful rotation | Single use |
| `revokedAt` | Revocation | Set on family revoke |

**Rotation transition**:

```text
active token --refresh--> consumed token + new active child
consumed token --replay--> revoke entire family/device session
```

### AuthorizationCode

| Field | Meaning | Rules |
|---|---|---|
| `codeDigest` | One-time code lookup | Keyed digest |
| `accountId` | Logged-in account | Required |
| `pkceChallenge` | S256 challenge | Required |
| `redirectUri` | Loopback callback | Exact match |
| `stateBinding` | Authorization transaction binding | Server-side opaque reference |
| `expiresAt` | Short expiry | Recommended 2 minutes |
| `consumedAt` | One-time marker | Null until exchanged |

### LocalHandoffGrant

Represents Edge-generated, loopback-only authorization to replace the currently bound local account.

| Field | Meaning | Rules |
|---|---|---|
| `grantDigest` | Edge-local one-time grant | Stored only in Edge memory |
| `expiresAt` | Very short expiry | Recommended 60 seconds |
| `expectedState` | Code login transaction binding | Exact match |
| `consumedAt` | One-time marker | Memory only |

### WebviewTicket and WebviewSession

| Field | Meaning | Rules |
|---|---|---|
| `ticketDigest` | One-time Webview bootstrap ticket | Keyed digest |
| `accountId`, `deviceSessionId` | Issuer identity | Required |
| `audience` | Fixed management origin | Exact match |
| `roleVersion` | Role snapshot generation | Revalidate on exchange |
| `expiresAt`, `consumedAt` | Short one-time validity | Recommended 60 seconds |
| `webviewSessionId` | HttpOnly page session | Created on exchange |
| `webviewExpiresAt` | Short management session | Sliding only while product session valid |
| `webviewRevokedAt` | Close/logout/admin revoke | Nullable |

## 4. Credits, Risk and Usage

### ModelRate

| Field | Meaning | Rules |
|---|---|---|
| `modelId` | Public model identifier | Versioned |
| `inputCreditPerToken` | Input rate | Non-negative decimal |
| `outputCreditPerToken` | Output rate | Non-negative decimal |
| `multiplier` | Level 1 adjustment | Positive decimal |
| `effectiveFrom`, `effectiveTo` | Rate window | No overlap per model |
| `visibleTo` | Visibility policy | Rates hidden from user/Level 2 |

### OrganizationCreditPeriod

| Field | Meaning | Rules |
|---|---|---|
| `id` | Billing period row | Immutable |
| `organizationId` | Organization | Required |
| `periodStart`, `periodEnd` | Monthly bounds | Unique per organization/start |
| `allocatedCredits` | Level 1 monthly pool | Non-negative |
| `settledCredits` | Sum of completed usage | May exceed allocation |
| `createdAt`, `closedAt` | Lifecycle | UTC |
| `version` | Concurrent update control | Required |

### UserCreditAllocation

| Field | Meaning | Rules |
|---|---|---|
| `periodId`, `accountId` | Composite scope | Unique |
| `allocatedCredits` | Level 2/Level 1 user allocation | Non-negative |
| `settledCredits` | Actual user cost | May exceed allocation |
| `updatedBy`, `updatedAt` | Administrative audit | Required |
| `version` | Concurrent update control | Required |

### RiskPolicy

| Field | Meaning | Rules |
|---|---|---|
| `scope` | `global` or organization ID | Organization overrides global |
| `maxOverdraftPerTurn` | Hidden per-Turn threshold | Positive decimal |
| `maxCumulativeRisk` | Hidden active risk threshold | Positive decimal |
| `updatedBy`, `updatedAt` | Level 1 audit | Required |

### TurnRisk

| Field | Meaning | Rules |
|---|---|---|
| `turnId` | Client/Gateway idempotency ID | Globally unique |
| `accountId`, `organizationId` | Billing scope | Required |
| `deviceSessionId` | Calling device | Required |
| `modelId` | Requested model | Required |
| `estimatedInputTokens`, `maxOutputTokens` | Estimate inputs | Non-negative |
| `reservedRiskCredits` | Hidden estimated exposure | Non-negative |
| `status` | `reserved`, `streaming`, `settled`, `failed`, `abandoned` | State machine |
| `createdAt`, `startedAt`, `finishedAt` | Lifecycle | UTC |
| `usageRecordId` | Final settlement | One-to-one when settled |
| `failureCode` | Safe classified failure | No secret body |

**State transition**:

```text
reserved → streaming → settled
reserved → failed
streaming → settled
streaming → failed
reserved/streaming → abandoned (reconciler only)
```

### UsageRecord

| Field | Meaning | Rules |
|---|---|---|
| `id` | Usage record | Immutable |
| `turnId` | Idempotent one-to-one link | Unique |
| `accountId`, `organizationId`, `periodId` | Billing scope | Required |
| `modelId`, `providerId` | Route | Provider hidden by role policy |
| `inputTokens`, `outputTokens` | Usage | Non-negative |
| `usageSource` | `upstream`, `estimated` | Must be explicit |
| `inputCredits`, `outputCredits`, `totalCredits` | Settlement | Decimal |
| `startedAt`, `completedAt` | Timing | UTC |
| `routeErrorCode` | Safe final error | Nullable |

## 5. Audit and Retention

### ConversationAudit

| Field | Meaning | Rules |
|---|---|---|
| `id`, `turnId` | Audit identity | Turn link unique where applicable |
| `accountId`, `organizationId` | Access scope | Required |
| `modelId` | Public model | Required |
| `userTextSanitized` | Allowed user text | Nullable after retention cleanup |
| `assistantTextSanitized` | Allowed final output | Nullable after cleanup |
| `inputTokens`, `outputTokens` | Usage summary | Non-negative |
| `createdAt` | Call time | UTC |
| `bodyExpiresAt` | Organization retention deadline | 7–180 days |
| `bodyDeletedAt` | Cleanup marker | Nullable |
| `redactionVersion` | Sanitizer version | Required |

### AdminAuditEvent

| Field | Meaning | Rules |
|---|---|---|
| `id` | Event ID | Immutable |
| `actorAccountId` | Admin or system actor | Required |
| `actorRole` | Role at action time | Required |
| `organizationScope` | Target scope | Nullable for global |
| `action` | Stable action code | Required |
| `targetType`, `targetId` | Affected entity | No secret values |
| `outcome` | `allowed`, `denied`, `failed` | Required |
| `errorCode` | Safe code | Nullable |
| `metadataSanitized` | Small structured details | No bodies/secrets |
| `createdAt` | Event time | UTC |

## 6. Providers and Models

### Provider

| Field | Meaning | Rules |
|---|---|---|
| `id` | Provider ID | Immutable |
| `kind` | `chatgpt-sub`, `openai-api`, `deepseek`, `relay` | Supported adapter |
| `displayName` | Admin display | Sanitized |
| `status` | `enabled`, `disabled` | Level 1 only |
| `configSanitized` | Non-secret routing config | JSON |
| `internalBudgetCredits` | Optional Gateway-side Provider budget | Level 1 only; not an upstream balance |
| `createdAt`, `updatedAt` | Lifecycle | UTC |

### ProviderCredential

| Field | Meaning | Rules |
|---|---|---|
| `id`, `providerId` | Credential identity | Required |
| `storageFormat` | `plaintext-v1`, later `envelope-v1` | MVP local only for plaintext |
| `secretPayload` | Credential payload | Never return via API |
| `maskedPreview` | Fixed safe preview | Returnable to Level 1 |
| `label`, `accountIdPreview` | Administrator label and masked upstream identity | Level 1 only |
| `accountPolicy` | Route enabled, weight, quota reserve, daily limits and reserved models | Reuses standalone account-pool semantics |
| `quotaSnapshot`, `runtimeHealth` | Provider quota windows, cooldown, concurrency and health | Safe runtime projection; no Token or full credential |
| `createdAt`, `updatedAt`, `lastUsedAt` | Lifecycle | UTC |
| `revokedAt` | Revocation | Nullable |

### ModelRoute

| Field | Meaning | Rules |
|---|---|---|
| `modelId` | Public model ID | Unique |
| `displayName` | UI name | Required |
| `providerId` | Route target | Required |
| `enabled` | Catalog visibility | Required |
| `contextWindow`, `maxOutputTokens` | Risk estimate inputs | Positive |
| `rateVersion` | Billing rate link | Required |
| `routingConfig` | Non-secret route options | JSON |
| `updatedAt`, `updatedBy` | Admin audit | Required |

## 7. Edge-Local State

Edge state is intentionally not part of the central relational schema.

### LocalAccountBinding

| Field | Meaning | Storage |
|---|---|---|
| `gatewayOrigin` | Fixed product Gateway | Product config, not user setting |
| `accountId`, `deviceSessionId` | Current binding metadata | Edge data file, non-secret |
| `refreshToken` | Current rotating token | DPAPI/Keychain only |
| `accessToken` | Five-minute token | Process memory only |
| `accessTokenExpiresAt` | Refresh schedule | Process memory only |
| `bindingVersion` | Account switch serialization | Edge data file |

Logout deletes secure Refresh Token, clears memory Access Token and increments binding version. Existing
in-flight proxy streams retain their captured account/Turn identity until settlement.

## 8. Deletion and Retention Rules

- Account disable is preferred over hard delete while audit or usage references remain.
- Device session and token rows retain non-secret revocation metadata for replay investigation.
- Conversation body cleanup nulls sanitized text and sets `bodyDeletedAt`; usage totals remain.
- Invitation plaintext is never retained after creation response.
- Temporary/bootstrap password plaintext is never retained after initialization/reset response.
- `plaintext-v1` Provider credentials are excluded from automatic backups and public deployment.
