# Classroom v19.2A — Navigation & Week Stability

Release date: 2026-07-13  
Version: 19.2.0

## Navigation

- Converts Learners into one direct sidebar destination.
- Removes the duplicate Learners child navigation from view.
- Converts Library into one direct sidebar destination.
- Removes Library child navigation from view.
- Preserves the original hidden native destination as the page-opening bridge, so existing React navigation continues to work.

## Route registry and System Health

- Adds one shared route registry for Today, Week, Tasks, Learners, Library, Calendar, Import, Export, and Settings.
- Recognizes current and legacy page labels through stable aliases.
- Stops System Health from relying on one exact DOM label.
- Reports each required route as registered or missing.
- Fixes the reported `Missing: Today, Week, Tasks` false failure when those pages exist.

## Week cards

- Adds a stable Week-card layout layer.
- Reserves a real upper-right action rail.
- Prevents long card titles from covering status and action controls.
- Converts child flow rows to a compact two-column layout: time on the left, title and status on the right.
- Adds responsive behavior for narrow multi-column Week views.

## Bump

- Replaces the large labeled Bump control with a 30 × 30 shift-forward icon.
- Places the icon in the Week card’s upper-right action area.
- Stops click propagation before the card’s native navigation handler runs.
- Keeps the current Week route after preview and confirmation.
- Preserves the current scroll position while the updated lesson records are rendered.
- Continues to use the existing Bump preview, conflict checks, blocked-date logic, and Undo history.

## Stability

- Prevents duplicate action rails from being appended during repeated enhancement passes.
- Avoids rewriting the Bump SVG on every mutation cycle.
- Dispatches a data-change event after local lesson writes so the existing app can refresh without a forced route change.

## Compatibility

v19.2A remains a compatibility layer over the current v18 production bundle. It reuses the current `cos-*` data and does not create a parallel database.
