# PA Creator MVP

**Status**: Requirements frozen
**Baseline**: v0.1, 2026-07-18
**Source**: PA Creator decision cache Q01-Q28

## Goal

Add a local-first PA Plaza to the AI Editor and ship a built-in **PA Creator**
that uses its own nine-AA workflow to create, validate, trial-run, and publish
new Process Agents.

The bootstrap acceptance case is complete only when the built-in PA Creator
creates and publishes another PA Creator, the new module appears without an
AI Editor restart, and the new module can start its own AA workflow.

## Product Entry

```text
AI Editor Chat Editor
→ PA Plaza action
→ local PA Plaza
→ PA Creator
→ continuous creation conversation
```

## Confirmed Constraints

- The product targets local consumer users.
- PA Creator is itself a PA.
- PA creation uses nine AAs and six release checks.
- Four user confirmations block automatic progress.
- PA packages are immutable after publication.
- The first plaza is profile-scoped and local; there is no public marketplace.
- PA and Skill share personal-creation metadata and lifecycle states, but keep
  distinct package and runtime formats.
- Runtime instances stay on their starting version unless the user accepts an
  update prompt.
- User materials stay local by default and require authorization before model
  transmission.
- The implementation reuses the Workbench, Codex Agent Host, external local
  Proxy, and existing tool system.
- The product implementation uses TypeScript, Zod, and SQLite. The Python
  bootstrap prototype is not a product runtime.
- Development is gate-driven and has no calendar estimates.

## Built-in PA Creator Workflow

1. Requirements clarification
2. Source and knowledge ingestion
3. Deliverable and data-object definition
4. Identity, boundary, and manifesto definition
5. AA/CA and contract design
6. Tool and scheduling design
7. Package generation and static validation
8. Trial run, correction, and user acceptance
9. Atomic publication to the PA Plaza

User confirmation is required after steps 1, 3, 5, and 8.

## PA Plaza Card

The plaza card displays:

- name;
- icon;
- short description;
- current version;
- publication status;
- last updated time.

It does not display required models, tools, permissions, or recent run results.

## Standard Package

```text
<pa-id>/<version>/
├─ pa.json
├─ Identity.md
├─ Manifesto.md
├─ Plan.md
├─ DataObjects/
├─ AAList/
├─ CAList/
├─ Knowledge/
├─ BestPractice/
├─ Tests/
└─ assets/
```

## Release Gate

Publication requires a complete package, closed data contracts, an acyclic
DAG, independently checkable AAs, CA coverage of critical artifacts, confirmed
tool permissions, a successful trial run, complete version/source records, and
final user confirmation.

## Recovery

Every user input, AA completion, CA result, and confirmation writes a
checkpoint. A failed CA identifies evidence and the responsible AA. Only the
affected node and downstream nodes are invalidated. Automatic correction is
limited to two attempts before user intervention.
