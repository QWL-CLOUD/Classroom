(function (global) {
  "use strict";

  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const DAY_INDEX = Object.fromEntries(DAY_NAMES.map((day, index) => [day, index]));

  function colToNumber(col) {
    let n = 0;
    for (const ch of col) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function numberToCol(number) {
    let n = number + 1;
    let out = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function decodeCell(ref) {
    const match = String(ref || "").match(/([A-Z]+)(\d+)/i);
    if (!match) return null;
    return { c: colToNumber(match[1].toUpperCase()), r: Number(match[2]) - 1 };
  }

  function normalizeTarget(target) {
    return String(target || "").replace(/^\//, "").replace(/^xl\//, "");
  }

  function normalizeText(value) {
    return String(value ?? "")
      .replace(/\r/g, "")
      .replace(/[–—−~～]/g, "-")
      .replace(/：/g, ":")
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")")
      .replace(/\t/g, " ")
      .replace(/[ \u00a0]+\n/g, "\n")
      .trim();
  }

  function xmlText(node) {
    return Array.from(node?.getElementsByTagName?.("t") || []).map((item) => item.textContent || "").join("");
  }

  async function readWorkbook(file) {
    if (!global.JSZip) throw new Error("The local XLSX reader is missing.");
    const buffer = await file.arrayBuffer();
    const zip = await global.JSZip.loadAsync(buffer);
    const parser = new DOMParser();
    const readText = async (path) => {
      const entry = zip.file(path);
      return entry ? entry.async("text") : "";
    };

    const sharedXml = await readText("xl/sharedStrings.xml");
    const sharedStrings = [];
    if (sharedXml) {
      const doc = parser.parseFromString(sharedXml, "application/xml");
      for (const item of Array.from(doc.getElementsByTagName("si"))) sharedStrings.push(xmlText(item));
    }

    const workbookXml = await readText("xl/workbook.xml");
    if (!workbookXml) throw new Error("This file does not contain a readable Excel workbook.");
    const workbookDoc = parser.parseFromString(workbookXml, "application/xml");
    const relationshipsXml = await readText("xl/_rels/workbook.xml.rels");
    const relationshipsDoc = parser.parseFromString(relationshipsXml, "application/xml");
    const relationships = {};
    for (const rel of Array.from(relationshipsDoc.getElementsByTagName("Relationship"))) {
      relationships[rel.getAttribute("Id")] = normalizeTarget(rel.getAttribute("Target"));
    }

    const sheets = [];
    for (const sheetNode of Array.from(workbookDoc.getElementsByTagName("sheet"))) {
      const relationshipId = sheetNode.getAttribute("r:id") || sheetNode.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      const target = relationships[relationshipId];
      if (!target) continue;
      const path = target.startsWith("worksheets/") ? `xl/${target}` : `xl/${target}`;
      const sheetXml = await readText(path);
      if (!sheetXml) continue;
      const sheetDoc = parser.parseFromString(sheetXml, "application/xml");
      const grid = [];
      let maxRow = 0;
      let maxCol = 0;

      for (const cell of Array.from(sheetDoc.getElementsByTagName("c"))) {
        const location = decodeCell(cell.getAttribute("r"));
        if (!location) continue;
        const type = cell.getAttribute("t");
        let value = "";
        if (type === "inlineStr") value = xmlText(cell);
        else {
          const valueNode = cell.getElementsByTagName("v")[0];
          if (valueNode) {
            value = valueNode.textContent || "";
            if (type === "s") value = sharedStrings[Number(value)] ?? "";
            else if (type === "b") value = value === "1" ? "TRUE" : "FALSE";
          }
        }
        if (!grid[location.r]) grid[location.r] = [];
        grid[location.r][location.c] = value;
        maxRow = Math.max(maxRow, location.r);
        maxCol = Math.max(maxCol, location.c);
      }

      const merges = Array.from(sheetDoc.getElementsByTagName("mergeCell"))
        .map((node) => node.getAttribute("ref"))
        .filter(Boolean);

      sheets.push({
        name: sheetNode.getAttribute("name") || `Sheet ${sheets.length + 1}`,
        grid,
        merges,
        rowCount: maxRow + 1,
        colCount: maxCol + 1,
      });
    }

    return { fileName: file.name, sheets };
  }

  function containsTimeRange(value) {
    return /(\d{1,2}\s*:\s*\d{1,2})\s*[-–—~～]\s*(\d{1,2}\s*:\s*\d{1,2})/.test(String(value || ""));
  }

  function parseTimeToMinutes(raw) {
    const clean = String(raw || "").replace(/\s/g, "");
    const parts = clean.split(":").map(Number);
    if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) return null;
    let [hour, minute] = parts;
    if (hour >= 1 && hour <= 6) hour += 12;
    if (hour === 24) hour = 0;
    return hour * 60 + minute;
  }

  function formatMinutes(minutes) {
    if (!Number.isFinite(minutes)) return "";
    const normalized = ((minutes % 1440) + 1440) % 1440;
    const hour = Math.floor(normalized / 60);
    const minute = normalized % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function displayTime(minutes) {
    if (!Number.isFinite(minutes)) return "";
    const hour24 = Math.floor(minutes / 60) % 24;
    const minute = minutes % 60;
    const suffix = hour24 >= 12 ? "PM" : "AM";
    const hour = hour24 % 12 || 12;
    return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
  }

  function cleanTitle(value) {
    return normalizeText(value)
      .replace(/\(\s*\d+\s*\)\s*/g, " ")
      .replace(/\b(?:Alyssa|MJ|Amira)(?:\s*\+\s*(?:Alyssa|MJ|Amira))*\b\s*$/i, "")
      .replace(/^[-–—:;,.\s]+|[-–—:;,.\s]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function isTeacherOnly(value) {
    const text = cleanTitle(value);
    return /^(?:Alyssa|MJ|Amira)(?:\s*\+\s*(?:Alyssa|MJ|Amira))*$/i.test(text);
  }

  function isDurationOnly(value) {
    return /^\(?\s*\d+\s*\)?\s*(?:min(?:utes?)?)?\s*(?:Alyssa|MJ|Amira)?$/i.test(normalizeText(value));
  }

  function meaningfulTitle(value) {
    const title = cleanTitle(value);
    return title && !isTeacherOnly(title) && !isDurationOnly(title) && !containsTimeRange(title);
  }

  function titleFromContext(lines, index, matchStart, matchEnd) {
    const line = lines[index] || "";
    const prefix = cleanTitle(line.slice(0, matchStart));
    const suffix = cleanTitle(line.slice(matchEnd));
    if (meaningfulTitle(prefix)) return prefix;
    if (meaningfulTitle(suffix)) return suffix;

    const candidates = [];
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = lines[cursor];
      if (containsTimeRange(candidate)) break;
      if (!meaningfulTitle(candidate)) continue;
      candidates.unshift(cleanTitle(candidate));
      if (candidates.length >= 2) break;
    }
    return candidates.length ? candidates.join(" / ") : "Untitled block";
  }

  function teacherFromContext(lines, index) {
    const context = lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 2)).join(" ");
    const names = Array.from(context.matchAll(/\b(Alyssa|MJ|Amira)\b/gi)).map((match) => match[1]);
    return Array.from(new Set(names.map((name) => name[0].toUpperCase() + name.slice(1)))).join(" + ");
  }

  function durationHintFromContext(lines, index) {
    const context = lines.slice(Math.max(0, index - 2), index + 1).join(" ");
    const hints = Array.from(context.matchAll(/\(\s*(\d{1,3})\s*\)/g)).map((match) => Number(match[1]));
    return hints.length ? hints[hints.length - 1] : null;
  }

  function inferCategory(title) {
    const text = normalizeText(title).toLowerCase();
    if (/transition|转换|过渡/.test(text)) return "Transition";
    if (/arrival|到校/.test(text)) return "Arrival";
    if (/recess|课间/.test(text)) return "Recess";
    if (/lunch|午饭|午餐/.test(text)) return "Lunch";
    if (/dismissal|放学/.test(text)) return "Dismissal";
    if (/math|数学/.test(text)) return "Math";
    if (/cla|ela|read aloud|阅读|语言/.test(text)) return "CLA/ELA";
    if (/science|social studies|sass|人文|科学/.test(text)) return "SASS";
    if (/special|体艺/.test(text)) return "Specials";
    if (/mindfulness|quiet time|安静/.test(text)) return "Mindfulness";
    if (/strong start|strong close|活力启动/.test(text)) return "Routine";
    if (/snack/.test(text)) return "Snack";
    if (/meeting/.test(text)) return "Meeting";
    return "Other";
  }

  function defaultBumpParticipation(category) {
    return !["Transition", "Arrival", "Recess", "Lunch", "Dismissal", "Mindfulness", "Snack", "Routine"].includes(category);
  }

  function extractIntervals(text) {
    const normalized = normalizeText(text);
    const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
    const intervals = [];
    const rangePattern = /(\d{1,2}\s*:\s*\d{1,2})\s*-\s*(\d{1,2}\s*:\s*\d{1,2})/g;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      rangePattern.lastIndex = 0;
      let match;
      while ((match = rangePattern.exec(line))) {
        const start = parseTimeToMinutes(match[1]);
        let end = parseTimeToMinutes(match[2]);
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        if (end <= start) end += 12 * 60;
        const title = titleFromContext(lines, lineIndex, match.index, match.index + match[0].length);
        const expectedDuration = durationHintFromContext(lines, lineIndex);
        intervals.push({
          title,
          start,
          end,
          startTime: formatMinutes(start),
          endTime: formatMinutes(end),
          teacher: teacherFromContext(lines, lineIndex),
          expectedDuration,
          actualDuration: end - start,
          rawLine: line,
          lineIndex,
        });
      }
    }

    const dismissalMatch = normalized.match(/Dismissal\s+starts?\s+(\d{1,2}\s*:\s*\d{1,2})[\s\S]*?Dismissal\s+ends?\s+(\d{1,2}\s*:\s*\d{1,2})/i);
    if (dismissalMatch) {
      const start = parseTimeToMinutes(dismissalMatch[1]);
      let end = parseTimeToMinutes(dismissalMatch[2]);
      if (end <= start) end += 12 * 60;
      intervals.push({
        title: "Dismissal",
        start,
        end,
        startTime: formatMinutes(start),
        endTime: formatMinutes(end),
        teacher: "",
        expectedDuration: null,
        actualDuration: end - start,
        rawLine: dismissalMatch[0],
        lineIndex: 999,
      });
    }

    return intervals;
  }

  function synthesizeDurationParent(text, children) {
    const lines = normalizeText(text).split("\n").map((line) => line.trim()).filter(Boolean);
    if (!children.length || !lines.length) return null;
    const firstTimeLine = lines.findIndex(containsTimeRange);
    if (firstTimeLine <= 0) return null;
    const headingLines = lines.slice(0, firstTimeLine).filter(meaningfulTitle);
    const durationMatch = lines.slice(0, firstTimeLine).join(" ").match(/\(\s*(\d{1,3})\s*\)/);
    if (!durationMatch || !headingLines.length) return null;
    const expectedDuration = Number(durationMatch[1]);
    if (expectedDuration < 15) return null;
    const minStart = Math.min(...children.map((item) => item.start));
    const maxEnd = Math.max(...children.map((item) => item.end));
    const explicitContaining = children.some((item) => item.start === minStart && item.end === maxEnd && item.actualDuration >= expectedDuration * 0.75);
    if (explicitContaining) return null;
    return {
      title: headingLines.join(" / "),
      start: minStart,
      end: maxEnd,
      startTime: formatMinutes(minStart),
      endTime: formatMinutes(maxEnd),
      teacher: teacherFromContext(lines, 0),
      expectedDuration,
      actualDuration: maxEnd - minStart,
      rawLine: lines.slice(0, firstTimeLine).join(" / "),
      lineIndex: -1,
      synthesized: true,
    };
  }

  function detectDayHeader(sheet) {
    let best = null;
    for (let row = 0; row < sheet.grid.length; row += 1) {
      const hits = [];
      const values = sheet.grid[row] || [];
      for (let col = 0; col < values.length; col += 1) {
        const value = normalizeText(values[col]);
        const day = DAY_NAMES.find((candidate) => candidate.toLowerCase() === value.toLowerCase());
        if (day) hits.push({ day, col });
      }
      if (!best || hits.length > best.hits.length) best = { row, hits };
    }
    return best && best.hits.length >= 2 ? best : null;
  }

  function inferClassName(sheet, dayColumns, headerRow) {
    const candidates = [];
    for (let row = Math.max(0, headerRow - 3); row < headerRow; row += 1) {
      for (const { col } of dayColumns) {
        const value = cleanTitle(sheet.grid[row]?.[col]);
        if (value && !DAY_NAMES.includes(value) && value.length < 50) candidates.push(value);
      }
    }
    if (!candidates.length) return "Class";
    const counts = new Map();
    for (const candidate of candidates) counts.set(candidate, (counts.get(candidate) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  function parseVisualSchedule(sheet) {
    const header = detectDayHeader(sheet);
    if (!header) return { detected: false, reason: "No Monday–Sunday header row was found.", blocks: [], warnings: [] };
    const dayColumns = header.hits.sort((a, b) => a.col - b.col);
    const className = inferClassName(sheet, dayColumns, header.row);
    const blocks = [];
    const cellIntervals = new Map();
    const globalDismissalRanges = [];

    for (let row = 0; row < sheet.grid.length; row += 1) {
      for (let col = 0; col < (sheet.grid[row]?.length || 0); col += 1) {
        const value = sheet.grid[row]?.[col];
        if (!value) continue;
        const dismissal = extractIntervals(value).filter((item) => item.title === "Dismissal");
        for (const item of dismissal) globalDismissalRanges.push(item);
      }
    }

    for (let dayIndex = 0; dayIndex < dayColumns.length; dayIndex += 1) {
      const { day, col } = dayColumns[dayIndex];
      const nextCol = dayColumns[dayIndex + 1]?.col ?? col + 1;
      for (let row = header.row + 1; row < sheet.grid.length; row += 1) {
        for (let cellCol = col; cellCol < nextCol; cellCol += 1) {
          const rawValue = sheet.grid[row]?.[cellCol];
          if (!rawValue) continue;
          const text = normalizeText(rawValue);
          let intervals = extractIntervals(text).filter((item) => item.title !== "Dismissal");

          if (!intervals.length && meaningfulTitle(text)) {
            const rowReference = normalizeText(sheet.grid[row]?.[1]);
            const fallback = extractIntervals(rowReference)[0];
            if (/^arrival$/i.test(cleanTitle(text)) && fallback) {
              intervals = [{ ...fallback, title: "Arrival", teacher: "", expectedDuration: null, rawLine: text, fallbackFromAxis: true }];
            }
          }

          const parent = synthesizeDurationParent(text, intervals);
          if (parent) intervals.push(parent);
          if (!intervals.length) continue;

          const sourceCell = `${numberToCol(cellCol)}${row + 1}`;
          const cellKey = `${day}|${sourceCell}`;
          cellIntervals.set(cellKey, []);
          for (const interval of intervals) {
            const category = inferCategory(interval.title);
            const id = crypto.randomUUID ? crypto.randomUUID() : `${day}-${sourceCell}-${interval.start}-${interval.end}-${Math.random()}`;
            const block = {
              id,
              day,
              dayIndex: DAY_INDEX[day],
              title: interval.title,
              category,
              subject: category,
              className,
              teacher: interval.teacher,
              start: interval.start,
              end: interval.end,
              startTime: interval.startTime,
              endTime: interval.endTime,
              expectedDuration: interval.expectedDuration,
              actualDuration: interval.actualDuration,
              parentId: null,
              sourceSheet: sheet.name,
              sourceCell,
              sourceText: text,
              sourceLine: interval.rawLine,
              synthesized: Boolean(interval.synthesized),
              fallbackFromAxis: Boolean(interval.fallbackFromAxis),
              participatesInBump: defaultBumpParticipation(category),
              status: "Active",
              effectiveStart: "",
              effectiveEnd: "",
              needsReview: interval.title === "Untitled block" || category === "Other" || (interval.expectedDuration && Math.abs(interval.expectedDuration - interval.actualDuration) >= 5),
              reviewReasons: [],
            };
            if (interval.title === "Untitled block") block.reviewReasons.push("Missing title");
            if (category === "Other") block.reviewReasons.push("Category needs review");
            if (interval.expectedDuration && Math.abs(interval.expectedDuration - interval.actualDuration) >= 5) block.reviewReasons.push(`Duration label says ${interval.expectedDuration} minutes; detected ${interval.actualDuration}`);
            blocks.push(block);
            cellIntervals.get(cellKey).push(block);
          }
        }
      }

      if (globalDismissalRanges.length && !blocks.some((block) => block.day === day && block.category === "Dismissal")) {
        const item = globalDismissalRanges[0];
        blocks.push({
          id: crypto.randomUUID ? crypto.randomUUID() : `${day}-dismissal-${Math.random()}`,
          day,
          dayIndex: DAY_INDEX[day],
          title: "Dismissal",
          category: "Dismissal",
          subject: "Dismissal",
          className,
          teacher: "",
          start: item.start,
          end: item.end,
          startTime: item.startTime,
          endTime: item.endTime,
          expectedDuration: null,
          actualDuration: item.actualDuration,
          parentId: null,
          sourceSheet: sheet.name,
          sourceCell: "B",
          sourceText: item.rawLine,
          sourceLine: item.rawLine,
          synthesized: true,
          fallbackFromAxis: true,
          participatesInBump: false,
          status: "Active",
          effectiveStart: "",
          effectiveEnd: "",
          needsReview: false,
          reviewReasons: [],
        });
      }
    }

    for (const siblings of cellIntervals.values()) {
      for (const child of siblings) {
        const parents = siblings
          .filter((candidate) => candidate.id !== child.id && candidate.start <= child.start && candidate.end >= child.end && candidate.actualDuration > child.actualDuration)
          .sort((a, b) => a.actualDuration - b.actualDuration);
        if (parents[0]) child.parentId = parents[0].id;
      }
    }

    const conflicts = [];
    for (const day of DAY_NAMES) {
      const dayBlocks = blocks.filter((block) => block.day === day && !block.parentId).sort((a, b) => a.start - b.start || a.end - b.end);
      for (let i = 0; i < dayBlocks.length; i += 1) {
        for (let j = i + 1; j < dayBlocks.length; j += 1) {
          const a = dayBlocks[i];
          const b = dayBlocks[j];
          if (b.start >= a.end) break;
          if (a.start < b.end && b.start < a.end) {
            a.needsReview = true;
            b.needsReview = true;
            const reason = `Overlaps ${b.title} (${displayTime(b.start)}–${displayTime(b.end)})`;
            if (!a.reviewReasons.includes(reason)) a.reviewReasons.push(reason);
            const reverse = `Overlaps ${a.title} (${displayTime(a.start)}–${displayTime(a.end)})`;
            if (!b.reviewReasons.includes(reverse)) b.reviewReasons.push(reverse);
            conflicts.push({ day, aId: a.id, bId: b.id });
          }
        }
      }
    }

    blocks.sort((a, b) => a.dayIndex - b.dayIndex || a.start - b.start || b.actualDuration - a.actualDuration);
    const warnings = [];
    const reviewCount = blocks.filter((block) => block.needsReview).length;
    if (reviewCount) warnings.push(`${reviewCount} detected blocks need review.`);
    if (conflicts.length) warnings.push(`${conflicts.length} overlapping block pairs were found.`);

    return {
      detected: true,
      sheetName: sheet.name,
      headerRow: header.row + 1,
      dayColumns,
      className,
      blocks,
      warnings,
      countsByDay: Object.fromEntries(DAY_NAMES.map((day) => [day, blocks.filter((block) => block.day === day).length])),
      reviewCount,
      conflictCount: conflicts.length,
    };
  }

  function detectWorkbookSchedules(workbook) {
    return workbook.sheets.map((sheet) => ({ sheet, result: parseVisualSchedule(sheet) }));
  }

  global.ClassroomXlsx = {
    DAY_NAMES,
    readWorkbook,
    parseVisualSchedule,
    detectWorkbookSchedules,
    extractIntervals,
    parseTimeToMinutes,
    formatMinutes,
    displayTime,
    inferCategory,
  };
})(window);
