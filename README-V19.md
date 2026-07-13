# Classroom v19 — Installation

This package upgrades the current public **Classroom v18 · Stability & Cleanup** build to the v19 Workflow & Navigation layer.

## Files to upload

Upload these items to the root of the `QWL-CLOUD/Classroom` repository:

- `index.html` — replace the current file
- `v19/` — add the entire folder
- `manifest.webmanifest` — replace the current file
- `version.json` — replace the current file
- `CHANGELOG-v19.md`
- `VERSION-v19.txt`

Keep the existing `assets/` folder, `manifest.webmanifest`, and all other files unchanged.

## GitHub web steps

1. Open the `QWL-CLOUD/Classroom` repository.
2. Back up or download the current repository first.
3. Replace the root `index.html` with the included file.
4. Create a root folder named `v19` and upload all three files from this package’s `v19` folder.
5. Replace `manifest.webmanifest` and `version.json` with the included v19 files.
6. Upload `CHANGELOG-v19.md` and `VERSION-v19.txt` to the repository root.
7. Commit the changes to `main`.
8. Open the GitHub Pages site and perform a hard refresh once.

## Data safety

The patch does not clear browser data. It continues to use the existing `cos-*` local-storage records. Do not clear site data during deployment.

A full backup from Classroom Settings is still recommended before replacing files.

## First acceptance pass

After deployment:

1. Open **System → System Health**.
2. Confirm the route, date, parent/child, and Undo/Redo checks.
3. Click **Run live page test**.
4. Import or retain the 27-event PDF calendar batch.
5. Return to System Health and verify that the table shows `27/27` after all events pass.
6. Export the JSON report for the acceptance record.

The 27-event table reads the actual browser data. It cannot report `27/27` until those imported records exist in that browser.

## Rollback

Replace `index.html` with the prior v18 file. The `v19/` folder may remain unused or may be deleted. Existing Classroom data is not changed by the rollback itself.
