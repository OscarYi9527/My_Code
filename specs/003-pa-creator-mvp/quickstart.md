# PA Creator MVP Quickstart

## Create and Publish a PA

1. In the AI window, open **PA Plaza**.
2. Select **PA Creator** and choose **Create PA**.
3. Complete the continuous AA-01 through AA-09 conversation.
4. Accept or revise at the mandatory gates after AA-01, AA-03, AA-05, and
   AA-08.
5. In AA-08, review trial-run and source evidence.
6. In AA-09, publish the immutable version.
7. Return to PA Plaza and verify the new PA card appears without a restart.
8. Open the card and verify execution starts from its manifest entry AA.

## Update a PA

1. Open **Personal Creation → PA**.
2. Select **Update** on an existing PA.
3. PA Creator opens with the artifact identity and base version.
4. Make changes and publish a new patch version.
5. When a running instance is detected, follow the update prompt; do not
   silently move the instance to the new version.

Published package files are never edited in place.

## Publish, Unpublish, and Roll Back

- **Unpublish** removes a PA from Plaza while retaining it in Personal
  Creation.
- **Publish** returns the selected current version to Plaza.
- **Rollback** selects an older immutable version and makes it current.
- A running instance remains pinned unless the user accepts an update.

## Export and Import

1. Select a PA version in Personal Creation and choose **Export**.
2. Save the generated ZIP outside the user-data directory.
3. In the destination Profile, choose **Import** and select the ZIP.
4. Import validates traversal safety, schema `1.0`, host compatibility,
   package layout, contracts, and release evidence before publication.

## Self-Bootstrap Acceptance

Create a PA named **PA Creator**. The published result must:

- contain AA-01 through AA-09;
- contain CA-01 for `ReleaseCandidate`;
- contain CA-02 for `PublishedPAModule`;
- have nine files under `AAList`;
- use AA-01 as `entryActivity`;
- expose **Create PA** as its primary action;
- appear in the current Profile immediately after publication.

## Local Data

Runtime state is under `<AI Editor userDataPath>/pa-registry`. Back up the
whole directory only while AI Editor is closed. See:

- `docs/pa-creator-release.md`
- `docs/pa-creator-rollback.md`
