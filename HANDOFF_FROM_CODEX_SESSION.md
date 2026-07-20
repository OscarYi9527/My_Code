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
