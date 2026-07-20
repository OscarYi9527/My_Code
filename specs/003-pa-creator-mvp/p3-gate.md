# P3 Gate Evidence

**Status**: PASSED; P4 entry approved.

## Delivered Storage

- versioned SQLite migration;
- profile-scoped PA/Skill artifact metadata;
- immutable package-version records;
- run state and current activity;
- atomic checkpoints;
- audit event records;
- profile-filtered plaza projection.

## Transaction Rules

- publication metadata and immutable version insertion share one transaction;
- duplicate immutable versions roll back the metadata update;
- checkpoint insertion and run advancement share one transaction;
- a checkpoint for a missing run is rolled back;
- writes are serialized on the database instance.

## Validation

| Check | Result |
|---|---|
| `npm run typecheck-client` | PASS |
| direct ESLint on P3 files | PASS |
| `scripts\test.bat --grep "PA registry database"` | PASS, 4 tests |
| `npm run transpile-client` | PASS |
| `npm run valid-layers-check` | PASS |

## Test Coverage

- Profile A and Profile B see only their own gallery metadata.
- Duplicate publication cannot overwrite an immutable version.
- Checkpoint persistence advances the matching run.
- Missing-run checkpoint attempts leave no partial checkpoint.
