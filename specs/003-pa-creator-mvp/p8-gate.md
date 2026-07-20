# P8 Bootstrap Acceptance

**Status**: PASSED at the service/package integration level; P9 entry approved.

## Acceptance Scenario

1. A fully accepted PA Creator creation session is converted into a package.
2. The generated manifest contains AA-01 through AA-09 in dependency order.
3. ReleaseCandidate and PublishedPAModule are protected by CA-01 and CA-02.
4. The package passes the P7 release gate and is written immutably.
5. SQLite registration succeeds and refreshes the live Profile projection.
6. The new PA Creator card exposes `aiEditor.pa.create`.
7. The published manifest starts at AA-01, so opening the module can start the
   same continuous creation workflow.

## Evidence

- Generated package contains nine `AAList` files.
- Persisted manifest contains nine AAs and entry activity `AA-01`.
- The new card appears in the in-process projection callback without restart.
- The primary action is the real PA Creator command, not the generic PA-open
  placeholder.
- The Create command safely distinguishes a gallery item ID from an
  edit-as-new-version preset.

## Validation

| Check | Result |
|---|---|
| `npm run typecheck-client` | PASS |
| direct ESLint on P8 files | PASS |
| `scripts\test.bat --grep "PA Creator bootstrap acceptance"` | PASS, 1 test |
| P2-P8 focused regression | PASS, 29 tests |
| `npm run transpile-client` | PASS |
| `npm run valid-layers-check` | PASS |
| `git diff --check` | PASS |

## Product UI Note

The repeatable integration acceptance covers workflow output, package files,
SQLite, refresh projection, and start action. P9 still must validate the same
path through the development Workbench UI and Windows packaged product. The
known Junction dependency limitation remains applicable to product packaging.
