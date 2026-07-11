"use strict";

const STORAGE_KEY = "classroomDataV1";
const UNDO_SCHEDULE_KEY = "classroomUndoScheduleV7";
const UNDO_BUMP_KEY = "classroomUndoBumpV7";
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ENTRY_TYPES = ["Class", "Individual", "Small Group", "Meeting", "Observation", "Preparation", "Reflection"];
const THEMES = {
  qingdai: { name: "青黛 · Qingdai", note: "Ink blue, celadon, rice paper", colors: ["#26394b", "#76928c", "#f5f2e9", "#b37969"] },
  zhuyue: { name: "竹月 · Bamboo Moon", note: "Bamboo green, tea beige, warm clay", colors: ["#30463c", "#7f9b82", "#f4f0e6", "#ae8267"] },
  taoyao: { name: "桃夭 · Peach Bloom", note: "Muted peach, smoke plum, jade gray", colors: ["#493d46", "#b68c94", "#f7f0ed", "#8c9b8d"] },
  jilan: { name: "霁蓝 · Clear Sky", note: "Rain-cleared blue, mist, old gold", colors: ["#2d4152", "#7692a5", "#f1f4f3", "#ae8668"] },
};

const EMPTY_DATA = {
  version: 7,
  lessons: [],
  materials: [],
  calendarEvents: [],
  students: [],
  learners: [],
  smallGroups: [],
  learnerPlans: [],
  teachingMemory: [],
  playbookRoutines: [],
  playbookRuns: [],
  templates: [],
  imports: [],
  automationRules: [],
  automationRuns: [],
  scheduleBlocks: [],
  scheduleExceptions: [],
  tasks: [],
  captures: [],
  settings: {
    theme: "qingdai",
    schoolYearStart: "2026-08-24",
    dayStartTime: "08:00",
    dayEndTime: "16:00",
    showWeekends: true,
  },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const uid = () => crypto.randomUUID();
const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeHTML = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function normalizeData(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalized = clone(EMPTY_DATA);
  for (const key of Object.keys(normalized)) {
    if (Array.isArray(normalized[key])) normalized[key] = Array.isArray(source[key]) ? source[key] : [];
  }
  normalized.settings = { ...EMPTY_DATA.settings, ...(source.settings || {}) };
  normalized.version = 7;
  normalized.lessons = normalized.lessons.map((lesson) => ({
    type: "Class", status: "Planned", duration: 60, subject: "", learner: "", notes: "", pinned: false, ...lesson,
  }));
  normalized.learners = normalized.learners.length ? normalized.learners : (source.students || []);
  normalized.scheduleBlocks = normalized.scheduleBlocks.map((block) => ({
    category: "Other", subject: block.category || "Other", className: "Class", teacher: "", parentId: null,
    participatesInBump: true, status: "Active", effectiveStart: "", effectiveEnd: "", reviewReasons: [], ...block,
  }));
  return normalized;
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return normalizeData(saved ? JSON.parse(saved) : EMPTY_DATA);
  } catch {
    return normalizeData(EMPTY_DATA);
  }
}

let data = loadData();
let currentView = "today";
let weekStart = getMonday(new Date());
let weekMode = "week";
let learnerTab = "individuals";
let scheduleTab = "defaults";
let importState = null;
let folderHandle = null;
let minuteTimer = null;
let entryContext = {};

function persist(message = "Saved") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderAll();
  showToast(message);
  queueFolderSave();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function toISODate(value) {
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(value) { return value ? new Date(`${value}T12:00:00`) : null; }
function addDays(value, days) { const date = new Date(value); date.setDate(date.getDate() + days); return date; }
function getMonday(value) { const date = new Date(value); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); date.setHours(12, 0, 0, 0); return date; }
function dayNameFromDate(value) { return DAY_NAMES[(value.getDay() + 6) % 7]; }
function minutesFromTime(value) { const [hour, minute] = String(value || "00:00").split(":").map(Number); return hour * 60 + minute; }
function timeFromMinutes(value) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function displayTime(value) {
  const minutes = typeof value === "number" ? value : minutesFromTime(value);
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${hour24 % 12 || 12}:${String(minute).padStart(2, "0")} ${hour24 >= 12 ? "PM" : "AM"}`;
}
function dateLabel(date, options = {}) { return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", ...options }); }
function weekNumber(date) {
  const start = parseDate(data.settings.schoolYearStart);
  if (!start || date < start) return 0;
  return Math.floor((getMonday(date) - getMonday(start)) / 604800000) + 1;
}
function isWithinEffectiveRange(block, dateISO) {
  return (!block.effectiveStart || dateISO >= block.effectiveStart) && (!block.effectiveEnd || dateISO <= block.effectiveEnd) && block.status !== "Archived";
}
function categoryColor(category) {
  const key = String(category || "other").toLowerCase().replace(/[\s/]+/g, "-");
  return `var(--category-${key},var(--accent))`;
}
function isSchoolClosed(dateISO) {
  return data.calendarEvents.some((event) => dateISO >= event.date && dateISO <= (event.endDate || event.date) && /closed|holiday|no school/i.test(`${event.type || ""} ${event.title || ""}`));
}

function applyTheme() {
  const theme = data.settings.theme in THEMES ? data.settings.theme : "qingdai";
  document.documentElement.dataset.theme = theme;
  const now = new Date();
  const hour = now.getHours();
  document.body.dataset.daypart = hour < 10 ? "morning" : hour < 13 ? "midday" : hour < 17 ? "afternoon" : "evening";
}

function switchView(view) {
  currentView = view;
  $$(".view").forEach((element) => element.classList.toggle("active", element.id === `${view}View`));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getExceptions(blockId, dateISO) {
  return data.scheduleExceptions.filter((exception) => exception.blockId === blockId && exception.date === dateISO);
}

function scheduleInstancesForDate(dateInput) {
  const date = dateInput instanceof Date ? dateInput : parseDate(dateInput);
  if (!date) return [];
  const dateISO = toISODate(date);
  const day = dayNameFromDate(date);
  const defaults = data.scheduleBlocks.filter((block) => block.day === day && isWithinEffectiveRange(block, dateISO));
  const instances = [];
  for (const block of defaults) {
    const exception = getExceptions(block.id, dateISO).slice(-1)[0];
    if (exception?.cancelled) continue;
    const override = exception?.overrides || {};
    const start = Number.isFinite(override.start) ? override.start : Number(block.start ?? minutesFromTime(block.startTime));
    const end = Number.isFinite(override.end) ? override.end : Number(block.end ?? minutesFromTime(block.endTime));
    instances.push({
      ...block,
      ...override,
      start,
      end,
      startTime: timeFromMinutes(start),
      endTime: timeFromMinutes(end),
      occurrenceDate: dateISO,
      exceptionId: exception?.id || null,
      isException: Boolean(exception),
      defaultBlockId: block.id,
    });
  }
  for (const lesson of data.lessons.filter((item) => item.date === dateISO && !item.scheduleBlockId)) {
    const start = minutesFromTime(lesson.time);
    instances.push({
      id: `lesson-${lesson.id}`, defaultBlockId: null, occurrenceDate: dateISO, title: lesson.title, category: lesson.subject || lesson.type,
      subject: lesson.subject || "", className: lesson.learner || lesson.type, teacher: "", start, end: start + Number(lesson.duration || 60),
      startTime: lesson.time, endTime: timeFromMinutes(start + Number(lesson.duration || 60)), lessonId: lesson.id, type: lesson.type,
      participatesInBump: true, parentId: null, reviewReasons: [],
    });
  }
  return instances.sort((a, b) => a.start - b.start || b.end - a.end);
}

function lessonForInstance(instance) {
  if (instance.lessonId) return data.lessons.find((lesson) => lesson.id === instance.lessonId) || null;
  return data.lessons.find((lesson) => lesson.date === instance.occurrenceDate && (
    lesson.scheduleBlockId === instance.defaultBlockId || (!lesson.scheduleBlockId && lesson.time === instance.startTime && lesson.title === instance.title)
  )) || null;
}

function childrenForInstance(instance, allInstances) {
  return allInstances.filter((candidate) => candidate.parentId === instance.defaultBlockId);
}

function topLevelInstances(instances) {
  const ids = new Set(instances.map((item) => item.defaultBlockId));
  return instances.filter((item) => !item.parentId || !ids.has(item.parentId));
}

function renderAll() {
  applyTheme();
  renderFolderStatus();
  if (currentView === "today") renderToday();
  if (currentView === "week") renderWeek();
  if (currentView === "sessions") renderSessions();
  if (currentView === "learners") renderLearners();
  if (currentView === "learnerPlanning") renderPlans();
  if (currentView === "memory") renderMemory();
  if (currentView === "library") renderLibrary();
  if (currentView === "playbook") renderPlaybook();
  if (currentView === "schedule") renderScheduleSettings();
  if (currentView === "calendar") renderCalendar();
  if (currentView === "tasks") renderTasks();
  if (currentView === "capture") renderCapture();
  if (currentView === "automation") renderAutomation();
  if (currentView === "import") renderImportHistory();
  if (currentView === "backup") renderBackup();
  if (currentView === "settings") renderSettings();
  $("#undoScheduleButton")?.toggleAttribute("disabled", !localStorage.getItem(UNDO_SCHEDULE_KEY));
  $("#undoBumpButton")?.toggleAttribute("disabled", !localStorage.getItem(UNDO_BUMP_KEY));
}

function greetingForTime(date) {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function renderToday() {
  const now = new Date();
  const todayISO = toISODate(now);
  const week = weekNumber(now);
  $("#greeting").textContent = `${greetingForTime(now)}, Alyssa.`;
  $("#todayMeta").textContent = `${dateLabel(now)}${week ? ` · Week ${week}` : ""}`;
  const instances = topLevelInstances(scheduleInstancesForDate(now));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const next = instances.find((item) => item.end > nowMinutes);
  const unplanned = instances.filter((item) => item.participatesInBump && !lessonForInstance(item)).length;
  $("#nextSummary").innerHTML = next
    ? `<strong>Next: ${escapeHTML(next.title)} at ${displayTime(next.start)}</strong><br><span>${unplanned} ${unplanned === 1 ? "lesson" : "lessons"} still need planning</span>`
    : `<strong>No more scheduled blocks today.</strong><br><span>${unplanned} ${unplanned === 1 ? "lesson" : "lessons"} still need planning</span>`;
  renderTodayTasks();
  renderTodayReminders();
  renderStudentsToNotice();
  renderTodayTimeline(instances, now);
}

function renderTodayTasks() {
  const tasks = data.tasks.filter((task) => !task.completed).sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"))).slice(0, 5);
  $("#todayTasks").innerHTML = tasks.length ? tasks.map((task) => `<label class="stack-item"><input type="checkbox" data-complete-task="${task.id}" /><span class="grow"><strong>${escapeHTML(task.title)}</strong><small>${task.dueDate ? `Due ${escapeHTML(task.dueDate)}` : escapeHTML(task.category || "Task")}</small></span></label>`).join("") : `<div class="stack-item"><span class="grow"><strong>Nothing urgent</strong><small>Add a task when something needs your attention.</small></span></div>`;
  $$('[data-complete-task]').forEach((input) => input.addEventListener("change", () => {
    const task = data.tasks.find((item) => item.id === input.dataset.completeTask);
    if (task) { task.completed = true; persist("Task completed"); }
  }));
}

function renderTodayReminders() {
  const today = toISODate(new Date());
  const tomorrow = toISODate(addDays(new Date(), 1));
  const reminders = data.calendarEvents.filter((event) => event.date === today || event.date === tomorrow).slice(0, 5);
  $("#todayReminders").innerHTML = reminders.length ? reminders.map((event) => `<div class="stack-item"><span class="grow"><strong>${escapeHTML(event.title)}</strong><small>${event.date === today ? "Today" : "Tomorrow"}${event.time ? ` · ${displayTime(event.time)}` : ""}</small></span></div>`).join("") : `<div class="stack-item"><span class="grow"><strong>No dated reminders</strong><small>School events and schedule changes appear here.</small></span></div>`;
}

function renderStudentsToNotice() {
  const today = toISODate(new Date());
  const items = data.teachingMemory.filter((memory) => memory.status !== "Resolved" && (!memory.reviewDate || memory.reviewDate <= today)).slice(0, 5);
  $("#studentsToNotice").innerHTML = items.length ? items.map((memory) => `<button class="stack-item text-row" data-open-memory="${memory.id}"><span class="grow"><strong>${escapeHTML(memory.learner || "Learner")}</strong><small>${escapeHTML(memory.nextStep || memory.observation || "Follow up")}</small></span></button>`).join("") : `<div class="stack-item"><span class="grow"><strong>No follow-ups due</strong><small>Teaching Memory can surface learners to notice.</small></span></div>`;
  $$('[data-open-memory]').forEach((button) => button.addEventListener("click", () => openEntryDialog("memory", button.dataset.openMemory)));
}

function renderTodayTimeline(instances, now) {
  const host = $("#todayTimeline");
  if (!instances.length) {
    host.innerHTML = `<div class="timeline-empty"><div><strong>No schedule is available for ${dayNameFromDate(now)}.</strong><p>Import your Master Schedule or add a default block.</p><button class="button primary" data-view-link="import">Import schedule</button></div></div>`;
    bindViewLinks(host);
    return;
  }
  const startSetting = minutesFromTime(data.settings.dayStartTime);
  const endSetting = minutesFromTime(data.settings.dayEndTime);
  const start = Math.min(startSetting, ...instances.map((item) => item.start)) - 10;
  const end = Math.max(endSetting, ...instances.map((item) => item.end)) + 10;
  const total = Math.max(1, end - start);
  const height = Math.max(560, total * 1.15);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowPct = Math.max(0, Math.min(100, ((nowMinutes - start) / total) * 100));
  host.style.height = `${height}px`;
  host.style.setProperty("--now-pct", `${nowPct}%`);
  const events = instances.map((instance) => {
    const top = ((instance.start - start) / total) * height;
    const itemHeight = Math.max(38, ((instance.end - instance.start) / total) * height - 3);
    const state = nowMinutes >= instance.end ? "past" : nowMinutes >= instance.start ? "now" : "future";
    const lesson = lessonForInstance(instance);
    const status = state === "now" ? "NOW" : state === "past" ? "Past" : lesson ? (lesson.status === "Planned" ? "Ready" : lesson.status) : instance.participatesInBump ? "Draft" : "Scheduled";
    return `<button class="timeline-event ${state}" style="top:${top}px;height:${itemHeight}px;--event-color:${categoryColor(instance.category)}" data-open-block="${instance.defaultBlockId || instance.id}" data-occurrence-date="${instance.occurrenceDate}"><span class="time-label">${displayTime(instance.start)}</span><span class="state">${escapeHTML(status)}</span><h4>${escapeHTML(lesson?.title || instance.title)}</h4><p>${escapeHTML(instance.className || instance.subject || instance.category)}${instance.teacher ? ` · ${escapeHTML(instance.teacher)}` : ""}</p></button>`;
  }).join("");
  host.innerHTML = `<div class="timeline-rail"></div>${nowMinutes >= start && nowMinutes <= end ? `<div class="timeline-now"><span class="timeline-now-label">NOW</span></div>` : ""}${events}`;
  bindScheduleBlockButtons(host);
}

function visibleWeekDays() {
  const showWeekend = data.settings.showWeekends && $("#showWeekends")?.checked !== false && weekMode !== "workweek";
  return DAY_NAMES.slice(0, showWeekend ? 7 : 5);
}

function renderWeek() {
  const end = addDays(weekStart, 6);
  $("#weekRange").textContent = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  $("#showWeekends").checked = data.settings.showWeekends;
  const days = visibleWeekDays();
  const dayRecords = days.map((day, index) => {
    const date = addDays(weekStart, index);
    return { day, date, iso: toISODate(date), instances: scheduleInstancesForDate(date) };
  });
  populateSubjectFilter(dayRecords.flatMap((record) => record.instances));
  if (weekMode === "agenda") { renderWeekAgenda(dayRecords); return; }
  const typeFilter = $("#weekTypeFilter").value;
  const subjectFilter = $("#weekSubjectFilter").value;
  for (const record of dayRecords) record.instances = record.instances.filter((item) => (!typeFilter || (lessonForInstance(item)?.type || "Class") === typeFilter) && (!subjectFilter || (item.subject || item.category) === subjectFilter));
  const all = dayRecords.flatMap((record) => record.instances);
  const start = Math.min(minutesFromTime(data.settings.dayStartTime), ...(all.length ? all.map((item) => item.start) : [480])) - 5;
  const endMinutes = Math.max(minutesFromTime(data.settings.dayEndTime), ...(all.length ? all.map((item) => item.end) : [960])) + 5;
  const minuteHeight = 1.18;
  const calendarHeight = (endMinutes - start) * minuteHeight;
  const marks = [];
  for (let minute = Math.ceil(start / 30) * 30; minute <= endMinutes; minute += 30) marks.push(`<span class="time-mark" style="top:${(minute - start) * minuteHeight}px">${minute % 60 === 0 ? displayTime(minute).replace(":00", "") : displayTime(minute)}</span>`);
  const todayISO = toISODate(new Date());
  const header = `<div class="week-header-cell"></div>${dayRecords.map((record) => `<div class="week-header-cell ${record.iso === todayISO ? "today" : ""}"><small>${record.day}</small><strong>${record.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong><button class="day-add" data-add-date="${record.iso}" title="Add entry">+</button></div>`).join("")}`;
  const columns = dayRecords.map((record) => {
    const roots = topLevelInstances(record.instances);
    const now = new Date();
    const nowMinute = now.getHours() * 60 + now.getMinutes();
    const currentLine = record.iso === todayISO && nowMinute >= start && nowMinute <= endMinutes ? `<div class="current-time-line" style="top:${(nowMinute - start) * minuteHeight}px"></div>` : "";
    const blocks = roots.map((instance) => {
      const top = (instance.start - start) * minuteHeight;
      const height = Math.max(18, (instance.end - instance.start) * minuteHeight - 2);
      const lesson = lessonForInstance(instance);
      const children = childrenForInstance(instance, record.instances);
      const conflict = (instance.reviewReasons || []).some((reason) => /overlap/i.test(reason));
      return `<button class="week-event ${conflict ? "conflict" : ""}" style="top:${top}px;height:${height}px;--event-color:${categoryColor(instance.category)}" data-open-block="${instance.defaultBlockId || instance.id}" data-occurrence-date="${record.iso}"><h4>${escapeHTML(lesson?.title || instance.title)}</h4><p>${displayTime(instance.start)}–${displayTime(instance.end)}${lesson?.status ? ` · ${escapeHTML(lesson.status)}` : ""}</p>${children.length && height > 65 ? `<div class="children">${children.slice(0, 4).map((child) => `<span class="child">${displayTime(child.start)} ${escapeHTML(child.title)}</span>`).join("")}</div>` : ""}</button>`;
    }).join("");
    return `<div class="day-column ${record.day === "Saturday" || record.day === "Sunday" ? "weekend" : ""} ${record.iso === todayISO ? "today" : ""}">${currentLine}${blocks}</div>`;
  }).join("");
  $("#weekCalendar").innerHTML = `<div class="week-grid" style="--day-count:${dayRecords.length};--calendar-height:${calendarHeight}px;--minute-height:${minuteHeight}px">${header}<div class="time-axis">${marks.join("")}</div>${columns}</div>`;
  bindScheduleBlockButtons($("#weekCalendar"));
  $$('[data-add-date]').forEach((button) => button.addEventListener("click", () => openEntryDialog("lesson", null, { date: button.dataset.addDate })));
}

function renderWeekAgenda(dayRecords) {
  $("#weekCalendar").innerHTML = `<div class="agenda-list">${dayRecords.map((record) => `<section class="agenda-day"><h3>${record.day} · ${record.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</h3>${topLevelInstances(record.instances).map((instance) => { const lesson = lessonForInstance(instance); return `<div class="data-row"><div><h4>${escapeHTML(lesson?.title || instance.title)}</h4><p>${displayTime(instance.start)}–${displayTime(instance.end)} · ${escapeHTML(instance.className || instance.category)}</p></div><div class="meta">${escapeHTML(lesson?.status || "Scheduled")}</div><div class="row-actions"><button class="mini-button" data-open-block="${instance.defaultBlockId || instance.id}" data-occurrence-date="${record.iso}">Open</button></div></div>`; }).join("") || `<p class="meta">No entries</p>`}</section>`).join("")}</div>`;
  bindScheduleBlockButtons($("#weekCalendar"));
}

function populateSubjectFilter(instances) {
  const selected = $("#weekSubjectFilter").value;
  const subjects = Array.from(new Set(instances.map((item) => item.subject || item.category).filter(Boolean))).sort();
  $("#weekSubjectFilter").innerHTML = `<option value="">All subjects</option>${subjects.map((subject) => `<option ${subject === selected ? "selected" : ""}>${escapeHTML(subject)}</option>`).join("")}`;
}

function buildSessionRows() {
  const start = parseDate($("#sessionStartDate")?.value) || addDays(new Date(), -30);
  const end = parseDate($("#sessionEndDate")?.value) || addDays(new Date(), 90);
  const rows = [];
  for (let date = new Date(start); date <= end; date = addDays(date, 1)) {
    for (const instance of topLevelInstances(scheduleInstancesForDate(date))) {
      const lesson = lessonForInstance(instance);
      rows.push({ ...instance, lesson, date: toISODate(date), type: lesson?.type || "Class", person: lesson?.learner || instance.className || "" });
    }
  }
  return rows;
}

function renderSessions() {
  const rows = buildSessionRows();
  const people = Array.from(new Set(rows.map((row) => row.person).filter(Boolean))).sort();
  const types = Array.from(new Set(rows.map((row) => row.type).filter(Boolean))).sort();
  const personSelected = $("#sessionPersonFilter").value;
  const typeSelected = $("#sessionTypeFilter").value;
  $("#sessionPersonFilter").innerHTML = `<option value="">All people</option>${people.map((person) => `<option ${person === personSelected ? "selected" : ""}>${escapeHTML(person)}</option>`).join("")}`;
  $("#sessionTypeFilter").innerHTML = `<option value="">All types</option>${types.map((type) => `<option ${type === typeSelected ? "selected" : ""}>${escapeHTML(type)}</option>`).join("")}`;
  const query = $("#sessionSearch").value.trim().toLowerCase();
  const filtered = rows.filter((row) => (!query || `${row.title} ${row.lesson?.title || ""} ${row.person} ${row.teacher} ${row.subject}`.toLowerCase().includes(query)) && (!personSelected || row.person === personSelected) && (!typeSelected || row.type === typeSelected));
  $("#sessionsList").innerHTML = filtered.slice(0, 300).map((row) => `<div class="data-row"><div><h4>${escapeHTML(row.lesson?.title || row.title)}</h4><p>${escapeHTML(row.date)} · ${displayTime(row.start)}–${displayTime(row.end)} · ${escapeHTML(row.person || row.subject)}</p></div><div class="meta"><span class="tag">${escapeHTML(row.type)}</span> ${escapeHTML(row.lesson?.status || "Scheduled")}</div><div class="row-actions"><button class="mini-button" data-open-block="${row.defaultBlockId || row.id}" data-occurrence-date="${row.date}">Open</button></div></div>`).join("") || `<div class="empty-state">No sessions match these filters.</div>`;
  bindScheduleBlockButtons($("#sessionsList"));
}

const ENTRY_DEFINITIONS = {
  lesson: {
    title: "Session",
    collection: "lessons",
    fields: [
      ["title", "Title", "text", true], ["date", "Date", "date", true], ["time", "Start time", "time", true], ["duration", "Duration (minutes)", "number", true],
      ["type", "Type", "select", false, ENTRY_TYPES], ["subject", "Subject", "text"], ["learner", "Person / group", "text"], ["status", "Status", "select", false, ["Planned", "Ready", "Completed", "Needs follow-up", "Cancelled"]],
      ["notes", "Notes", "textarea", false, null, "span-2"],
    ],
    defaults: { duration: 60, type: "Class", status: "Planned", date: toISODate(new Date()), time: "09:00" },
  },
  learner: {
    title: "Learner",
    collection: "learners",
    fields: [["name", "Name", "text", true], ["grade", "Grade / level", "text"], ["goals", "Goals", "textarea", false, null, "span-2"], ["interests", "Interests", "text"], ["notes", "Notes", "textarea"]],
  },
  group: {
    title: "Small group",
    collection: "smallGroups",
    fields: [["name", "Group name", "text", true], ["members", "Members (comma-separated)", "text"], ["goal", "Shared goal", "textarea", false, null, "span-2"], ["notes", "Notes", "textarea", false, null, "span-2"]],
  },
  plan: {
    title: "Learner plan",
    collection: "learnerPlans",
    fields: [["title", "Plan title", "text", true], ["planType", "Plan type", "select", false, ["Individual", "Small Group"]], ["learner", "Learner / group", "text", true], ["status", "Status", "select", false, ["Active", "Paused", "Completed"]], ["goal", "Goal", "textarea", false, null, "span-2"], ["nextStep", "Next step", "textarea"], ["reviewDate", "Review date", "date"]],
    defaults: { planType: "Individual", status: "Active" },
  },
  memory: {
    title: "Teaching memory",
    collection: "teachingMemory",
    fields: [["learner", "Learner / group", "text", true], ["date", "Date", "date", true], ["category", "Category", "select", false, ["Observation", "What worked", "Challenge", "Evidence", "Reflection"]], ["status", "Status", "select", false, ["Needs follow-up", "No action", "Resolved"]], ["observation", "Observation", "textarea", true, null, "span-2"], ["nextStep", "Next step", "textarea"], ["reviewDate", "Review date", "date"], ["tags", "Tags", "text", false, null, "span-2"]],
    defaults: { date: toISODate(new Date()), category: "Observation", status: "Needs follow-up" },
  },
  resource: {
    title: "Library resource",
    collection: "materials",
    fields: [["title", "Title", "text", true], ["type", "Resource type", "select", false, ["Slides", "Worksheet", "Assessment", "Image", "Audio", "Video", "Link", "Other"]], ["url", "File or URL", "text", false, null, "span-2"], ["grade", "Grade", "text"], ["skill", "Skill", "text"], ["topic", "Topic", "text"], ["unit", "Unit / learner", "text"], ["tags", "Tags", "text", false, null, "span-2"], ["notes", "Notes", "textarea", false, null, "span-2"]],
    defaults: { type: "Other" },
  },
  routine: {
    title: "Playbook routine",
    collection: "playbookRoutines",
    fields: [["title", "Routine title", "text", true], ["category", "Routine type", "select", false, ["Daily", "Teaching", "Operational"]], ["purpose", "Purpose", "textarea", false, null, "span-2"], ["whenToUse", "When / trigger", "text"], ["frequency", "Frequency", "text"], ["steps", "Checklist steps (one per line)", "textarea", false, null, "span-2"], ["cues", "Teacher language / cues", "textarea"], ["recovery", "Reset / recovery plan", "textarea"], ["tags", "Tags", "text", false, null, "span-2"]],
    defaults: { category: "Teaching" },
  },
  event: {
    title: "Calendar event",
    collection: "calendarEvents",
    fields: [["title", "Event title", "text", true], ["type", "Event type", "select", false, ["School event", "School closed", "Testing", "Assembly", "Field trip", "Early dismissal", "Reminder"]], ["date", "Start date", "date", true], ["endDate", "End date", "date"], ["time", "Time", "time"], ["notes", "Notes", "textarea", false, null, "span-2"]],
    defaults: { date: toISODate(new Date()), type: "School event" },
  },
  task: {
    title: "Task",
    collection: "tasks",
    fields: [["title", "Task", "text", true], ["dueDate", "Due date", "date"], ["category", "Category", "select", false, ["Preparation", "Communication", "Follow-up", "Administrative", "Personal"]], ["priority", "Priority", "select", false, ["Low", "Normal", "High"]], ["notes", "Notes", "textarea", false, null, "span-2"]],
    defaults: { category: "Preparation", priority: "Normal", completed: false },
  },
};

function renderField([key, label, type, required, options, className], value) {
  const requiredAttr = required ? "required" : "";
  const classAttr = className ? ` class="${className}"` : "";
  if (type === "select") return `<label${classAttr}>${escapeHTML(label)}<select data-entry-field="${key}" ${requiredAttr}>${(options || []).map((option) => `<option ${String(value ?? "") === option ? "selected" : ""}>${escapeHTML(option)}</option>`).join("")}</select></label>`;
  if (type === "textarea") return `<label${classAttr}>${escapeHTML(label)}<textarea data-entry-field="${key}" rows="4" ${requiredAttr}>${escapeHTML(value ?? "")}</textarea></label>`;
  return `<label${classAttr}>${escapeHTML(label)}<input data-entry-field="${key}" type="${type}" value="${escapeHTML(value ?? "")}" ${requiredAttr} /></label>`;
}

function openEntryDialog(kind, id = null, preset = {}) {
  const definition = ENTRY_DEFINITIONS[kind];
  if (!definition) return;
  const collection = data[definition.collection];
  const existing = id ? collection.find((item) => item.id === id) : null;
  const record = { ...(definition.defaults || {}), ...(existing || {}), ...preset };
  entryContext = { ...preset };
  $("#entryId").value = existing?.id || "";
  $("#entryKind").value = kind;
  $("#entryDialogEyebrow").textContent = existing ? "Edit" : "New";
  $("#entryDialogTitle").textContent = `${existing ? "Edit" : "Add"} ${definition.title.toLowerCase()}`;
  $("#entryFields").innerHTML = definition.fields.map((field) => renderField(field, record[field[0]])).join("");
  $("#deleteEntryButton").classList.toggle("hidden", !existing);
  $("#entryDialog").showModal();
}

function saveEntryFromDialog() {
  const kind = $("#entryKind").value;
  const definition = ENTRY_DEFINITIONS[kind];
  if (!definition) return;
  const id = $("#entryId").value || uid();
  const record = { id };
  for (const input of $$('[data-entry-field]', $("#entryFields"))) record[input.dataset.entryField] = input.type === "number" ? Number(input.value) : input.value.trim();
  if (kind === "task") record.completed = data.tasks.find((item) => item.id === id)?.completed || false;
  if (kind === "lesson") {
    const old = data.lessons.find((item) => item.id === id);
    record.scheduleBlockId = old?.scheduleBlockId || entryContext.scheduleBlockId || "";
    record.seriesKey = old?.seriesKey || entryContext.seriesKey || id;
    record.pinned = old?.pinned || false;
  }
  const collection = data[definition.collection];
  const index = collection.findIndex((item) => item.id === id);
  if (index >= 0) collection[index] = { ...collection[index], ...record, updatedAt: Date.now() };
  else collection.push({ ...record, createdAt: Date.now(), updatedAt: Date.now() });
  $("#entryDialog").close();
  entryContext = {};
  persist(`${definition.title} ${index >= 0 ? "updated" : "added"}`);
}

function deleteEntryFromDialog() {
  const kind = $("#entryKind").value;
  const definition = ENTRY_DEFINITIONS[kind];
  const id = $("#entryId").value;
  if (!definition || !id || !confirm(`Delete this ${definition.title.toLowerCase()}?`)) return;
  data[definition.collection] = data[definition.collection].filter((item) => item.id !== id);
  $("#entryDialog").close();
  persist(`${definition.title} deleted`);
}

function renderLearners() {
  const items = learnerTab === "individuals" ? data.learners : data.smallGroups;
  $("#learnersContent").innerHTML = items.map((item) => `<article class="item-card"><span class="eyebrow">${learnerTab === "individuals" ? "Individual" : "Small group"}</span><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.grade || item.goal || item.goals || "No goal added yet.")}</p><div class="card-actions"><button class="mini-button" data-edit-${learnerTab === "individuals" ? "learner" : "group"}="${item.id}">Edit</button><button class="mini-button" data-memory-for="${escapeHTML(item.name)}">Add memory</button></div></article>`).join("") || `<div class="empty-state">No ${learnerTab === "individuals" ? "individual learners" : "small groups"} yet.</div>`;
  $$('[data-edit-learner]').forEach((button) => button.addEventListener("click", () => openEntryDialog("learner", button.dataset.editLearner)));
  $$('[data-edit-group]').forEach((button) => button.addEventListener("click", () => openEntryDialog("group", button.dataset.editGroup)));
  $$('[data-memory-for]').forEach((button) => button.addEventListener("click", () => openEntryDialog("memory", null, { learner: button.dataset.memoryFor })));
}

function renderPlans() {
  $("#plansContent").innerHTML = data.learnerPlans.map((plan) => `<article class="item-card"><span class="eyebrow">${escapeHTML(plan.planType || "Individual")}</span><h3>${escapeHTML(plan.title)}</h3><p><strong>${escapeHTML(plan.learner || "")}</strong><br>${escapeHTML(plan.goal || "No goal added.")}</p><div class="card-actions"><button class="mini-button" data-edit-plan="${plan.id}">Edit</button><button class="mini-button" data-plan-memory="${escapeHTML(plan.learner || "")}">Memory</button></div></article>`).join("") || `<div class="empty-state">No individual or small-group plans yet.</div>`;
  $$('[data-edit-plan]').forEach((button) => button.addEventListener("click", () => openEntryDialog("plan", button.dataset.editPlan)));
  $$('[data-plan-memory]').forEach((button) => button.addEventListener("click", () => openEntryDialog("memory", null, { learner: button.dataset.planMemory })));
}

function renderMemory() {
  $("#memoryContent").innerHTML = [...data.teachingMemory].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).map((memory) => `<div class="data-row"><div><h4>${escapeHTML(memory.learner || "Learner")}</h4><p>${escapeHTML(memory.observation || "")}</p></div><div class="meta">${escapeHTML(memory.date || "")} · ${escapeHTML(memory.status || "No action")}${memory.nextStep ? `<br>Next: ${escapeHTML(memory.nextStep)}` : ""}</div><div class="row-actions"><button class="mini-button" data-edit-memory="${memory.id}">Edit</button></div></div>`).join("") || `<div class="empty-state">No Teaching Memory records yet.</div>`;
  $$('[data-edit-memory]').forEach((button) => button.addEventListener("click", () => openEntryDialog("memory", button.dataset.editMemory)));
}

function renderLibrary() {
  const query = $("#librarySearch").value.trim().toLowerCase();
  const selected = $("#libraryTypeFilter").value;
  const types = Array.from(new Set(data.materials.map((item) => item.type).filter(Boolean))).sort();
  $("#libraryTypeFilter").innerHTML = `<option value="">All resource types</option>${types.map((type) => `<option ${type === selected ? "selected" : ""}>${escapeHTML(type)}</option>`).join("")}`;
  const items = data.materials.filter((item) => (!query || `${item.title} ${item.topic} ${item.tags} ${item.skill}`.toLowerCase().includes(query)) && (!selected || item.type === selected));
  $("#libraryContent").innerHTML = items.map((item) => `<article class="item-card"><span class="eyebrow">${escapeHTML(item.type || "Resource")}</span><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML([item.grade, item.skill, item.topic].filter(Boolean).join(" · ") || item.notes || "No description")}</p><div class="card-actions">${item.url ? `<button class="mini-button" data-open-url="${escapeHTML(item.url)}">Open</button>` : ""}<button class="mini-button" data-edit-resource="${item.id}">Edit</button></div></article>`).join("") || `<div class="empty-state">No Library resources yet.</div>`;
  $$('[data-edit-resource]').forEach((button) => button.addEventListener("click", () => openEntryDialog("resource", button.dataset.editResource)));
  $$('[data-open-url]').forEach((button) => button.addEventListener("click", () => window.open(button.dataset.openUrl, "_blank", "noopener")));
}

function renderPlaybook() {
  $("#playbookContent").innerHTML = data.playbookRoutines.map((routine) => `<article class="item-card"><span class="eyebrow">${escapeHTML(routine.category || "Routine")}</span><h3>${escapeHTML(routine.title)}</h3><p>${escapeHTML(routine.purpose || routine.whenToUse || "Reusable classroom procedure")}</p><div class="card-actions"><button class="mini-button" data-edit-routine="${routine.id}">Edit</button><button class="mini-button" data-run-routine="${routine.id}">Run checklist</button></div></article>`).join("") || `<div class="empty-state">No Classroom Playbook routines yet.</div>`;
  $$('[data-edit-routine]').forEach((button) => button.addEventListener("click", () => openEntryDialog("routine", button.dataset.editRoutine)));
  $$('[data-run-routine]').forEach((button) => button.addEventListener("click", () => {
    const routine = data.playbookRoutines.find((item) => item.id === button.dataset.runRoutine);
    openDrawer("Playbook", routine?.title || "Routine", `<div class="detail-section"><h4>Checklist</h4>${String(routine?.steps || "No steps added.").split(/\n+/).map((step) => `<label class="stack-item"><input type="checkbox" /><span>${escapeHTML(step)}</span></label>`).join("")}</div>`);
  }));
}

function renderCalendar() {
  $("#calendarContent").innerHTML = [...data.calendarEvents].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((event) => `<div class="data-row"><div><h4>${escapeHTML(event.title)}</h4><p>${escapeHTML(event.type || "School event")}${event.notes ? ` · ${escapeHTML(event.notes)}` : ""}</p></div><div class="meta">${escapeHTML(event.date || "")}${event.endDate && event.endDate !== event.date ? ` – ${escapeHTML(event.endDate)}` : ""}</div><div class="row-actions"><button class="mini-button" data-edit-event="${event.id}">Edit</button></div></div>`).join("") || `<div class="empty-state">No school calendar events yet.</div>`;
  $$('[data-edit-event]').forEach((button) => button.addEventListener("click", () => openEntryDialog("event", button.dataset.editEvent)));
}

function renderTasks() {
  $("#tasksContent").innerHTML = [...data.tasks].sort((a, b) => Number(a.completed) - Number(b.completed) || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"))).map((task) => `<div class="data-row"><div><h4>${task.completed ? "✓ " : ""}${escapeHTML(task.title)}</h4><p>${escapeHTML(task.category || "Task")}${task.notes ? ` · ${escapeHTML(task.notes)}` : ""}</p></div><div class="meta">${escapeHTML(task.dueDate || "No due date")} · ${escapeHTML(task.priority || "Normal")}</div><div class="row-actions"><button class="mini-button" data-toggle-task="${task.id}">${task.completed ? "Reopen" : "Complete"}</button><button class="mini-button" data-edit-task="${task.id}">Edit</button></div></div>`).join("") || `<div class="empty-state">No tasks yet.</div>`;
  $$('[data-toggle-task]').forEach((button) => button.addEventListener("click", () => { const task = data.tasks.find((item) => item.id === button.dataset.toggleTask); if (task) { task.completed = !task.completed; persist("Task updated"); } }));
  $$('[data-edit-task]').forEach((button) => button.addEventListener("click", () => openEntryDialog("task", button.dataset.editTask)));
}

function renderCapture() {
  $("#captureContent").innerHTML = [...data.captures].sort((a, b) => b.createdAt - a.createdAt).map((capture) => `<div class="data-row"><div><h4>${escapeHTML(capture.type || "Note")}</h4><p>${escapeHTML(capture.text)}</p></div><div class="meta">${new Date(capture.createdAt).toLocaleString()}</div><div class="row-actions"><button class="mini-button" data-convert-capture="${capture.id}">Convert…</button><button class="mini-button" data-delete-capture="${capture.id}">Delete</button></div></div>`).join("") || `<div class="empty-state">Quick Capture is empty.</div>`;
  $$('[data-delete-capture]').forEach((button) => button.addEventListener("click", () => { data.captures = data.captures.filter((item) => item.id !== button.dataset.deleteCapture); persist("Capture deleted"); }));
  $$('[data-convert-capture]').forEach((button) => button.addEventListener("click", () => convertCapture(button.dataset.convertCapture)));
}

function convertCapture(id) {
  const capture = data.captures.find((item) => item.id === id);
  if (!capture) return;
  const choice = prompt("Convert to: task, memory, resource, or lesson", capture.type === "Task" ? "task" : "task");
  if (!choice) return;
  const normalized = choice.trim().toLowerCase();
  if (normalized === "task") openEntryDialog("task", null, { title: capture.text });
  else if (normalized === "memory") openEntryDialog("memory", null, { observation: capture.text });
  else if (normalized === "resource") openEntryDialog("resource", null, { title: capture.text });
  else if (normalized === "lesson") openEntryDialog("lesson", null, { title: capture.text });
}

function renderAutomation() {
  const reviewBlocks = data.scheduleBlocks.filter((block) => block.needsReview);
  const unplanned = [];
  for (let offset = 0; offset < 14; offset += 1) {
    const date = addDays(new Date(), offset);
    for (const instance of topLevelInstances(scheduleInstancesForDate(date))) if (instance.participatesInBump && !lessonForInstance(instance)) unplanned.push(instance);
  }
  const followUps = data.teachingMemory.filter((memory) => memory.status === "Needs follow-up");
  $("#automationContent").innerHTML = `
    <div class="data-row"><div><h4>Schedule import review</h4><p>${reviewBlocks.length} blocks have conflicts, unclear categories, or duration mismatches.</p></div><div class="meta">Review first</div><div><button class="mini-button" data-view-link="schedule">Open</button></div></div>
    <div class="data-row"><div><h4>Lessons needing planning</h4><p>${unplanned.length} instructional blocks in the next 14 days have no lesson content.</p></div><div class="meta">No automatic changes</div><div><button class="mini-button" data-view-link="week">Open week</button></div></div>
    <div class="data-row"><div><h4>Teaching Memory follow-up</h4><p>${followUps.length} records still need follow-up.</p></div><div class="meta">Review first</div><div><button class="mini-button" data-view-link="memory">Open</button></div></div>`;
  bindViewLinks($("#automationContent"));
}

function scheduleConflictCount() {
  let count = 0;
  for (const day of DAY_NAMES) {
    const blocks = data.scheduleBlocks.filter((block) => block.day === day && !block.parentId && block.status !== "Archived").sort((a, b) => a.start - b.start);
    for (let i = 0; i < blocks.length; i += 1) {
      for (let j = i + 1; j < blocks.length; j += 1) {
        if (blocks[j].start >= blocks[i].end) break;
        if (blocks[i].start < blocks[j].end && blocks[j].start < blocks[i].end) count += 1;
      }
    }
  }
  return count;
}

function renderScheduleSettings() {
  $("#defaultBlockCount").textContent = data.scheduleBlocks.length;
  $("#exceptionCount").textContent = data.scheduleExceptions.length;
  $("#scheduleReviewCount").textContent = data.scheduleBlocks.filter((block) => block.needsReview).length;
  $("#scheduleConflictCount").textContent = scheduleConflictCount();
  $$("[data-schedule-tab]").forEach((button) => button.classList.toggle("active", button.dataset.scheduleTab === scheduleTab));
  const host = $("#scheduleSettingsContent");
  if (scheduleTab === "exceptions") {
    host.innerHTML = [...data.scheduleExceptions].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((exception) => {
      const block = data.scheduleBlocks.find((item) => item.id === exception.blockId);
      return `<div class="data-row"><div><h4>${escapeHTML(exception.cancelled ? "Cancelled: " : "Modified: ")}${escapeHTML(block?.title || "Schedule block")}</h4><p>${escapeHTML(exception.date)} · ${escapeHTML(exception.reason || "One-time exception")}</p></div><div class="meta">${exception.cancelled ? "Cancelled" : `${displayTime(exception.overrides?.start ?? block?.start)}–${displayTime(exception.overrides?.end ?? block?.end)}`}</div><div class="row-actions"><button class="mini-button" data-revert-exception="${exception.id}">Revert to default</button></div></div>`;
    }).join("") || `<div class="empty-state">No date-specific exceptions.</div>`;
    $$('[data-revert-exception]').forEach((button) => button.addEventListener("click", () => { saveUndoSchedule(); data.scheduleExceptions = data.scheduleExceptions.filter((item) => item.id !== button.dataset.revertException); persist("Exception reverted to default"); }));
    return;
  }
  let blocks = [...data.scheduleBlocks];
  if (scheduleTab === "review") blocks = blocks.filter((block) => block.needsReview);
  blocks.sort((a, b) => DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day) || a.start - b.start || b.end - a.end);
  host.innerHTML = blocks.map((block) => `<div class="data-row"><div><h4>${escapeHTML(block.title)} ${block.needsReview ? `<span class="tag review-badge">Needs review</span>` : ""}</h4><p>${escapeHTML(block.day)} · ${displayTime(block.start)}–${displayTime(block.end)} · ${escapeHTML(block.category)}${block.parentId ? " · Child block" : ""}</p>${block.reviewReasons?.length ? `<p>${escapeHTML(block.reviewReasons.join("; "))}</p>` : ""}</div><div class="meta">${escapeHTML(block.className || "Class")}<br>${block.participatesInBump ? "Bump enabled" : "Fixed routine"}</div><div class="row-actions"><button class="mini-button" data-edit-default-block="${block.id}">Edit default</button></div></div>`).join("") || `<div class="empty-state">No schedule blocks yet.</div>`;
  $$('[data-edit-default-block]').forEach((button) => button.addEventListener("click", () => openScheduleDialog(button.dataset.editDefaultBlock, null, "default")));
}

function openDrawer(eyebrow, title, body) {
  $("#drawerEyebrow").textContent = eyebrow;
  $("#drawerTitle").textContent = title;
  $("#drawerBody").innerHTML = body;
  $("#detailDrawer").classList.remove("hidden");
  $("#drawerBackdrop").classList.remove("hidden");
}
function closeDrawer() { $("#detailDrawer").classList.add("hidden"); $("#drawerBackdrop").classList.add("hidden"); }

function bindScheduleBlockButtons(root = document) {
  $$('[data-open-block]', root).forEach((button) => button.addEventListener("click", () => openScheduleDrawer(button.dataset.openBlock, button.dataset.occurrenceDate)));
}

function openScheduleDrawer(blockId, occurrenceDate) {
  const block = data.scheduleBlocks.find((item) => item.id === blockId);
  const date = parseDate(occurrenceDate) || new Date();
  const instance = block ? scheduleInstancesForDate(date).find((item) => item.defaultBlockId === blockId) : null;
  const lesson = instance ? lessonForInstance(instance) : data.lessons.find((item) => item.id === String(blockId).replace(/^lesson-/, ""));
  if (!instance && !lesson) return;
  const title = lesson?.title || instance?.title || "Session";
  const body = `
    <div class="detail-section"><div class="detail-grid"><div><span>Date</span><strong>${escapeHTML(occurrenceDate)}</strong></div><div><span>Time</span><strong>${displayTime(instance?.start ?? minutesFromTime(lesson?.time))}–${displayTime(instance?.end ?? minutesFromTime(lesson?.time) + Number(lesson?.duration || 60))}</strong></div><div><span>Default block</span><strong>${escapeHTML(instance?.title || "Independent entry")}</strong></div><div><span>Status</span><strong>${escapeHTML(lesson?.status || "Scheduled")}</strong></div><div><span>Teacher</span><strong>${escapeHTML(instance?.teacher || "—")}</strong></div><div><span>Scope</span><strong>${instance?.isException ? "Modified for this date" : "Default schedule"}</strong></div></div></div>
    ${instance?.isException ? `<button class="button subtle" id="drawerRevertDefault">Revert this date to default</button>` : ""}
    <div class="button-row">
      <button class="button primary" id="drawerLessonButton">${lesson ? "Edit lesson" : "Plan this lesson"}</button>
      ${instance?.defaultBlockId ? `<button class="button subtle" id="drawerScheduleButton">Edit schedule</button>` : ""}
      ${lesson ? `<button class="button subtle" id="drawerDuplicateButton">Duplicate to next week</button><button class="button subtle" id="drawerPinButton">${lesson.pinned ? "Unpin" : "Pin"}</button>${instance?.participatesInBump ? `<button class="button subtle" id="drawerBumpButton">Bump…</button>` : ""}` : ""}
    </div>
    ${instance ? `<div class="detail-section"><h4>Schedule source</h4><p>${escapeHTML(instance.sourceSheet || "Manual schedule")}${instance.sourceCell ? ` · ${escapeHTML(instance.sourceCell)}` : ""}</p>${instance.reviewReasons?.length ? `<p><span class="tag review-badge">Needs review</span> ${escapeHTML(instance.reviewReasons.join("; "))}</p>` : ""}</div>` : ""}`;
  openDrawer("Session details", title, body);
  $("#drawerLessonButton")?.addEventListener("click", () => {
    closeDrawer();
    if (lesson) openEntryDialog("lesson", lesson.id);
    else openEntryDialog("lesson", null, { title: instance.title, date: occurrenceDate, time: instance.startTime, duration: instance.end - instance.start, type: "Class", subject: instance.subject || instance.category, learner: instance.className, scheduleBlockId: instance.defaultBlockId });
  });
  $("#drawerScheduleButton")?.addEventListener("click", () => { closeDrawer(); openScheduleDialog(instance.defaultBlockId, occurrenceDate, "occurrence"); });
  $("#drawerRevertDefault")?.addEventListener("click", () => { saveUndoSchedule(); data.scheduleExceptions = data.scheduleExceptions.filter((item) => !(item.blockId === instance.defaultBlockId && item.date === occurrenceDate)); closeDrawer(); persist("This date reverted to default"); });
  $("#drawerDuplicateButton")?.addEventListener("click", () => { const copy = { ...lesson, id: uid(), date: toISODate(addDays(parseDate(lesson.date), 7)), createdAt: Date.now() }; data.lessons.push(copy); closeDrawer(); persist("Duplicated to next week"); });
  $("#drawerPinButton")?.addEventListener("click", () => { lesson.pinned = !lesson.pinned; closeDrawer(); persist(lesson.pinned ? "Session pinned" : "Session unpinned"); });
  $("#drawerBumpButton")?.addEventListener("click", () => { closeDrawer(); openBumpDialog(lesson.id); });
}

function saveUndoSchedule() {
  localStorage.setItem(UNDO_SCHEDULE_KEY, JSON.stringify({ scheduleBlocks: data.scheduleBlocks, scheduleExceptions: data.scheduleExceptions, savedAt: Date.now() }));
}
function undoSchedule() {
  try {
    const snapshot = JSON.parse(localStorage.getItem(UNDO_SCHEDULE_KEY) || "null");
    if (!snapshot) return;
    data.scheduleBlocks = snapshot.scheduleBlocks || [];
    data.scheduleExceptions = snapshot.scheduleExceptions || [];
    localStorage.removeItem(UNDO_SCHEDULE_KEY);
    persist("Schedule edit undone");
  } catch { showToast("Could not undo schedule edit"); }
}

function fillScheduleSelects() {
  $("#scheduleCategory").innerHTML = ["Arrival", "Routine", "Recess", "Transition", "Snack", "CLA/ELA", "Specials", "Lunch", "Mindfulness", "Math", "SASS", "Dismissal", "Meeting", "Other"].map((item) => `<option>${item}</option>`).join("");
  $("#scheduleDay").innerHTML = DAY_NAMES.map((day) => `<option>${day}</option>`).join("");
}

function openScheduleDialog(blockId = null, occurrenceDate = null, forcedScope = null) {
  fillScheduleSelects();
  const block = blockId ? data.scheduleBlocks.find((item) => item.id === blockId) : null;
  $("#scheduleBlockId").value = block?.id || "";
  $("#scheduleOccurrenceDate").value = occurrenceDate || "";
  $("#scheduleDialogTitle").textContent = block ? "Edit schedule block" : "Add default schedule block";
  $("#scheduleTitle").value = block?.title || "";
  $("#scheduleCategory").value = block?.category || "Other";
  $("#scheduleDay").value = block?.day || dayNameFromDate(new Date());
  $("#scheduleStart").value = block?.startTime || (Number.isFinite(block?.start) ? timeFromMinutes(block.start) : "09:00");
  $("#scheduleEnd").value = block?.endTime || (Number.isFinite(block?.end) ? timeFromMinutes(block.end) : "10:00");
  $("#scheduleTeacher").value = block?.teacher || "";
  $("#scheduleClassName").value = block?.className || "";
  $("#scheduleSubject").value = block?.subject || block?.category || "";
  $("#scheduleBump").checked = block?.participatesInBump ?? true;
  $("#scheduleParent").innerHTML = `<option value="">No parent block</option>${data.scheduleBlocks.filter((item) => item.id !== blockId && item.day === (block?.day || dayNameFromDate(new Date()))).map((item) => `<option value="${item.id}">${escapeHTML(item.title)} · ${displayTime(item.start)}</option>`).join("")}`;
  $("#scheduleParent").value = block?.parentId || "";
  const fieldset = $("#scheduleScopeFieldset");
  fieldset.classList.toggle("hidden", !block || !occurrenceDate);
  const scope = forcedScope || (occurrenceDate ? "occurrence" : "default");
  const radio = $(`input[name="scheduleScope"][value="${scope}"]`);
  if (radio) radio.checked = true;
  $("#occurrenceScopeHelp").textContent = occurrenceDate ? `· ${occurrenceDate}` : "";
  $("#deleteScheduleButton").classList.toggle("hidden", !block);
  updateScheduleImpact();
  $("#scheduleDialog").showModal();
}

function selectedScheduleScope() { return $('input[name="scheduleScope"]:checked')?.value || "default"; }
function updateScheduleImpact() {
  const block = data.scheduleBlocks.find((item) => item.id === $("#scheduleBlockId").value);
  const date = $("#scheduleOccurrenceDate").value;
  const scope = selectedScheduleScope();
  if (!block) { $("#scheduleImpact").textContent = "A new recurring default block will be created."; return; }
  if (scope === "occurrence") $("#scheduleImpact").textContent = `Only ${date || "this date"} will change. The default schedule remains unchanged.`;
  else if (scope === "future") $("#scheduleImpact").textContent = `The current default will end before ${date}; a new default begins on ${date}. Earlier dates remain unchanged.`;
  else $("#scheduleImpact").textContent = "The recurring default will change for its full active range. Existing one-time exceptions remain intact.";
}

function scheduleFormValues() {
  const start = minutesFromTime($("#scheduleStart").value);
  const end = minutesFromTime($("#scheduleEnd").value);
  return {
    title: $("#scheduleTitle").value.trim(), category: $("#scheduleCategory").value, day: $("#scheduleDay").value,
    start, end, startTime: timeFromMinutes(start), endTime: timeFromMinutes(end), teacher: $("#scheduleTeacher").value.trim(),
    className: $("#scheduleClassName").value.trim(), subject: $("#scheduleSubject").value.trim(), parentId: $("#scheduleParent").value || null,
    participatesInBump: $("#scheduleBump").checked,
  };
}

function saveScheduleForm() {
  const id = $("#scheduleBlockId").value;
  const date = $("#scheduleOccurrenceDate").value;
  const scope = selectedScheduleScope();
  const values = scheduleFormValues();
  if (!values.title || values.end <= values.start) { showToast("Check the title and time range"); return false; }
  saveUndoSchedule();
  if (!id) {
    data.scheduleBlocks.push({ id: uid(), ...values, status: "Active", effectiveStart: "", effectiveEnd: "", reviewReasons: [], needsReview: false, createdAt: Date.now() });
  } else {
    const block = data.scheduleBlocks.find((item) => item.id === id);
    if (!block) return false;
    if (scope === "occurrence" && date) {
      data.scheduleExceptions = data.scheduleExceptions.filter((item) => !(item.blockId === id && item.date === date));
      data.scheduleExceptions.push({ id: uid(), blockId: id, date, overrides: values, cancelled: false, reason: "Manual one-time edit", createdAt: Date.now() });
    } else if (scope === "future" && date) {
      const previousEnd = toISODate(addDays(parseDate(date), -1));
      block.effectiveEnd = previousEnd;
      const newId = uid();
      data.scheduleBlocks.push({ ...block, ...values, id: newId, effectiveStart: date, effectiveEnd: "", createdAt: Date.now(), sourceCell: "", sourceText: "" });
      for (const child of data.scheduleBlocks.filter((item) => item.parentId === id && (!item.effectiveEnd || item.effectiveEnd >= date))) {
        child.effectiveEnd = previousEnd;
        data.scheduleBlocks.push({ ...child, id: uid(), parentId: newId, effectiveStart: date, effectiveEnd: "", createdAt: Date.now() });
      }
    } else Object.assign(block, values, { updatedAt: Date.now() });
  }
  $("#scheduleDialog").close();
  persist("Schedule saved");
  return true;
}

function deleteScheduleFromDialog() {
  const id = $("#scheduleBlockId").value;
  const date = $("#scheduleOccurrenceDate").value;
  const scope = selectedScheduleScope();
  const block = data.scheduleBlocks.find((item) => item.id === id);
  if (!block) return;
  if (!confirm(`Delete ${block.title} using the selected scope?`)) return;
  saveUndoSchedule();
  if (scope === "occurrence" && date) {
    data.scheduleExceptions = data.scheduleExceptions.filter((item) => !(item.blockId === id && item.date === date));
    data.scheduleExceptions.push({ id: uid(), blockId: id, date, overrides: {}, cancelled: true, reason: "Deleted occurrence", createdAt: Date.now() });
  } else if (scope === "future" && date) block.effectiveEnd = toISODate(addDays(parseDate(date), -1));
  else {
    const childIds = new Set(data.scheduleBlocks.filter((item) => item.parentId === id).map((item) => item.id));
    data.scheduleBlocks = data.scheduleBlocks.filter((item) => item.id !== id && !childIds.has(item.id));
    data.scheduleExceptions = data.scheduleExceptions.filter((item) => item.blockId !== id && !childIds.has(item.blockId));
  }
  $("#scheduleDialog").close();
  persist("Schedule removed");
}

function futureValidDates(blockId, afterDate, count) {
  const dates = [];
  for (let offset = 1; offset <= 730 && dates.length < count; offset += 1) {
    const date = addDays(parseDate(afterDate), offset);
    const dateISO = toISODate(date);
    if (isSchoolClosed(dateISO)) continue;
    if (scheduleInstancesForDate(date).some((instance) => instance.defaultBlockId === blockId)) dates.push(dateISO);
  }
  return dates;
}

function openBumpDialog(lessonId) {
  const lesson = data.lessons.find((item) => item.id === lessonId);
  if (!lesson?.scheduleBlockId) { showToast("Link this lesson to a schedule block before using schedule-aware Bump"); return; }
  $("#bumpLessonId").value = lessonId;
  updateBumpPreview();
  $("#bumpDialog").showModal();
}
function updateBumpPreview() {
  const lesson = data.lessons.find((item) => item.id === $("#bumpLessonId").value);
  if (!lesson) return;
  const scope = $('input[name="bumpScope"]:checked')?.value || "one";
  const affected = scope === "one" ? [lesson] : data.lessons.filter((item) => item.scheduleBlockId === lesson.scheduleBlockId && item.date >= lesson.date && item.status !== "Completed").sort((a, b) => a.date.localeCompare(b.date));
  const slots = futureValidDates(lesson.scheduleBlockId, lesson.date, affected.length);
  $("#bumpPreview").innerHTML = slots.length ? `${affected.length} ${affected.length === 1 ? "lesson" : "lessons"} will move through the next valid ${affected.length === 1 ? "slot" : "slots"}.<br><strong>${escapeHTML(lesson.date)} → ${escapeHTML(slots[0])}</strong>` : "No future valid schedule slot was found.";
}
function applyBump() {
  const lesson = data.lessons.find((item) => item.id === $("#bumpLessonId").value);
  if (!lesson) return;
  const scope = $('input[name="bumpScope"]:checked')?.value || "one";
  const affected = scope === "one" ? [lesson] : data.lessons.filter((item) => item.scheduleBlockId === lesson.scheduleBlockId && item.date >= lesson.date && item.status !== "Completed").sort((a, b) => a.date.localeCompare(b.date));
  const slots = futureValidDates(lesson.scheduleBlockId, lesson.date, affected.length);
  if (slots.length < affected.length) { showToast("Not enough future schedule slots were found"); return; }
  localStorage.setItem(UNDO_BUMP_KEY, JSON.stringify({ lessons: clone(data.lessons), savedAt: Date.now() }));
  affected.forEach((item, index) => { item.date = slots[index]; });
  $("#bumpDialog").close();
  persist(scope === "one" ? "Lesson moved to the next valid block" : "Lesson sequence bumped");
}
function undoBump() {
  try {
    const snapshot = JSON.parse(localStorage.getItem(UNDO_BUMP_KEY) || "null");
    if (!snapshot?.lessons) return;
    data.lessons = snapshot.lessons;
    localStorage.removeItem(UNDO_BUMP_KEY);
    persist("Bump undone");
  } catch { showToast("Could not undo bump"); }
}

async function handleImportFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (!['xlsx','xlsm'].includes(extension)) {
    showToast("This repair build currently focuses on XLSX visual schedules");
    return;
  }
  try {
    $("#importWorkbookSummary").classList.remove("hidden");
    $("#importWorkbookSummary").innerHTML = `<p>Reading <strong>${escapeHTML(file.name)}</strong> locally…</p>`;
    const workbook = await ClassroomXlsx.readWorkbook(file);
    const detections = ClassroomXlsx.detectWorkbookSchedules(workbook);
    importState = { file, workbook, detections, selectedSheet: detections.findIndex((item) => item.result.detected), selectedBlocks: new Set(), blocks: [] };
    if (importState.selectedSheet < 0) importState.selectedSheet = 0;
    const selectedDetection = detections[importState.selectedSheet];
    importState.blocks = clone(selectedDetection?.result?.blocks || []);
    importState.selectedBlocks = new Set(importState.blocks.map((block) => block.id));
    renderImportWorkbookSummary();
    renderImportPreview();
  } catch (error) {
    console.error(error);
    $("#importWorkbookSummary").innerHTML = `<p class="review-badge">Could not read this workbook: ${escapeHTML(error.message)}</p>`;
    $("#confirmScheduleImport").disabled = true;
  }
}

function renderImportWorkbookSummary() {
  if (!importState) return;
  $("#importWorkbookSummary").innerHTML = `<span class="eyebrow">Workbook</span><h3>${escapeHTML(importState.file.name)}</h3>${importState.detections.map((item, index) => `<button class="sheet-choice" data-import-sheet="${index}"><span><strong>${escapeHTML(item.sheet.name)}</strong><small>${item.sheet.rowCount} rows · ${item.sheet.colCount} columns</small></span><span class="tag ${item.result.detected ? "" : "review-badge"}">${item.result.detected ? `${item.result.blocks.length} time blocks` : "No weekly schedule detected"}</span></button>`).join("")}`;
  $$('[data-import-sheet]').forEach((button) => button.addEventListener("click", () => {
    importState.selectedSheet = Number(button.dataset.importSheet);
    importState.blocks = clone(importState.detections[importState.selectedSheet].result.blocks || []);
    importState.selectedBlocks = new Set(importState.blocks.map((block) => block.id));
    renderImportWorkbookSummary();
    renderImportPreview();
  }));
}

function renderImportPreview() {
  if (!importState) return;
  const detection = importState.detections[importState.selectedSheet]?.result;
  if (!detection?.detected) {
    $("#importPreview").innerHTML = `<div class="empty-state">This sheet was not recognized as a Monday–Sunday visual schedule. Choose another sheet.</div>`;
    $("#confirmScheduleImport").disabled = true;
    return;
  }
  const selectedCount = importState.selectedBlocks.size;
  const byDay = DAY_NAMES.map((day) => `<button data-import-day="${day}">${day} ${detection.countsByDay[day] || 0}</button>`).join("");
  const rows = importState.blocks.map((block, index) => `<tr class="${block.needsReview ? "needs-review" : ""}" data-import-row="${index}"><td><input type="checkbox" data-import-select="${block.id}" ${importState.selectedBlocks.has(block.id) ? "checked" : ""}></td><td>${escapeHTML(block.day)}</td><td><input data-import-edit="title" value="${escapeHTML(block.title)}"></td><td><input type="time" data-import-edit="startTime" value="${escapeHTML(block.startTime)}"></td><td><input type="time" data-import-edit="endTime" value="${escapeHTML(block.endTime)}"></td><td><select data-import-edit="category">${["Arrival","Routine","Recess","Transition","Snack","CLA/ELA","Specials","Lunch","Mindfulness","Math","SASS","Dismissal","Meeting","Other"].map((category) => `<option ${category === block.category ? "selected" : ""}>${category}</option>`).join("")}</select></td><td>${block.parentId ? "Child" : "Top level"}</td><td><input type="checkbox" data-import-edit="participatesInBump" ${block.participatesInBump ? "checked" : ""}></td><td>${escapeHTML(block.sourceCell || "")}</td><td>${block.needsReview ? `<span class="tag review-badge">${escapeHTML(block.reviewReasons.join("; ") || "Review")}</span>` : "Ready"}</td></tr>`).join("");
  $("#importPreview").innerHTML = `<div class="import-report"><div><span>Detected</span><strong>${detection.blocks.length}</strong></div><div><span>Selected</span><strong>${selectedCount}</strong></div><div><span>Needs review</span><strong>${detection.reviewCount}</strong></div><div><span>Conflicts</span><strong>${detection.conflictCount}</strong></div></div><div class="import-preview-tabs"><button class="active" data-import-day="all">All days</button>${byDay}</div><p class="meta">Detected class: <strong>${escapeHTML(detection.className)}</strong> · Header row ${detection.headerRow}. Every time range inside each weekday cell is listed below, including child segments.</p><div class="preview-table-wrap"><table class="preview-table"><thead><tr><th>Use</th><th>Day</th><th>Title</th><th>Start</th><th>End</th><th>Category</th><th>Level</th><th>Bump</th><th>Source</th><th>Review</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  $("#confirmScheduleImport").disabled = selectedCount === 0;
  $$('[data-import-select]').forEach((input) => input.addEventListener("change", () => { input.checked ? importState.selectedBlocks.add(input.dataset.importSelect) : importState.selectedBlocks.delete(input.dataset.importSelect); renderImportPreview(); }));
  $$('[data-import-edit]').forEach((input) => input.addEventListener("change", () => {
    const row = input.closest("tr");
    const block = importState.blocks[Number(row.dataset.importRow)];
    const field = input.dataset.importEdit;
    if (field === "participatesInBump") block[field] = input.checked;
    else if (field === "startTime" || field === "endTime") { block[field] = input.value; block[field === "startTime" ? "start" : "end"] = minutesFromTime(input.value); }
    else block[field] = input.value;
  }));
  $$('[data-import-day]').forEach((button) => button.addEventListener("click", () => {
    const day = button.dataset.importDay;
    $$("#importPreview tbody tr").forEach((row) => row.classList.toggle("hidden", day !== "all" && importState.blocks[Number(row.dataset.importRow)].day !== day));
    $$('[data-import-day]').forEach((item) => item.classList.toggle("active", item === button));
  }));
}

function importSelectedSchedule() {
  if (!importState) return;
  const selected = importState.blocks.filter((block) => importState.selectedBlocks.has(block.id));
  if (!selected.length) return;
  saveUndoSchedule();
  const batchId = uid();
  const duplicateKeys = new Set(data.scheduleBlocks.map((block) => `${block.day}|${block.start}|${block.end}|${block.title}`.toLowerCase()));
  let added = 0;
  let skipped = 0;
  for (const block of selected) {
    const key = `${block.day}|${block.start}|${block.end}|${block.title}`.toLowerCase();
    if (duplicateKeys.has(key)) { skipped += 1; continue; }
    data.scheduleBlocks.push({ ...block, id: block.id || uid(), importBatchId: batchId, sourceFile: importState.file.name, importedAt: Date.now() });
    duplicateKeys.add(key);
    added += 1;
  }
  data.imports.push({ id: batchId, fileName: importState.file.name, category: "schedule", sheetName: importState.detections[importState.selectedSheet].sheet.name, count: added, skipped, createdAt: Date.now(), sourceRetained: false });
  importState = null;
  $("#importFile").value = "";
  $("#importWorkbookSummary").classList.add("hidden");
  $("#importPreview").innerHTML = `<div class="empty-state">Import complete. Review any flagged blocks in Schedule Settings.</div>`;
  $("#confirmScheduleImport").disabled = true;
  persist(`${added} schedule blocks imported${skipped ? `; ${skipped} duplicates skipped` : ""}`);
  renderImportHistory();
}

function renderImportHistory() {
  const host = $("#importHistory");
  if (!host) return;
  host.innerHTML = [...data.imports].sort((a, b) => b.createdAt - a.createdAt).map((batch) => `<div class="data-row"><div><h4>${escapeHTML(batch.fileName || "Imported data")}</h4><p>${escapeHTML(batch.sheetName || batch.category || "Import")} · ${batch.count || 0} created${batch.skipped ? ` · ${batch.skipped} skipped` : ""}</p></div><div class="meta">${new Date(batch.createdAt).toLocaleString()}<br>Original file remains on your device</div><div class="row-actions"><button class="mini-button" data-view-import="${batch.id}">View</button><button class="mini-button" data-delete-import-data="${batch.id}">Delete imported data</button><button class="mini-button" data-remove-import-history="${batch.id}">Remove history</button></div></div>`).join("") || `<div class="empty-state">No imported files yet.</div>`;
  $$('[data-view-import]').forEach((button) => button.addEventListener("click", () => { scheduleTab = "defaults"; switchView("schedule"); }));
  $$('[data-delete-import-data]').forEach((button) => button.addEventListener("click", () => deleteImportData(button.dataset.deleteImportData)));
  $$('[data-remove-import-history]').forEach((button) => button.addEventListener("click", () => { data.imports = data.imports.filter((item) => item.id !== button.dataset.removeImportHistory); persist("Import history removed; imported data kept"); }));
}

function deleteImportData(batchId) {
  const batch = data.imports.find((item) => item.id === batchId);
  const blocks = data.scheduleBlocks.filter((item) => item.importBatchId === batchId);
  if (!confirm(`Delete ${blocks.length} records created by ${batch?.fileName || "this import"}? The original XLSX file will not be deleted.`)) return;
  saveUndoSchedule();
  const blockIds = new Set(blocks.map((item) => item.id));
  data.scheduleBlocks = data.scheduleBlocks.filter((item) => item.importBatchId !== batchId);
  data.scheduleExceptions = data.scheduleExceptions.filter((item) => !blockIds.has(item.blockId));
  data.lessons = data.lessons.map((lesson) => blockIds.has(lesson.scheduleBlockId) ? { ...lesson, scheduleBlockId: "" } : lesson);
  data.imports = data.imports.filter((item) => item.id !== batchId);
  persist("Imported data deleted; original file kept");
}

let folderSaveTimer = null;
function queueFolderSave() {
  if (!folderHandle) return;
  clearTimeout(folderSaveTimer);
  folderSaveTimer = setTimeout(() => saveToFolder(true), 900);
}

async function connectFolder() {
  if (!window.showDirectoryPicker) { showToast("Use desktop Chrome to connect a local folder"); return; }
  try {
    folderHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    await saveFolderHandle(folderHandle);
    await saveToFolder(false);
    renderFolderStatus();
    showToast("Classroom Data folder connected");
  } catch (error) {
    if (error.name !== "AbortError") showToast("Folder connection was not completed");
  }
}

async function saveToFolder(silent = false) {
  if (!folderHandle) { if (!silent) showToast("Connect Classroom Data folder first"); return; }
  try {
    const permission = await folderHandle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted" && await folderHandle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Permission not granted");
    const fileHandle = await folderHandle.getFileHandle("Classroom-Workspace.classroom.json", { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    data.settings.lastFolderSave = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (!silent) showToast("Saved to Classroom Data folder");
    renderFolderStatus();
  } catch (error) {
    if (!silent) showToast("Could not write to the connected folder");
  }
}

function renderFolderStatus() {
  const pill = $("#folderStatusButton");
  if (!pill) return;
  pill.classList.toggle("connected", Boolean(folderHandle));
  $("b", pill).textContent = folderHandle ? "Folder connected" : "Browser only";
}

function renderBackup() {
  $("#folderDetails").textContent = folderHandle ? `${folderHandle.name} is connected.${data.settings.lastFolderSave ? ` Last saved ${new Date(data.settings.lastFolderSave).toLocaleString()}.` : ""}` : "No folder connected. Your browser still holds the current work copy.";
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `Classroom-Backup-${toISODate(new Date())}.classroom.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

async function restoreBackup(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!confirm("Replace the current browser work copy with this backup?")) return;
    data = normalizeData(parsed);
    persist("Backup restored");
  } catch { showToast("This backup file could not be read"); }
}

function openHandleDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ClassroomLocalHandles", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveFolderHandle(handle) {
  try { const db = await openHandleDatabase(); const tx = db.transaction("handles", "readwrite"); tx.objectStore("handles").put(handle, "classroomData"); } catch {}
}
async function loadFolderHandle() {
  try {
    const db = await openHandleDatabase();
    folderHandle = await new Promise((resolve) => { const request = db.transaction("handles").objectStore("handles").get("classroomData"); request.onsuccess = () => resolve(request.result || null); request.onerror = () => resolve(null); });
    renderFolderStatus();
  } catch {}
}
async function disconnectFolder() {
  folderHandle = null;
  try { const db = await openHandleDatabase(); db.transaction("handles", "readwrite").objectStore("handles").delete("classroomData"); } catch {}
  renderFolderStatus();
  renderBackup();
  showToast("Folder disconnected; browser data kept");
}

function renderSettings() {
  $("#themePicker").innerHTML = Object.entries(THEMES).map(([key, theme]) => `<button class="theme-card ${data.settings.theme === key ? "active" : ""}" data-theme-choice="${key}"><span class="theme-swatches">${theme.colors.map((color) => `<i style="background:${color}"></i>`).join("")}</span><strong>${theme.name}</strong><small>${theme.note}</small></button>`).join("");
  $("#schoolYearStart").value = data.settings.schoolYearStart;
  $("#dayStartTime").value = data.settings.dayStartTime;
  $("#dayEndTime").value = data.settings.dayEndTime;
  $("#settingsShowWeekends").checked = data.settings.showWeekends;
  $$('[data-theme-choice]').forEach((button) => button.addEventListener("click", () => { data.settings.theme = button.dataset.themeChoice; persist("Color palette updated"); }));
}

function globalSearchRecords() {
  return [
    ...data.lessons.map((item) => ({ type: "Session", title: item.title, text: `${item.date} ${item.learner} ${item.subject} ${item.notes}`, action: () => { weekStart = getMonday(parseDate(item.date)); switchView("week"); } })),
    ...data.learners.map((item) => ({ type: "Learner", title: item.name, text: `${item.grade} ${item.goals} ${item.notes}`, action: () => switchView("learners") })),
    ...data.smallGroups.map((item) => ({ type: "Small group", title: item.name, text: `${item.members} ${item.goal}`, action: () => switchView("learners") })),
    ...data.materials.map((item) => ({ type: "Library", title: item.title, text: `${item.type} ${item.topic} ${item.tags}`, action: () => switchView("library") })),
    ...data.playbookRoutines.map((item) => ({ type: "Playbook", title: item.title, text: `${item.purpose} ${item.steps} ${item.tags}`, action: () => switchView("playbook") })),
    ...data.learnerPlans.map((item) => ({ type: "Plan", title: item.title, text: `${item.learner} ${item.goal} ${item.nextStep}`, action: () => switchView("learnerPlanning") })),
    ...data.teachingMemory.map((item) => ({ type: "Memory", title: item.learner || "Teaching memory", text: `${item.observation} ${item.nextStep} ${item.tags}`, action: () => switchView("memory") })),
    ...data.scheduleBlocks.map((item) => ({ type: "Schedule", title: item.title, text: `${item.day} ${item.category} ${item.className} ${item.teacher}`, action: () => switchView("schedule") })),
  ];
}

function renderGlobalSearch() {
  const query = $("#globalSearch").value.trim().toLowerCase();
  const panel = $("#searchResults");
  if (!query) { panel.classList.add("hidden"); panel.innerHTML = ""; return; }
  const records = globalSearchRecords().filter((record) => `${record.title} ${record.text}`.toLowerCase().includes(query)).slice(0, 14);
  panel.innerHTML = records.map((record, index) => `<button class="search-result" data-search-index="${index}"><strong>${escapeHTML(record.title)}</strong><small>${escapeHTML(record.type)} · ${escapeHTML(record.text).slice(0, 120)}</small></button>`).join("") || `<div class="empty-state">No local results.</div>`;
  panel.classList.remove("hidden");
  $$('[data-search-index]').forEach((button) => button.addEventListener("click", () => { panel.classList.add("hidden"); records[Number(button.dataset.searchIndex)].action(); }));
}

function bindViewLinks(root = document) {
  $$('[data-view-link]', root).forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewLink)));
}

function cycleTheme() {
  const keys = Object.keys(THEMES);
  data.settings.theme = keys[(keys.indexOf(data.settings.theme) + 1) % keys.length];
  persist(`${THEMES[data.settings.theme].name} palette selected`);
}

function setupEventListeners() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  bindViewLinks();
  $("#globalSearch").addEventListener("input", renderGlobalSearch);
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#globalSearch").focus(); }
    if (event.key === "Escape") { $("#searchResults").classList.add("hidden"); closeDrawer(); }
  });
  document.addEventListener("click", (event) => { if (!event.target.closest(".search-wrap")) $("#searchResults").classList.add("hidden"); });
  $("#themeQuickButton").addEventListener("click", cycleTheme);
  $("#folderStatusButton").addEventListener("click", () => switchView("backup"));
  $("#quickAddButton").addEventListener("click", () => openEntryDialog("lesson"));
  $("#inlineTaskForm").addEventListener("submit", (event) => { event.preventDefault(); const title = $("#inlineTaskInput").value.trim(); if (!title) return; data.tasks.push({ id: uid(), title, category: "Preparation", priority: "Normal", completed: false, createdAt: Date.now() }); $("#inlineTaskInput").value = ""; persist("Task added"); });
  $("#quickCaptureForm").addEventListener("submit", (event) => { event.preventDefault(); const text = $("#quickCaptureText").value.trim(); if (!text) return; data.captures.push({ id: uid(), text, type: $("#quickCaptureType").value, createdAt: Date.now() }); $("#quickCaptureText").value = ""; persist("Captured locally"); });
  $("#previousWeek").addEventListener("click", () => { weekStart = addDays(weekStart, -7); renderWeek(); });
  $("#nextWeek").addEventListener("click", () => { weekStart = addDays(weekStart, 7); renderWeek(); });
  $("#thisWeek").addEventListener("click", () => { weekStart = getMonday(new Date()); renderWeek(); });
  $$("#weekMode button").forEach((button) => button.addEventListener("click", () => { weekMode = button.dataset.mode; $$("#weekMode button").forEach((item) => item.classList.toggle("active", item === button)); renderWeek(); }));
  ["#showWeekends", "#weekTypeFilter", "#weekSubjectFilter"].forEach((selector) => $(selector).addEventListener("change", () => { if (selector === "#showWeekends") data.settings.showWeekends = $(selector).checked; localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); renderWeek(); }));
  ["#sessionSearch", "#sessionPersonFilter", "#sessionTypeFilter", "#sessionStartDate", "#sessionEndDate"].forEach((selector) => $(selector).addEventListener(selector.includes("Search") ? "input" : "change", renderSessions));
  $$("[data-learner-tab]").forEach((button) => button.addEventListener("click", () => { learnerTab = button.dataset.learnerTab; $$("[data-learner-tab]").forEach((item) => item.classList.toggle("active", item === button)); renderLearners(); }));
  $$("[data-schedule-tab]").forEach((button) => button.addEventListener("click", () => { scheduleTab = button.dataset.scheduleTab; renderScheduleSettings(); }));
  $$('[data-add]').forEach((button) => button.addEventListener("click", () => openEntryDialog(button.dataset.add)));
  $("#librarySearch").addEventListener("input", renderLibrary);
  $("#libraryTypeFilter").addEventListener("change", renderLibrary);
  $("#addScheduleBlock").addEventListener("click", () => openScheduleDialog());
  $("#undoScheduleButton").addEventListener("click", undoSchedule);
  $("#undoBumpButton").addEventListener("click", undoBump);
  $("#entryForm").addEventListener("submit", (event) => { event.preventDefault(); saveEntryFromDialog(); });
  $("#deleteEntryButton").addEventListener("click", deleteEntryFromDialog);
  $("#scheduleForm").addEventListener("submit", (event) => { event.preventDefault(); saveScheduleForm(); });
  $("#deleteScheduleButton").addEventListener("click", deleteScheduleFromDialog);
  $$('input[name="scheduleScope"]').forEach((input) => input.addEventListener("change", updateScheduleImpact));
  $("#scheduleDay").addEventListener("change", () => {
    const current = $("#scheduleBlockId").value;
    $("#scheduleParent").innerHTML = `<option value="">No parent block</option>${data.scheduleBlocks.filter((item) => item.id !== current && item.day === $("#scheduleDay").value).map((item) => `<option value="${item.id}">${escapeHTML(item.title)} · ${displayTime(item.start)}</option>`).join("")}`;
  });
  $("#bumpForm").addEventListener("submit", (event) => { event.preventDefault(); applyBump(); });
  $$('input[name="bumpScope"]').forEach((input) => input.addEventListener("change", updateBumpPreview));
  $("#closeDrawer").addEventListener("click", closeDrawer);
  $("#drawerBackdrop").addEventListener("click", closeDrawer);
  $$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  $("#importFile").addEventListener("change", (event) => { if (event.target.files[0]) handleImportFile(event.target.files[0]); });
  const dropZone = $("#dropZone");
  ["dragenter", "dragover"].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.remove("dragover"); }));
  dropZone.addEventListener("drop", (event) => { if (event.dataTransfer.files[0]) handleImportFile(event.dataTransfer.files[0]); });
  $("#confirmScheduleImport").addEventListener("click", importSelectedSchedule);
  $("#connectFolderButton").addEventListener("click", connectFolder);
  $("#saveFolderButton").addEventListener("click", () => saveToFolder(false));
  $("#disconnectFolderButton").addEventListener("click", disconnectFolder);
  $("#downloadBackupButton").addEventListener("click", downloadBackup);
  $("#restoreBackupInput").addEventListener("change", (event) => { if (event.target.files[0]) restoreBackup(event.target.files[0]); });
  $("#schoolYearStart").addEventListener("change", () => { data.settings.schoolYearStart = $("#schoolYearStart").value; persist("School year start updated"); });
  $("#dayStartTime").addEventListener("change", () => { data.settings.dayStartTime = $("#dayStartTime").value; persist("Day start updated"); });
  $("#dayEndTime").addEventListener("change", () => { data.settings.dayEndTime = $("#dayEndTime").value; persist("Day end updated"); });
  $("#settingsShowWeekends").addEventListener("change", () => { data.settings.showWeekends = $("#settingsShowWeekends").checked; persist("Weekend preference updated"); });
}

async function init() {
  setupEventListeners();
  await loadFolderHandle();
  renderAll();
  clearInterval(minuteTimer);
  minuteTimer = setInterval(() => { applyTheme(); if (currentView === "today") renderToday(); if (currentView === "week") renderWeek(); }, 60000);
}

init();
