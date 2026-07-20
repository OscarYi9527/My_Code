# P7 Gate Evidence

**Status**: PASSED; P8 bootstrap acceptance entry approved.

## Delivered Publication Path

- Six grouped release checks and Zod manifest validation.
- Generated `pa.json` plus the complete standard package structure.
- Staging write followed by immutable profile/PA/version directories.
- SQLite version registration, audit records, and compensating rollback.
- Desktop main-process publication service exposed through IPC.
- Renderer publication client refreshes the current Profile projection after
  every mutating operation, so successful publication appears without restart.
- AA-09 submits the final confirmed candidate and completes the creation
  session only after publication succeeds.

## Lifecycle

- Published versions cannot be overwritten.
- Update starts a new PA Creator workflow bound to the same artifact ID and a
  new patch version.
- Publish, unpublish, rollback, ZIP import, and ZIP export use real services.
- Permanent deletion is blocked by active runs and removes immutable package
  files only after metadata deletion succeeds.
- Published Skills remain personal creations and are not shown as runnable PAs.

## Validation

| Check | Result |
|---|---|
| `npm run typecheck-client` | PASS |
| direct ESLint on P7 files | PASS |
| P6/P7 focused tests | PASS, 10 tests |
| `npm run transpile-client` | PASS |
| `npm run valid-layers-check` | PASS |
| `git diff --check` | PASS |

## Remaining Product Validation

The P7 source and integration contracts pass. Full development UI interaction
and Windows product packaging remain part of P8/P9. The independent worktree
still cannot complete repository-wide compile/product packaging because its
Junction-backed dependencies omit existing self-host test-extension packages.
