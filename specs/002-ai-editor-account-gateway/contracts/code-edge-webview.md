# Contract: Code, Edge and Management Webview

## 1. Code Platform Service

`IAiEditorAccountService` is the only workbench-facing account boundary.

```ts
interface IAiEditorAccountService {
  readonly onDidChangeStatus: Event<IAiEditorSafeStatus>;
  getStatus(options?: { force?: boolean }): Promise<IAiEditorSafeStatus>;
  login(kind: 'login' | 'register'): Promise<IAiEditorSafeStatus>;
  logout(): Promise<void>;
  canStartTurn(request: IAiEditorTurnGateRequest): Promise<IAiEditorTurnGateResult>;
  openAccountManagement(route?: IAiEditorManagementRoute): Promise<void>;
  retryStatus(): Promise<IAiEditorSafeStatus>;
}
```

The renderer does not receive Refresh Token, Access Token, password, invitation code, Webview ticket
digest or Provider credentials.

## 2. Safe Status Model

```ts
type AiEditorAccountState =
  | 'ready'
  | 'loginRequired'
  | 'accountUnavailable'
  | 'serviceUnavailable'
  | 'passwordChangeRequired';

interface IAiEditorSafeStatus {
  state: AiEditorAccountState;
  checkedAt: number;
  accountDisplay?: string;
  role?: 'level1' | 'level2' | 'user';
  currentModel?: string;
  availableCredits?: string;
  errorId?: string;
  actions: readonly ('login' | 'openAccount' | 'retry' | 'openDiagnostics')[];
}
```

No unsafe diagnostic fields are part of this renderer contract.

## 3. Login Flow

1. Renderer invokes `login`.
2. Main service creates random state, PKCE verifier/challenge and loopback callback listener.
3. Main service opens the fixed Gateway authorization URL in the system browser.
4. Callback listener accepts exactly one request with matching state, then closes.
5. Main service exchanges authorization code and hands the resulting device session to Edge using
   the local one-time handoff contract.
6. Edge acknowledges handoff completion with `status=completed` and a positive `bindingVersion`.
7. Main service fetches `GET /ai-editor/status`, clears transient tokens and emits safe status.

Cancellation, timeout, invalid state and callback-port errors return stable safe error codes.

All Electron-main HTTP calls to `/ai-editor/*` carry `X-AI-Editor-Local-Nonce`. The nonce is loaded
from a protected runtime boundary and never crosses account IPC into the renderer.

Logout accepts Edge HTTP `204 No Content`; main then refreshes safe status before notifying the
renderer.

## 4. New-Turn Gate

Chat calls `canStartTurn` immediately before creating/forwarding each new Turn.

Input:

```ts
interface IAiEditorTurnGateRequest {
  modelId: string;
  sessionId: string;
  clientTurnId: string;
}
```

Output:

```ts
interface IAiEditorTurnGateResult {
  allowed: boolean;
  status: IAiEditorSafeStatus;
  reason?: 'loginRequired' | 'accountUnavailable' | 'serviceUnavailable' | 'passwordChangeRequired';
}
```

Rules:

- Gate timeout fails closed for the new Turn.
- Existing streaming Turns are not cancelled by status changes.
- Only one forced status check per account/binding runs at a time.
- A denied Turn does not create a Codex request or modify the workspace.

## 5. Status Contribution

Refresh triggers:

- Workbench startup.
- Window restoration/focus recovery.
- 30-second background timer while a relevant Code window is active.
- Every new Turn gate.
- User manual retry.

UI actions:

| State | Label | Action |
|---|---|---|
| Ready | AI 服务正常 | Show account/model/credits summary |
| Login required | 需要登录 | Start browser login |
| Account unavailable | 账号不可用 | Open own account route |
| Service unavailable | 服务暂不可用 | Retry and show safe error ID |
| Password change required | 需要修改密码 | Open account security route |

Level 1 may additionally open diagnostics; that action is absent for other roles.

## 6. Account Menu

The lower-left product account menu replaces the official account entry:

- Logged out: `登录`, `邀请码注册`.
- User: account summary, `我的账号`, device/security entry, `退出登录`.
- Level 2: user items plus `组织用户`, `邀请码`, `组织使用情况`.
- Level 1: all permitted management sections plus `系统诊断`.

Menu visibility is convenience only; Gateway remains the authorization authority.

## 7. Dedicated Management Editor

Properties:

- Title: `AI Editor 管理`.
- Single editor input instance; subsequent opens reveal/focus it.
- Fixed product Gateway origin from product configuration/development override.
- No editable address bar or generic back/forward controls.
- Retains page context while hidden.
- Closing disposes only the short Webview session.

Bootstrap:

1. Editor loads the fixed management shell without credentials in URL.
2. Code requests a one-time ticket through Edge.
3. The Workbench renderer sends only the fixed private-view ID and requested route to Electron main.
   Electron main applies the origin policy, loads the fixed shell, requests the ticket, and injects the
   following message from an isolated world. The Workbench renderer never receives the ticket:

   ```json
   {
     "type": "ai-editor-management-bootstrap",
     "version": 1,
     "route": "account",
     "ticket": "one-time-ticket",
     "expiresIn": 60
   }
   ```

   The page MUST accept this message only when `event.source === window`, `event.origin` equals its
   configured Gateway origin, `type` and `version` match, and the route is in the fixed route enum.
4. Page POSTs ticket to Gateway and receives HttpOnly Cookie.
5. Page acknowledges role and initial route; Code never receives page data beyond safe lifecycle
   events.

The management view uses a dedicated ephemeral BrowserView session and is excluded from integrated
browser discovery, browser tools, extension browser APIs, chat attachments and agent context.
Closing the tab best-effort calls `DELETE /webview/session`, clears the ephemeral browser storage,
and destroys the private view without logging out the product device session.

Navigation policy:

- Same-origin Gateway routes allowed.
- Login/help external links open with the system default browser.
- Cross-origin in-Webview navigation, arbitrary new windows and unapproved downloads are denied.
- Generic integrated-browser context menus, sharing, inspection and browser actions are unavailable.
- CSP disallows inline/eval script and restricts connect/frame/form targets to the Gateway origin.

## 8. Configuration

Development:

- Gateway default: `http://127.0.0.1:47920`.
- Edge default: `http://127.0.0.1:47921`.
- Overrides accepted only from explicit development launch arguments/environment.

Product:

- Gateway origin compiled/signed into product configuration as HTTPS.
- Local Edge origin follows the bundled Proxy setting.
- Ordinary settings UI cannot modify Gateway origin.

## 9. Build and Validation Contract

Every Code UI/runtime task is incomplete until:

1. `npm run compile` succeeds and `scripts\code.bat` is validated with an isolated profile.
2. `npm run core-ci` succeeds.
3. Windows product is rebuilt from `out-vscode-min`, checksums remain valid, and
   `Code - OSS.exe` is validated.

Proxy/Gateway development never restarts shared `47892`. Any eventual switch requires explicit user
approval and only `scripts\restart-ai-proxy.ps1`.
