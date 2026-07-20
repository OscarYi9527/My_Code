# PA Creator Host Integration Boundary

**Phase**: P1
**Branch**: `feature/pa-creator-p1`
**Base**: `750de0517db1bda94708d2f5c4a31849c0070072`

## 1. Workbench Ownership

PA Creator is a native Workbench feature. It is not an extension-host feature
and does not create a second Electron application.

Recommended module boundaries:

```text
src/vs/workbench/contrib/paPlaza/
src/vs/workbench/contrib/paCreator/
src/vs/workbench/services/paRegistry/
src/vs/workbench/services/paRuntime/
src/vs/workbench/services/paStorage/
src/vs/workbench/services/paPackaging/
```

P1 lands only `paRegistry` and a `paPlaza` action scaffold. Later phases replace
the scaffold without changing the service-facing card projection.

## 2. AI Window Entry

The current AI Editor conversation is a Chat Editor backed by
`agent-host-codex:/...`. The PA Plaza entry is contributed to
`MenuId.ChatTitleBarMenu` and is visible for Codex Agent Host sessions.

The P1 action uses a quick pick to validate action registration, dependency
injection, localization, and registry discovery. It is not the final PA Plaza
surface.

## 3. Model and Tool Boundary

PA execution must reuse:

```text
Chat Editor
→ agent-host-codex
→ CodexAgent
→ codex app-server
→ external-local-proxy
```

PA services must not create a second model catalog, credential store, terminal
bridge, file-edit bridge, or approval system.

## 4. Storage Boundary

P1 exposes an in-memory built-in registry projection only.

P3 will add:

- profile-scoped SQLite metadata;
- immutable version directories;
- run and checkpoint state;
- audit indexes;
- transaction-backed publication.

Workbench storage may keep view preferences and last-opened identifiers, but
must not become the source of truth for PA packages or run history.

## 5. Profile Boundary

The local registry is profile-scoped. Switching profile changes visibility and
does not delete packages. Cloud identity mapping is an adapter concern and is
not required by the MVP.

## 6. Card Projection Boundary

The plaza-facing `IPaGalleryItem` includes only:

- ID and artifact kind;
- name, icon, and description;
- version, publication status, and updated time;
- optional primary action.

Runtime model, tool, permission, and recent-run details are intentionally
excluded.

## 7. Layering

- `services/paRegistry/common` defines stable contracts.
- `services/paRegistry/browser` provides the initial Workbench implementation.
- `contrib/paPlaza/browser` owns the user entry and presentation.
- Contributions depend on services; services do not depend on contributions.
- Workbench code may use platform/base layers, not sessions-layer modules.

## 8. P1 Gate

P1 passes when:

1. client type-check succeeds;
2. the focused registry unit tests pass;
3. layer validation succeeds;
4. the command is registered in the common Workbench;
5. the original dirty account workspace remains untouched.
