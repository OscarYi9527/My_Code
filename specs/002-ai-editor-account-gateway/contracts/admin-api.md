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
successful creation response and is not returned by list APIs.

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

- `GET /audit/conversations`
- `GET /audit/conversations/{auditId}`
- `GET /audit/admin-events`
- `PUT /organizations/{organizationId}/audit-retention`

Rules:

- Conversation query is organization-scoped for Level 2.
- Body access creates a separate `audit.conversation.view` admin event, including denied attempts.
- System/developer/file/tool/reasoning payloads are never returned because they are never persisted.
- Body deleted by retention returns metadata with `bodyDeletedAt`, not an empty ambiguous record.

## 7. Providers, Models and Diagnostics (Level 1 only)

- `GET /providers`
- `POST /providers`
- `PATCH /providers/{providerId}`
- `DELETE /providers/{providerId}`
- `POST /providers/{providerId}/credentials`
- `DELETE /providers/{providerId}/credentials/{credentialId}`
- `POST /providers/{providerId}/chatgpt-login/start`
- `GET /providers/{providerId}/chatgpt-login/status`
- `GET /models`
- `PUT /models/{modelId}`
- `GET /diagnostics`
- `GET /diagnostics/providers`
- `GET /diagnostics/circuits`
- `GET /diagnostics/recent-route-errors`

Credential responses contain only:

```json
{
  "id": "cred_opaque",
  "maskedPreview": "sk-...abcd",
  "storageFormat": "plaintext-v1",
  "updatedAt": "2026-07-15T10:00:00Z",
  "lastUsedAt": null
}
```

MVP local `plaintext-v1` responses show a persistent warning and Gateway refuses non-loopback/public
production startup while any real credential remains in that format.

## 8. Initial Administration

The initialization command:

- Runs only against an empty database.
- Creates fixed login name `admin`.
- Generates a high-entropy one-time bootstrap password.
- Prints it once to the invoking console and never writes it to logs/files.
- Marks `mustChangePassword=true` and `mustProvideEmail=true`.
- Refuses to reset an existing database unless the explicit isolated-development reset command has
  already removed it.
