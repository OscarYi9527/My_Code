# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

## Persistent AI Editor Build and Proxy Rules

These rules are authoritative across new Codex windows, fresh threads, context
loss, and handoffs.

### Keep development and product builds synchronized

- Every AI Editor UI or runtime change must be propagated to and validated in
  both build surfaces before the task is considered complete:
  1. Development build: run `npm run compile`, then validate through
     `scripts\code.bat` (`out`).
  2. Windows product build: run `npm run core-ci`, update or package
     `D:\AI_prejoct\VSCode-win32-x64` from `out-vscode-min`, keep product
     checksums valid, and validate `Code - OSS.exe`.
- Never assume that updating `out`, `out-vscode-min`, or the unpacked product
  automatically updates either of the other two.
- When reporting completion, explicitly state the validation result for both
  the development build and the product build.

### Restart the shared Proxy only through the safe script

- The Proxy at `http://127.0.0.1:47892` is shared by Codex clients. Do not stop
  it when Code exits.
- Do not restart it with `Stop-Process`, `taskkill`, the stop script alone, or
  `POST /admin/api/proxy/restart`. That endpoint currently terminates the
  process and cannot be assumed to start it again.
- A Proxy restart still requires explicit user approval.
- After approval, use only:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File `
    D:\AI_prejoct\My_code\scripts\restart-ai-proxy.ps1
  ```

- The safe script starts an independent hidden worker before stopping the
  Proxy, performs the stop/start sequence, verifies `/live`, and makes a
  fallback start attempt if restart fails. Do not replace it with an inline
  stop-then-start command issued from an AI session.

### Black/Oscar repository ownership and collaboration

These ownership rules are persistent for the AI Editor account/Gateway MVP:

- Oscar owns the Code product repository at `D:\AI_prejoct\My_code`:
  - Code account service and IPC;
  - system-browser login callback;
  - lower-left AI Editor account menu and safe status UI;
  - pre-Turn account gate and dedicated management Webview;
  - Edge product packaging, release manifest integration, Code development
    build and Windows product validation.
- Black owns the server repository `OscarYi9527/codex_proxy`:
  - standalone/edge/gateway modes;
  - Gateway, account/auth, organization, invitation, device session, credits,
    risk, Provider, routing, diagnostics and audit modules;
  - React management Web UI and server-side tests/documentation.
- Black's existing server work is based on
  `feature/custom-api-urls@e3ed1d6` (or a later explicitly confirmed stable
  commit). Do not reset the work to `master@06cd8d5`, overwrite it, or
  reimplement equivalent management, quota, cost-governance, routing,
  diagnostics, migration or test functionality.
- Before new Gateway implementation, audit Black's current branch against
  `specs/002-ai-editor-account-gateway/tasks.md`; reuse and validate existing
  work before marking covered tasks complete.
- Oscar owns a Code-side contract simulator and injectable mock account
  transport. Code UI, login callback, status, Turn gate and Webview development
  must not wait for Black to deliver a mock server.
- Black implements the real Edge/Gateway independently against the same
  contracts and contract fixtures. Black is not a prerequisite for Oscar's
  component-level development, and Oscar is not a prerequisite for Black's
  server implementation.
- The source of truth for cross-repository interfaces is:
  `specs/002-ai-editor-account-gateway/contracts/`.
  Any endpoint, JSON field, status code or security-semantics change must
  update the relevant contract and be confirmed by both Black and Oscar before
  either implementation changes.
- Black must provide the branch name, commit SHA, tests, migrations and API
  changes for each integration checkpoint. Oscar updates
  `build/ai-editor-proxy/release.json` only after the server commit is stable
  and validated.
- Use Gateway `127.0.0.1:47920` and test Edge `127.0.0.1:47921` for
  development. Neither person may use account/Gateway development to stop,
  restart, modify, import from or migrate the shared `127.0.0.1:47892`
  instance.
- T112 (full isolated quickstart) and T113 (shared Proxy invariants) require
  validation by both Black and Oscar before they are marked complete.
- Joint synchronization is limited to three gates: contract freeze, real
  Edge/Gateway contract conformance, and final end-to-end acceptance.
- Each person updates only their assigned task checkboxes. Ownership and task
  IDs are defined in `specs/002-ai-editor-account-gateway/tasks.md`.

### Repository hygiene for collaborative development

- Use feature branches and pull requests; do not force-push, reset or rewrite
  another person's active branch.
- Keep commits small and include the relevant task ID, for example
  `feat(edge): add safe account status endpoint (T041)`.
- Never use `git add .` in the dirty Code workspace. Stage only explicit
  intended files and preserve unrelated user changes.
- Never commit `node_modules`, `out`, `out-vscode-min`, `.tmp-*`, `.verify-*`,
  logs, screenshots, ZIP exports, SQLite databases, `.env`, API keys, account
  credentials, Tokens, DPAPI/Keychain data, PID files, Proxy runtime data or
  `D:\AI_prejoct\VSCode-win32-x64`.
- The current detailed implementation source of truth is:
  - `specs/002-ai-editor-account-gateway/spec.md`
  - `specs/002-ai-editor-account-gateway/plan.md`
  - `specs/002-ai-editor-account-gateway/tasks.md`
  - `specs/002-ai-editor-account-gateway/quickstart.md`
- When implementation status changes, update the corresponding task checkbox
  and synchronize `CODEX_PROXY_INTEGRATION_PROGRESS.md`.
