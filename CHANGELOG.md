# Changelog

## v8.1 — Core UX Repair

### Fixed
- Replaced the “课” logo with a **C** mark and C favicon.
- Replaced placeholder dots/characters with consistent navigation icons.
- Fixed the logo-only navigation state so clicking **C** expands the sidebar.
- Removed Schedule, Calendar, learner services, and tasks from Personal Agenda.
- Added Personal Agenda create, edit, delete, pin, duplicate-to-next-week, search, category, pinned, and date filters.
- Changed Week's former “Agenda” mode label to **List** to avoid confusion with Personal Agenda.
- Kept individual row selection in Import Center from re-rendering and returning to the top.
- Added Select all visible, Select all in file, and Deselect all.
- Added multi-sheet workbook handling, configurable header row, and manual column mapping.
- Added structured import attempts for readable text PDFs instead of always saving them as references.
- Immediately refreshes hidden Today and Week views after Schedule/Calendar import.

### Clarified
- Calendar events can appear in Today and Week.
- Personal Agenda is a private personal-event list only.
- Tasks are imported as Tasks, not into Personal Agenda.

### Known limits
- Scanned PDFs and images do not run OCR in this offline build.
- Complex PDF tables and visually positioned calendars still require review.
- Learner lesson sequences are currently stored inside learner-owned plan records; a full nested lesson editor remains a later refinement.
- Reminders are generated and open related records, but Snooze/Dismiss persistence is not yet implemented.
