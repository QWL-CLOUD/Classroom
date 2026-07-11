# Deploy checklist

1. In the current Classroom site, download a backup.
2. Unzip the v8.1 package.
3. Upload every file and the `assets` folder to the GitHub repository root.
4. Commit with: `Repair v8 navigation agenda and imports`
5. Wait for GitHub Pages deployment.
6. Open: `https://qwl-cloud.github.io/Classroom/?v=8.1-core-repair`
7. Hard-refresh once (`Command + Shift + R`).
8. Do **not** clear site data.

## Five-minute acceptance test

- Collapse the sidebar, then click **C** to reopen it.
- Confirm the collapsed sidebar shows icons rather than dots.
- Open Personal Agenda and confirm fixed schedule blocks are absent.
- Add one personal item; edit, pin, duplicate, and delete it.
- Import a Schedule file; open Today and Week and confirm the blocks appear.
- In Import Center, deselect several rows and confirm the scroll position stays put.
- Import an activity workbook to Classroom Playbook using manual column mapping.
- Open Export & Backup and confirm the connected folder status remains available.
