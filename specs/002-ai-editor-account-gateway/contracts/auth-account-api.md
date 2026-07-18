# Contract: Authentication and Account API

Base path: `/api/v1`

All JSON errors use:

```json
{
  "error": {
    "code": "stable_machine_code",
    "message": "safe localized user message",
    "requestId": "req_opaque",
    "retryable": false
  }
}
```

Responses never include password hashes, token digests, invitation digests, full Provider credentials
or internal risk values.

## 1. Browser Authorization

### `GET /oauth/authorize`

Starts the system-browser login/registration flow.

Required query parameters:

- `client_id=ai-editor-code`
- `redirect_uri=http://127.0.0.1:{randomPort}/callback`
- `response_type=code`
- `code_challenge`
- `code_challenge_method=S256`
- `state`

Rules:

- Only loopback callback hosts are accepted for the desktop client.
- The exact redirect URI is bound to the authorization transaction.
- Login UI supports account identifier/email + password.
- Registration UI supports invitation code + email + password.
- A successful browser operation redirects with `code` and original `state`; errors redirect with a
  safe OAuth error code.

### `POST /oauth/token`

Exchanges an authorization code or rotates a Refresh Token.

Authorization-code request:

```json
{
  "grantType": "authorization_code",
  "clientId": "ai-editor-code",
  "code": "one-time-code",
  "codeVerifier": "pkce-verifier",
  "redirectUri": "http://127.0.0.1:54321/callback",
  "device": {
    "name": "Oscar's Windows PC",
    "platform": "windows"
  }
}
```

Refresh request:

```json
{
  "grantType": "refresh_token",
  "clientId": "ai-editor-edge",
  "refreshToken": "opaque-token",
  "deviceSessionId": "ds_opaque"
}
```

Success:

```json
{
  "accessToken": "short-lived-signed-token",
  "accessTokenExpiresIn": 300,
  "refreshToken": "new-opaque-token",
  "refreshTokenExpiresIn": 2592000,
  "deviceSessionId": "ds_opaque",
  "account": {
    "id": "acct_opaque",
    "display": "user@example.com",
    "role": "user",
    "organizationId": "org_opaque",
    "mustChangePassword": false,
    "mustProvideEmail": false
  }
}
```

Rules:

- Authorization code and Refresh Token are single-use.
- A successful refresh consumes the old Token and returns a new one.
- Replay of a consumed Refresh Token revokes the token family and returns
  `refresh_token_reuse_detected`.

## 2. Invitation Registration

### `POST /auth/register`

Used by the browser authorization page.

```json
{
  "authorizationTransactionId": "atx_opaque",
  "invitationCode": "displayed-secret",
  "email": "user@example.com",
  "password": "user-provided-password"
}
```

Success atomically consumes one invitation use and creates an active user in the invitation
organization. Common errors:

- `invitation_invalid`
- `invitation_expired`
- `invitation_exhausted`
- `email_already_registered`
- `password_policy_failed`

## 3. Current Account and Status

### `GET /account/me`

Bearer-authenticated. Returns:

```json
{
  "account": {
    "id": "acct_opaque",
    "email": "user@example.com",
    "role": "user",
    "status": "active",
    "expiresAt": null,
    "organization": {
      "id": "org_opaque",
      "name": "Example Org"
    },
    "mustChangePassword": false,
    "mustProvideEmail": false
  },
  "credits": {
    "periodStart": "2026-07-01T00:00:00Z",
    "periodEnd": "2026-08-01T00:00:00Z",
    "allocated": "1000.000000",
    "settled": "123.450000",
    "available": "876.550000"
  }
}
```

No hidden rate, overdraft, cumulative risk or Provider fields are returned.

### `GET /account/status`

Used before each new Turn and for 30-second refresh.

```json
{
  "state": "ready",
  "checkedAt": "2026-07-15T10:00:00Z",
  "accountVersion": 12,
  "safeSummary": {
    "accountDisplay": "user@example.com",
    "currentModel": "gpt-example",
    "availableCredits": "876.550000",
    "usedCreditsPercent": "12.5"
  },
  "actions": []
}
```

Allowed states:

- `ready`
- `login_required`
- `account_unavailable`
- `service_unavailable`
- `password_change_required`

The ordinary response never contains endpoint, Provider, route, circuit or credential state.

## 4. Password Management

### `POST /account/password/change`

```json
{
  "currentPassword": "current-or-temporary",
  "newPassword": "new-password",
  "email": "required only when mustProvideEmail is true"
}
```

Success:

- Replaces password hash and increments password version.
- Consumes bootstrap/temporary credential.
- Clears `mustChangePassword`; clears `mustProvideEmail` when valid email supplied.
- Revokes other device sessions by default; current device receives a newly rotated token family.

### `POST /admin/accounts/{accountId}/temporary-password`

Level 1 only. Returns the temporary password exactly once:

```json
{
  "temporaryPassword": "random-high-entropy-value",
  "mustChangePassword": true,
  "expiresAt": "2026-07-16T10:00:00Z"
}
```

The response is marked `Cache-Control: no-store`; logs and audit omit the password.

## 5. Device Sessions

### `GET /account/devices`

Returns the current user's device sessions with safe metadata and current-device marker.

### `DELETE /account/devices/{sessionId}`

Revokes one of the current user's sessions. A user cannot accidentally revoke the current session
without explicit confirmation.

### `POST /account/logout`

Revokes the current device session. Edge then clears secure and memory tokens. It does not revoke
other devices.

## 6. Webview Ticket

### `POST /account/webview-ticket`

Bearer-authenticated request from Edge on behalf of Code:

```json
{
  "audience": "http://127.0.0.1:47920",
  "purpose": "account-management"
}
```

Returns:

```json
{
  "ticket": "one-time-ticket",
  "expiresIn": 60
}
```

### `POST /webview/session`

The management page receives the ticket from Code via `postMessage` and exchanges it in the body:

```json
{
  "ticket": "one-time-ticket"
}
```

Success sets an HttpOnly, SameSite management Cookie and returns the permitted navigation model.
The ticket cannot be reused.

The `postMessage` envelope and main-process-only ticket injection are defined in
`code-edge-webview.md`. The Workbench renderer is not a ticket recipient.

### `DELETE /webview/session`

Revokes the current Webview management session. Closing the tab invokes this best-effort; expiry is
the crash fallback. It does not log out the product device session.
