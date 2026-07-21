# HANDOFF_FROM_CODEX_SESSION

Generated: 2026-07-10T21:19:02

## Purpose

Continue the AI Editor layout task in `D:\AI_prejoct\My_code` after the previous Codex window became unusable because its context window was exhausted.

## Persistent rules for every new window

These rules override older handoff snippets:

1. Every subsequent AI Editor change must be synchronized to both build
   surfaces:
   - development: `npm run compile` and verify `scripts\code.bat` (`out`);
   - product: `npm run core-ci`, update/package
     `D:\AI_prejoct\VSCode-win32-x64` from `out-vscode-min`, preserve product
     checksums, and verify `Code - OSS.exe`.
2. Do not declare a UI/runtime change complete after validating only one build.
3. The shared Proxy must not be stopped when Code exits.
4. Never restart Proxy with a raw process kill, the stop script alone, or
   `POST /admin/api/proxy/restart`.
5. After explicit user approval, restart only with:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File `
     D:\AI_prejoct\My_code\scripts\restart-ai-proxy.ps1
   ```

   This script starts an independent worker before stopping Proxy and verifies
   that `http://127.0.0.1:47892/live` becomes healthy again.

## User-provided old-window correction

The user explicitly reported the intended behavior from the broken target window:

```text
The previous agent got the direction wrong:
- Development mode must NOT hide the left Activity Bar.
- Simple mode hides the left Activity Bar.
- Simple mode keeps the file Explorer/Sidebar.
- The top menu/title bar must be preserved in both modes.
```

This is the authoritative requirement if any extracted session snippet conflicts with it.
## Target behavior

1. The top menu/title bar must remain visible in both modes.
2. Development mode must show the left Activity Bar and the file Explorer/Sidebar.
3. Simple mode must hide the left Activity Bar but keep the file Explorer/Sidebar visible.
4. Do not rely on the broken old thread context; use current files and `git diff` as source of truth.
5. Avoid dumping full build logs. Write build output to a log and inspect only the tail.

## Repository

```text
D:\AI_prejoct\My_code
```

## Key file

```text
src/vs/workbench/contrib/aiEditorMode/browser/aiEditorMode.contribution.ts
```

## Current git status

```text
## main...origin/main
?? HANDOFF_FROM_CODEX_SESSION.md
```

## Current diff summary

```text
(no git diff)
```

## Current key layout lines

```ts
100: 		this.layoutSnapshot.activityBarVisible = this.layoutService.isVisible(Parts.ACTIVITYBAR_PART);
101: 		this.layoutSnapshot.sideBarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
102: 		this.layoutSnapshot.panelVisible = this.layoutService.isVisible(Parts.PANEL_PART);
103: 		this.layoutSnapshot.auxiliaryBarVisible = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
105: 		this.layoutSnapshot.statusBarVisible = this.layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow);
115: 		this.layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
116: 		this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
117: 		this.layoutService.setPartHidden(!snapshot.panelVisible, Parts.PANEL_PART);
118: 		this.layoutService.setPartHidden(!snapshot.auxiliaryBarVisible, Parts.AUXILIARYBAR_PART);
119: 		this.layoutService.setPartHidden(false, Parts.STATUSBAR_PART);
130: 		this.layoutService.setPartHidden(true, Parts.ACTIVITYBAR_PART);
131: 		this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
132: 		this.layoutService.setPartHidden(true, Parts.PANEL_PART);
133: 		this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
134: 		this.layoutService.setPartHidden(true, Parts.STATUSBAR_PART);
238: 				id: MenuId.MenubarAppearanceMenu,
242: 				id: MenuId.TitleBar,
263: 				id: MenuId.MenubarAppearanceMenu,
282: 				id: MenuId.MenubarAppearanceMenu,
```

## Interpretation of current code

Based on the key lines above:

- Development layout currently calls:
  - `setPartHidden(false, Parts.ACTIVITYBAR_PART)`
  - `setPartHidden(false, Parts.SIDEBAR_PART)`
- Simple layout currently calls:
  - `setPartHidden(true, Parts.ACTIVITYBAR_PART)`
  - `setPartHidden(false, Parts.SIDEBAR_PART)`
- Menu entries still reference `MenuId.MenubarAppearanceMenu` / `MenuId.TitleBar`; there is no current evidence in this file that the top menu/title bar is being hidden by the simple-mode layout logic.

## Previous-thread failure reason

The previous Codex window failed because the thread context became too large:

```text
Codex ran out of room in the model's context window.
stream disconnected before completion: Incomplete response returned, reason: max_output_tokens
```

This was a thread/context-size failure, not necessarily a TypeScript or layout-code failure.

## Recommended next steps for the new Codex window

1. Read this handoff file.
2. Run:

```powershell
Set-Location D:\AI_prejoct\My_code
git status --short --branch
git diff -- src/vs/workbench/contrib/aiEditorMode/browser/aiEditorMode.contribution.ts
```

3. Inspect only the layout functions around `ACTIVITYBAR_PART`, `SIDEBAR_PART`, and any title/menu bar calls.
4. Verify with:

```powershell
npm run typecheck-client *> typecheck-client.log
Get-Content -Tail 80 typecheck-client.log
```

5. If a full build is required, redirect output to a log and inspect only the last 80-120 lines.

## 2026-07-20 current account/Gateway continuation

The layout section above is historical. The current active server task is the AI Editor
Gateway/Provider Worker MVP:

- Code repository branch: `codex/account-gateway-mvp`
- Proxy worktree: `D:\AI_prejoct\codex_proxy-provider-worker`
- Proxy branch: `codex/provider-worker-mvp`
- Current Proxy commits: `2257ce7` and `a8aef6a`
- PW0/PW1 and T121–T132 are complete.
- PW2 T133/T134 now reuse the existing ChatGPT subscription account-pool runtime through
  signed Gateway → Worker configuration.
- Root/Gateway/Admin tests are `149/149`, `112/112`, and `28/28`.
- Shared `127.0.0.1:47892` must remain untouched; the last verified PID was `26404`.
- T135 persistent execution/outbox and secure restart-safe refreshed credentials remain next.
- Real credentials may only be imported through the isolated Gateway level-1 management page;
  never copy shared `47892` credentials or send tokens/auth.json through chat.

Current sources of truth:

- `AI_EDITOR_PROVIDER_WORKER_PUBLIC_ROADMAP.md`
- `CODEX_PROXY_INTEGRATION_PROGRESS.md` section 89
- `specs/002-ai-editor-account-gateway/contracts/provider-worker-api.md`
- Proxy `docs/AI_EDITOR_PROVIDER_WORKER_CHATGPT_POOL_HANDOFF.md`

## Prompt to paste into a new Codex thread

```text
Please read D:\AI_prejoct\My_code\HANDOFF_FROM_CODEX_SESSION.md and continue the AI Editor layout task. First inspect git status, git diff, and the target file. Do not dump full build logs; only show concise summaries or the last 80 lines of logs.
```

## 2026-07-20 current P0 circuit-recovery checkpoint

The layout prompt above is historical. The latest active P0 is a repeated ChatGPT
subscription circuit-recovery failure:

```text
unexpected status 502 Bad Gateway:
Upstream circuit "chatgpt-sub:account:acct_mrrx0g4li6ye6afs" is probing recovery
```

Confirmed root cause and release gap:

- The original upstream failures were `getaddrinfo ENOTFOUND chatgpt.com`.
- Three DNS failures opened the account circuit.
- The old runtime could leave a half-open probe occupied and returned every
  `CIRCUIT_OPEN` as HTTP `502`.
- The earlier fix `3a1cd54` existed on other branches but was absent from the
  actual shared runtime branch `codex/fix-cross-provider-tool-ids@f56093a`.
- This was a missed release/cherry-pick, not evidence that the old fix itself
  stopped working.

Completed and pushed fixes:

- Shared standalone branch:
  `codex/fix-chatgpt-circuit-recovery`
  - `1bdccb0 fix: recover abandoned half-open probes`
  - `b4928eb fix(proxy): bound ChatGPT circuit recovery probes`
- Provider Worker/Gateway branch:
  `codex/provider-worker-mvp@a43887f`

New behavior:

- stale half-open probes can be replaced after 60 seconds;
- recovery probes have an independent 30-second timeout;
- ordinary requests retain their configured longer timeout;
- recovery rejection is HTTP `503` with `Retry-After`,
  `upstream_recovering`, and `retryable=true`;
- the same semantics propagate safely through Provider Worker and Gateway.

Validation:

- shared branch root tests: `74/74`;
- Provider Worker branch root tests: `153/153`;
- Gateway: `114/114`;
- Admin Web: `28/28`;
- `npm run release:check`: passed;
- `npm audit --audit-level=high`: `0 vulnerabilities`.

Deployment state:

- Shared Proxy is still PID `26404`, `/live=ok`, `/ready=ok`.
- It still runs
  `C:\Users\Oscar\.claude\proxy`,
  branch `codex/fix-cross-provider-tool-ids`,
  SHA `f56093a756160a288a7a4b7a66cfd3d6bd71764c`.
- The fixed code has not yet been installed or restarted.
- A new explicit user approval is required before restarting shared `47892`.
- After approval, use only:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File `
    D:\AI_prejoct\My_code\scripts\restart-ai-proxy.ps1
  ```

- Never use `Stop-Process`, `taskkill`, the stop script alone, or
  `/admin/api/proxy/restart`.

Current continuation prompt:

```text
Read D:\AI_prejoct\My_code\HANDOFF_FROM_CODEX_SESSION.md. Continue from the
2026-07-20 P0 circuit-recovery checkpoint. Inspect both Proxy branches and the
shared runtime before acting. Do not restart shared 47892 without a new explicit
approval, and then use only scripts\restart-ai-proxy.ps1.
```

## 2026-07-20 current Provider Worker T135 checkpoint

- Proxy worktree: `D:\AI_prejoct\codex_proxy-provider-worker`
- Proxy branch: `codex/provider-worker-mvp`
- T121–T135 are complete in the current working tree.
- T135 adds:
  - restart-safe execution/outbox metadata without prompts, replies or credentials;
  - signed `aieditor-usage-v1` receipts;
  - Gateway idempotent settlement acknowledgements;
  - 15-second background reconciliation;
  - fail-closed `recovery_required` for interrupted executions.
- Validation:
  - root `155/155`;
  - Gateway `117/117`;
  - Admin `28/28`;
  - release check passed;
  - audit `0 vulnerabilities`;
  - 29-file Worker artifact started with `/live=ok`, `/ready=ready`;
  - shared `47892` remained PID `26120`, `/live=ok`.
- Contract:
  `specs/002-ai-editor-account-gateway/contracts/provider-worker-api.md`
- Proxy handoff:
  `docs/AI_EDITOR_PROVIDER_WORKER_T135_HANDOFF.md`
- Next server task is T136/PW3 envelope encryption, KMS/Secret Manager,
  restart-safe refreshed credentials, migration, rotation and backup recovery.
- T136 local abstraction/tests can begin without purchasing infrastructure, but
  the production KMS adapter cannot be frozen until Oscar selects the domestic
  Gateway and overseas Worker cloud platforms.

### Shared P0 deployment correction

- The user approved and the safe restart script was run after the earlier P0.
- The restart cleared the current circuit state, but a later read-only audit shows
  the shared runtime source is still:
  `C:\Users\Oscar\.claude\proxy`,
  `codex/fix-cross-provider-tool-ids@f56093a`.
- Therefore the durable circuit-recovery commits are still not installed in the
  shared source. The current circuit is healthy (`closed`, failures `0`), but a
  future DNS failure can still reproduce the old recovery behavior.
- Do not claim the durable P0 is deployed. Installing it requires preparing the
  shared runtime branch and obtaining a new explicit restart approval, then using
  only `scripts\restart-ai-proxy.ps1`.

## 2026-07-20 Provider credential encryption T136a checkpoint

- Proxy worktree: `D:\AI_prejoct\codex_proxy-provider-worker`
- Branch: `codex/provider-worker-mvp`
- Pushed commit:
  `9b1c4848dcc9ce197e4ddeade3a86a47a3a9ec22`
- T136a is complete:
  - Gateway Provider credentials use per-record DEKs and AES-256-GCM
    `envelope-v1`;
  - AAD binds credential ID, Provider ID, credential version and secret purpose;
  - plaintext migration is idempotent, read-back verified and restartable;
  - KEK rotation rewraps DEKs without re-encrypting credential payloads;
  - SQLite backups are encrypted and authenticated before mutating migration or
    rotation operations;
  - restore rejects tampering/wrong keys and runs SQLite integrity checking;
  - Worker persists rotated ChatGPT Tokens in an independent encrypted vault;
  - `credential_version` prevents an old Worker Token from overwriting an
    administrator replacement;
  - production Gateway/Worker fail closed when no external KMS/Secret Manager
    implementation is injected.
- Validation:
  - root `156/156`;
  - Gateway `126/126`;
  - Admin `28/28`;
  - Provider Worker focused `18/18`;
  - release check passed;
  - audit `0 vulnerabilities`;
  - Worker allowlist `29`, built artifact `30` files;
  - post-commit release manifest points to `9b1c4848dcc9ce197e4ddeade3a86a47a3a9ec22`;
  - isolated Worker artifact started successfully on `127.0.0.1:47930`.
- Shared `47892` remained PID `26120`, `/live=ok`, `/ready=ok`; it was not
  stopped, restarted, modified or migrated.
- T136 remains open only for T136b:
  - selected production KMS/Secret Manager adapters;
  - PostgreSQL TLS and least-privilege deployment;
  - off-host encrypted backup/key custody;
  - production key and mTLS certificate rotation/recovery drills.
- Oscar must select the domestic Gateway cloud and authorized-region Worker
  cloud before T136b can be frozen. No purchase is required merely to review
  T136a.
- Detailed Proxy handoff:
  `docs/AI_EDITOR_PROVIDER_CREDENTIAL_ENCRYPTION_T136A_HANDOFF.md`.

## 2026-07-20 large-request upload deadlock checkpoint

The upload deadlock affecting long Codex tasks has been fixed, pushed, and
deployed to the VMware public-preview stack.

Confirmed root cause:

- the old parser stopped consuming uploads after the `16 MiB` limit;
- the client kept uploading while the server attempted to reply;
- TCP backpressure deadlocked both sides until Node emitted an unhelpful HTTP
  `408` after about five minutes;
- parsing happens before Provider routing, so every `/v1` Provider was affected.

Shared standalone source:

- worktree: `C:\Users\Oscar\.claude\proxy`;
- branch: `codex/fix-cross-provider-tool-ids`;
- pushed commits:
  - `f1be606 fix(proxy): prevent oversized upload deadlocks`;
  - `38a436c docs(proxy): document request upload safety limits`;
- root tests: `74/74`.

Long-term Edge/Gateway/Worker source:

- worktree: `D:\AI_prejoct\codex_proxy-provider-worker`;
- branch: `codex/provider-worker-mvp`;
- pushed commit:
  `a34aa5c3fd2735fbac1a4fe56418e0aa11abe09e`;
- root tests: `166/166`;
- Gateway tests: `130/130`;
- Admin tests: `28/28`;
- `npm run check` and `npm run release:check`: passed;
- Provider Worker 29-file artifact boundary: passed.

Behavior:

- default body limit is `64 MiB`;
- `CODEX_PROXY_MAX_BODY_MIB` can tune it up to `256 MiB`;
- incomplete uploads time out after `60000 ms` by default;
- `CODEX_PROXY_BODY_TIMEOUT_MS` can tune this up to `300000 ms`;
- oversized uploads are drained or closed and return typed HTTP `413`;
- incomplete uploads return a typed HTTP `408` without waiting for Node's
  default five-minute timeout.

Deployment:

- VMware repository is at `a34aa5c`;
- Gateway runs on `127.0.0.1:47920`;
- Provider Worker runs on `127.0.0.1:47930`;
- the existing Cloudflare Quick Tunnel remains preview-only and `/live=200`;
- a public `17 MiB` request passed body parsing and reached authentication;
- local Edge accepted a `17 MiB` body and rejected a declared `65 MiB` body
  with typed `413` in about `21 ms`.

Final read-only audit:

- both Proxy target branches match their upstream branches (`0/0`);
- shared `47892` is PID `32260`, `/live=200`, `/ready=200`;
- isolated Edge `47921` is PID `38016`, `/live=200`;
- public preview Gateway `/live=200`;
- shared `47892` was not restarted again during the final audit.

Preserve these unrelated local files in the shared Proxy worktree:

- unstaged `tests/test-codex-proxy.js` quota-threshold test isolation;
- untracked `codex-proxy-requests.log.1`.

Do not stage or discard them as part of the upload fix.

## 2026-07-21 forced-password management bootstrap fix

Symptom:

- a new Code window opened `AI Editor 账户 → 修改密码`;
- the dedicated management Webview showed
  `管理会话建立失败，请关闭标签页后重试`.

The repeated-failure audit disproved Edge reachability and ticket issuance as
the root cause:

- isolated Edge `47921` was live and ready;
- the local nonce was valid;
- authenticated status returned `password_change_required` in `0.6–2 s`;
- Webview ticket issuance completed in about `0.5 s`;
- a fresh isolated Code profile reproduced the failure;
- Webview console evidence showed privileged Provider and diagnostics requests
  returning HTTP `409 password_change_required` after ticket exchange.

Root cause:

- the management session was already established successfully;
- the Level 1 management app still preloaded all organization, credit,
  Provider, model and diagnostics data while forced password change was active;
- the protected endpoints correctly rejected those calls with `409`;
- the React bootstrap treated any preload failure as management-session
  failure, preventing access to the password form.

Fix:

- repository: `D:\AI_prejoct\codex_proxy-provider-worker`;
- branch: `codex/provider-worker-mvp`;
- pushed commit:
  `1d0f212c2efe4e09b6682e214548d7bc4390acb0`;
- `mustChangePassword=true` now opens the security/password page directly;
- only account, device and self-usage data is loaded before the password is
  changed;
- organization, credit, audit, Provider, model and diagnostics navigation and
  requests stay disabled until the password lifecycle is complete.

Validation:

- Admin Web: `29/29`;
- root Proxy/Edge/Worker: `166/166`;
- Gateway: `130/130`;
- `npm run release:check`: passed;
- My_Code compile: passed;
- My_Code account and management focused tests: `25/25`;
- fresh Code/Edge/public-Gateway E2E passed twice, including close and reopen.

Deployment:

- VMware repository and Gateway container run `1d0f212`;
- Provider Worker and the Cloudflare Quick Tunnel were not recreated;
- the preview URL did not change and public `/live=200`;
- local Edge was restored after the release gate and is PID `25028`,
  `/live=200`, `/ready=200`;
- shared `47892` remained PID `32260` and was not restarted.

The five pre-existing uncommitted My_Code account/Proxy lifecycle files remain
pending their separate Windows product-build checkpoint; do not mix them into
this server-side fix.

## 2026-07-21 public MVP 30-account capacity gate (T139)

Human operators were offline, so manual UI acceptance and production
infrastructure decisions were skipped. The next fully automatable pre-run item,
T139, was completed in:

- repository: `D:\AI_prejoct\codex_proxy-provider-worker`;
- branch: `codex/provider-worker-mvp`;
- capacity commit: `6e73100`;
- isolated-login cleanup commit: `131467b`.

Implemented behavior:

- the short-term public MVP admits at most 30 product accounts total;
- bootstrap Level 1, all other administrators and ordinary users count;
- disabling an account does not silently free a slot;
- migration `004_public_mvp_capacity` initializes existing deployments safely;
- capacity reservation, invitation consumption and account creation are one
  transaction;
- concurrent final registrations cannot create account 31;
- a rejected registration does not consume invitation use or capacity;
- HTTP `409 public_mvp_capacity_reached` is stable and non-retryable;
- at capacity, new invitation creation is also blocked;
- Level 1 gets a read-only capacity API and in-product admitted/limit/remaining
  display; Level 2 does not receive deployment-capacity data;
- no environment or management API bypass exists.

The release gate exposed and fixed a separate pre-existing Windows cleanup
race: terminal ChatGPT official-login paths now wait for the owned isolated
Codex app-server process to exit before deleting its temporary `CODEX_HOME`.
The focused lifecycle test passed five consecutive runs.

Automated results:

- root Proxy/Edge/Worker: `166/166`;
- Gateway: `136/136`;
- Admin Web: `31/31`;
- full `npm run release:check`: passed;
- Gateway/Admin production builds and Provider Worker release boundary: passed.

Deployment state:

- shared `47892` remains PID `32260`, `/live=ok`; it was not restarted;
- the isolated Edge on `47921` was stopped with the repository safe script so
  release script lifecycle tests could own the port, then restored as PID
  `37496` with `/live=ok`;
- VMware deployment is deferred because the guest does not accept the Windows
  SSH key and no human is available to authorize it;
- do not weaken SSH or script a plaintext guest password;
- the public Quick Tunnel still serves the prior VMware build.

Remaining human gates are T136b (cloud/KMS/PostgreSQL/object storage choice),
T137 (approved production deployment) and T138 (72-hour multi-network
acceptance). Detailed server handoff:
`docs/AI_EDITOR_PUBLIC_MVP_CAPACITY_T139_HANDOFF.md`.

## 2026-07-21 Code lifecycle and password-management pre-run checkpoint

Human verification remained intentionally skipped. The previous
`AI Editor account -> Change password` failure and the next fully automatable
Code pre-run checks are complete in the working tree.

Implemented:

- account HTTP requests now allow 10 seconds for the public preview Gateway;
- a management BrowserView is considered reusable only after a one-time
  Webview ticket was successfully injected;
- retry after an initial management bootstrap failure requests a fresh ticket;
- development `external-local-proxy` mode monitors the existing Edge on
  `47921` without auto-starting the bundled Proxy;
- a built product ignores inherited development-only Edge environment
  variables and continues to use product configuration;
- the Windows clean-start verifier isolates `USERPROFILE` and `HOME`, avoiding
  the real user's shared Proxy single-instance lock;
- the verifier clears all inherited development Edge/Gateway variables and
  rejects any configured Provider model leaked into a clean bundled Proxy;
- the real UI verifier now supports a pre-started local Edge connected to an
  explicit public Gateway and verifies
  `password_change_required -> /admin#security`.

Automated evidence:

- Account Electron tests: `11/11`;
- Proxy Electron tests: `6/6`;
- `npm run compile`: passed;
- `npm run core-ci`: passed;
- `npm run gulp vscode-win32-x64-min-ci`: passed after adding the installed
  Windows SDK x64 `signtool.exe` directory to that command's process PATH;
- Windows product verification:
  - result `PASS`;
  - Workbench checksums `10/10`;
  - clean bundled Proxy startup passed;
  - the bundled test Proxy survived Code exit;
- development Code/public-Gateway CDP verification: `5/5`, including opening
  the password security page and cleaning the isolated Code process.

Runtime invariants:

- shared `47892` remains PID `32260`, `/live=ok`, and was not restarted;
- preview Edge `47921` remains PID `37496`, `/live=ok`;
- the current public Quick Tunnel `/live` remains HTTP 200.

Generated evidence is under
`.build/ai-editor-account-gateway/pre-run-code-lifecycle-20260721-v6.*` and
`.build/ai-editor-account-gateway/real-ui-prelogin-acceptance.*`; these build
artifacts must not be committed.

The next human gates remain T136b, T137 and T138. Do not weaken VMware SSH or
replace the temporary Quick Tunnel with a production claim while no operator
is available.

## 2026-07-21 production decision preflight

The next vendor-neutral pre-run item was completed and pushed without making
any infrastructure purchase or production claim:

- repository: `D:\AI_prejoct\codex_proxy-provider-worker`;
- branch: `codex/provider-worker-mvp`;
- commit: `6ceaad0`;
- command: `npm run production:preflight`.

The preflight records only non-secret decisions and checks the 30-account
capacity, minimum Gateway/Worker sizing, stable HTTPS origins, ICP/WAF,
Gateway and Worker KMS adapters, mTLS rotation, PostgreSQL TLS/least privilege,
migration/rollback drills, off-host encrypted backups, restore drills,
monitoring, pinned release SHAs and explicit human approvals. It rejects
secret-shaped fields and refuses localhost, IP and `trycloudflare.com`
production origins.

The committed placeholder intentionally reports `blocked` with 7/27 checks
passing and 20 decisions/gates still missing. This is the correct pre-purchase
state; it does not complete T136b.

Automated evidence:

- production preflight tests: `4/4`;
- root Proxy/Edge/Worker: `170/170`;
- Gateway: `136/136`;
- Admin Web: `31/31`;
- full `npm run release:check`: passed.

Shared `47892` remains PID `32260`, `/live=ok`. The preview Edge was stopped
and restored only through the repository isolated lifecycle scripts and is now
PID `48732`, still targeting the existing Quick Tunnel.

When Oscar returns, the required decisions are:

1. domestic Gateway cloud/region/KMS;
2. Provider-authorized Worker cloud/region/KMS or Secret Manager;
3. PostgreSQL service;
4. versioned off-host object storage;
5. stable production domains and ICP path;
6. infrastructure/security/deployment approvals.

## 2026-07-21 production PostgreSQL TLS boundary

The remaining vendor-neutral PostgreSQL work was completed and pushed:

- repository: `D:\AI_prejoct\codex_proxy-provider-worker`;
- branch: `codex/provider-worker-mvp`;
- commit: `53892dc`.

Production Gateway now:

- requires PostgreSQL rather than SQLite;
- requires a mounted trusted CA;
- creates `pg.Pool` with `rejectUnauthorized=true`;
- accepts an optional client certificate/key only as a complete pair;
- supports a bounded certificate server-name override;
- rejects all PostgreSQL URL `ssl*` parameters so node-postgres cannot replace
  the explicit TLS object;
- never auto-runs migrations with the runtime database identity;
- rejects `AI_EDITOR_GATEWAY_MIGRATE_ON_START=true`.

`npm run gateway:bootstrap` is the explicit migration/bootstrap entry point
for a separately injected migration identity.

Validation:

- focused config/TLS tests: `11/11`;
- Gateway: `140/140`;
- root Proxy/Edge/Worker: `170/170`;
- Admin Web: `31/31`;
- full `npm run release:check`: passed.

Shared `47892` remains PID `32260`, `/live=ok`. Preview Edge is restored as
PID `9680` against the same Quick Tunnel and data root.

This still does not finish T136b: the selected managed PostgreSQL CA, separated
migration/runtime roles, real least-privilege verification, migration/rollback
drill and off-host backup/restore drill require the cloud choice and operator
approval.

## 2026-07-21 production PostgreSQL runtime-role self-check

The vendor-neutral least-privilege runtime gate was completed and pushed:

- Proxy commit: `34c59a4`;
- branch: `codex/provider-worker-mvp`.

Production Gateway now inspects the effective PostgreSQL role before serving.
It fails closed for superuser, role/database creation, replication, RLS
bypass, database CREATE/TEMP, schema CREATE, ownership of application
relations, and predefined server file/program roles. The migration role must
own schema objects; the Gateway runtime role receives only required
table/sequence DML.

Validation:

- focused role/TLS tests: `17/17`;
- Gateway: `153/153`;
- root Proxy/Edge/Worker: `170/170`;
- Admin Web: `31/31`;
- full `npm run release:check`: passed.

Shared `47892` remains PID `32260`, `/live=ok`. Preview Edge is restored as
PID `35172`, `/live=ok`, against the unchanged Quick Tunnel/data root.

The real cloud database role grants and the live startup check still wait for
the PostgreSQL provider selection.

## 2026-07-21 automated validation closure checkpoint

Manual preview verification is now replaced where technically possible by:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  D:\AI_prejoct\My_code\scripts\verify-ai-editor-preproduction-closure.ps1 `
  -GatewayOrigin <current-preview-https-origin>
```

The runner builds and validates both Code surfaces, runs server release checks,
real UI/CDP checks and a real SSE Turn when the safe account state is `ready`,
then writes sanitized JSON/Markdown evidence. Its result is `PASS`, `BLOCKED`
or `FAIL`; external cloud purchases, ICP, production approval, a real macOS
runner, and T138 three-network acceptance remain truthful `BLOCKED` gates.
See `AI_EDITOR_AUTOMATED_VALIDATION_CLOSURE.md`. The runner never restarts the
shared `47892` Proxy and manages only the isolated preview Edge through the
Proxy repository lifecycle scripts.

## 2026-07-21 PA Creator MVP integration checkpoint

PA Creator source `origin/feature/pa-creator-p1@465d95c44` is intentionally
merged on top of the newer account/Gateway MVP instead of replacing it:

```text
base:        origin/codex/account-gateway-mvp
integration: codex/mvp-pa-creator-integration
```

The PA branch was 28 commits behind the MVP and had one unique product commit.
`origin/main` is already contained by the MVP. Dependabot branches are
workflow-only updates and `refs/agents/...` are Codex session checkpoints, so
neither class is bulk-merged into the product.

The automated closure now requires PA source, focused Registry/Runtime/
Publication tests, a development PA Plaza/Creator CDP smoke and a packaged
Windows PA Plaza/Creator CDP smoke. See
`AI_EDITOR_MVP_BRANCH_INTEGRATION.md`. A branch is eligible for the MVP PR only
when the closure report has `FAIL=0`.

## 2026-07-21 PA Creator MVP merge completed

The PA Creator integration was closed through
[My_Code PR #5](https://github.com/OscarYi9527/My_Code/pull/5) and merged into
`codex/account-gateway-mvp` as `52c772966c35b51e4b80497455592a2b44dbba3e`.

Final local preproduction closure:

- report:
  `.build/ai-editor-preproduction-closure/20260720T214621Z/closure-report.md`;
- `24 PASS / 3 external BLOCKED / 0 FAIL`;
- development compile, account/Proxy contracts, PA focused tests and PA
  development UI passed;
- `core-ci`, Windows packaging/release verification and packaged PA UI passed;
- server release check and real account UI passed;
- shared `47892` stayed at PID `32260` with selected hashes unchanged;
- the isolated preview Edge was restored.

All five PR checks passed, including Windows/macOS/Linux chat-lib tests. The
fork-only CI failure was fixed by checking engineering-system permissions in
`${{ github.repository }}` instead of the hard-coded upstream
`microsoft/vscode`.

The three remaining blockers are truthful external gates: the preview account
requires a password change before a real SSE Turn, no real macOS runner is
available, and 19 production infrastructure/approval prerequisites remain.
`origin/main`, `origin/feature/pa-creator-p1`, and
`origin/codex/mvp-pa-creator-integration` are all contained by the MVP.

## 2026-07-21 account management retry regression

The real Edge and Gateway remained healthy, and direct status/ticket checks
returned `password_change_required` and HTTP 200. The visible failure was a
Code-side singleton-editor retry defect: after one transient management-view
preparation failure, reopening the same security route did not emit a route
event, so the existing editor stayed permanently on its unavailable message.

Branch `codex/fix-account-management-retry` now:

- forces preparation when the singleton management editor is reopened on the
  same route;
- keeps the route-change behavior unchanged for normal state updates;
- avoids calling `setWindowOpenHandler` after the management WebContents has
  already been destroyed;
- makes the real UI verifier dispatch the account status action even when an
  unrelated startup notification overlaps it.

Validation completed:

- development compile: passed with zero errors;
- focused management/navigation tests: `9/9`;
- account Electron main tests: `26/26`;
- real `password_change_required -> #security` BrowserView: passed;
- management close no longer logs `Object has been destroyed`;
- `core-ci`: passed;
- Windows package/release verification: passed, checksums `10/10`;
- shared `47892` remained healthy at PID `32260`.

The migration product still intentionally lacks a fixed
`aiEditorAccountGatewayOrigin`; use the development preview launch with the
current external Gateway until the formal production origin is frozen.

## 2026-07-21 subscription Provider relogin remediation

The model catalog is healthy, but the active ChatGPT subscription Refresh
Token was rejected permanently and the Worker marked the account
`auth_error`. This is not a Tunnel, network, product-login, model-routing or
credits failure.

The generic HTTP 503 was replaced with an actionable safe error:

```text
409 provider_relogin_required
ChatGPT 订阅账号登录已失效，请一级管理员在“Provider 与模型”中重新登录。
```

Delivery and deployment:

- Proxy branch: `codex/fix-provider-relogin-error`;
- source commit: `5617d69`;
- Ubuntu preview cherry-pick: `e5df91d`;
- preview Gateway/Worker and Windows Edge verification: PASS;
- full release gate: root `188/188`, Gateway `156/156`, Admin `31/31`.

The real Edge returned the expected new error. To finish the acceptance, a
Level-1 administrator must open `AI Editor 账户 → AI Editor 管理 → Provider 与模型`,
complete OpenAI official login for the subscription account, keep automatic
routing enabled, and test a new `gpt-5.6-terra` Turn. Do not copy or import
credentials without explicit operator approval.
