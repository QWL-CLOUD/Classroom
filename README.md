# Classroom · Schedule Studio v7

A privacy-first teaching workspace designed for GitHub Pages. Public code contains only the application; personalized schedules, learners, lessons, and teaching records stay in the browser and the user's connected Classroom Data folder.

## What changed

- Redesigned navigation: Today, Week, Sessions, Planning, Resources, and System.
- Operational Today dashboard with To-do, Reminders, Students to Notice, Quick Capture, and a live vertical schedule timeline.
- Four low-saturation palettes inspired by traditional Chinese colors: Qingdai, Bamboo Moon, Peach Bloom, and Clear Sky.
- Monday–Sunday Week timeline with weekend visibility, filters, current-time line, and nested schedule blocks.
- Sessions is a searchable list view of the same records shown in Week.
- Visual XLSX schedule importer reads every time range inside weekday cells, including nested Part, Transition, Review, Reflection, and Strong Close segments.
- Recurring schedule defaults and date-specific exceptions are stored separately.
- Schedule edits support This occurrence only, This and future occurrences, and Entire default schedule.
- Schedule-aware Bump moves lessons through the next valid recurring block instead of simply adding a day.
- Import history supports deleting imported data separately from removing history. Original source files remain on the user's device.

## Main files

- `index.html`
- `styles-v7.css`
- `app-v7.js`
- `xlsx-import-v7.js`
- `assets/vendor/jszip.min.js`

## Upload

Upload all files and the entire `assets` folder to the root of the GitHub repository. Do not upload the ZIP itself.

Recommended commit message:

`Add Schedule Studio v7`

Then open:

`https://qwl-cloud.github.io/Classroom/?v=7-schedule-studio`

Do not clear browser site data. The application continues to use the existing `classroomDataV1` local workspace key and normalizes earlier data into the v7 structure.
