# PA Creator Rollback and Recovery Guide

## Preferred Artifact Rollback

Published versions are immutable. To return a PA to an earlier version:

1. Open **PA Plaza → Personal Creation → PA**.
2. Select the PA and choose **Rollback**.
3. Select an existing immutable version.
4. Confirm the operation.
5. Verify the card now points to that version and is published.

Rollback changes only the registry's current-version pointer and status. It
does not rewrite or delete either package. If an instance is already running,
keep its pinned version unless the user explicitly accepts an update prompt.

## Failed Publication Recovery

Publication uses package → SQLite → Workbench refresh ordering.

- A release-check failure writes neither package nor metadata.
- A package-write failure removes the staging directory.
- A SQLite registration failure removes the final package directory.
- A projection-refresh failure removes the registered version and package.
- Import extraction is isolated under `.imports` and removed in `finally`.

After a failed publication, refresh PA Plaza and inspect Personal Creation. Do
not manually create a SQLite record for a package directory.

## Full Installation Rollback

Use this procedure when rolling back the AI Editor binary or recovering a
damaged registry:

1. Close every AI Editor process using the affected user-data directory.
2. Preserve the current `<userDataPath>/pa-registry` directory as forensic
   evidence.
3. Restore the matching backup of the complete directory, including
   `registry.sqlite`, any SQLite sidecar files, and `packages`.
4. Launch the matching AI Editor build with an isolated user-data directory
   first.
5. Verify gallery projection, version lists, a checkpoint resume, and one
   export.
6. Only then replace the production user-data copy.

Do not restore only `registry.sqlite` or only `packages`: the registry and
immutable package tree form one consistency boundary.

P9 does not support an in-place downgrade from registry schema `2` to an older
schema. Restore a backup created by the older build instead. A newer database
schema is deliberately rejected.

## Backup

Create backups only while AI Editor is closed:

```powershell
Copy-Item -LiteralPath '<userDataPath>\pa-registry' `
  -Destination '<backupRoot>\pa-registry-<timestamp>' -Recurse
```

Also export business-critical PA versions as ZIP files from Personal Creation.
ZIP exports are portable package backups, but they do not include runs,
checkpoints, audit records, or publication status.

## Unpublish and Remove

- **Unpublish** hides the PA from the Plaza but retains metadata and versions
  in Personal Creation.
- **Permanent delete** is blocked while a run is active.
- After guarded deletion succeeds, package files are removed.
- Prefer unpublish plus ZIP export over permanent deletion.

If the complete local feature must be removed, close AI Editor, back up the
directory, and remove `<userDataPath>/pa-registry` as one unit. The next launch
creates a fresh registry. This does not require or justify restarting the
shared AI Proxy.

## Recovery Verification

- SQLite opens at schema `2`.
- No package version directory was modified in place.
- Every current-version pointer resolves to an existing package.
- Published items appear only in their owning Profile.
- Unpublished items remain in Personal Creation and are absent from Plaza.
- A recovered unfinished run resumes from its latest checkpoint.
