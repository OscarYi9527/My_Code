# Codex Chat No-Response Diagnosis

Updated: 2026-07-13

## Observed boundary

- GPT Subscription and `deepseek-v4-pro` turns entered Agent Host
  `sendMessage`.
- Neither turn produced an app-server `turn/started` notification.
- Neither turn produced a matching Proxy `/v1/responses` request.
- The failure therefore occurred before Proxy routing.

## Controlled comparisons

Using the same Codex binary, user `CODEX_HOME`, plugins, Proxy, and
`deepseek-v4-pro`:

- a fresh `thread/start` returned in about 5.6 seconds;
- `turn/start` returned in 6 milliseconds;
- `turn/started` followed and the request reached Proxy.

Additional isolated `thread/start` checks passed with:

- all 5 Agent Host server tools;
- all 18 active Code client tools;
- the combined 23-tool catalog;
- two concurrent requests.

These results exclude the selected model, Proxy routing, plugin scanning,
dynamic-tool schemas, and basic app-server concurrency as the general cause.
The failing Code session retained a stale lifecycle request in its
restored/provisional materialization path.

## Implemented hardening

- External-Proxy sessions no longer start an unclaimed background prewarm.
  Their first user send owns materialization.
- `thread/start`, `thread/resume`, and `turn/start` now have a 30-second
  app-server response deadline.
- Timed-out JSON-RPC entries are removed and late responses are discarded.
- A timeout completes the visible host turn with an error; `turn/start` is not
  automatically replayed because upstream acceptance may be uncertain.
- Codex send diagnostics now log prompt length only, not prompt text.

## Validation

- `npm run typecheck-client`: passed.
- `npm run compile`: passed.
- Focused `CodexAppServerClient` tests: 16 passing.
- Full Node run: 11721 passing / 182 pending, with one unrelated,
  machine-specific Kerberos credential failure.
- `git diff --check`: passed.
- Rebuilt Windows Code OSS was restarted with the persistent test profile.
- Shared Proxy PID remained `32564` before and after the Code restart.

## Next verification

1. In the restarted Code OSS window, send a minimal message with
   `deepseek-v4-pro`.
2. Confirm the response starts or a visible error appears within 30 seconds.
3. Repeat with one GPT Subscription model.
4. Confirm Agent Host logs contain lifecycle metadata but no prompt text.
