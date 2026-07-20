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
