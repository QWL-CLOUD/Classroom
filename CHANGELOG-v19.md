# Classroom v19 — Workflow & Navigation

## Added

- Hash-based URL routes for the main workspace pages and custom v19 pages.
- Browser Back and Forward support.
- Global **Teaching Insights** page for Reflection, Memory, and Next Steps.
- CLA page containing only **Level Learning** and **STAMP-related Skills**.
- Icon-only Undo and Redo controls in the top search area.
- Bump buttons for scheduled learner-planning records.
- Bump preview with connected-record count, date movement preview, holiday/closure avoidance for the final date, and immediate Undo after completion.
- Dedicated workflow and calendar acceptance page.
- Dynamic 27-event PDF calendar acceptance report and JSON export.
- Live in-app navigation acceptance test for Calendar, Week, and Today.

## Changed

- “Classes, Groups & Individuals” is displayed as **Learners**.
- Lesson-plan activity sequence is displayed as **Lesson Flow Editor**.
- Attached activity counts are displayed as **flow blocks** inside planning records.
- Parent and child schedule blocks have clearer indentation, connectors, spacing, and long-title handling.
- “View in Week” writes route/date state and highlights the matching Week card without requiring a manual reload.

## Fixed / guarded

- Date validation uses local noon calendar parsing instead of UTC conversion, preventing timezone-related all-day date false positives.
- Event ranges, malformed times, duplicate event signatures, invalid session dates, and orphan parent/child links are reported separately.
- Undo/Redo captures changes to Classroom `cos-*` data stores while excluding visual preference and navigation-only keys.

## CLA scope

Only these two sources are shown:

1. Level Learning
2. STAMP-related Skills

No placeholder categories are created for school, district, state, or future standards.

## Implementation note

v19 is a compatibility layer over the current v18 production build. It reuses the existing local data records and does not create a parallel database.
