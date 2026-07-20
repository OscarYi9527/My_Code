# P9 Release Baseline

**Status**: PASSED — source, development Workbench, independent build, and
packaged Windows product gates are complete.

## Frozen Compatibility Contract

| Contract | Value |
|---|---|
| PA package schema | `1.0` |
| PA registry schema | `2` |
| Minimum/current validated host | `1.127.0` |
| Manifest | `pa.json` |
| Root files | `Identity.md`, `Manifesto.md`, `Plan.md` |
| Non-empty directories | `DataObjects`, `AAList`, `CAList`, `Knowledge`, `BestPractice`, `Tests`, `assets` |

Executable constants are in
`src/vs/workbench/services/paRegistry/common/paCompatibility.ts`.

The manifest boundary rejects future package schemas, incompatible host ranges,
unsafe paths, and incomplete package layouts. The registry boundary asserts
contiguous migrations through schema `2` and rejects newer database schemas.

## Release Documentation

- `docs/pa-creator-release.md`
- `docs/pa-creator-rollback.md`
- `specs/003-pa-creator-mvp/quickstart.md`

The documentation covers local storage, backup, migration, immutable versions,
publication compensation, artifact rollback, registry restore, removal, and
acceptance commands. No PA operation required a shared AI Proxy restart.

## Source Validation

| Check | Result |
|---|---|
| `npm run typecheck-client` | PASS |
| direct PA/account integration ESLint | PASS |
| `npm run transpile-client` | PASS |
| P2-P9 focused regression | PASS, 37 tests |
| `npm run valid-layers-check` | PASS |
| `git diff --check` | PASS; line-ending notices only |

The focused regression includes startup/Profile registry synchronization,
stale-response protection, and contained IPC failures:

```powershell
scripts\test.bat --grep "PA registry synchronization|PA Creator bootstrap acceptance|PA Creator workflow|PA package publisher|PaRegistryService|PA Plaza editor input|PA runtime|PA registry database|PA manifest contracts"
```

## Development Workbench Acceptance

After materializing the missing self-host extension dependencies,
`npm run compile` passed. A real development Workbench launched with isolated
user data and completed:

1. PA Plaza open;
2. PA Creator start/resume;
3. all nine AA views;
4. mandatory confirmations after AA-01, AA-03, AA-05, and AA-08;
5. AA-09 publication;
6. immediate PA card and Personal Creation lifecycle refresh.

The runtime paths were also repaired to resolve `ServicesAccessor` services
before asynchronous boundaries.

## Independent Windows Build Acceptance

Validation used the independent workspace:

`D:\AI_prejoct\skill_Process_Agent\verification\My_Code_pa_creator_p9_20260720`

It has a complete `npm ci` installation with real dependency directories.
The following passed:

- `npm run compile`;
- `npm run core-ci`;
- `vscode-win32-x64-min-ci`;
- packaged product checksum validation (`10/10`).

Windows packaging now skips non-PE cross-platform `.node` payloads before
`signtool`/`rcedit`, while preserving processing for actual PE binaries.

## Packaged Product and Restart Acceptance

Product:

`D:\AI_prejoct\skill_Process_Agent\verification\VSCode-win32-x64\Code - OSS.exe`

Isolated user data:

`D:\AI_prejoct\skill_Process_Agent\verification\.verify-pa-product-userdata`

The packaged product published a second nine-AA `PA Creator` with two release
CAs and persisted it in SQLite plus an immutable package directory. A subsequent
process restart with the same user data verified:

- the built-in and published PA Creator cards are both visible;
- both cards use the `创建 PA` primary action rather than `打开运行`;
- Personal Creation shows the persisted item with 更新、导出、回滚、下架;
- invoking the published card starts the PA Creator requirement interaction;
- startup and Profile changes hydrate the in-memory registry projection from
  the main-process SQLite registry.

Startup hydration is owned by an `AfterRestored` Workbench contribution. It
contains IPC failures, joins Profile changes, and ignores stale asynchronous
responses.

## Gate Decision

P9-08 and P9-09 are passed. No release blocker remains in the validated PA
Creator scope. The dirty primary repository was not reset, staged, overwritten,
or used as a packaging workaround, and the shared AI Proxy was not restarted.
