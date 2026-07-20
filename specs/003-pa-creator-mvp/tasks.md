# PA Creator MVP Tasks

## P1 — Host Integration Boundary

- [x] P1-01 Create a clean feature worktree and preserve unrelated account work.
- [x] P1-02 Audit Workbench contribution and service registration patterns.
- [x] P1-03 Audit Chat Editor and `agent-host-codex` entry constraints.
- [x] P1-04 Define the PA Plaza card projection without runtime-only fields.
- [x] P1-05 Add the `IPaRegistryService` integration seam.
- [x] P1-06 Register the built-in PA Creator projection.
- [x] P1-07 Add an AI Chat title-bar PA Plaza action scaffold.
- [x] P1-08 Pass client type-check.
- [x] P1-09 Pass focused unit tests.
- [x] P1-10 Pass layer validation.
- [x] P1-11 Record P1 gate evidence and approve P2 entry.

## P2 — Domain Contracts

- [x] P2-01 Define `PaManifest` Zod schema.
- [x] P2-02 Define AA, CA, and data-object contracts.
- [x] P2-03 Define run, checkpoint, artifact, and failure-route contracts.
- [x] P2-04 Implement ID, producer/consumer, DAG, and CA coverage validators.
- [x] P2-05 Add valid and invalid fixtures.
- [x] P2-06 Pass type-check, direct ESLint, focused tests, and layer validation.

## P3 — Local Registry and State

- [x] P3-01 Define SQLite migrations.
- [x] P3-02 Add profile-scoped creation metadata.
- [x] P3-03 Add immutable package version records.
- [x] P3-04 Add run/checkpoint/audit repositories.
- [x] P3-05 Add transaction and recovery tests.
- [x] P3-06 Pass type-check, direct ESLint, focused tests, transpile, and layer validation.

## P4 — PA Runtime

- [x] P4-01 Define runtime transition rules and events.
- [x] P4-02 Implement AA scheduling and CA gates.
- [x] P4-03 Implement bounded correction and user-decision suspension.
- [x] P4-04 Implement checkpoint recovery and side-effect idempotency.
- [x] P4-05 Add runtime state-machine and recovery tests.

## P5 — PA Plaza and Personal Creation

- [x] P5-01 Replace the quick-pick scaffold with a native PA Plaza editor.
- [x] P5-02 Render only the confirmed PA card projection fields.
- [x] P5-03 Add a profile-scoped PA/Skill projection and refresh events.
- [x] P5-04 Add personal creation PA/Skill categories, search, and status filters.
- [x] P5-05 Add open, detail, update, import, export, rollback, publish, and unpublish action boundaries.
- [x] P5-06 Keep unpublished artifacts in personal creation metadata while hiding them from the plaza.
- [x] P5-07 Add focused profile, filtering, lifecycle, and editor-route tests.
- [x] P5-08 Pass type-check, direct ESLint, focused tests, transpile, and layer validation.

## P6 — PA Creator Nine-AA Workflow

- [x] P6-01 Define nine single-responsibility AA descriptors and outputs.
- [x] P6-02 Implement one continuous, profile-scoped creation session.
- [x] P6-03 Add step progress, conversation, confirmation cards, and artifact details.
- [x] P6-04 Enforce mandatory confirmations after AA-01, AA-03, AA-05, and AA-08.
- [x] P6-05 Add source catalog ingestion and uncertainty confirmation.
- [x] P6-06 Generate the standard PA package draft projection at AA-07.
- [x] P6-07 Invalidate and recompute only a revised AA and its downstream nodes.
- [x] P6-08 Persist and resume multiple incomplete sessions per Profile.
- [x] P6-09 Add focused workflow, confirmation, source, revision, and profile tests.
- [x] P6-10 Pass type-check, direct ESLint, focused tests, transpile, and layer validation.

## P7 — Packaging, Publication, and Versioning

- [x] P7-01 Generate `pa.json` and the standard package directory.
- [x] P7-02 Implement six grouped release checks and block failed candidates.
- [x] P7-03 Write immutable version directories through a staging location.
- [x] P7-04 Register package metadata and versions in SQLite.
- [x] P7-05 Roll back files and SQLite registration when refresh fails.
- [x] P7-06 Implement version listing, rollback, publish, and unpublish repositories.
- [x] P7-07 Prevent permanent deletion while a run is active.
- [x] P7-08 Implement ZIP export and traversal-safe ZIP import.
- [x] P7-09 Add package, gate, rollback, lifecycle, import, and export tests.
- [x] P7-10 Register the desktop publication IPC service.
- [x] P7-11 Replace import, export, rollback, and status commands with native calls.
- [x] P7-12 Connect AA-09 to publication and refresh the live Workbench projection.
- [x] P7-13 Delete package files after guarded permanent metadata deletion.
- [x] P7-14 Pass desktop integration contracts and approve the P7 gate.
- [x] P7-15 Replace Update with edit-as-new-version.

## P8 — Bootstrap Acceptance

- [x] P8-01 Generate a second PA Creator with nine AAs and two release CAs.
- [x] P8-02 Publish it through the immutable package and SQLite path.
- [x] P8-03 Refresh the live profile projection without a restart.
- [x] P8-04 Expose the Create PA primary action on the published module.
- [x] P8-05 Verify the published manifest starts at AA-01 and contains all nine AAs.
- [x] P8-06 Add a repeatable self-bootstrap acceptance test.
- [x] P8-07 Pass type-check, ESLint, transpile, focused test, and layer checks.

## P9 — Release Baseline

- [x] P9-01 Freeze package schema `1.0`, registry schema `2`, and host baseline `1.127.0`.
- [x] P9-02 Freeze required package paths and reject unsupported package/host versions.
- [x] P9-03 Assert registry migrations are contiguous and reject a newer database schema.
- [x] P9-04 Add compatibility, required-layout, and migration baseline tests.
- [x] P9-05 Document release, upgrade, rollback, backup, and recovery procedures.
- [x] P9-06 Add an operator quickstart for create, publish, update, export, and rollback.
- [x] P9-07 Pass type-check, ESLint, transpile, layer validation, and focused regression.
- [x] P9-08 Validate the development build through `npm run compile` and `scripts\code.bat`.
- [x] P9-09 Validate the Windows product build through `npm run core-ci` and `Code - OSS.exe`.
- [x] P9-10 Record the final P9 gate decision and unresolved environment blockers.
- [x] P9-11 Hydrate the persisted profile registry on startup and Profile changes, including stale-response and IPC-failure guards.
