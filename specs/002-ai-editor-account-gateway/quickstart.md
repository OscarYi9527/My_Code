# Quickstart Validation: AI Editor 产品账号与中央 Gateway MVP

> 本文是实现完成后的验收合同。任务未完成前，所列新脚本和端点可能尚不存在。

## 1. Safety Preconditions

```powershell
$codeRepo = 'D:\AI_prejoct\My_code'
$proxyRepo = 'D:\AI_prejoct\codex_proxy-dev'
$shared = 'http://127.0.0.1:47892'

Invoke-RestMethod "$shared/live"
git -C $codeRepo status --short
git -C $proxyRepo status --short
```

Record before validation:

- Shared Proxy PID.
- `GET http://127.0.0.1:47892/live` response.
- Hashes of selected shared data files, without printing file contents.

Do not run the shared Proxy restart script during this quickstart.

## 2. Install Isolated Development Dependencies

```powershell
Set-Location D:\AI_prejoct\codex_proxy-dev
npm ci
npm --prefix gateway ci
npm --prefix gateway/admin-web ci
```

No command may install into or modify `C:\Users\Oscar\.claude\proxy`.

## 3. Start Isolated Gateway and Edge

```powershell
Set-Location D:\AI_prejoct\My_code

powershell -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\connect-ai-editor-black-dev.ps1 `
  -BlackRepository D:\AI_prejoct\codex_proxy-gateway-dev `
  -State login_required
```

Expected:

- Gateway: `http://127.0.0.1:47920`.
- Edge: `http://127.0.0.1:47921`.
- Isolated data root printed by the script.
- Health checks pass before the script reports ready.
- On first empty database, console prints:
  - login name `admin`;
  - one-time bootstrap password exactly once.
- Password is not present in Gateway/Edge log files.
- The wrapper prints the nonce **file path**, never the nonce value.
- The Black checkout contains runtime commit
  `84ab6445bb4b557dc379815776bcd784f34676c1` or a confirmed descendant.

Repeat the start command. Expected: existing healthy processes and database are reused; no new
bootstrap password and no data reset.

To stop only the isolated stack:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  D:\AI_prejoct\My_code\scripts\connect-ai-editor-black-dev.ps1 `
  -BlackRepository D:\AI_prejoct\codex_proxy-gateway-dev `
  -Stop
```

## 4. Bootstrap Level 1

Open the Gateway login page in the system browser, sign in as `admin`, and use the one-time password.

Expected:

1. Login is accepted only once.
2. The account must set a permanent password and email before accessing management.
3. The bootstrap password cannot log in again.
4. The first Level 1 cannot disable or delete itself while it is the last valid Level 1.

## 5. Configure Isolated Providers

From the Level 1 management page:

1. Add test ChatGPT subscription account(s) through a new login.
2. Add test API/Relay credentials manually.
3. Enable at least one subscription model and one non-subscription model.

Expected:

- No account or secret is imported from shared `47892`.
- Credential list shows only masked previews.
- Database may use local-only `plaintext-v1`, with a visible non-production warning.
- Ordinary/Level 2 accounts cannot call Provider APIs.

## 6. Create Organization and Invitation

As Level 1:

1. Create Organization A with monthly credits.
2. Create a Level 2 administrator for Organization A.
3. Create Organization B and a second Level 2 administrator.

As Organization A Level 2:

1. Create an invitation with expiry and use count.
2. Register a user using invitation + email + password.
3. Allocate user credits.
4. Attempt to query Organization B and Provider diagnostics.

Expected:

- Registration joins Organization A.
- Organization B and Provider requests return `403`.
- Denied attempts appear in admin audit without secret details.

## 7. Launch Code Against Isolated Edge

Recommended one-command launcher (it starts only isolated `47920`/`47921`, injects the protected
nonce into Electron main, and launches a dedicated Code profile):

```powershell
Set-Location D:\AI_prejoct\My_code
.\scripts\launch-ai-editor-black-dev.ps1 -AuthenticationMode real
```

For diagnosis or custom profile paths, the equivalent manual launch is:

```powershell
Set-Location D:\AI_prejoct\My_code
npm run compile *> .tmp-account-gateway-compile.log
if ($LASTEXITCODE -ne 0) {
  Get-Content .tmp-account-gateway-compile.log -Tail 120
  exit $LASTEXITCODE
}

$env:VSCODE_AI_EDITOR_ACCOUNT_EDGE_ORIGIN = 'http://127.0.0.1:47921'
$env:VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN = 'http://127.0.0.1:47920'
$env:VSCODE_AI_EDITOR_ACCOUNT_EDGE_NONCE_FILE = `
  'D:\AI_prejoct\codex_proxy-gateway-dev\.ai-editor-dev\oscar-code\edge-local-nonce.secret'
$env:VSCODE_AGENT_HOST_CODEX_PROXY_MODE = 'external-local-proxy'
$env:VSCODE_AGENT_HOST_CODEX_PROXY_BASE_URL = 'http://127.0.0.1:47921'

.\scripts\code.bat `
  --user-data-dir D:\AI_prejoct\My_code\.verify-account-gateway-user-data `
  --extensions-dir D:\AI_prejoct\My_code\.verify-account-gateway-extensions `
  --shared-data-dir D:\AI_prejoct\My_code\.verify-account-gateway-shared `
  D:\AI_prejoct\My_code
```

Expected before login:

- File editing, terminal and Git work.
- No `Welcome to Visual Studio Code` / GitHub Copilot sign-in modal or title-bar `Sign In` action is
  shown; AI Editor uses only the product account entry for its own login flow.
- AI status shows `需要登录`.
- Sending a Turn is blocked before Codex/Provider forwarding.
- Electron main sends the nonce only in `X-AI-Editor-Local-Nonce`; renderer storage and IPC do not
  contain it.
- Codex Agent Host routes only to isolated Edge `47921`; it does not send a Turn to shared Proxy
  `47892`.

Complete system-browser login. Expected:

- Browser returns to Code through random loopback callback.
- Status changes to `AI 服务正常`.
- Edge secure store contains the device Refresh Token; Code/Webview storage does not.
- The selected model can answer a real streaming request.

### Automated Mock UI smoke (does not require real Gateway)

For a repeatable Code-side UI regression before Black completes the real authentication and
Responses chain, first ensure that `47921` is unused, then run:

```powershell
Set-Location D:\AI_prejoct\My_code
npm run verify-ai-editor-account-mock-ui
```

The verifier starts its own in-memory Mock Edge only on `47921`, opens `scripts\code.bat` with an
isolated profile and CDP port `49231`, then verifies:

- all five safe account states and their Chat-input actions;
- the ready-state account/model/credits summary;
- fixed-origin opening of the `AI Editor 管理` BrowserView;
- the `service_unavailable` retry action;
- cleanup of its own Mock/Code processes and unchanged shared `47892` PID and `/live`.

It writes sanitized reports under `.build\ai-editor-account-gateway\`. During this mock-only test,
the Gateway origin deliberately points to the in-memory Mock Edge so the BrowserView route can be
verified. It does not change product configuration, `productTarget`, Agent Host routing, or the
shared Proxy, and it must not run while the real Black Edge occupies `47921`.
If either required port is occupied, the verifier fails safely and does not stop or modify the
existing process.

## 8. Validate Account Menu and Management Editor

1. Click the lower-left `AI Editor 账户`.
2. Open `我的账号`.
3. Click the same entry again.
4. Close and reopen the management tab.
5. Try a cross-origin link/new window/download from a test route.

Expected:

- A single `AI Editor 管理` tab is reused.
- No generic browser address/back/forward controls.
- User sees only own profile, credits, devices and usage.
- Reopen does not require product re-login.
- Workbench renderer receives only the private view ID and route; the one-time ticket is injected by
  Electron main using the `ai-editor-management-bootstrap` version 1 envelope.
- Cross-origin navigation/new window/unapproved download is blocked; approved external links use the
  system browser.
- URL and localStorage contain no product Token or Webview ticket.
- Closing the tab best-effort calls `DELETE /api/v1/webview/session`, clears ephemeral BrowserView
  storage and destroys the private view without logging out the product device session.

## 9. Validate Status and Fail-Closed Behavior

Test:

- Startup refresh.
- Window restoration refresh.
- 30-second refresh.
- Manual retry.
- New-Turn forced check.

Temporarily stop only the isolated Gateway through its isolated stop script.

Expected:

- New Turn is blocked with `服务暂不可用` and a safe error ID.
- Local editing remains available.
- A Turn already streaming before the outage is not force-cancelled.
- Restarting the isolated Gateway and pressing retry restores ready status.

## 10. Validate Credits and Concurrency

Configure small test values, then start 20 concurrent Turns with unique Turn IDs.

Expected:

- Each accepted Turn has exactly one risk reservation.
- Per-Turn maximum overdraft rejects oversized requests before Provider forwarding.
- Cumulative risk rejects only new Turns once the threshold is reached.
- Existing Turns finish and settle.
- Each Turn has at most one usage record and one credit deduction.
- Missing upstream usage creates an `estimated` settlement.
- User credits may become negative after an accepted Turn but future requests are re-evaluated.

## 11. Validate Devices, Rotation and Logout

1. Login from two isolated device profiles.
2. Refresh each session.
3. Replay a consumed Refresh Token in a contract test.
4. Revoke one device.
5. Log out the local Edge binding.

Expected:

- Refresh returns a different Token and consumes the old one.
- Replay revokes the affected token family.
- Revoked device cannot refresh or start a Turn.
- Local logout makes Edge `/v1` return `login_required`.
- Other device remains active.
- Edge `/live` and management login page remain reachable.

## 12. Validate Audit and Retention

Send a test Turn containing:

- Normal user text.
- A fake API Key.
- Structured file content.
- Tool output.
- System/developer instructions.

Expected audit:

- Stores sanitized user and final assistant text, model, time and Token usage.
- Masks fake API Key.
- Does not store file object, tool output, system/developer text or reasoning.
- Level 2 sees only its organization.
- Viewing body creates an admin audit event.

Set a short test retention deadline through a test clock and run cleanup. Expected: bodies are
deleted, aggregate usage remains.

## 13. Automated Tests

```powershell
Set-Location D:\AI_prejoct\codex_proxy-dev
npm test
npm --prefix gateway test -- --coverage
npm --prefix gateway/admin-web test -- --coverage

Set-Location D:\AI_prejoct\My_code
npm run typecheck-client *> .tmp-account-gateway-typecheck.log
npm run compile *> .tmp-account-gateway-compile.log
```

Expected:

- Existing standalone Proxy tests pass.
- Gateway/admin new code line coverage is at least 80%.
- Code typecheck and focused account/proxy/chat tests pass.

## 14. Windows Product Validation

```powershell
Set-Location D:\AI_prejoct\My_code
npm run core-ci *> .tmp-account-gateway-core-ci.log
npm run gulp vscode-win32-x64-min-ci *> .tmp-account-gateway-win-package.log
```

Update/package `D:\AI_prejoct\VSCode-win32-x64` using the project release process, preserve Workbench
checksums, and validate `Code - OSS.exe` with isolated user/extension directories.

Expected:

- Product contains Edge resources only; no Gateway database driver, admin source, SQLite database or
  Provider credential file.
- `release-manifest.json` reports `target=edge`; `legacy-standalone` is a migration target and does
  not satisfy final T116 acceptance.
- Product UI and management entry are Chinese under Chinese system locale.
- Login, status, management Webview, model refresh and real streaming response match development
  build behavior.

## 15. Shared Proxy Invariant

After all validation:

```powershell
Invoke-RestMethod http://127.0.0.1:47892/live
```

Compare recorded PID and selected data hashes.

Expected:

- Shared Proxy remained live.
- PID did not change because of this feature validation.
- Shared account/config/data hashes did not change.
- No switch to shared `47892` occurs until the user gives a new explicit approval.
