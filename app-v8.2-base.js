"use strict";

const STORAGE_KEY = "classroomDataV1";
const UNDO_SCHEDULE_KEY = "classroomUndoScheduleV8";
const UNDO_BUMP_KEY = "classroomUndoBumpV8";
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ENTRY_TYPES = ["Class", "Individual", "Small Group", "Meeting", "Observation", "Preparation", "Reflection", "Personal", "Service"];
const THEMES = {
  qingdai: { name: "青黛 · Qingdai", note: "Ink blue, celadon, rice paper", colors: ["#26394b", "#76928c", "#f5f2e9", "#b37969"] },
  zhuyue: { name: "竹月 · Bamboo Moon", note: "Bamboo green, tea beige, warm clay", colors: ["#30463c", "#7f9b82", "#f4f0e6", "#ae8267"] },
  taoyao: { name: "桃夭 · Peach Bloom", note: "Muted peach, smoke plum, jade gray", colors: ["#493d46", "#b68c94", "#f7f0ed", "#8c9b8d"] },
  jilan: { name: "霁蓝 · Clear Sky", note: "Rain-cleared blue, mist, old gold", colors: ["#2d4152", "#7692a5", "#f1f4f3", "#ae8668"] },
};

const EMPTY_DATA = {
  version: 8.2,
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
  personalAgenda: [],
  documentReferences: [],
  settings: {
    theme: "qingdai",
    schoolYearStart: "2026-08-24",
    dayStartTime: "08:00",
    dayEndTime: "16:00",
    showWeekends: true,
    displayName: "Alyssa",
    summerBreakStart: "2027-06-16",
    countdownMode: "school",
    sidebarCollapsed: false,
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
  normalized.personalAgenda = Array.isArray(source.personalAgenda) ? source.personalAgenda : [];
  normalized.documentReferences = Array.isArray(source.documentReferences) ? source.documentReferences : [];
  normalized.version = 8.2;
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
let todayPreviewDate = null;

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

function findNextScheduledDate(fromDate, maxDays = 180) {
  for (let offset = 1; offset <= maxDays; offset += 1) {
    const candidate = addDays(fromDate, offset);
    const iso = toISODate(candidate);
    if (isSchoolClosed(iso)) continue;
    if (topLevelInstances(scheduleInstancesForDate(candidate)).length) return candidate;
  }
  return null;
}

function renderToday() {
  const now = new Date();
  const todayISO = toISODate(now);
  const week = weekNumber(now);
  const name = data.settings.displayName || "Alyssa";
  $("#greeting").textContent = `${greetingForTime(now)}, ${name}.`;
  $("#todayMeta").textContent = `${dateLabel(now)}${week ? ` · Week ${week}` : ""}`;

  const todayInstances = topLevelInstances(scheduleInstancesForDate(now));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const next = todayInstances.find((item) => item.end > nowMinutes);
  const unplanned = todayInstances.filter((item) => item.participatesInBump && !lessonForInstance(item)).length;
  const nextScheduledDate = todayInstances.length ? null : findNextScheduledDate(now);

  if (next) {
    $("#nextSummary").innerHTML = `<strong>Next: ${escapeHTML(next.title)} at ${displayTime(next.start)}</strong><br><span>${unplanned} ${unplanned === 1 ? "lesson" : "lessons"} still need planning</span>`;
  } else if (todayInstances.length) {
    $("#nextSummary").innerHTML = `<strong>No more scheduled blocks today.</strong><br><span>${unplanned} ${unplanned === 1 ? "lesson" : "lessons"} still need planning</span>`;
  } else if (nextScheduledDate) {
    $("#nextSummary").innerHTML = `<strong>No scheduled blocks today.</strong><br><span>Next scheduled day: ${nextScheduledDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>`;
  } else {
    $("#nextSummary").innerHTML = `<strong>No schedule has been connected yet.</strong><br><span>Import a recurring schedule or add a default block.</span>`;
  }

  renderTodayTasks();
  renderTodayReminders();
  renderStudentsToNotice();

  const displayDate = todayPreviewDate ? parseDate(todayPreviewDate) : now;
  const isPreview = Boolean(todayPreviewDate && toISODate(displayDate) !== todayISO);
  const dateLabelElement = $("#todayScheduleDateLabel");
  if (dateLabelElement) dateLabelElement.textContent = isPreview
    ? `Previewing ${displayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`
    : `${dayNameFromDate(now)} · ${now.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
  const backButton = $("#todayBackButton");
  if (backButton) {
    backButton.classList.toggle("hidden", !isPreview);
    backButton.onclick = () => { todayPreviewDate = null; renderToday(); };
  }

  const displayInstances = topLevelInstances(scheduleInstancesForDate(displayDate));
  renderTodayTimeline(displayInstances, displayDate, now);
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

function renderTodayTimeline(instances, displayDate, actualNow = new Date()) {
  const host = $("#todayTimeline");
  const displayISO = toISODate(displayDate);
  const actualISO = toISODate(actualNow);
  const isActualToday = displayISO === actualISO;
  host.style.removeProperty("height");
  host.style.removeProperty("--now-pct");

  if (!instances.length) {
    const hasScheduleData = data.scheduleBlocks.length > 0 || data.lessons.length > 0;
    const closedEvents = data.calendarEvents.filter((event) => displayISO >= event.date && displayISO <= (event.endDate || event.date) && /closed|holiday|no school/i.test(`${event.type || ""} ${event.title || ""}`));
    const nextDate = findNextScheduledDate(displayDate);
    const reason = closedEvents.length
      ? `No school today: ${closedEvents.map((event) => escapeHTML(event.title)).join(", ")}.`
      : ["Saturday", "Sunday"].includes(dayNameFromDate(displayDate))
        ? `No recurring school blocks are scheduled for ${dayNameFromDate(displayDate)}.`
        : hasScheduleData
          ? `No schedule blocks are assigned to ${dayNameFromDate(displayDate)}.`
          : `No schedule has been imported yet.`;
    const nextButton = nextDate ? `<button class="button primary" type="button" data-preview-next-schedule="${toISODate(nextDate)}">Preview ${nextDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</button>` : "";
    const importButton = !hasScheduleData ? `<button class="button primary" data-view-link="import">Import schedule</button>` : "";
    host.innerHTML = `<div class="timeline-empty"><div><strong>${reason}</strong><p>${hasScheduleData ? "Your imported schedule is saved. Choose the next scheduled day or open the Week view." : "Import your Master Schedule or add a recurring default block."}</p><div class="empty-actions">${nextButton}${importButton}<button class="button subtle" type="button" data-view-link="week">Open Week</button></div></div></div>`;
    bindViewLinks(host);
    const nextPreview = $("[data-preview-next-schedule]", host);
    if (nextPreview) nextPreview.addEventListener("click", () => { todayPreviewDate = nextPreview.dataset.previewNextSchedule; renderToday(); });
    return;
  }

  const startSetting = minutesFromTime(data.settings.dayStartTime);
  const endSetting = minutesFromTime(data.settings.dayEndTime);
  const start = Math.min(startSetting, ...instances.map((item) => item.start)) - 10;
  const end = Math.max(endSetting, ...instances.map((item) => item.end)) + 10;
  const total = Math.max(1, end - start);
  const height = Math.max(560, total * 1.15);
  const nowMinutes = actualNow.getHours() * 60 + actualNow.getMinutes();
  const nowPct = Math.max(0, Math.min(100, ((nowMinutes - start) / total) * 100));
  host.style.height = `${height}px`;
  if (isActualToday) host.style.setProperty("--now-pct", `${nowPct}%`);

  const events = instances.map((instance) => {
    const top = ((instance.start - start) / total) * height;
    const itemHeight = Math.max(38, ((instance.end - instance.start) / total) * height - 3);
    const state = isActualToday ? (nowMinutes >= instance.end ? "past" : nowMinutes >= instance.start ? "now" : "future") : "future";
    const lesson = lessonForInstance(instance);
    const status = isActualToday && state === "now" ? "NOW" : isActualToday && state === "past" ? "Past" : lesson ? (lesson.status === "Planned" ? "Ready" : lesson.status) : instance.participatesInBump ? "Draft" : "Scheduled";
    return `<button class="timeline-event ${state}" style="top:${top}px;height:${itemHeight}px;--event-color:${categoryColor(instance.category)}" data-open-block="${instance.defaultBlockId || instance.id}" data-occurrence-date="${instance.occurrenceDate}"><span class="time-label">${displayTime(instance.start)}</span><span class="state">${escapeHTML(status)}</span><h4>${escapeHTML(lesson?.title || instance.title)}</h4><p>${escapeHTML(instance.className || instance.subject || instance.category)}${instance.teacher ? ` · ${escapeHTML(instance.teacher)}` : ""}</p></button>`;
  }).join("");
  host.innerHTML = `<div class="timeline-rail"></div>${isActualToday && nowMinutes >= start && nowMinutes <= end ? `<div class="timeline-now"><span class="timeline-now-label">NOW</span></div>` : ""}${events}`;
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
  if (weekMode === "list") { renderWeekAgenda(dayRecords); return; }
  const typeFilter = $("#weekTypeFilter").value;
  const subjectFilter = $("#weekSubjectFilter").value;
  for (const record of dayRecords) record.instances = record.instances.filter((item) => (!typeFilter || (lessonForInstance(item)?.type || item.type || "Class") === typeFilter) && (!subjectFilter || (item.subject || item.category) === subjectFilter));
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
    fields: [["title", "Plan title", "text", true], ["planType", "Plan type", "select", false, ["Individual", "Small Group"]], ["learner", "Learner / group", "text", true], ["status", "Status", "select", false, ["Active", "Paused", "Completed"]], ["goal", "Long-term goal", "textarea", false, null, "span-2"], ["currentFocus", "Current focus", "textarea"], ["objectives", "Objectives", "textarea"], ["lessonSequence", "Lesson sequence (one lesson per line)", "textarea", false, null, "span-2"], ["nextStep", "Next lesson / next step", "textarea"], ["reviewDate", "Review date", "date"]],
    defaults: { planType: "Individual", status: "Active" },
  },
  memory: {
    title: "Teaching memory",
    collection: "teachingMemory",
    fields: [["learner", "Learner / group", "text", true], ["date", "Date", "date", true], ["category", "Category", "select", false, ["Observation", "What worked", "Challenge", "Evidence", "Reflection"]], ["status", "Status", "select", false, ["Needs follow-up", "No action", "Resolved"]], ["observation", "Observation", "textarea", true, null, "span-2"], ["nextStep", "Next step", "textarea"], ["reviewDate", "Review date", "date"], ["noticeDate", "Notice on date", "date"], ["tags", "Tags", "text", false, null, "span-2"]],
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
    fields: [["title", "Event title", "text", true], ["type", "Event type", "select", false, ["School event", "School closed", "Testing", "Assembly", "Field trip", "Early dismissal", "Reminder", "Social Worker", "OT", "Speech", "Counseling", "Learner service"]], ["date", "Start date", "date", true], ["endDate", "End date", "date"], ["time", "Start time", "time"], ["endTime", "End time", "time"], ["learner", "Learner / group", "text"], ["location", "Location", "text"], ["notes", "Notes", "textarea", false, null, "span-2"]],
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
    ...data.personalAgenda.map((item) => ({ type: "Personal Agenda", title: item.title, text: `${item.date} ${item.time || ""} ${item.category || ""} ${item.notes || ""}`, action: () => { switchView("sessions"); setTimeout(() => openPersonalAgendaDialog(item.id), 0); } })),
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
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => { switchView(button.dataset.view); document.body.classList.remove("mobile-sidebar-open"); }));
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
  ["#sessionSearch", "#sessionCategoryFilter", "#sessionPinnedOnly", "#sessionStartDate", "#sessionEndDate"].forEach((selector) => $(selector)?.addEventListener(selector.includes("Search") ? "input" : "change", renderSessions));
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


// ─────────────────────────────────────────────────────────────
// Workspace Consolidation v8 enhancements
// ─────────────────────────────────────────────────────────────

let todayActionTab = "tasks";
let importQueue = [];
let importActiveIndex = -1;
let importVisibleDay = "all";

const baseRenderAllV8 = renderAll;
renderAll = function renderAllV8() {
  baseRenderAllV8();
  applySidebarState();
  renderSummerCountdown();
  if (currentView === "learnerPlanning") fillPlanOwnerFilter();
};

function applySidebarState() {
  const collapsed = Boolean(data.settings.sidebarCollapsed);
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  const button = $("#sidebarCollapse");
  if (button) {
    button.textContent = "‹";
    button.title = "Collapse navigation";
    button.setAttribute("aria-label", "Collapse navigation");
  }
  const brand = $("#brandButton");
  if (brand) {
    brand.title = collapsed ? "Expand navigation" : "Open Today";
    brand.setAttribute("aria-label", collapsed ? "Expand navigation" : "Open Today");
  }
  if (collapsed) $$("#mainNav details").forEach((group) => { group.open = true; });
}

function renderSummerCountdown() {
  const host = $("#summerCountdown");
  if (!host) return;
  const mode = data.settings.countdownMode || "school";
  const target = parseDate(data.settings.summerBreakStart);
  const now = new Date(); now.setHours(12,0,0,0);
  if (mode === "hidden" || !target || target < now) { host.classList.add("hidden"); return; }
  let days = 0;
  if (mode === "calendar") days = Math.max(0, Math.ceil((target - now) / 86400000));
  else {
    for (let date = new Date(now); date < target; date = addDays(date, 1)) {
      const day = date.getDay();
      const iso = toISODate(date);
      if (day !== 0 && day !== 6 && !isSchoolClosed(iso)) days += 1;
    }
  }
  host.textContent = `${days} ${mode === "school" ? "school" : "calendar"} ${days === 1 ? "day" : "days"} until Summer Break`;
  host.classList.remove("hidden");
}

const baseRenderTodayV8 = renderToday;
renderToday = function renderTodayV8() {
  baseRenderTodayV8();
  const name = data.settings.displayName || "Alyssa";
  $("#greeting").textContent = `${greetingForTime(new Date())}, ${name}.`;
  renderSummerCountdown();
  setTodayActionTab(todayActionTab, false);
};

function setTodayActionTab(tab, focus = true) {
  todayActionTab = tab;
  $$("[data-today-action]").forEach((button) => button.classList.toggle("active", button.dataset.todayAction === tab));
  $("#todayTasks")?.classList.toggle("hidden", tab !== "tasks");
  $("#todayReminders")?.classList.toggle("hidden", tab !== "reminders");
  $("#inlineTaskForm")?.classList.toggle("hidden", tab !== "tasks");
  if (focus) (tab === "tasks" ? $("#inlineTaskInput") : null)?.focus();
}

function serviceEventsForDate(dateISO) {
  return data.calendarEvents.filter((event) => {
    const text = `${event.type || ""} ${event.title || ""}`;
    return event.date <= dateISO && (event.endDate || event.date) >= dateISO && /social worker|\bot\b|speech|counsel|learner service|service/i.test(text) && event.learner;
  });
}

renderStudentsToNotice = function renderStudentsToNoticeV8() {
  const today = toISODate(new Date());
  const services = serviceEventsForDate(today).map((event) => ({
    kind: "service", id: event.id, learner: event.learner, title: event.type || event.title,
    detail: `${event.time ? displayTime(event.time) : "Today"}${event.endTime ? `–${displayTime(event.endTime)}` : ""}${event.location ? ` · ${event.location}` : ""}${event.notes ? ` · ${event.notes}` : ""}`,
  }));
  const memories = data.teachingMemory.filter((memory) => memory.status !== "Resolved" && (memory.noticeDate === today || (!memory.noticeDate && memory.reviewDate === today))).map((memory) => ({ kind:"memory", id: memory.id, learner: memory.learner || "Learner", title:"Teaching Memory", detail: memory.nextStep || memory.observation || "Follow up today" }));
  const items = [...services, ...memories].slice(0, 8);
  $("#studentsToNotice").innerHTML = items.length ? items.map((item) => `<button class="stack-item text-row" data-notice-kind="${item.kind}" data-notice-id="${item.id}"><span class="service-chip">${item.kind === "service" ? "S" : "M"}</span><span class="grow"><strong>${escapeHTML(item.learner)}</strong><small>${escapeHTML(item.title)} · ${escapeHTML(item.detail)}</small></span></button>`).join("") : `<div class="stack-item"><span class="grow"><strong>No special services or notices today</strong><small>Social Worker, OT, Speech, Counseling, and date-specific Teaching Memory appear here.</small></span></div>`;
  $$('[data-notice-kind="memory"]').forEach((button) => button.addEventListener("click", () => openEntryDialog("memory", button.dataset.noticeId)));
  $$('[data-notice-kind="service"]').forEach((button) => button.addEventListener("click", () => openEntryDialog("event", button.dataset.noticeId)));
};

renderTodayReminders = function renderTodayRemindersV8() {
  const today = toISODate(new Date());
  const tomorrow = toISODate(addDays(new Date(), 1));
  const reminders = [];
  data.calendarEvents.filter((event) => event.date === today || event.date === tomorrow).forEach((event) => reminders.push({ id:event.id, title:event.title, detail:`${event.date === today ? "Today" : "Tomorrow"}${event.time ? ` · ${displayTime(event.time)}` : ""}`, type:"event" }));
  const unplannedToday = topLevelInstances(scheduleInstancesForDate(new Date())).filter((item) => item.participatesInBump && !lessonForInstance(item));
  if (unplannedToday.length) reminders.push({ title:`${unplannedToday.length} scheduled ${unplannedToday.length === 1 ? "block needs" : "blocks need"} planning`, detail:"Open Today Schedule to plan lesson content", type:"system" });
  if (!folderHandle) reminders.push({ title:"Classroom Data folder is not connected", detail:"Your browser copy is still working; connect a folder for durable backup", type:"backup" });
  $("#todayReminders").innerHTML = reminders.length ? reminders.slice(0,8).map((item) => `<div class="stack-item"><span class="grow"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.detail)}</small></span>${item.id ? `<button class="mini-button" data-edit-reminder-event="${item.id}">Open</button>` : ""}</div>`).join("") : `<div class="stack-item"><span class="grow"><strong>No active reminders</strong><small>Calendar changes, unplanned lessons, follow-ups, and backup status appear here.</small></span></div>`;
  $$('[data-edit-reminder-event]').forEach((button) => button.addEventListener("click", () => openEntryDialog("event", button.dataset.editReminderEvent)));
};

// Calendar events with time appear in Today and Week alongside schedule instances. Personal Agenda remains separate.
const baseScheduleInstancesForDateV8 = scheduleInstancesForDate;
scheduleInstancesForDate = function scheduleInstancesForDateV8(dateInput) {
  const instances = baseScheduleInstancesForDateV8(dateInput);
  const date = dateInput instanceof Date ? dateInput : parseDate(dateInput);
  if (!date) return instances;
  const dateISO = toISODate(date);
  const events = data.calendarEvents.filter((event) => event.date <= dateISO && (event.endDate || event.date) >= dateISO && event.time).map((event) => {
    const start = minutesFromTime(event.time);
    const end = event.endTime ? minutesFromTime(event.endTime) : start + 30;
    return { id:`event-${event.id}`, eventId:event.id, defaultBlockId:null, occurrenceDate:dateISO, title:event.title, category:event.type || "Calendar", subject:event.type || "Calendar", className:event.learner || event.location || "Calendar", teacher:"", start, end, startTime:event.time, endTime:event.endTime || timeFromMinutes(end), lessonId:null, type:/social worker|\bot\b|speech|counsel|service/i.test(`${event.type} ${event.title}`) ? "Service" : "Meeting", participatesInBump:false, parentId:null, reviewReasons:[] };
  });
  const personal = data.personalAgenda.filter((item)=>item.date===dateISO && item.time).map((item)=>{const start=minutesFromTime(item.time);const end=item.endTime?minutesFromTime(item.endTime):start+30;return{id:`personal-${item.id}`,personalAgendaId:item.id,defaultBlockId:null,occurrenceDate:dateISO,title:item.title,category:"Personal",subject:item.category||"Personal",className:"My agenda",teacher:"",start,end,startTime:item.time,endTime:item.endTime||timeFromMinutes(end),lessonId:null,type:"Personal",participatesInBump:false,parentId:null,reviewReasons:[]};});
  return [...instances, ...events, ...personal].sort((a,b)=>a.start-b.start || b.end-a.end);
};

// Event drawer handling for timeline items.
const baseOpenScheduleDrawerV8 = openScheduleDrawer;
openScheduleDrawer = function openScheduleDrawerV8(blockId, occurrenceDate) {
  if (String(blockId).startsWith("event-")) {
    const event = data.calendarEvents.find((item) => item.id === String(blockId).replace(/^event-/, ""));
    if (event) openEntryDialog("event", event.id);
    return;
  }
  if (String(blockId).startsWith("personal-")) {
    openPersonalAgendaDialog(String(blockId).replace(/^personal-/, ""));
    return;
  }
  baseOpenScheduleDrawerV8(blockId, occurrenceDate);
};

function personalAgendaRowsV81() {
  return [...data.personalAgenda]
    .map((item) => ({ category: "Personal", pinned: false, endTime: "", notes: "", ...item }))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));
}

renderSessions = function renderPersonalAgendaV81() {
  const query = $("#sessionSearch")?.value.trim().toLowerCase() || "";
  const category = $("#sessionCategoryFilter")?.value || "";
  const pinnedOnly = Boolean($("#sessionPinnedOnly")?.checked);
  const start = $("#sessionStartDate")?.value || "";
  const end = $("#sessionEndDate")?.value || "";
  const all = personalAgendaRowsV81();
  const categories = Array.from(new Set(all.map((item) => item.category || "Personal"))).sort();
  const filter = $("#sessionCategoryFilter");
  if (filter) filter.innerHTML = `<option value="">All categories</option>${categories.map((value) => `<option ${value === category ? "selected" : ""}>${escapeHTML(value)}</option>`).join("")}`;
  const rows = all.filter((item) => (!query || `${item.title} ${item.category} ${item.notes}`.toLowerCase().includes(query)) && (!category || item.category === category) && (!pinnedOnly || item.pinned) && (!start || item.date >= start) && (!end || item.date <= end));
  $("#sessionsList").innerHTML = rows.map((item) => `<div class="data-row agenda-row ${item.pinned ? "is-pinned" : ""}"><div><div class="${item.pinned ? "agenda-pin" : "meta"}">${item.pinned ? "Pinned" : escapeHTML(item.category || "Personal")}</div><h4>${escapeHTML(item.title)}</h4><p>${escapeHTML(item.notes || "No notes")}</p></div><div class="meta"><strong>${escapeHTML(item.date || "No date")}</strong>${item.time ? `<br>${displayTime(item.time)}${item.endTime ? `–${displayTime(item.endTime)}` : ""}` : ""}</div><div class="row-actions"><button class="mini-button" data-personal-pin="${item.id}">${item.pinned ? "Unpin" : "Pin"}</button><button class="mini-button" data-personal-duplicate="${item.id}">Next week</button><button class="mini-button" data-personal-edit="${item.id}">Edit</button></div></div>`).join("") || `<div class="empty-state">No personal agenda items match these filters.</div>`;
  $$('[data-personal-edit]').forEach((button) => button.addEventListener("click", () => openPersonalAgendaDialog(button.dataset.personalEdit)));
  $$('[data-personal-pin]').forEach((button) => button.addEventListener("click", () => { const item = data.personalAgenda.find((entry) => entry.id === button.dataset.personalPin); if (!item) return; item.pinned = !item.pinned; item.updatedAt = Date.now(); persist(item.pinned ? "Personal item pinned" : "Personal item unpinned"); }));
  $$('[data-personal-duplicate]').forEach((button) => button.addEventListener("click", () => { const item = data.personalAgenda.find((entry) => entry.id === button.dataset.personalDuplicate); if (!item) return; data.personalAgenda.push({ ...clone(item), id: uid(), date: item.date ? toISODate(addDays(parseDate(item.date), 7)) : toISODate(addDays(new Date(), 7)), pinned: false, createdAt: Date.now(), updatedAt: Date.now() }); persist("Personal item duplicated to next week"); }));
};

function openPersonalAgendaDialog(id = null, preset = {}) {
  const existing = id ? data.personalAgenda.find((item) => item.id === id) : null;
  const item = { title: "", date: toISODate(new Date()), time: "", endTime: "", category: "Personal", notes: "", pinned: false, ...preset, ...(existing || {}) };
  $("#personalAgendaId").value = existing?.id || "";
  $("#personalAgendaDialogTitle").textContent = existing ? "Edit personal agenda item" : "Add personal agenda item";
  $("#personalAgendaTitle").value = item.title || "";
  $("#personalAgendaDate").value = item.date || toISODate(new Date());
  $("#personalAgendaCategory").value = item.category || "Personal";
  $("#personalAgendaTime").value = item.time || "";
  $("#personalAgendaEndTime").value = item.endTime || "";
  $("#personalAgendaNotes").value = item.notes || "";
  $("#personalAgendaPinned").checked = Boolean(item.pinned);
  $("#deletePersonalAgendaButton").classList.toggle("hidden", !existing);
  $("#personalAgendaDialog").showModal();
  setTimeout(() => $("#personalAgendaTitle")?.focus(), 0);
}

function savePersonalAgendaV81(event) {
  event.preventDefault();
  const id = $("#personalAgendaId").value;
  const title = $("#personalAgendaTitle").value.trim();
  const date = $("#personalAgendaDate").value;
  if (!title || !date) { showToast("Add a title and date"); return; }
  const values = { title, date, category: $("#personalAgendaCategory").value || "Personal", time: $("#personalAgendaTime").value, endTime: $("#personalAgendaEndTime").value, notes: $("#personalAgendaNotes").value.trim(), pinned: $("#personalAgendaPinned").checked, updatedAt: Date.now() };
  const existing = id ? data.personalAgenda.find((item) => item.id === id) : null;
  if (existing) Object.assign(existing, values); else data.personalAgenda.push({ id: uid(), ...values, createdAt: Date.now() });
  $("#personalAgendaDialog").close();
  persist(existing ? "Personal agenda item updated" : "Personal agenda item added");
}

function deletePersonalAgendaV81() {
  const id = $("#personalAgendaId").value;
  if (!id) return;
  const item = data.personalAgenda.find((entry) => entry.id === id);
  if (!item || !confirm(`Delete “${item.title}”?`)) return;
  data.personalAgenda = data.personalAgenda.filter((entry) => entry.id !== id);
  $("#personalAgendaDialog").close();
  persist("Personal agenda item deleted");
}

// Learner profiles and owner-specific lesson plans.
function learnerOwnerOptions() {
  return [
    ...data.learners.map((item)=>({key:`individual:${item.id}`,name:item.name,type:"Individual",item})),
    ...data.smallGroups.map((item)=>({key:`group:${item.id}`,name:item.name,type:"Small Group",item})),
  ];
}
function ownerKeyForPlan(plan) {
  if (plan.ownerKey) return plan.ownerKey;
  const owner=learnerOwnerOptions().find((item)=>item.name===plan.learner && item.type===plan.planType);
  return owner?.key || "";
}
function fillPlanOwnerFilter() {
  const select=$("#planOwnerFilter"); if(!select) return;
  const current=select.value;
  select.innerHTML=`<option value="">All learners & groups</option>${learnerOwnerOptions().map((owner)=>`<option value="${owner.key}" ${owner.key===current?"selected":""}>${escapeHTML(owner.name)} · ${owner.type}</option>`).join("")}`;
}

renderLearners = function renderLearnersV8() {
  const items=learnerTab==="individuals"?data.learners:data.smallGroups;
  $("#learnersContent").innerHTML=items.map((item)=>{
    const type=learnerTab==="individuals"?"Individual":"Small Group";
    const key=`${learnerTab==="individuals"?"individual":"group"}:${item.id}`;
    const planCount=data.learnerPlans.filter((plan)=>ownerKeyForPlan(plan)===key || plan.learner===item.name).length;
    const serviceCount=data.calendarEvents.filter((event)=>event.learner===item.name && /social worker|\bot\b|speech|counsel|service/i.test(`${event.type} ${event.title}`)).length;
    return `<article class="item-card learner-card"><span class="eyebrow">${type}</span><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.grade||item.goal||item.goals||"No goal added yet.")}</p><div class="mini-stats"><span>${planCount} plans</span><span>${serviceCount} services</span></div><div class="card-actions"><button class="mini-button" data-open-learner-profile="${key}">Open profile</button><button class="mini-button" data-edit-${learnerTab==="individuals"?"learner":"group"}="${item.id}">Edit</button></div></article>`;
  }).join("")||`<div class="empty-state">No ${learnerTab==="individuals"?"individual learners":"small groups"} yet.</div>`;
  $$('[data-edit-learner]').forEach((button)=>button.addEventListener("click",()=>openEntryDialog("learner",button.dataset.editLearner)));
  $$('[data-edit-group]').forEach((button)=>button.addEventListener("click",()=>openEntryDialog("group",button.dataset.editGroup)));
  $$('[data-open-learner-profile]').forEach((button)=>button.addEventListener("click",()=>openLearnerProfile(button.dataset.openLearnerProfile)));
};

function openLearnerProfile(ownerKey) {
  const owner=learnerOwnerOptions().find((item)=>item.key===ownerKey); if(!owner)return;
  const plans=data.learnerPlans.filter((plan)=>ownerKeyForPlan(plan)===ownerKey || plan.learner===owner.name);
  const sessions=data.lessons.filter((lesson)=>lesson.learner===owner.name);
  const memories=data.teachingMemory.filter((memory)=>memory.learner===owner.name);
  const services=data.calendarEvents.filter((event)=>event.learner===owner.name);
  openDrawer(owner.type,owner.name,`<div class="profile-tabs"><button class="active" data-profile-tab="profile">Profile</button><button data-profile-tab="plans">Lesson Plans (${plans.length})</button><button data-profile-tab="sessions">Sessions (${sessions.length})</button><button data-profile-tab="memory">Memory (${memories.length})</button><button data-profile-tab="services">Services (${services.length})</button></div><div id="profileTabBody"></div><div class="button-row"><button class="button primary" id="profileAddPlan">+ Lesson plan</button><button class="button subtle" id="profileAddMemory">+ Memory</button><button class="button subtle" id="profileAddService">+ Service</button></div>`);
  const content={
    profile:`<div class="detail-section"><h4>Profile</h4><p>${escapeHTML(owner.item.grade||owner.item.goal||owner.item.goals||owner.item.notes||"No profile details yet.")}</p></div>`,
    plans:plans.map((plan)=>`<button class="stack-item text-row" data-profile-plan="${plan.id}"><span class="grow"><strong>${escapeHTML(plan.title)}</strong><small>${escapeHTML(plan.currentFocus||plan.goal||"No focus")}</small></span></button>`).join("")||`<div class="empty-state">No lesson plans yet.</div>`,
    sessions:sessions.map((lesson)=>`<button class="stack-item text-row" data-profile-session="${lesson.id}"><span class="grow"><strong>${escapeHTML(lesson.title)}</strong><small>${escapeHTML(lesson.date)} · ${escapeHTML(lesson.status||"Planned")}</small></span></button>`).join("")||`<div class="empty-state">No linked sessions yet.</div>`,
    memory:memories.map((memory)=>`<button class="stack-item text-row" data-profile-memory="${memory.id}"><span class="grow"><strong>${escapeHTML(memory.category||"Memory")}</strong><small>${escapeHTML(memory.observation||memory.nextStep||"")}</small></span></button>`).join("")||`<div class="empty-state">No memory records yet.</div>`,
    services:services.map((event)=>`<button class="stack-item text-row" data-profile-service="${event.id}"><span class="grow"><strong>${escapeHTML(event.title)}</strong><small>${escapeHTML(event.date)}${event.time?` · ${displayTime(event.time)}`:""}</small></span></button>`).join("")||`<div class="empty-state">No services or calendar events yet.</div>`,
  };
  const show=(tab)=>{ $("#profileTabBody").innerHTML=content[tab]; $$('[data-profile-tab]').forEach((b)=>b.classList.toggle("active",b.dataset.profileTab===tab)); $$('[data-profile-plan]').forEach((b)=>b.addEventListener("click",()=>openEntryDialog("plan",b.dataset.profilePlan))); $$('[data-profile-session]').forEach((b)=>b.addEventListener("click",()=>openEntryDialog("lesson",b.dataset.profileSession))); $$('[data-profile-memory]').forEach((b)=>b.addEventListener("click",()=>openEntryDialog("memory",b.dataset.profileMemory))); $$('[data-profile-service]').forEach((b)=>b.addEventListener("click",()=>openEntryDialog("event",b.dataset.profileService))); };
  $$('[data-profile-tab]').forEach((button)=>button.addEventListener("click",()=>show(button.dataset.profileTab)));
  $("#profileAddPlan").addEventListener("click",()=>openEntryDialog("plan",null,{learner:owner.name,planType:owner.type,ownerKey}));
  $("#profileAddMemory").addEventListener("click",()=>openEntryDialog("memory",null,{learner:owner.name}));
  $("#profileAddService").addEventListener("click",()=>openEntryDialog("event",null,{learner:owner.name,type:"Learner service"}));
  show("profile");
}

const baseSaveEntryFromDialogV8=saveEntryFromDialog;
saveEntryFromDialog=function saveEntryFromDialogV8(){
  const kind=$("#entryKind").value;
  const ownerKey=entryContext.ownerKey;
  const result=baseSaveEntryFromDialogV8();
  if(kind==="plan"&&ownerKey){ const latest=data.learnerPlans.slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0]; if(latest&&!latest.ownerKey){ latest.ownerKey=ownerKey; localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); renderAll(); queueFolderSave(); } }
  return result;
};

renderPlans = function renderPlansV8() {
  fillPlanOwnerFilter();
  const filter=$("#planOwnerFilter")?.value||"";
  const query=$("#planSearch")?.value.trim().toLowerCase()||"";
  const items=data.learnerPlans.filter((plan)=>(!filter||ownerKeyForPlan(plan)===filter)&&(!query||`${plan.title} ${plan.learner} ${plan.goal} ${plan.currentFocus} ${plan.objectives} ${plan.lessonSequence}`.toLowerCase().includes(query)));
  $("#plansContent").innerHTML=items.map((plan)=>`<article class="item-card plan-card"><span class="eyebrow">${escapeHTML(plan.planType||"Individual")}</span><h3>${escapeHTML(plan.title)}</h3><p><strong>${escapeHTML(plan.learner||"")}</strong><br>${escapeHTML(plan.currentFocus||plan.goal||"No current focus added.")}</p><div class="lesson-sequence-preview">${String(plan.lessonSequence||"").split(/\n+/).filter(Boolean).slice(0,3).map((line,index)=>`<span>${index+1}. ${escapeHTML(line)}</span>`).join("")}</div><div class="card-actions"><button class="mini-button" data-edit-plan="${plan.id}">Edit</button><button class="mini-button" data-plan-memory="${escapeHTML(plan.learner||"")}">Memory</button></div></article>`).join("")||`<div class="empty-state">No lesson plans match this view.</div>`;
  $$('[data-edit-plan]').forEach((button)=>button.addEventListener("click",()=>openEntryDialog("plan",button.dataset.editPlan)));
  $$('[data-plan-memory]').forEach((button)=>button.addEventListener("click",()=>openEntryDialog("memory",null,{learner:button.dataset.planMemory})));
};

// Weekday-aware schedule editor.
function selectedScheduleWeekdays() { return $$('[data-schedule-weekday]:checked').map((input)=>input.value); }
function renderScheduleWeekdayChecks(primaryDay) {
  $("#scheduleWeekdays").innerHTML=DAY_NAMES.map((day)=>`<label><input type="checkbox" data-schedule-weekday value="${day}" ${day===primaryDay?"checked":""}/><span>${day.slice(0,3)}</span></label>`).join("");
}
const baseOpenScheduleDialogV8=openScheduleDialog;
openScheduleDialog=function openScheduleDialogV8(blockId=null,occurrenceDate=null,forcedScope=null){
  baseOpenScheduleDialogV8(blockId,occurrenceDate,forcedScope);
  const block=blockId?data.scheduleBlocks.find((item)=>item.id===blockId):null;
  renderScheduleWeekdayChecks(block?.day||$("#scheduleDay").value||dayNameFromDate(new Date()));
  updateScheduleImpactV8();
};
function relatedBlockForDay(block,day){
  const seriesKey=block.seriesKey||block.importBatchId||`${block.title}|${block.start}|${block.end}|${block.className}`;
  return data.scheduleBlocks.find((item)=>item.day===day && ((item.seriesKey&&item.seriesKey===seriesKey)||(!item.seriesKey&&`${item.title}|${item.start}|${item.end}|${item.className}`===`${block.title}|${block.start}|${block.end}|${block.className}`)));
}
function dateForWeekday(referenceDate,day){ const monday=getMonday(parseDate(referenceDate)||new Date()); return toISODate(addDays(monday,DAY_NAMES.indexOf(day))); }
function updateScheduleImpactV8(){
  const block=data.scheduleBlocks.find((item)=>item.id===$("#scheduleBlockId").value); const date=$("#scheduleOccurrenceDate").value; const scope=selectedScheduleScope(); const days=selectedScheduleWeekdays();
  if(!block){ $("#scheduleImpact").textContent=`${days.length||1} recurring default ${days.length===1?"block":"blocks"} will be created.`; return; }
  const count=days.length||1;
  if(scope==="occurrence") $("#scheduleImpact").textContent=`Only ${count} occurrence${count===1?"":"s"} in the week of ${date||"the selected date"} will change. Defaults remain unchanged.`;
  else if(scope==="future") $("#scheduleImpact").textContent=`The selected ${count} weekday rule${count===1?"":"s"} will split from the week of ${date}. Earlier dates remain unchanged.`;
  else $("#scheduleImpact").textContent=`The recurring default will be updated or created for ${count} selected weekday${count===1?"":"s"}. Existing one-time exceptions remain intact.`;
}
updateScheduleImpact=updateScheduleImpactV8;

saveScheduleForm=function saveScheduleFormV8(){
  const id=$("#scheduleBlockId").value; const date=$("#scheduleOccurrenceDate").value; const scope=selectedScheduleScope(); const values=scheduleFormValues();
  const weekdays=selectedScheduleWeekdays().length?selectedScheduleWeekdays():[$("#scheduleDay").value];
  if(!values.title||values.end<=values.start){showToast("Check the title and time range");return false;}
  saveUndoSchedule();
  const source=id?data.scheduleBlocks.find((item)=>item.id===id):null;
  const seriesKey=source?.seriesKey||uid();
  const valuesForDay=(day)=>{const next={...values,day};if(values.parentId){const parent=data.scheduleBlocks.find((item)=>item.id===values.parentId);const related=parent?relatedBlockForDay(parent,day):null;next.parentId=related?.id||values.parentId;}return next;};
  if(!source){
    weekdays.forEach((day)=>data.scheduleBlocks.push({id:uid(),...valuesForDay(day),seriesKey,status:"Active",effectiveStart:"",effectiveEnd:"",reviewReasons:[],needsReview:false,createdAt:Date.now()}));
  } else if(scope==="occurrence"&&date){
    weekdays.forEach((day)=>{ const target=relatedBlockForDay(source,day)||source; const targetDate=dateForWeekday(date,day); data.scheduleExceptions=data.scheduleExceptions.filter((item)=>!(item.blockId===target.id&&item.date===targetDate)); data.scheduleExceptions.push({id:uid(),blockId:target.id,date:targetDate,overrides:valuesForDay(day),cancelled:false,reason:"Manual one-time edit",createdAt:Date.now()}); });
  } else if(scope==="future"&&date){
    weekdays.forEach((day)=>{ const target=relatedBlockForDay(source,day); const targetDate=dateForWeekday(date,day); if(target){ target.effectiveEnd=toISODate(addDays(parseDate(targetDate),-1)); data.scheduleBlocks.push({...target,...valuesForDay(day),id:uid(),seriesKey:target.seriesKey||seriesKey,effectiveStart:targetDate,effectiveEnd:"",createdAt:Date.now(),sourceCell:"",sourceText:""}); } else data.scheduleBlocks.push({...source,...valuesForDay(day),id:uid(),seriesKey,effectiveStart:targetDate,effectiveEnd:"",createdAt:Date.now(),sourceCell:"",sourceText:""}); });
  } else {
    weekdays.forEach((day)=>{ const target=relatedBlockForDay(source,day); if(target) Object.assign(target,valuesForDay(day),{seriesKey:target.seriesKey||seriesKey,updatedAt:Date.now()}); else data.scheduleBlocks.push({...source,...valuesForDay(day),id:uid(),seriesKey,effectiveStart:source.effectiveStart||"",effectiveEnd:source.effectiveEnd||"",createdAt:Date.now()}); });
  }
  $("#scheduleDialog").close(); persist(`Schedule saved for ${weekdays.length} ${weekdays.length===1?"day":"days"}`); return true;
};

// Multi-format, multi-file Import Center.
function fileExtension(file){ return String(file.name.split(".").pop()||"").toLowerCase(); }
function destinationLabel(key){ return ({schedule:"Recurring Schedule",calendar:"Calendar",playbook:"Classroom Playbook",library:"Library",learners:"Learners",plans:"Learner Lesson Plans",memory:"Teaching Memory",tasks:"Tasks",reference:"Reference document"})[key]||key; }
function normalizedHeader(value){return String(value||"").trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g," ");}
function findField(record,patterns){ for(const [key,value] of Object.entries(record)){const h=normalizedHeader(key);if(patterns.some((pattern)=>pattern.test(h)))return value;} return ""; }
function autoMapGenericRows(table,destination){
  return table.rows.map((row)=>{const r=row.record; const stableId=`${destination}:${table.sheetName}:${row.sourceRow}`; const source={sourceSheet:table.sheetName,sourceRow:row.sourceRow,sourceRecord:r};
    if(destination==="playbook")return{id:stableId,title:findField(r,[/activity/,/title/,/name/,/活动/,/名称/])||`Activity row ${row.sourceRow}`,category:findField(r,[/category/,/type/,/类别/])||"Teaching",purpose:findField(r,[/purpose/,/objective/,/目的/,/目标/]),whenToUse:findField(r,[/when/,/trigger/,/时机/]),frequency:findField(r,[/frequency/,/频率/]),steps:findField(r,[/steps?/,/procedure/,/instructions?/,/步骤/,/玩法/,/流程/]),cues:findField(r,[/teacher language/,/sentence/,/教师语言/,/句型/]),recovery:findField(r,[/variation/,/adapt/,/recovery/,/变化/,/调整/]),tags:findField(r,[/tags?/,/标签/]),...source};
    if(destination==="library")return{id:stableId,title:findField(r,[/resource/,/title/,/name/,/资源/,/名称/])||`Resource row ${row.sourceRow}`,type:findField(r,[/type/,/format/,/类型/])||"Other",url:findField(r,[/url/,/link/,/file/,/链接/,/文件/]),grade:findField(r,[/grade/,/年级/]),skill:findField(r,[/skill/,/技能/]),topic:findField(r,[/topic/,/theme/,/主题/]),unit:findField(r,[/unit/,/单元/]),tags:findField(r,[/tags?/,/标签/]),notes:findField(r,[/notes?/,/description/,/备注/,/说明/]),...source};
    if(destination==="calendar")return{id:stableId,title:findField(r,[/event/,/title/,/activity/,/name/,/事件/,/活动/,/名称/])||`Calendar row ${row.sourceRow}`,type:findField(r,[/type/,/category/,/类型/])||"School event",date:findField(r,[/^date$/,/start date/,/日期/,/开始日期/]),endDate:findField(r,[/end date/,/结束日期/]),time:findField(r,[/start time/,/^time$/,/时间/]),endTime:findField(r,[/end time/,/结束时间/]),learner:findField(r,[/learner/,/student/,/学生/,/学习者/]),location:findField(r,[/location/,/地点/]),notes:findField(r,[/notes?/,/description/,/备注/,/说明/]),...source};
    if(destination==="learners")return{id:stableId,name:findField(r,[/learner/,/student/,/name/,/学生/,/姓名/])||`Learner row ${row.sourceRow}`,grade:findField(r,[/grade/,/年级/]),goals:findField(r,[/goal/,/目标/]),notes:findField(r,[/notes?/,/备注/]),...source};
    if(destination==="plans")return{id:stableId,title:findField(r,[/plan title/,/lesson plan/,/title/,/计划名称/])||`Lesson plan row ${row.sourceRow}`,planType:findField(r,[/plan type/,/type/,/类型/])||"Individual",learner:findField(r,[/learner/,/student/,/group/,/学生/,/小组/]),status:findField(r,[/status/,/状态/])||"Active",goal:findField(r,[/goal/,/目标/]),currentFocus:findField(r,[/focus/,/重点/]),objectives:findField(r,[/objectives?/,/学习目标/]),lessonSequence:findField(r,[/sequence/,/lessons?/,/课程序列/,/课次/]),nextStep:findField(r,[/next/,/下一步/]),reviewDate:findField(r,[/review date/,/复查日期/]),...source};
    if(destination==="memory")return{id:stableId,learner:findField(r,[/learner/,/student/,/group/,/学生/,/小组/]),date:findField(r,[/^date$/, /日期/])||toISODate(new Date()),category:findField(r,[/category/,/type/,/类别/])||"Observation",status:findField(r,[/status/,/状态/])||"Needs follow-up",observation:findField(r,[/observation/,/evidence/,/notes?/,/观察/,/证据/,/记录/]),nextStep:findField(r,[/next step/,/下一步/]),reviewDate:findField(r,[/review date/,/复查日期/]),noticeDate:findField(r,[/notice date/,/关注日期/]),tags:findField(r,[/tags?/,/标签/]),...source};
    if(destination==="tasks")return{id:stableId,title:findField(r,[/task/,/title/,/agenda/,/待办/,/事项/])||`Task row ${row.sourceRow}`,dueDate:findField(r,[/due date/,/^date$/, /截止/,/日期/]),time:findField(r,[/^time$/, /时间/]),category:findField(r,[/category/,/type/,/类别/])||"Preparation",priority:findField(r,[/priority/,/优先级/])||"Normal",notes:findField(r,[/notes?/,/备注/]),completed:false,...source};
    return{id:stableId,title:`Row ${row.sourceRow}`,notes:JSON.stringify(r),...source};
  });
}

function parseDelimited(text,delimiter){
  const rows=[]; let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1]; if(ch==='"'){if(quoted&&next==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){row.push(cell);cell="";}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);if(row.some((v)=>v.trim()))rows.push(row);row=[];cell="";}else cell+=ch;}
  row.push(cell);if(row.some((v)=>v.trim()))rows.push(row);return rows;
}
function tableFromMatrix(name,matrix){const headers=(matrix[0]||[]).map((v,i)=>String(v||`Column ${i+1}`));return{sheetName:name,headerRow:1,headers,rows:matrix.slice(1).map((values,index)=>({sourceRow:index+2,values,record:Object.fromEntries(headers.map((h,i)=>[h,values[i]||""]))})).filter((r)=>r.values.some((v)=>String(v).trim()))};}
function detectDestinationFromText(text){ const t=text.toLowerCase(); if(/monday|tuesday|wednesday|thursday|friday|星期一|课表/.test(t))return"schedule"; if(/holiday|school closed|calendar|early dismissal|校历|放假/.test(t))return"calendar"; if(/activity|purpose|steps|procedure|活动|目的|步骤|玩法/.test(t))return"playbook"; if(/lesson plan|objective|goal|教学计划|学习目标/.test(t))return"plans"; if(/observation|what worked|challenge|观察|下一步/.test(t))return"memory"; if(/resource|worksheet|slides|资源|课件|工作纸/.test(t))return"library"; return"reference"; }
async function extractZipText(file,kind){ const zip=await JSZip.loadAsync(await file.arrayBuffer()); const names=Object.keys(zip.files).filter((name)=>kind==="docx"?/^word\/.*\.xml$/.test(name):/^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(); let text=""; for(const name of names){const xml=await zip.file(name).async("text"); const doc=new DOMParser().parseFromString(xml,"application/xml"); text+=Array.from(doc.getElementsByTagName("t")).map((node)=>node.textContent||"").join(" ")+"\n";} return text.trim(); }
function parseICS(text){const unfolded=text.replace(/\r?\n[ \t]/g,"");const events=[];for(const block of unfolded.split("BEGIN:VEVENT").slice(1)){const body=block.split("END:VEVENT")[0];const get=(key)=>{const match=body.match(new RegExp(`^${key}(?:;[^:]*)?:(.*)$`,`mi`));return match?match[1].trim():"";};const rawStart=get("DTSTART"),rawEnd=get("DTEND");const date=(raw)=>raw&&raw.length>=8?`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`:"";const time=(raw)=>raw&&raw.includes("T")?`${raw.slice(9,11)}:${raw.slice(11,13)}`:"";events.push({id:uid(),title:get("SUMMARY")||"Calendar event",type:"School event",date:date(rawStart),endDate:date(rawEnd),time:time(rawStart),endTime:time(rawEnd),location:get("LOCATION"),notes:get("DESCRIPTION"),sourceText:body.trim()});}return events.filter((e)=>e.date);}
function naivePdfText(bytes){ const text=new TextDecoder("latin1").decode(bytes); const matches=[]; for(const match of text.matchAll(/\(([^()]|\\.){3,}\)\s*Tj/g)){matches.push(match[0].slice(1,match[0].lastIndexOf(")")).replace(/\\([()\\])/g,"$1"));} return matches.join(" "); }

async function createImportItem(file){
  const ext=fileExtension(file);
  const requestedDestination=$("#importDestination")?.value||"auto";
  const item={id:uid(),file,status:"Reading",requestedDestination,destination:requestedDestination,preview:null,selected:new Set(),selectionInitialized:false,recordCache:null,recordCacheKey:"",visibleFilter:"all",error:""};
  try{
    if(["xlsx","xlsm"].includes(ext)){const workbook=await ClassroomXlsx.readWorkbook(file);const detections=ClassroomXlsx.detectWorkbookSchedules(workbook);const scheduleIndex=detections.findIndex((d)=>d.result.detected);const tables=workbook.sheets.map((sheet)=>ClassroomXlsx.genericTable(sheet));const auto=scheduleIndex>=0?"schedule":ClassroomXlsx.inferGenericDestination(tables[0]);item.destination=item.destination==="auto"?auto:item.destination;item.preview={kind:"workbook",workbook,detections,tables,selectedSheet:item.destination==="schedule"?Math.max(0,scheduleIndex):0};}
    else if(["csv","tsv"].includes(ext)){const text=await file.text();const matrix=parseDelimited(text,ext==="tsv"?"\t":",");const table=tableFromMatrix(file.name,matrix);item.destination=item.destination==="auto"?detectDestinationFromText(`${table.headers.join(" ")} ${text.slice(0,4000)}`):item.destination;item.preview={kind:"table",table};}
    else if(ext==="ics"){const events=parseICS(await file.text());item.destination=item.destination==="auto"?"calendar":item.destination;item.preview={kind:"records",records:events};}
    else if(ext==="json"){const parsed=JSON.parse(await file.text());const records=Array.isArray(parsed)?parsed:(parsed.records||parsed.items||[parsed]);item.destination=item.destination==="auto"?detectDestinationFromText(JSON.stringify(records).slice(0,5000)):item.destination;item.preview={kind:"json",records};}
    else if(ext==="txt"){const text=await file.text();item.destination=item.destination==="auto"?detectDestinationFromText(text):item.destination;item.preview={kind:"text",text};}
    else if(["docx","pptx"].includes(ext)){const text=await extractZipText(file,ext);item.destination=item.destination==="auto"?detectDestinationFromText(text):item.destination;item.preview={kind:"text",text,sourceType:ext};}
    else if(ext==="pdf"){const bytes=new Uint8Array(await file.arrayBuffer());const text=naivePdfText(bytes);item.destination=item.destination==="auto"?detectDestinationFromText(text):item.destination;item.preview={kind:"pdf",url:URL.createObjectURL(file),text,scanned:!text.trim()};}
    else if(["png","jpg","jpeg","heic"].includes(ext)){item.destination=item.destination==="auto"?"reference":item.destination;item.preview={kind:"image",url:URL.createObjectURL(file)};}
    else throw new Error("Unsupported file type");
    item.status="Ready";
  }catch(error){item.status="Error";item.error=error.message;}
  return item;
}

async function handleImportFiles(files){
  for(const file of Array.from(files)){const item=await createImportItem(file);importQueue.push(item);}
  if(importActiveIndex<0&&importQueue.length)importActiveIndex=0;
  renderImportQueue();renderActiveImport();
}
handleImportFile=async function handleImportFileV8(file){return handleImportFiles([file]);};
function activeImport(){return importQueue[importActiveIndex]||null;}
function autoDestinationForItem(item){
  const p=item?.preview;if(!p)return "reference";
  if(p.kind==="records")return "calendar";
  if(p.kind==="table")return detectDestinationFromText(`${p.table.headers.join(" ")} ${p.table.rows.slice(0,20).map((row)=>Object.values(row.record).join(" ")).join(" ")}`);
  if(p.kind==="json")return detectDestinationFromText(JSON.stringify(p.records).slice(0,8000));
  if(p.kind==="text")return detectDestinationFromText(p.text||"");
  if(p.kind==="pdf")return p.text?.trim()?detectDestinationFromText(p.text):"reference";
  if(p.kind==="image")return "reference";
  if(p.kind==="workbook"){
    const scheduleIndex=p.detections?.findIndex((d)=>d.result?.detected)??-1;
    if(scheduleIndex>=0)return "schedule";
    const table=p.tables?.[p.selectedSheet||0]||p.tables?.[0];
    return table?ClassroomXlsx.inferGenericDestination(table):"reference";
  }
  return "reference";
}
function applyImportDestination(item,value){
  item.requestedDestination=value||"auto";
  item.destination=item.requestedDestination==="auto"?autoDestinationForItem(item):item.requestedDestination;
  item.selected.clear();item.selectionInitialized=false;item.recordCache=null;item.recordCacheKey="";
}
function renderImportQueue(){const host=$("#importQueue");if(!host)return;host.innerHTML=importQueue.map((item,index)=>`<button class="import-queue-item ${index===importActiveIndex?"active":""}" data-import-queue-index="${index}"><span><strong>${escapeHTML(item.file.name)}</strong><small>${escapeHTML(item.destination==="auto"?"Auto-detect":destinationLabel(item.destination))} · ${escapeHTML(item.status)}</small></span><span class="queue-actions"><i>${escapeHTML(fileExtension(item.file).toUpperCase())}</i><b data-remove-queued="${index}" title="Remove">×</b></span></button>`).join("");$$('[data-import-queue-index]').forEach((button)=>button.addEventListener("click",(event)=>{if(event.target.closest('[data-remove-queued]'))return;importActiveIndex=Number(button.dataset.importQueueIndex);renderImportQueue();renderActiveImport();}));$$('[data-remove-queued]').forEach((button)=>button.addEventListener("click",(event)=>{event.stopPropagation();const index=Number(button.dataset.removeQueued);const [removed]=importQueue.splice(index,1);if(removed?.preview?.url)URL.revokeObjectURL(removed.preview.url);if(importActiveIndex>=importQueue.length)importActiveIndex=importQueue.length-1;renderImportQueue();renderActiveImport();}));}
function setImportSelection(item,records){if(!item.selectionInitialized){item.selected=new Set(records.map((r)=>r.id||r.__id));item.selectionInitialized=true;}}
function recordsForImportItem(item){
  if(!item?.preview)return[];
  const p=item.preview;
  const key=`${item.destination}|${p.selectedSheet ?? 0}|${p.kind}`;
  if(item.recordCacheKey===key && item.recordCache)return item.recordCache;
  let records=[];
  if(p.kind==="records")records=p.records.map((r,index)=>({...r,__id:r.id||`record-${index}`}));
  else if(p.kind==="json")records=p.records.map((r,index)=>({...r,__id:r.id||`json-${index}`}));
  else if(p.kind==="table")records=autoMapGenericRows(p.table,item.destination).map((r)=>({...r,__id:r.id}));
  else if(p.kind==="workbook"){
    if(item.destination==="schedule"){const d=p.detections[p.selectedSheet]?.result;records=(d?.blocks||[]).map((r)=>({...r,__id:r.id}));}
    else records=autoMapGenericRows(p.tables[p.selectedSheet],item.destination).map((r)=>({...r,__id:r.id}));
  }
  else if(p.kind==="text")records=p.text.split(/\n{2,}|\n(?=[A-Z\u4e00-\u9fff])/).map((text,index)=>{const id=`text-${index}`;const title=text.split(/\n|[.!?。！？]/)[0].slice(0,90)||`Section ${index+1}`;if(item.destination==="playbook")return{id,__id:id,title,category:"Teaching",purpose:"",steps:text,sourceText:text};if(item.destination==="library")return{id,__id:id,title,type:p.sourceType?.toUpperCase()||"Document",notes:text};if(item.destination==="tasks")return{id,__id:id,title,dueDate:"",category:"Preparation",priority:"Normal",notes:text,completed:false};return{id,__id:id,title,text,selected:true};}).filter((r)=>(r.text||r.steps||r.notes||r.title).trim());
  item.recordCacheKey=key; item.recordCache=records;
  return records;
}
function renderActiveImport(){
  const item=activeImport();const preview=$("#importPreview"),summary=$("#importWorkbookSummary"),confirm=$("#confirmScheduleImport");
  if(!item){summary.classList.add("hidden");preview.innerHTML=`<div class="empty-state">Choose or drag in a file. Nothing is saved until you confirm.</div>`;confirm.disabled=true;return;}
  summary.classList.remove("hidden");summary.innerHTML=`<span class="eyebrow">Active file</span><h3>${escapeHTML(item.file.name)}</h3><p>${escapeHTML(destinationLabel(item.destination))} · ${escapeHTML(item.status)}${item.error?` · ${escapeHTML(item.error)}`:""}</p>`;
  if($("#importDestination")) $("#importDestination").value=item.requestedDestination||"auto";
  $("#importPreviewTitle").textContent=destinationLabel(item.destination);
  if(item.status==="Error"){preview.innerHTML=`<div class="empty-state review-badge">${escapeHTML(item.error)}</div>`;confirm.disabled=true;return;}
  if(item.preview.kind==="pdf"||item.preview.kind==="image"){
    const media=item.preview.kind==="pdf"?`<object class="document-preview" data="${item.preview.url}" type="application/pdf"><p>Open the PDF in a new tab to review it.</p></object>`:`<img class="document-preview-image" src="${item.preview.url}" alt="Imported image preview"/>`;
    preview.innerHTML=`${media}<div class="reference-import-box"><p><strong>${item.preview.text?"Some embedded PDF text was found.":"No reliable embedded text was found."}</strong></p><p>${item.preview.scanned?"This appears to be a scanned PDF. Keep it as a reference document, or manually add Calendar / Schedule records after reviewing the page.":"Review the extracted text below before deciding how to import."}</p>${item.preview.text?`<textarea id="pdfExtractedText" rows="8">${escapeHTML(item.preview.text)}</textarea>`:""}</div>`;
    confirm.disabled=false;confirm.textContent=item.destination==="reference"?"Save reference":"Save reference & continue manually";return;
  }
  let records=recordsForImportItem(item);records.forEach((r)=>{if(!r.__id)r.__id=r.id||uid();});setImportSelection(item,records);
  const visible=records.filter((r)=>item.visibleFilter==="all"||r.day===item.visibleFilter);
  const selectedVisible=visible.filter((r)=>item.selected.has(r.__id)).length;
  const dayButtons=item.destination==="schedule"?`<button data-import-filter="all" class="${item.visibleFilter==="all"?"active":""}">All</button>${DAY_NAMES.map((day)=>`<button data-import-filter="${day}" class="${item.visibleFilter===day?"active":""}">${day} ${records.filter((r)=>r.day===day).length}</button>`).join("")}`:"";
  const sheetButtons=item.preview.kind==="workbook"?item.preview.workbook.sheets.map((sheet,index)=>`<button data-generic-sheet="${index}" class="${item.preview.selectedSheet===index?"active":""}">${escapeHTML(sheet.name)}</button>`).join(""):"";
  const columns=item.destination==="schedule"?["day","title","startTime","endTime","category","sourceCell"]:Object.keys(visible[0]||{}).filter((key)=>!["id","__id","sourceRecord"].includes(key)).slice(0,8);
  preview.innerHTML=`<div class="selection-toolbar"><div><button class="mini-button" data-select-action="visible">Select all visible</button><button class="mini-button" data-select-action="all">Select all in file</button><button class="mini-button" data-select-action="none">Deselect all</button></div><strong id="importSelectionCount">Selected ${item.selected.size} of ${records.length}</strong></div>${sheetButtons?`<div class="import-preview-tabs">${sheetButtons}</div>`:""}${dayButtons?`<div class="import-preview-tabs">${dayButtons}</div>`:""}<div class="preview-table-wrap"><table class="preview-table"><thead><tr><th>Use</th>${columns.map((c)=>`<th>${escapeHTML(c)}</th>`).join("")}</tr></thead><tbody>${visible.map((r)=>`<tr data-import-record-id="${r.__id}" class="${r.needsReview?"needs-review":""}"><td><input type="checkbox" data-import-record-select="${r.__id}" ${item.selected.has(r.__id)?"checked":""}></td>${columns.map((c)=>`<td>${c==="title"||c==="startTime"||c==="endTime"?`<input data-import-cell="${c}" value="${escapeHTML(r[c]??"")}"/>`:escapeHTML(typeof r[c]==="object"?JSON.stringify(r[c]):r[c]??"")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  confirm.disabled=item.selected.size===0;confirm.textContent=`Import ${item.selected.size} selected`;
  $$('[data-import-record-select]').forEach((input)=>input.addEventListener("change",()=>{input.checked?item.selected.add(input.dataset.importRecordSelect):item.selected.delete(input.dataset.importRecordSelect);const count=$("#importSelectionCount");if(count)count.textContent=`Selected ${item.selected.size} of ${records.length}`;confirm.disabled=item.selected.size===0;confirm.textContent=`Import ${item.selected.size} selected`;}));
  $$('[data-import-cell]').forEach((input)=>input.addEventListener("change",()=>{const row=input.closest("tr");const record=records.find((r)=>r.__id===row.dataset.importRecordId);if(record){record[input.dataset.importCell]=input.value;if(input.dataset.importCell==="startTime"||input.dataset.importCell==="endTime")record[input.dataset.importCell==="startTime"?"start":"end"]=minutesFromTime(input.value);}}));
  $$('[data-select-action]').forEach((button)=>button.addEventListener("click",()=>{const action=button.dataset.selectAction;if(action==="visible")visible.forEach((r)=>item.selected.add(r.__id));else if(action==="all")records.forEach((r)=>item.selected.add(r.__id));else item.selected.clear();renderActiveImport();}));
  $$('[data-import-filter]').forEach((button)=>button.addEventListener("click",()=>{item.visibleFilter=button.dataset.importFilter;renderActiveImport();}));
  $$('[data-generic-sheet]').forEach((button)=>button.addEventListener("click",()=>{item.preview.selectedSheet=Number(button.dataset.genericSheet);item.selected.clear();item.selectionInitialized=false;item.recordCache=null;item.recordCacheKey="";renderActiveImport();}));
}

function importCollectionForDestination(destination){return({schedule:"scheduleBlocks",calendar:"calendarEvents",playbook:"playbookRoutines",library:"materials",learners:"learners",plans:"learnerPlans",memory:"teachingMemory",tasks:"tasks"})[destination]||null;}
function importActiveSelection(){
  const item=activeImport();if(!item)return;const batchId=uid();
  if(item.preview.kind==="pdf"||item.preview.kind==="image"||item.destination==="reference"){
    data.documentReferences.push({id:uid(),title:item.file.name,type:fileExtension(item.file).toUpperCase(),destination:item.destination,notes:item.preview.text||"",createdAt:Date.now(),importBatchId:batchId});
    data.imports.push({id:batchId,fileName:item.file.name,category:"reference",count:1,createdAt:Date.now(),sourceRetained:false});
    removeActiveImportAfterSave();persist("Reference document recorded locally; original file remains in your folder");return;
  }
  const records=recordsForImportItem(item).filter((r)=>item.selected.has(r.__id));const collection=importCollectionForDestination(item.destination);if(!collection){showToast("Choose an import destination");return;}
  let added=0,skipped=0;const target=data[collection];
  for(const raw of records){const record={...raw};delete record.__id;record.importBatchId=batchId;record.sourceFile=item.file.name;record.importedAt=Date.now();if(item.destination==="schedule"){record.seriesKey=record.seriesKey||`${record.title}|${record.start}|${record.end}|${record.className||""}`.toLowerCase();record.start=Number.isFinite(record.start)?record.start:minutesFromTime(record.startTime);record.end=Number.isFinite(record.end)?record.end:minutesFromTime(record.endTime);}const duplicate=item.destination==="schedule"?target.some((x)=>x.day===record.day&&x.start===record.start&&x.end===record.end&&x.title===record.title):target.some((x)=>x.title&&record.title&&x.title.toLowerCase()===record.title.toLowerCase()&&((x.date||"")===(record.date||"")));if(duplicate){skipped++;continue;}target.push(record);added++;}
  data.imports.push({id:batchId,fileName:item.file.name,category:item.destination,sheetName:item.preview.kind==="workbook"?item.preview.workbook.sheets[item.preview.selectedSheet].name:"",count:added,skipped,createdAt:Date.now(),sourceRetained:false});
  removeActiveImportAfterSave();persist(`${added} ${destinationLabel(item.destination)} records imported${skipped?`; ${skipped} duplicates skipped`:""}`);
}
function removeActiveImportAfterSave(){const [removed]=importQueue.splice(importActiveIndex,1);if(removed?.preview?.url)URL.revokeObjectURL(removed.preview.url);if(importActiveIndex>=importQueue.length)importActiveIndex=importQueue.length-1;if($("#importDestination"))$("#importDestination").value=activeImport()?.requestedDestination||"auto";renderImportQueue();renderActiveImport();renderImportHistory();}
importSelectedSchedule=importActiveSelection;

renderImportHistory=function renderImportHistoryV8(){const host=$("#importHistory");if(!host)return;host.innerHTML=[...data.imports].sort((a,b)=>b.createdAt-a.createdAt).map((batch)=>`<div class="data-row"><div><h4>${escapeHTML(batch.fileName||"Imported data")}</h4><p>${escapeHTML(destinationLabel(batch.category)||batch.category||"Import")} · ${batch.count||0} created${batch.skipped?` · ${batch.skipped} skipped`:""}</p></div><div class="meta">${new Date(batch.createdAt).toLocaleString()}<br>Original file remains on your device</div><div class="row-actions"><button class="mini-button" data-view-import="${batch.id}">View</button><button class="mini-button" data-delete-import-data="${batch.id}">Delete imported data</button><button class="mini-button" data-remove-import-history="${batch.id}">Remove history</button></div></div>`).join("")||`<div class="empty-state">No imported files yet.</div>`;$$('[data-view-import]').forEach((button)=>button.addEventListener("click",()=>{const batch=data.imports.find((x)=>x.id===button.dataset.viewImport);switchView(batch?.category==="calendar"?"calendar":batch?.category==="playbook"?"playbook":batch?.category==="library"?"library":batch?.category==="learners"?"learners":batch?.category==="plans"?"learnerPlanning":batch?.category==="tasks"?"tasks":"schedule");}));$$('[data-delete-import-data]').forEach((button)=>button.addEventListener("click",()=>deleteImportDataV8(button.dataset.deleteImportData)));$$('[data-remove-import-history]').forEach((button)=>button.addEventListener("click",()=>{data.imports=data.imports.filter((item)=>item.id!==button.dataset.removeImportHistory);persist("Import history removed; imported data kept");}));};
function deleteImportDataV8(batchId){const batch=data.imports.find((x)=>x.id===batchId);const collections=["scheduleBlocks","calendarEvents","playbookRoutines","materials","learners","smallGroups","learnerPlans","teachingMemory","tasks","documentReferences"];let count=0;for(const name of collections)count+=data[name].filter((item)=>item.importBatchId===batchId).length;if(!confirm(`Delete ${count} records created by ${batch?.fileName||"this import"}? The original file will not be deleted.`))return;saveUndoSchedule();for(const name of collections)data[name]=data[name].filter((item)=>item.importBatchId!==batchId);data.imports=data.imports.filter((item)=>item.id!==batchId);persist("Imported data deleted; original file kept");}


// ─────────────────────────────────────────────────────────────
// Import Center audit repair v8.1
// ─────────────────────────────────────────────────────────────
const IMPORT_FIELD_OPTIONS_V81 = {
  calendar: [["title","Title"],["type","Type"],["date","Date"],["endDate","End date"],["time","Start time"],["endTime","End time"],["learner","Learner"],["location","Location"],["notes","Notes"]],
  playbook: [["title","Title"],["category","Category"],["purpose","Purpose"],["whenToUse","When / trigger"],["frequency","Frequency"],["steps","Steps / procedure"],["cues","Teacher language / cues"],["recovery","Variation / recovery"],["tags","Tags"]],
  library: [["title","Title"],["type","Resource type"],["url","File / URL"],["grade","Grade"],["skill","Skill"],["topic","Topic"],["unit","Unit / learner"],["tags","Tags"],["notes","Notes"]],
  learners: [["name","Name"],["grade","Grade / level"],["goals","Goals"],["notes","Notes"]],
  plans: [["title","Plan title"],["planType","Plan type"],["learner","Learner / group"],["status","Status"],["goal","Long-term goal"],["currentFocus","Current focus"],["objectives","Objectives"],["lessonSequence","Lesson sequence"],["nextStep","Next lesson / next step"],["reviewDate","Review date"]],
  memory: [["learner","Learner / group"],["date","Date"],["category","Category"],["status","Status"],["observation","Observation"],["nextStep","Next step"],["reviewDate","Review date"],["noticeDate","Notice date"],["tags","Tags"]],
  tasks: [["title","Title"],["dueDate","Due date"],["time","Time"],["category","Category"],["priority","Priority"],["notes","Notes"]],
};

function normalizeImportedDateV81(value, fallbackYear = null) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" || /^\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const numeric = Number(value);
    if (numeric > 20000 && numeric < 100000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(numeric) * 86400000);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`;
    }
  }
  const text = String(value).trim().replace(/[.]/g, "/");
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2,"0")}-${match[3].padStart(2,"0")}`;
  match = text.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?/);
  if (match) {
    let year = match[3] ? Number(match[3]) : Number(fallbackYear || new Date().getFullYear());
    if (year < 100) year += 2000;
    return `${year}-${match[1].padStart(2,"0")}-${match[2].padStart(2,"0")}`;
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return toISODate(parsed);
  return "";
}

function normalizeImportedTimeV81(value) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric < 1) return timeFromMinutes(Math.round(numeric * 1440) % 1440);
  const text = String(value).trim().toLowerCase().replace(/\s+/g, "");
  let match = text.match(/^(\d{1,2}):(\d{2})(am|pm)?$/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3] === "pm" && hour < 12) hour += 12;
  if (match[3] === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
}

function normalizeMappedRecordV81(record, destination) {
  const next = { ...record };
  if (destination === "calendar") {
    next.date = normalizeImportedDateV81(next.date);
    next.endDate = normalizeImportedDateV81(next.endDate) || next.date;
    next.time = normalizeImportedTimeV81(next.time);
    next.endTime = normalizeImportedTimeV81(next.endTime);
    next.needsReview = !next.date || !next.title || /^Calendar row /.test(next.title);
    next.reviewReasons = [!next.date ? "Missing or unrecognized date" : "", !next.title || /^Calendar row /.test(next.title) ? "Missing event title" : ""].filter(Boolean);
  } else if (destination === "tasks") {
    next.dueDate = normalizeImportedDateV81(next.dueDate);
    next.time = normalizeImportedTimeV81(next.time);
    next.needsReview = !next.title || /^Task row /.test(next.title);
  } else if (destination === "plans") {
    next.reviewDate = normalizeImportedDateV81(next.reviewDate);
    next.needsReview = !next.learner || !next.title || /^Lesson plan row /.test(next.title);
  } else if (destination === "memory") {
    next.date = normalizeImportedDateV81(next.date) || toISODate(new Date());
    next.reviewDate = normalizeImportedDateV81(next.reviewDate);
    next.noticeDate = normalizeImportedDateV81(next.noticeDate);
    next.needsReview = !next.learner || !next.observation;
  } else if (destination === "playbook") {
    next.needsReview = !next.title || /^Activity row /.test(next.title) || !next.steps;
    next.reviewReasons = [!next.steps ? "No steps/procedure mapped" : "", /^Activity row /.test(next.title) ? "No activity title mapped" : ""].filter(Boolean);
  } else if (destination === "library") {
    next.needsReview = !next.title || /^Resource row /.test(next.title);
  } else if (destination === "learners") {
    next.needsReview = !next.name || /^Learner row /.test(next.name);
  }
  return next;
}

const baseAutoMapGenericRowsV81 = autoMapGenericRows;
autoMapGenericRows = function autoMapGenericRowsV81(table, destination) {
  return baseAutoMapGenericRowsV81(table, destination).map((record) => normalizeMappedRecordV81(record, destination));
};

function applyHeaderAliasesV81(table, aliases = {}) {
  if (!aliases || !Object.keys(aliases).length) return table;
  return {
    ...table,
    rows: table.rows.map((row) => {
      const record = { ...row.record };
      for (const [source, target] of Object.entries(aliases)) if (target && Object.prototype.hasOwnProperty.call(record, source)) record[target] = record[source];
      return { ...row, record };
    }),
  };
}

function tableForWorkbookSheetV81(preview, index) {
  const header = Number.isInteger(preview.headerRows?.[index]) ? preview.headerRows[index] : ClassroomXlsx.detectHeaderRow(preview.workbook.sheets[index]);
  const raw = ClassroomXlsx.genericTable(preview.workbook.sheets[index], header);
  return applyHeaderAliasesV81(raw, preview.headerAliases?.[index] || {});
}

function workbookSheetIndicesV81(preview) {
  if (preview.useAllSheets) return preview.workbook.sheets.map((_, index) => index);
  return [Math.max(0, Number(preview.selectedSheet || 0))];
}

function smartTableFromMatrixV81(name, matrix) {
  let bestRow = 0, bestScore = -1;
  const keywords = /date|day|time|start|end|title|name|activity|purpose|steps|resource|grade|skill|topic|learner|student|goal|event|日期|星期|时间|活动|目的|步骤|资源|年级|技能|主题|学生|目标/i;
  matrix.slice(0, 20).forEach((row, index) => {
    const cells = row.map((value) => String(value || "").trim());
    const nonempty = cells.filter(Boolean).length;
    const score = nonempty + cells.filter((value) => keywords.test(value)).length * 3;
    if (score > bestScore) { bestScore = score; bestRow = index; }
  });
  const headers = (matrix[bestRow] || []).map((value, index) => String(value || `Column ${index + 1}`).trim());
  return { sheetName: name, headerRow: bestRow + 1, headers, rows: matrix.slice(bestRow + 1).map((values, offset) => ({ sourceRow: bestRow + offset + 2, values, record: Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])) })).filter((row) => row.values.some((value) => String(value || "").trim())) };
}

tableFromMatrix = smartTableFromMatrixV81;

function splitTextSectionsV81(text) {
  const cleaned = String(text || "").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];
  let sections = cleaned.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (sections.length <= 1) sections = cleaned.split(/\n(?=(?:\d+[.)]|[A-Z][A-Z ]{3,}:?|Activity\b|活动\b))/).map((part) => part.trim()).filter(Boolean);
  if (sections.length <= 1 && cleaned.length > 500) sections = cleaned.match(/.{1,500}(?:\s|$)/g)?.map((part) => part.trim()).filter(Boolean) || [cleaned];
  return sections;
}

const MONTHS_V81 = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
function parseCalendarTextRecordsV81(text, sourceType = "PDF") {
  const lines = String(text || "").replace(/\r/g, "\n").split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const records = [];
  let contextMonth = null;
  let contextYear = new Date().getFullYear();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const monthHeader = line.match(/^([A-Za-z]+)\s+(20\d{2})$/);
    if (monthHeader && MONTHS_V81[monthHeader[1].toLowerCase()]) { contextMonth = MONTHS_V81[monthHeader[1].toLowerCase()]; contextYear = Number(monthHeader[2]); continue; }
    let date = "", title = "", ambiguous = false;
    let match = line.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\s*[-–—:,]?\s*(.*)$/);
    if (match) { date = `${match[1]}-${match[2].padStart(2,"0")}-${match[3].padStart(2,"0")}`; title = match[4]; }
    if (!date) {
      match = line.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[-–—:,]?\s*(.*)$/);
      if (match) { let year = match[3] ? Number(match[3]) : contextYear; if (year < 100) year += 2000; date = `${year}-${match[1].padStart(2,"0")}-${match[2].padStart(2,"0")}`; title = match[4]; ambiguous = !match[3]; }
    }
    if (!date) {
      match = line.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(20\d{2}))?\s*[-–—:,]?\s*(.*)$/);
      const month = match ? MONTHS_V81[match[1].toLowerCase()] : null;
      if (match && month) { const year = Number(match[3] || contextYear); date = `${year}-${String(month).padStart(2,"0")}-${match[2].padStart(2,"0")}`; title = match[4]; ambiguous = !match[3]; contextMonth = month; contextYear = year; }
    }
    if (!date && contextMonth) {
      match = line.match(/^(\d{1,2})\s*[-–—:,]?\s+(.+)$/);
      if (match && Number(match[1]) <= 31) { date = `${contextYear}-${String(contextMonth).padStart(2,"0")}-${match[1].padStart(2,"0")}`; title = match[2]; ambiguous = true; }
    }
    if (!date) continue;
    if (!title && lines[i + 1] && !/^(?:\d{1,2}|20\d{2})[-/]/.test(lines[i + 1])) { title = lines[++i]; }
    title = title.replace(/^[-–—:,\s]+/, "").trim() || "Untitled calendar event";
    const eventType = /no school|school closed|closed|holiday/i.test(title) ? "School closed" : /early dismissal/i.test(title) ? "Early dismissal" : /testing|map\b/i.test(title) ? "Testing" : /assembly/i.test(title) ? "Assembly" : /field trip/i.test(title) ? "Field trip" : /professional development|teacher workday|pd day/i.test(title) ? "Professional development" : "School event";
    records.push({ id:`calendar-text-${records.length}`, __id:`calendar-text-${records.length}`, title, type:eventType, date, endDate:date, time:"", endTime:"", learner:"", location:"", notes:"", sourceText:line, sourceType, needsReview:ambiguous || title === "Untitled calendar event", reviewReasons:[ambiguous ? "Year inferred from context" : "", title === "Untitled calendar event" ? "Missing title" : ""].filter(Boolean) });
  }
  return records;
}

function parseScheduleTextRecordsV81(text, sourceType = "PDF") {
  const lines = String(text || "").replace(/\r/g, "\n").split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const records = [];
  let day = "";
  for (let i = 0; i < lines.length; i += 1) {
    const dayMatch = DAY_NAMES.find((name) => new RegExp(`^${name}(?:\\b|:)`, "i").test(lines[i]));
    if (dayMatch) { day = dayMatch; continue; }
    const match = lines[i].match(/(\d{1,2}:\s*\d{2}\s*(?:am|pm)?)\s*[-–—]\s*(\d{1,2}:\s*\d{2}\s*(?:am|pm)?)/i);
    if (!match || !day) continue;
    const startTime = normalizeImportedTimeV81(match[1]);
    const endTime = normalizeImportedTimeV81(match[2]);
    const before = lines[i].slice(0, match.index).trim();
    const after = lines[i].slice((match.index || 0) + match[0].length).trim();
    const title = before || after || lines[i - 1] || "Untitled block";
    const category = ClassroomXlsx.inferCategory(title);
    records.push({ id:`schedule-text-${records.length}`, __id:`schedule-text-${records.length}`, day, title, startTime, endTime, start:minutesFromTime(startTime), end:minutesFromTime(endTime), category, subject:category, className:"Class", teacher:"", parentId:null, participatesInBump:!["Transition","Arrival","Recess","Lunch","Dismissal","Mindfulness","Snack","Routine"].includes(category), sourceText:lines[i], sourceType, needsReview:!startTime || !endTime || title === "Untitled block", reviewReasons:[] });
  }
  return records;
}

function textRecordsForDestinationV81(text, destination, sourceType = "Document", sourceName = "") {
  if (destination === "calendar") return parseCalendarTextRecordsV81(text, sourceType);
  if (destination === "schedule") return parseScheduleTextRecordsV81(text, sourceType);
  const sections = splitTextSectionsV81(text);
  return sections.map((section, index) => {
    const id = `text-${destination}-${index}`;
    const first = section.split(/\n|[.!?。！？]/)[0].replace(/^\d+[.)]\s*/, "").slice(0, 100).trim() || `${destinationLabel(destination)} section ${index + 1}`;
    if (destination === "playbook") return normalizeMappedRecordV81({id,__id:id,title:first,category:"Teaching",purpose:"",whenToUse:"",frequency:"",steps:section,cues:"",recovery:"",tags:"",sourceText:section,sourceType}, destination);
    if (destination === "library") return normalizeMappedRecordV81({id,__id:id,title:sourceName || first,type:sourceType.toUpperCase(),url:"",grade:"",skill:"",topic:"",unit:"",tags:"",notes:section,sourceText:section}, destination);
    if (destination === "tasks") return normalizeMappedRecordV81({id,__id:id,title:first,dueDate:"",time:"",category:"Preparation",priority:"Normal",notes:section,completed:false,sourceText:section}, destination);
    if (destination === "plans") return normalizeMappedRecordV81({id,__id:id,title:first,planType:"Individual",learner:"",status:"Active",goal:"",currentFocus:"",objectives:"",lessonSequence:section,nextStep:"",reviewDate:"",sourceText:section}, destination);
    if (destination === "memory") return normalizeMappedRecordV81({id,__id:id,learner:"",date:toISODate(new Date()),category:"Observation",status:"Needs follow-up",observation:section,nextStep:"",reviewDate:"",noticeDate:"",tags:"",sourceText:section}, destination);
    if (destination === "learners") return normalizeMappedRecordV81({id,__id:id,name:first,grade:"",goals:"",notes:section,sourceText:section}, destination);
    return {id,__id:id,title:first,text:section,sourceType};
  });
}

const baseCreateImportItemV81 = createImportItem;
createImportItem = async function createImportItemV81(file) {
  const item = await baseCreateImportItemV81(file);
  if (item.preview?.kind === "workbook") {
    item.preview.headerRows = item.preview.workbook.sheets.map((sheet, index) => Math.max(0, Number(item.preview.tables?.[index]?.headerRow || ClassroomXlsx.detectHeaderRow(sheet) + 1) - 1));
    item.preview.headerAliases = item.preview.workbook.sheets.map(() => ({}));
    item.preview.useAllSheets = false;
  }
  return item;
};

autoDestinationForItem = function autoDestinationForItemV81(item) {
  const p = item?.preview; if (!p) return "reference";
  if (p.kind === "records") return "calendar";
  if (p.kind === "table") return ClassroomXlsx.inferGenericDestination(p.table);
  if (p.kind === "json") return detectDestinationFromText(JSON.stringify(p.records).slice(0,8000));
  if (p.kind === "text") return detectDestinationFromText(p.text || "");
  if (p.kind === "pdf") return p.text?.trim() ? detectDestinationFromText(p.text) : "reference";
  if (p.kind === "image") return "reference";
  if (p.kind === "workbook") {
    const scheduleIndex = p.detections?.findIndex((d) => d.result?.detected) ?? -1;
    if (scheduleIndex >= 0) return "schedule";
    const scores = p.workbook.sheets.map((_, index) => ClassroomXlsx.inferGenericDestination(tableForWorkbookSheetV81(p, index)));
    return scores.find((value) => value === "playbook") || scores.find((value) => value === "calendar") || scores[0] || "library";
  }
  return "reference";
};

applyImportDestination = function applyImportDestinationV81(item, value) {
  item.requestedDestination = value || "auto";
  item.destination = item.requestedDestination === "auto" ? autoDestinationForItem(item) : item.requestedDestination;
  item.selected.clear(); item.selectionInitialized = false; item.recordCache = null; item.recordCacheKey = ""; item.visibleFilter = "all";
};

recordsForImportItem = function recordsForImportItemV81(item) {
  if (!item?.preview) return [];
  const p = item.preview;
  const aliasKey = p.headerAliases ? JSON.stringify(p.headerAliases) : "";
  const key = `${item.destination}|${p.selectedSheet ?? 0}|${p.useAllSheets ? "all" : "one"}|${JSON.stringify(p.headerRows || [])}|${aliasKey}|${p.kind}`;
  if (item.recordCacheKey === key && item.recordCache) return item.recordCache;
  let records = [];
  if (p.kind === "records") records = p.records.map((record,index) => ({...normalizeMappedRecordV81(record,item.destination),__id:record.id||`record-${index}`}));
  else if (p.kind === "json") records = p.records.map((record,index) => ({...normalizeMappedRecordV81(record,item.destination),__id:record.id||`json-${index}`}));
  else if (p.kind === "table") records = autoMapGenericRows(p.table,item.destination).map((record)=>({...record,__id:record.id}));
  else if (p.kind === "workbook") {
    const indices = workbookSheetIndicesV81(p);
    if (item.destination === "schedule") records = indices.flatMap((index) => (p.detections[index]?.result?.blocks || []).map((record) => ({...record,__id:record.id})));
    else records = indices.flatMap((index) => autoMapGenericRows(tableForWorkbookSheetV81(p,index),item.destination).map((record) => ({...record,__id:record.id})));
  } else if (p.kind === "text") records = textRecordsForDestinationV81(p.text,item.destination,p.sourceType||"Document",item.file?.name||"");
  else if (p.kind === "pdf" && p.text?.trim() && item.destination !== "reference") records = textRecordsForDestinationV81(p.text,item.destination,"PDF",item.file?.name||"");
  item.recordCacheKey = key; item.recordCache = records;
  return records;
};

function mappingPanelV81(item) {
  const p = item.preview;
  if (p.kind !== "workbook" || item.destination === "schedule") return "";
  const index = Math.max(0, Number(p.selectedSheet || 0));
  const rawTable = ClassroomXlsx.genericTable(p.workbook.sheets[index], p.headerRows[index]);
  const options = IMPORT_FIELD_OPTIONS_V81[item.destination] || [];
  const aliases = p.headerAliases[index] || {};
  return `<details class="mapping-panel"><summary>Header & column mapping · ${escapeHTML(p.workbook.sheets[index].name)}</summary><div class="mapping-tools"><label>Header row<input id="importHeaderRow" type="number" min="1" max="${Math.max(1,p.workbook.sheets[index].rowCount)}" value="${p.headerRows[index]+1}"></label><label class="checkbox-label"><input id="importAllSheets" type="checkbox" ${p.useAllSheets?"checked":""}> Import all workbook sheets</label></div><div class="mapping-grid">${rawTable.headers.map((header) => `<label><span>${escapeHTML(header)}</span><select data-header-alias="${escapeHTML(header)}"><option value="">Keep original / auto-detect</option>${options.map(([key,label]) => `<option value="${key}" ${aliases[header]===key?"selected":""}>${escapeHTML(label)}</option>`).join("")}</select></label>`).join("")}</div><p class="meta">Unmapped columns are retained in the imported record’s source data; they are not silently discarded.</p></details>`;
}

renderActiveImport = function renderActiveImportV81() {
  const item = activeImport(), preview = $("#importPreview"), summary = $("#importWorkbookSummary"), confirmButton = $("#confirmScheduleImport");
  if (!item) { summary.classList.add("hidden"); preview.innerHTML = `<div class="empty-state">Choose or drag in a file. Nothing is saved until you confirm.</div>`; confirmButton.disabled = true; return; }
  summary.classList.remove("hidden"); summary.innerHTML = `<span class="eyebrow">Active file</span><h3>${escapeHTML(item.file.name)}</h3><p>${escapeHTML(destinationLabel(item.destination))} · ${escapeHTML(item.status)}${item.error?` · ${escapeHTML(item.error)}`:""}</p>`;
  if ($("#importDestination")) $("#importDestination").value = item.requestedDestination || "auto";
  $("#importPreviewTitle").textContent = destinationLabel(item.destination);
  if (item.status === "Error") { preview.innerHTML = `<div class="empty-state review-badge">${escapeHTML(item.error)}</div>`; confirmButton.disabled = true; return; }
  const p = item.preview;
  if (p.kind === "image" || (p.kind === "pdf" && (!p.text?.trim() || item.destination === "reference"))) {
    const media = p.kind === "pdf" ? `<object class="document-preview" data="${p.url}" type="application/pdf"><p>Open the PDF in a new tab to review it.</p></object>` : `<img class="document-preview-image" src="${p.url}" alt="Imported image preview">`;
    preview.innerHTML = `${media}<div class="reference-import-box"><p><strong>${p.kind === "pdf" && p.text ? "Embedded text was found, but Reference document is selected." : "No reliable structured text was found."}</strong></p><p>${p.scanned ? "This appears to be a scanned PDF. This offline build does not run OCR; save it as a reference or add records manually after review." : "The original stays on your device. Classroom stores only local reference metadata."}</p>${p.text?`<textarea rows="8" readonly>${escapeHTML(p.text)}</textarea>`:""}</div>`;
    confirmButton.disabled = false; confirmButton.textContent = "Save reference"; return;
  }
  let records = recordsForImportItem(item); records.forEach((record) => { if (!record.__id) record.__id = record.id || uid(); }); setImportSelection(item,records);
  const visible = records.filter((record) => item.visibleFilter === "all" || record.day === item.visibleFilter);
  const sheetButtons = p.kind === "workbook" ? p.workbook.sheets.map((sheet,index) => `<button data-generic-sheet="${index}" class="${p.selectedSheet===index?"active":""}">${escapeHTML(sheet.name)}</button>`).join("") : "";
  const dayButtons = item.destination === "schedule" ? `<button data-import-filter="all" class="${item.visibleFilter==="all"?"active":""}">All</button>${DAY_NAMES.map((day)=>`<button data-import-filter="${day}" class="${item.visibleFilter===day?"active":""}">${day} ${records.filter((record)=>record.day===day).length}</button>`).join("")}` : "";
  const preferred = item.destination === "schedule" ? ["day","title","startTime","endTime","category","sourceCell"] : item.destination === "calendar" ? ["title","type","date","time","learner","sourceSheet","sourceRow","reviewReasons"] : item.destination === "playbook" ? ["title","purpose","steps","cues","tags","sourceSheet","sourceRow","reviewReasons"] : [];
  const union = Array.from(new Set(visible.flatMap((record)=>Object.keys(record)))).filter((key)=>!["id","__id","sourceRecord","importBatchId"].includes(key));
  const columns = [...preferred.filter((key)=>union.includes(key)),...union.filter((key)=>!preferred.includes(key))].slice(0,10);
  const originalPreview = p.kind === "pdf" ? `<details class="source-preview"><summary>Preview original PDF and extracted text</summary><object class="document-preview" data="${p.url}" type="application/pdf"></object><textarea rows="8" readonly>${escapeHTML(p.text||"")}</textarea></details>` : "";
  preview.innerHTML = `${originalPreview}<div class="selection-toolbar"><div><button class="mini-button" data-select-action="visible">Select all visible</button><button class="mini-button" data-select-action="all">Select all in file</button><button class="mini-button" data-select-action="none">Deselect all</button></div><strong id="importSelectionCount">Selected ${item.selected.size} of ${records.length}</strong></div>${sheetButtons?`<div class="import-preview-tabs">${sheetButtons}</div>`:""}${mappingPanelV81(item)}${dayButtons?`<div class="import-preview-tabs">${dayButtons}</div>`:""}<div class="preview-table-wrap"><table class="preview-table"><thead><tr><th>Use</th>${columns.map((column)=>`<th>${escapeHTML(column)}</th>`).join("")}</tr></thead><tbody>${visible.map((record)=>`<tr data-import-record-id="${record.__id}" class="${record.needsReview?"needs-review":""}"><td><input type="checkbox" data-import-record-select="${record.__id}" ${item.selected.has(record.__id)?"checked":""}></td>${columns.map((column)=>`<td>${["title","startTime","endTime","date","time","learner","purpose","steps"].includes(column)?`<input data-import-cell="${column}" value="${escapeHTML(record[column]??"")}">`:escapeHTML(typeof record[column]==="object"?JSON.stringify(record[column]):record[column]??"")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  confirmButton.disabled = item.selected.size === 0; confirmButton.textContent = `Import ${item.selected.size} selected`;
  $$('[data-import-record-select]').forEach((input)=>input.addEventListener("change",()=>{input.checked?item.selected.add(input.dataset.importRecordSelect):item.selected.delete(input.dataset.importRecordSelect);const count=$("#importSelectionCount");if(count)count.textContent=`Selected ${item.selected.size} of ${records.length}`;confirmButton.disabled=item.selected.size===0;confirmButton.textContent=`Import ${item.selected.size} selected`;}));
  $$('[data-import-cell]').forEach((input)=>input.addEventListener("change",()=>{const record=records.find((entry)=>entry.__id===input.closest("tr").dataset.importRecordId);if(!record)return;record[input.dataset.importCell]=input.value;if(input.dataset.importCell==="startTime"||input.dataset.importCell==="endTime")record[input.dataset.importCell==="startTime"?"start":"end"]=minutesFromTime(input.value);if(input.dataset.importCell==="date")record.date=normalizeImportedDateV81(input.value);record.needsReview=false;}));
  $$('[data-select-action]').forEach((button)=>button.addEventListener("click",()=>{const action=button.dataset.selectAction;if(action==="visible")visible.forEach((record)=>item.selected.add(record.__id));else if(action==="all")records.forEach((record)=>item.selected.add(record.__id));else item.selected.clear();renderActiveImport();}));
  $$('[data-import-filter]').forEach((button)=>button.addEventListener("click",()=>{item.visibleFilter=button.dataset.importFilter;renderActiveImport();}));
  $$('[data-generic-sheet]').forEach((button)=>button.addEventListener("click",()=>{p.selectedSheet=Number(button.dataset.genericSheet);item.recordCache=null;item.recordCacheKey="";renderActiveImport();}));
  $("#importHeaderRow")?.addEventListener("change",()=>{const index=Number(p.selectedSheet||0);p.headerRows[index]=Math.max(0,Number($("#importHeaderRow").value||1)-1);item.selected.clear();item.selectionInitialized=false;item.recordCache=null;item.recordCacheKey="";renderActiveImport();});
  $("#importAllSheets")?.addEventListener("change",()=>{p.useAllSheets=$("#importAllSheets").checked;item.selected.clear();item.selectionInitialized=false;item.recordCache=null;item.recordCacheKey="";renderActiveImport();});
  $$('[data-header-alias]').forEach((select)=>select.addEventListener("change",()=>{const index=Number(p.selectedSheet||0);p.headerAliases[index]=p.headerAliases[index]||{};if(select.value)p.headerAliases[index][select.dataset.headerAlias]=select.value;else delete p.headerAliases[index][select.dataset.headerAlias];item.selected.clear();item.selectionInitialized=false;item.recordCache=null;item.recordCacheKey="";renderActiveImport();}));
};

importActiveSelection = function importActiveSelectionV81() {
  const item = activeImport(); if (!item) return;
  const p = item.preview; const batchId = uid();
  if (p.kind === "image" || item.destination === "reference" || (p.kind === "pdf" && !p.text?.trim())) {
    data.documentReferences.push({id:uid(),title:item.file.name,type:fileExtension(item.file).toUpperCase(),destination:item.destination,notes:p.text||"",createdAt:Date.now(),importBatchId:batchId});
    data.imports.push({id:batchId,fileName:item.file.name,category:"reference",count:1,createdAt:Date.now(),sourceRetained:false});
    removeActiveImportAfterSave();persist("Reference document recorded locally; original file remains on your device");return;
  }
  const records = recordsForImportItem(item).filter((record)=>item.selected.has(record.__id));
  const collection = importCollectionForDestination(item.destination); if (!collection) { showToast("Choose an import destination"); return; }
  if (!records.length) { showToast("Select at least one record"); return; }
  let added=0, skipped=0; const target=data[collection];
  for(const raw of records){const record={...raw};delete record.__id;record.importBatchId=batchId;record.sourceFile=item.file.name;record.importedAt=Date.now();if(item.destination==="schedule"){record.seriesKey=record.seriesKey||`${record.title}|${record.start}|${record.end}|${record.className||""}`.toLowerCase();record.start=Number.isFinite(record.start)?record.start:minutesFromTime(record.startTime);record.end=Number.isFinite(record.end)?record.end:minutesFromTime(record.endTime);record.startTime=record.startTime||timeFromMinutes(record.start);record.endTime=record.endTime||timeFromMinutes(record.end);}if(item.destination==="calendar"){record.date=normalizeImportedDateV81(record.date);record.endDate=normalizeImportedDateV81(record.endDate)||record.date;record.time=normalizeImportedTimeV81(record.time);record.endTime=normalizeImportedTimeV81(record.endTime);}const duplicate=item.destination==="schedule"?target.some((existing)=>existing.day===record.day&&existing.start===record.start&&existing.end===record.end&&existing.title===record.title):target.some((existing)=>existing.title&&record.title&&existing.title.toLowerCase()===record.title.toLowerCase()&&((existing.date||"")===(record.date||"")));if(duplicate){skipped++;continue;}target.push(record);added++;}
  if(item.destination==="schedule"&&added){const imported=target.filter((record)=>record.importBatchId===batchId);const starts=imported.map((record)=>record.start).filter(Number.isFinite);const ends=imported.map((record)=>record.end).filter(Number.isFinite);if(starts.length)data.settings.dayStartTime=timeFromMinutes(Math.max(0,Math.min(...starts)-15));if(ends.length)data.settings.dayEndTime=timeFromMinutes(Math.min(1439,Math.max(...ends)+15));}
  data.imports.push({id:batchId,fileName:item.file.name,category:item.destination,sheetName:p.kind==="workbook"?(p.useAllSheets?"All sheets":p.workbook.sheets[p.selectedSheet].name):"",count:added,skipped,createdAt:Date.now(),sourceRetained:false});
  removeActiveImportAfterSave();
  persist(`${added} ${destinationLabel(item.destination)} records imported${skipped?`; ${skipped} duplicates skipped`:""}`);
  // Keep the hidden Today and Week views synchronized immediately after Schedule/Calendar import.
  if (item.destination === "schedule" || item.destination === "calendar") {
    todayPreviewDate = null;
    renderToday();
    renderWeek();
  }
};
importSelectedSchedule = importActiveSelection;


// Enhanced settings and event bindings.
const baseRenderSettingsV8=renderSettings;
renderSettings=function renderSettingsV8(){baseRenderSettingsV8();$("#displayName").value=data.settings.displayName||"Alyssa";$("#summerBreakStart").value=data.settings.summerBreakStart||"";$("#countdownMode").value=data.settings.countdownMode||"school";};

const baseSetupEventListenersV8=setupEventListeners;
setupEventListeners=function setupEventListenersV8(){
  baseSetupEventListenersV8();
  $("#sidebarCollapse")?.addEventListener("click",()=>{data.settings.sidebarCollapsed=true;localStorage.setItem(STORAGE_KEY,JSON.stringify(data));applySidebarState();});
  $("#brandButton")?.addEventListener("click",()=>{if(data.settings.sidebarCollapsed){data.settings.sidebarCollapsed=false;localStorage.setItem(STORAGE_KEY,JSON.stringify(data));applySidebarState();}else switchView("today");});
  $("#mobileMenuButton")?.addEventListener("click",()=>document.body.classList.toggle("mobile-sidebar-open"));
  $$("[data-today-action]").forEach((button)=>button.addEventListener("click",()=>setTodayActionTab(button.dataset.todayAction)));
  $("#addPersonalAgenda")?.addEventListener("click",()=>openPersonalAgendaDialog());
  $("#personalAgendaForm")?.addEventListener("submit",savePersonalAgendaV81);
  $("#deletePersonalAgendaButton")?.addEventListener("click",deletePersonalAgendaV81);
  $("#planOwnerFilter")?.addEventListener("change",renderPlans);$("#planSearch")?.addEventListener("input",renderPlans);
  $("#quickCaptureType")?.addEventListener("change",()=>{});
  $$("[data-weekday-preset]").forEach((button)=>button.addEventListener("click",()=>{const preset=button.dataset.weekdayPreset;$$('[data-schedule-weekday]').forEach((input)=>{input.checked=preset==="all"||(preset==="weekdays"&&DAY_NAMES.indexOf(input.value)<5);if(preset==="none")input.checked=false;});updateScheduleImpactV8();}));
  $("#scheduleWeekdays")?.addEventListener("change",updateScheduleImpactV8);
  $("#scheduleDay")?.addEventListener("change",()=>{const day=$("#scheduleDay").value;const inputs=$$('[data-schedule-weekday]');if(!inputs.some((i)=>i.checked))inputs.find((i)=>i.value===day).checked=true;updateScheduleImpactV8();});
  $("#importDestination")?.addEventListener("change",()=>{const item=activeImport();if(item){applyImportDestination(item,$("#importDestination").value);renderImportQueue();renderActiveImport();}});
  const fileInput=$("#importFile");if(fileInput){const cloneInput=fileInput.cloneNode(true);fileInput.replaceWith(cloneInput);cloneInput.addEventListener("change",(event)=>handleImportFiles(event.target.files));}
  const drop=$("#dropZone");if(drop){const replacement=drop.cloneNode(true);drop.replaceWith(replacement);["dragenter","dragover"].forEach((name)=>replacement.addEventListener(name,(event)=>{event.preventDefault();replacement.classList.add("dragover");}));["dragleave","drop"].forEach((name)=>replacement.addEventListener(name,(event)=>{event.preventDefault();replacement.classList.remove("dragover");}));replacement.addEventListener("drop",(event)=>handleImportFiles(event.dataTransfer.files));replacement.querySelector("#importFile")?.addEventListener("change",(event)=>handleImportFiles(event.target.files));}
  const confirm=$("#confirmScheduleImport");if(confirm){const fresh=confirm.cloneNode(true);confirm.replaceWith(fresh);fresh.addEventListener("click",importActiveSelection);}
  $("#displayName")?.addEventListener("change",()=>{data.settings.displayName=$("#displayName").value.trim()||"Alyssa";persist("Display name updated");});
  $("#summerBreakStart")?.addEventListener("change",()=>{data.settings.summerBreakStart=$("#summerBreakStart").value;persist("Summer Break date updated");});
  $("#countdownMode")?.addEventListener("change",()=>{data.settings.countdownMode=$("#countdownMode").value;persist("Countdown preference updated");});
};

// Quick Capture conversion to personal agenda.
const baseQuickCaptureSubmitV8 = null;
function capturePersonalAgendaIfNeeded(event){
  const type=$("#quickCaptureType").value; if(type!=="Personal agenda")return false;
  event.preventDefault();event.stopImmediatePropagation();const text=$("#quickCaptureText").value.trim();if(!text)return true;$("#quickCaptureText").value="";openPersonalAgendaDialog(null,{title:text});return true;
}

async function initV8(){
  setupEventListeners();
  // Capture personal agenda before the original submit handler can create a generic capture.
  $("#quickCaptureForm")?.addEventListener("submit",capturePersonalAgendaIfNeeded,true);
  await loadFolderHandle();
  applySidebarState();
  renderAll();
  clearInterval(minuteTimer);
  minuteTimer=setInterval(()=>{applyTheme();if(currentView==="today")renderToday();if(currentView==="week")renderWeek();},60000);
}

initV8();
