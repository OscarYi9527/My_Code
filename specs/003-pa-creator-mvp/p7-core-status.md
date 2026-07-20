# P7 Core Status

**Status**: Superseded by `p7-gate.md`; P7 passed.

## Delivered

- Six grouped release checks:
  - package structure;
  - contracts;
  - DAG;
  - AA testability and CA coverage;
  - tool permissions;
  - trial run, source/version provenance, and final confirmation.
- Staging-based standard package generation with generated `pa.json`.
- Immutable `<profile>/<pa-id>/<version>` directories.
- SQLite publication registration and immutable version history.
- Compensating rollback of both SQLite and package files when Workbench refresh
  fails.
- Version listing, status changes, rollback, guarded deletion, ZIP export, and
  traversal-safe ZIP import.
- Audit records for publish, publish rollback, status changes, rollback, and
  deletion.
- Desktop main-process publication service and renderer IPC client.
- AA-09 publish button, final package request, and session completion.
- Immediate current-Profile Workbench registry refresh after publication.
- Native ZIP import/export dialogs and version rollback picker.
- Package-file cleanup after guarded permanent deletion.

## Validation

| Check | Result |
|---|---|
| `npm run typecheck-client` | PASS |
| direct ESLint on P7 core TypeScript | PASS |
| `scripts\test.bat --grep "PA package publisher"` | PASS, 5 tests |
| `npm run transpile-client` | PASS |
| `npm run valid-layers-check` | PASS |

## Remaining After P7

- execute the self-bootstrap acceptance in P8;
- complete development UI and Windows product validation in P8/P9;
- rerun product packaging from a non-Junction dependency environment.
