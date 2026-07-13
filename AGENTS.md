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
