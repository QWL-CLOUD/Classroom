# Classroom v19 Changelog

## v19.2A.3 — Undo/Redo Route Preservation

### Fixed
- Prevented Undo and Redo reloads from falling back to Today.
- Preserved the complete current hash, including `?date=...`, across history restoration.
- Added a startup route-restoration guard so the temporary native Today state cannot overwrite the saved route.
- Reopened the saved native route after navigation targets become available.
- Stopped global Undo, Redo, and toast Undo clicks from bubbling to surrounding native controls.
- Delayed normal active-navigation hash synchronization until restoration finishes.

### Preserved
- Week Bump reconciliation from v19.2A.2.
- Route Registry and System Health route checks.
- Calendar repair, quarantine, and acceptance data.
- Existing production `assets` files.
