# Classroom — Core UX Repair v8.1

A privacy-first, local teaching workspace for Chrome and GitHub Pages.

## This repair release

- Replaces the Chinese character logo with a clean **C** mark.
- Uses real line icons for navigation.
- Fixes the collapsed sidebar: click the **C** to expand it again.
- Makes **Personal Agenda** a separate list for private appointments, errands, deadlines, and personal events only.
- Keeps recurring Schedule, Calendar services, and class sessions in **Today** and **Week**, not in Personal Agenda.
- Improves Import Center selection, multi-sheet workbook handling, manual header/column mapping, and structured import previews.
- Keeps unmapped source columns inside `sourceRecord`; they are not silently discarded.
- Refreshes Today and Week immediately after a Schedule or Calendar import.

## Import formats

- XLSX / XLSM
- CSV / TSV
- ICS
- JSON / TXT
- DOCX / PPTX
- PDF
- PNG / JPG / JPEG / HEIC as reference documents

Text-based PDFs can be previewed and conservatively parsed. Scanned/image-only PDFs are **not OCR-processed in this offline build**; they remain local reference documents until records are manually confirmed.

## Privacy

Personal data is not stored in the public GitHub repository. It remains in the browser and, when authorized, the user's `Classroom Data` folder.

## Upgrade

Upload all files in this folder to the repository root. Do not clear Chrome site data. The build continues using the existing `classroomDataV1` workspace.
