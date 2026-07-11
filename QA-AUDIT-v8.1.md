# Classroom v8 → v8.1 QA Audit

This audit distinguishes what was visible on the deployed v8 site, what v8.1 repairs, and what remains partial. It is intentionally conservative.

| Area | Deployed v8 finding | v8.1 status |
|---|---|---|
| Logo | Chinese “课” mark still shown | **Fixed:** C mark and C favicon |
| Navigation icons | Mixed text/placeholder symbols | **Fixed:** consistent SVG line icons |
| Collapsed navigation | Could collapse but not reliably reopen | **Fixed:** click C to expand; icon tooltips remain available |
| Personal Agenda | Mixed sessions, meetings, services, tasks, and personal items | **Fixed:** Personal Agenda reads only `personalAgenda` records |
| Week list mode | Named Agenda, creating a second meaning | **Fixed:** renamed to List |
| Import individual select | Deselection could rerender and return to top | **Fixed:** checkbox changes update selection count in place |
| Import bulk select | No dependable one-click flow | **Fixed:** visible/all/none controls |
| Workbook sheets | Generic import was effectively one-sheet oriented | **Improved:** select sheet or import all sheets |
| Header row | Assumed/auto-guessed only | **Improved:** manual header-row control |
| Column mapping | Weak for custom/bilingual headings | **Improved:** manual destination field mapping; source columns retained |
| Activity workbook → Playbook | Auto-detection could fail | **Improved:** manual destination + mapping + all-sheet import; real files still require preview confirmation |
| Schedule import → Today/Week | Shared-data intent existed, refresh was inconsistent | **Fixed in code:** schedule/calendar import explicitly refreshes both views |
| Calendar import | XLSX/CSV/ICS supported; PDF claims exceeded implementation | **Partial:** structured spreadsheet/ICS import plus conservative readable-text PDF parsing |
| Scanned PDF / image | No reliable OCR | **Still limited:** reference-only; no silent OCR guessing |
| Dynamic greeting | Implemented | **Verified in code:** time-aware and uses Settings display name |
| Summer-break countdown | Implemented | **Verified in code:** calendar- or school-day mode |
| Students to Notice | Intended to combine services and memory | **Verified in code:** Social Worker/OT/Speech/Counseling services + date-specific Teaching Memory |
| Tasks | Functional CRUD/completion | **Verified in code** |
| Reminders | Generated from dates/status | **Partial:** no persistent Snooze/Dismiss yet |
| Learner-owned plans | Owner association exists | **Partial:** multiple plans per learner/group work; nested per-lesson editor remains basic |
| Schedule edit scope | Occurrence/future/default and selected weekdays exist | **Verified in code; needs live data regression test** |
| Parent/child schedule cascade | Basic parent linking exists | **Partial:** complex child resizing/recalculation still needs a dedicated editor |
| Bump | Schedule-aware next-slot and sequence modes exist | **Verified in code; needs live data regression test** |
| Local folder backup | Existing v8 feature retained | **Retained; browser permission must be tested after deployment** |

## Static checks completed

- JavaScript syntax check for `app-v8.1.js`
- JavaScript syntax check for `xlsx-import-v8.1.js`
- Duplicate HTML ID check
- Asset/reference check
- Old Chinese logo asset removed from the package

## Runtime testing limitation

The build environment could not complete a headless Chromium session because of container browser restrictions. Therefore, browser permission flows, local-folder access, and interaction regression tests must be performed on the deployed GitHub Pages site in Chrome. This release does not claim those unrun checks passed.
