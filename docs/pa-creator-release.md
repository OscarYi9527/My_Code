# PA Creator Release and Upgrade Guide

## Release Baseline

PA Creator P9 freezes the following compatibility contract:

| Contract | Baseline |
|---|---|
| PA package schema | `1.0` |
| PA registry schema | `2` |
| Minimum/current host | `1.127.0` |
| Manifest path | `pa.json` |
| Required root files | `Identity.md`, `Manifesto.md`, `Plan.md` |
| Required non-empty directories | `DataObjects`, `AAList`, `CAList`, `Knowledge`, `BestPractice`, `Tests`, `assets` |

The executable source of truth is
`src/vs/workbench/services/paRegistry/common/paCompatibility.ts`.
Changing any frozen value requires an explicit compatibility review and new
tests. Published package directories remain immutable.

## Storage

All PA state is local and Profile-scoped. The desktop main process stores it
under:

```text
<AI Editor userDataPath>/pa-registry/
├── registry.sqlite
└── packages/
    └── <encoded-profile-id>/<pa-id>/<version>/
```

Temporary `.staging` and `.imports` directories are internal publication
workspaces. They are not release artifacts and can only be removed while AI
Editor is closed.

## Release Sequence

1. Complete AA-01 through AA-08 and accept all four mandatory confirmations.
2. AA-09 builds a package draft with a `1.0` manifest and host baseline.
3. Run the six release check groups: structure, contracts, DAG,
   activities/checks, permissions, and trial/provenance.
4. Write the candidate to a staging directory.
5. Rename it into the immutable Profile/PA/version path.
6. Register artifact and version metadata in one SQLite transaction.
7. Refresh the current Profile projection so the PA Plaza card appears without
   restarting AI Editor.
8. If registration or refresh fails, compensate by removing both the SQLite
   version and package directory.

The shared AI Proxy is not part of this sequence and must not be restarted.

## Upgrade Procedure

Before upgrading an existing installation:

1. Close all AI Editor windows using the target user-data directory.
2. Copy the complete `pa-registry` directory to a timestamped backup.
3. Install or launch the new AI Editor build.
4. Open PA Plaza and verify the current Profile's published cards.
5. Open Personal Creation and verify PA/Skill filters and version lists.
6. Publish a disposable patch version, export it, and import it into a test
   Profile.
7. Run a PA through at least one AA checkpoint and resume it once.

Registry migrations run in a transaction and advance SQLite `user_version` in
contiguous order. P9 supports registry schema `2`; a database with a newer
schema is rejected instead of being silently opened.

Package schema `1.0` is accepted only when its host range contains host
`1.127.0` and its minimum host is not older than `1.127.0`. Future package
schemas and incompatible host ranges are rejected at import/publication.

## Release Validation

Run from the repository root:

```powershell
npm run typecheck-client
npx eslint <PA Creator and PA Registry TypeScript files>
npm run transpile-client
npm run valid-layers-check
scripts\test.bat --grep "PA Creator bootstrap acceptance|PA Creator workflow|PA package publisher|PaRegistryService|PA Plaza editor input|PA runtime|PA registry database|PA manifest contracts"
git diff --check
```

Required product surfaces:

```powershell
npm run compile
scripts\code.bat --user-data-dir <isolated-user-data-directory>
npm run core-ci
```

The development Workbench and packaged Windows product must both pass before a
release is declared complete. A source-level pass does not waive a failed or
unavailable product build.

## Release Acceptance

- AI window opens PA Plaza.
- PA Creator opens as one continuous nine-AA workflow.
- Required confirmation gates suspend and resume correctly.
- AA-09 publishes an immutable version.
- The card appears in the current Profile without restart.
- A published PA Creator starts at AA-01 and can publish another nine-AA PA
  Creator.
- Personal Creation can search/filter, publish/unpublish, update as a new
  version, import/export, and roll back.
- Plaza cards do not expose model, tool, permission, or recent-run fields.
