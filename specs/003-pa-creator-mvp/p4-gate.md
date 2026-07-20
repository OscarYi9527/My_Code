# P4 Gate Evidence

**Status**: PASSED; P5 entry approved.

## Delivered Runtime

- deterministic AA dependency scheduler;
- CA blocking gates tied to produced data objects;
- configurable mandatory confirmation pauses, including the four PA Creator
  confirmation activity IDs;
- responsible-AA and downstream-only invalidation;
- maximum two automatic corrections followed by user-decision suspension;
- full runtime state in every transition checkpoint;
- checkpoint restoration without replaying completed nodes;
- stable per-attempt idempotency keys for Agent Host/tool adapters;
- atomic run, checkpoint, and runtime-event persistence.

## Transition and Recovery Rules

- Run start, user input, AA start/completion/failure, CA result, confirmation,
  and user-decision transitions each produce a checkpointed runtime event.
- A dependency is released only after its AA completes, all CAs for its output
  pass, and any configured user confirmation is accepted.
- Failed CAs report the rule, factual evidence, responsible AA, and affected
  downstream nodes.
- The third failure of a CA configured for two automatic corrections pauses
  the run for an explicit retry-or-abandon decision.
- Recovery resumes an in-progress AA with the same idempotency key. Agent Host
  adapters must de-duplicate that key, covering a crash between an external
  side effect and its completion checkpoint.
- SQLite writes the checkpoint, complete run projection, and event in one
  transaction; an event insertion failure rolls all three back.

## Validation

| Check | Result |
|---|---|
| `npm run typecheck-client` | PASS |
| direct ESLint on P4 files | PASS |
| `scripts\test.bat --grep "PA runtime"` | PASS, 4 tests |
| P2-P4 focused suite | PASS, 13 tests |
| `npm run transpile-client` | PASS |
| `npm run valid-layers-check` | PASS |
| `git diff --check` | PASS |

## Test Coverage

- CA and user confirmation gates block downstream AAs.
- CA failures invalidate only the responsible AA and its downstream nodes.
- Two automatic corrections are allowed before user-decision suspension.
- An interrupted activity is restored as in-progress with its original
  idempotency key, and a de-duplicating executor performs the side effect once.
- A late failure in the SQLite transition transaction leaves the previous run,
  checkpoint, and event sequence intact.

## Remaining Product Validation

P4 is a runtime/domain gate, not overall product completion. Development UI
validation and the Windows product build remain required at the later
integration/release gates. The current worktree reuses dependencies through
Junctions, so the known `core-ci` packaging `EISDIR` environment limitation
still applies.
