const STORAGE_KEY = "classroomDataV1";
const UNDO_STACK_KEY = "classroomUndoStackV2";
const BUMP_UNDO_KEY = "classroomLastBumpV2";
const IMPORT_UNDO_KEY = "classroomLastImportV2";
const SCHEMA_VERSION = 2;

const emptyData = {
  schemaVersion: SCHEMA_VERSION,
  lessons: [],
  materials: [],
  calendarEvents: [],
  students: [],
  memories: [],
  templates: [],
  importHistory: []
};

const CATEGORY_SCHEMAS = {
  lessons: {
    label: "Lessons and schedules",
    collection: "lessons",
    fields: [
      field("title", "Lesson title", true, ["lesson title", "class title", "session title", "title", "lesson", "class", "topic", "课程名称", "课程", "课题"]),
      field("date", "Date", true, ["lesson date", "class date", "session date", "date", "day", "日期", "上课日期", "课程日期"]),
      field("time", "Start time", false, ["start time", "lesson time", "class time", "time", "开始时间", "上课时间", "时间"]),
      field("duration", "Duration (minutes)", false, ["duration", "minutes", "length", "duration minutes", "时长", "分钟"]),
      field("type", "Lesson type", false, ["lesson type", "class type", "session type", "type", "类别", "课程类型"]),
      field("learner", "Learner or group", false, ["learner", "student", "students", "group", "class group", "class", "班级", "学生", "学习者", "小组"]),
      field("objective", "Learning objective", false, ["objective", "goal", "learning goal", "learning objective", "目标", "教学目标", "学习目标"]),
      field("notes", "Notes", false, ["notes", "plan", "activities", "description", "备注", "活动", "教学活动", "说明"]),
      field("materialUrl", "Material link", false, ["material url", "resource url", "link", "url", "materials", "资源链接", "材料链接", "链接"]),
      field("tags", "Tags", false, ["tags", "labels", "keywords", "标签", "关键词"])
    ]
  },
  calendar: {
    label: "School calendar",
    collection: "calendarEvents",
    fields: [
      field("title", "Event title", true, ["event title", "holiday", "event", "title", "name", "活动名称", "假期", "事件", "名称"]),
      field("startDate", "Start date", true, ["start date", "date", "event date", "begin", "from", "开始日期", "日期", "起始日期"]),
      field("endDate", "End date", false, ["end date", "until", "to", "finish", "结束日期", "截止日期"]),
      field("type", "Event type", false, ["event type", "calendar type", "type", "category", "类型", "事件类型"]),
      field("notes", "Notes", false, ["notes", "description", "details", "备注", "说明", "详情"])
    ]
  },
  materials: {
    label: "Library resources",
    collection: "materials",
    fields: [
      field("title", "Resource title", true, ["resource title", "material title", "title", "name", "资源名称", "材料名称", "名称"]),
      field("type", "Resource type", false, ["resource type", "material type", "type", "format", "类型", "资源类型", "格式"]),
      field("tag", "Unit or learner", false, ["unit", "learner", "class", "collection", "tag", "单元", "学习者", "班级", "分类"]),
      field("url", "Link", false, ["url", "link", "resource url", "drive link", "website", "链接", "网址", "资源链接"]),
      field("grade", "Grade", false, ["grade", "year level", "level", "年级", "水平"]),
      field("skill", "Language skill", false, ["skill", "language skill", "domain", "听说读写", "技能", "语言技能"]),
      field("topic", "Topic", false, ["topic", "theme", "subject", "主题", "话题", "学科"]),
      field("tags", "Tags", false, ["tags", "labels", "keywords", "标签", "关键词"]),
      field("notes", "Notes", false, ["notes", "description", "usage", "备注", "说明", "使用方法"])
    ]
  },
  students: {
    label: "Students and learners",
    collection: "students",
    fields: [
      field("name", "Name", true, ["student name", "learner name", "name", "preferred name", "学生姓名", "姓名", "学习者姓名"]),
      field("group", "Group or class", false, ["group", "class", "section", "班级", "小组"]),
      field("grade", "Grade", false, ["grade", "year", "level", "年级", "水平"]),
      field("goals", "Goals", false, ["goals", "learning goals", "targets", "目标", "学习目标"]),
      field("strengths", "Strengths", false, ["strengths", "can do", "assets", "优势", "强项"]),
      field("needs", "Support or review needs", false, ["needs", "support needs", "review", "challenges", "需要支持", "复习内容", "困难"]),
      field("notes", "Notes", false, ["notes", "profile", "comments", "备注", "说明"]),
      field("tags", "Tags", false, ["tags", "labels", "标签"])
    ]
  },
  memories: {
    label: "Teaching memory",
    collection: "memories",
    fields: [
      field("learner", "Learner or group", true, ["learner", "student", "group", "class", "学习者", "学生", "班级"]),
      field("date", "Observation date", false, ["observation date", "date", "lesson date", "记录日期", "日期"]),
      field("category", "Memory category", false, ["category", "type", "memory type", "类别", "记录类型"]),
      field("note", "Observation or memory", true, ["observation", "memory", "note", "what happened", "记录", "观察", "教学记录"]),
      field("nextStep", "Next step", false, ["next step", "follow up", "review next", "下一步", "后续", "复习建议"]),
      field("tags", "Tags", false, ["tags", "labels", "技能", "标签"])
    ]
  },
  templates: {
    label: "Lesson templates",
    collection: "templates",
    fields: [
      field("title", "Template title", true, ["template title", "lesson title", "title", "模板名称", "课程名称"]),
      field("category", "Category", false, ["category", "purpose", "type", "类别", "教学目的"]),
      field("objective", "Objective", false, ["objective", "goal", "learning objective", "目标", "教学目标"]),
      field("activities", "Activities", false, ["activities", "steps", "procedure", "活动", "步骤", "流程"]),
      field("materials", "Materials", false, ["materials", "resources", "材料", "资源"]),
      field("duration", "Duration (minutes)", false, ["duration", "minutes", "time", "时长", "分钟"]),
      field("tags", "Tags", false, ["tags", "skills", "labels", "标签", "技能"])
    ]
  },
  backup: {
    label: "Full Classroom backup",
    collection: null,
    fields: []
  }
};

const viewMeta = {
  dashboard: ["Workspace", "Teaching overview"],
  calendar: ["Plan and adjust", "Weekly planner"],
  sessions: ["Personalized learning", "One-on-one sessions"],
  materials: ["Classified resources", "Teaching library"],
  import: ["Private data pipeline", "Import center"]
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const deepClone = value => JSON.parse(JSON.stringify(value));

let data = loadData();
let weekStart = getMonday(new Date());
let confirmCallback = null;
let importState = freshImportState();

function field(key, label, required, aliases) {
  return { key, label, required, aliases };
}

function ensureDataShape(value) {
  const source = value && typeof value === "object" ? value : {};
  const shaped = deepClone(emptyData);
  Object.keys(shaped).forEach(key => {
    if (Array.isArray(shaped[key]) && Array.isArray(source[key])) shaped[key] = source[key];
  });
  shaped.schemaVersion = SCHEMA_VERSION;
  return shaped;
}

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyData));
    return deepClone(emptyData);
  }
  try {
    return ensureDataShape(JSON.parse(saved));
  } catch {
    return deepClone(emptyData);
  }
}

function persistData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    showToast("This browser could not save the data. Export a backup and free local storage.");
    console.error(error);
    return false;
  }
}

function saveData(message = "Saved", options = {}) {
  persistData();
  renderAll();
  if (message) showToast(message, options.undo ? undoLastAction : null);
}

function getUndoStack() {
  try { return JSON.parse(localStorage.getItem(UNDO_STACK_KEY) || "[]"); }
  catch { return []; }
}

function pushUndo(label, snapshot = deepClone(data)) {
  const stack = getUndoStack();
  stack.unshift({ label, snapshot, timestamp: Date.now() });
  const limited = stack.slice(0, 3);
  let saved = false;
  while (limited.length && !saved) {
    try {
      localStorage.setItem(UNDO_STACK_KEY, JSON.stringify(limited));
      saved = true;
    } catch {
      limited.pop();
    }
  }
  if (!saved) localStorage.removeItem(UNDO_STACK_KEY);
  updateUndoControls();
}

function undoLastAction() {
  const stack = getUndoStack();
  const action = stack.shift();
  if (!action) return;
  data = ensureDataShape(action.snapshot);
  localStorage.setItem(UNDO_STACK_KEY, JSON.stringify(stack));
  if (action.label === "Bump schedule") localStorage.removeItem(BUMP_UNDO_KEY);
  persistData();
  renderAll();
  showToast(`Undid: ${action.label}`);
}

function updateUndoControls() {
  const action = getUndoStack()[0];
  const button = $("#undoActionButton");
  button.disabled = !action;
  button.textContent = action ? `Undo: ${action.label}` : "Undo last action";
  $("#undoBumpButton").disabled = !localStorage.getItem(BUMP_UNDO_KEY);
  $("#undoImportButton").disabled = !localStorage.getItem(IMPORT_UNDO_KEY);
}

function nextDateForDay(dayIndex) {
  const date = new Date();
  const current = date.getDay();
  let diff = dayIndex - current;
  if (diff < 0) diff += 7;
  date.setDate(date.getDate() + diff);
  return toISODate(date);
}

function toISODate(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function parseLocalDate(dateString) {
  return new Date(`${dateString}T12:00:00`);
}

function getMonday(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(12, 0, 0, 0);
  return copy;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function formatTime(time) {
  if (!time || !/^\d{2}:\d{2}/.test(time)) return "Time not set";
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })
    .format(new Date(2020, 1, 1, hours, minutes));
}

function formatDate(dateString, options = { month: "short", day: "numeric", year: "numeric" }) {
  if (!dateString) return "Date not set";
  const date = parseLocalDate(dateString);
  return Number.isNaN(date.getTime()) ? dateString : date.toLocaleDateString("en-US", options);
}

function sortedLessons() {
  return [...data.lessons].sort((a, b) => `${a.date || ""}T${a.time || ""}`.localeCompare(`${b.date || ""}T${b.time || ""}`));
}

function switchView(viewName) {
  $$(".view").forEach(view => view.classList.remove("active"));
  $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === viewName));
  $(`#${viewName}View`).classList.add("active");
  $("#viewEyebrow").textContent = viewMeta[viewName][0];
  $("#viewTitle").textContent = viewMeta[viewName][1];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderAll() {
  renderDashboard();
  renderWeek();
  renderSessions();
  renderMaterials();
  renderImportCenter();
  updateUndoControls();
}

function renderDashboard() {
  const today = toISODate(new Date());
  const todayLessons = sortedLessons().filter(item => item.date === today);
  $("#todayHeading").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  $("#todaySummary").textContent = todayLessons.length
    ? `${todayLessons.length} lesson${todayLessons.length === 1 ? "" : "s"} planned today. Your first lesson starts at ${formatTime(todayLessons[0].time)}.`
    : "No lessons are scheduled today. Add a lesson or import your private schedule to begin.";

  const weekEnd = addDays(weekStart, 7);
  const lessonsThisWeek = data.lessons.filter(item => {
    const date = parseLocalDate(item.date);
    return date >= weekStart && date < weekEnd;
  });

  $("#weekLessonCount").textContent = lessonsThisWeek.length;
  $("#oneOnOneCount").textContent = lessonsThisWeek.filter(item => item.type === "One-on-one").length;
  $("#materialCount").textContent = data.materials.length;

  const nowKey = `${today}T${new Date().toTimeString().slice(0, 5)}`;
  const upcoming = sortedLessons().filter(item => `${item.date}T${item.time || "00:00"}` >= nowKey);
  const next = upcoming[0];
  $("#nextLessonTime").textContent = next ? formatTime(next.time) : "—";
  $("#nextLessonLabel").textContent = next ? next.title : "No lesson scheduled";

  $("#upcomingList").innerHTML = upcoming.slice(0, 4).map(item => {
    const date = parseLocalDate(item.date);
    return `
      <article class="upcoming-card">
        <div class="date-badge"><span>${date.toLocaleDateString("en-US", { month: "short" })}</span><strong>${date.getDate()}</strong></div>
        <div><h4>${escapeHTML(item.title)}</h4><p>${formatTime(item.time)} · ${escapeHTML(item.learner || item.type || "Lesson")}</p></div>
        <span class="type-pill">${escapeHTML(item.type || "Class")}</span>
      </article>`;
  }).join("") || '<div class="empty-state">No upcoming lessons yet. Import a schedule or add a lesson.</div>';

  const summary = [
    ["Calendar events", data.calendarEvents.length],
    ["Students", data.students.length],
    ["Teaching memories", data.memories.length],
    ["Lesson templates", data.templates.length]
  ];
  $("#localDataSummary").innerHTML = summary.map(([label, count]) => `
    <div class="data-summary-row"><span>${label}</span><strong>${count}</strong></div>`).join("");
}

function eventCoversDate(event, dateKey) {
  const start = event.startDate || event.date;
  const end = event.endDate || start;
  return start && dateKey >= start && dateKey <= end;
}

function isClosedEvent(event) {
  return /closed|closure|no school|holiday|break|休校|放假|假期/i.test(`${event.type || ""} ${event.title || ""}`);
}

function renderWeek() {
  const weekEnd = addDays(weekStart, 6);
  $("#weekRange").textContent = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const today = toISODate(new Date());
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  $("#weekGrid").innerHTML = dayNames.map((dayName, index) => {
    const date = addDays(weekStart, index);
    const dateKey = toISODate(date);
    const dayLessons = sortedLessons().filter(item => item.date === dateKey);
    const dayEvents = data.calendarEvents.filter(item => eventCoversDate(item, dateKey));
    const closed = dayEvents.some(isClosedEvent);

    const eventCards = dayEvents.map(item => `
      <div class="calendar-event ${isClosedEvent(item) ? "closed-event" : ""}">
        <strong>${escapeHTML(item.title || "Calendar event")}</strong>${escapeHTML(item.type || "")}
      </div>`).join("");

    const lessonCards = dayLessons.map(item => `
      <article class="lesson-card ${(item.type || "class").toLowerCase().replaceAll(" ", "-")}">
        <span class="eyebrow">${formatTime(item.time)} · ${item.duration || 60} min</span>
        <h4>${escapeHTML(item.title)}</h4>
        <p>${escapeHTML(item.learner || item.type || "Lesson")}</p>
        <div class="lesson-card-actions">
          <button class="mini-button" data-edit-lesson="${item.id}">Edit</button>
          <button class="mini-button" data-bump-lesson="${item.id}">Bump</button>
        </div>
      </article>`).join("") || '<div class="empty-day">No lessons</div>';

    return `
      <section class="day-column ${dateKey === today ? "today" : ""} ${index >= 5 ? "weekend" : ""} ${closed ? "closed" : ""}">
        <div class="day-heading"><div><span>${dayName}</span></div><strong>${date.getDate()}</strong></div>
        <div class="day-events">${eventCards}</div>
        <div class="day-lessons">${lessonCards}</div>
      </section>`;
  }).join("");

  $$('[data-edit-lesson]').forEach(button => button.addEventListener('click', () => openLessonDialog(button.dataset.editLesson)));
  $$('[data-bump-lesson]').forEach(button => button.addEventListener('click', () => openBumpDialog(button.dataset.bumpLesson)));
}

function renderSessions() {
  const sessions = sortedLessons().filter(item => item.type === "One-on-one");
  $("#sessionList").innerHTML = sessions.map(item => `
    <article class="session-card">
      <div class="session-card-top">
        <div><span class="eyebrow">${escapeHTML(item.learner || "Individual learner")}</span><h4>${escapeHTML(item.title)}</h4><span class="session-date">${formatDate(item.date, { weekday: "long", month: "long", day: "numeric" })} · ${formatTime(item.time)}</span></div>
        <button class="icon-button" data-edit-lesson="${item.id}" aria-label="Edit session">✎</button>
      </div>
      <dl>
        <div><dt>Goal</dt><dd>${escapeHTML(item.objective || "No objective added yet.")}</dd></div>
        <div><dt>Plan and notes</dt><dd>${escapeHTML(item.notes || "No notes added yet.")}</dd></div>
      </dl>
    </article>`).join("") || '<div class="empty-state">No one-on-one sessions yet.</div>';

  $$("#sessionList [data-edit-lesson]").forEach(button => button.addEventListener("click", () => openLessonDialog(button.dataset.editLesson)));
}

function renderMaterials() {
  const query = $("#materialSearch")?.value.toLowerCase() || "";
  const type = $("#materialTypeFilter")?.value || "all";
  const currentSkill = $("#materialSkillFilter")?.value || "all";
  const skills = [...new Set(data.materials.map(item => item.skill).filter(Boolean))].sort();
  $("#materialSkillFilter").innerHTML = '<option value="all">All skills</option>' + skills.map(skill => `<option value="${escapeAttribute(skill)}">${escapeHTML(skill)}</option>`).join("");
  $("#materialSkillFilter").value = skills.includes(currentSkill) ? currentSkill : "all";
  const skill = $("#materialSkillFilter").value;

  const filtered = [...data.materials]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .filter(item => type === "all" || item.type === type)
    .filter(item => skill === "all" || item.skill === skill)
    .filter(item => `${item.title} ${item.tag} ${item.notes} ${item.grade} ${item.skill} ${item.topic} ${item.tags}`.toLowerCase().includes(query));

  $("#materialLibrary").innerHTML = filtered.map(item => {
    const chips = [item.grade, item.skill, item.topic, item.tag, item.tags].filter(Boolean);
    return `
      <article class="material-card">
        <div class="material-header"><span class="type-pill">${escapeHTML(item.type || "Other")}</span><button data-delete-material="${item.id}">Delete</button></div>
        <h4>${escapeHTML(item.title)}</h4>
        <p>${escapeHTML(item.notes || "No notes added.")}</p>
        <div class="meta-chips">${chips.map(chip => `<span class="meta-chip">${escapeHTML(chip)}</span>`).join("")}</div>
        ${item.url ? `<a href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">Open resource ↗</a>` : ""}
      </article>`;
  }).join("") || '<div class="empty-state">No materials match this filter.</div>';

  $$('[data-delete-material]').forEach(button => button.addEventListener('click', () => {
    const item = data.materials.find(material => material.id === button.dataset.deleteMaterial);
    askConfirmation("Delete this material?", `“${item?.title || "This material"}” will be removed from this browser.`, "Delete", () => {
      pushUndo("Delete material");
      data.materials = data.materials.filter(material => material.id !== button.dataset.deleteMaterial);
      saveData("Material deleted", { undo: true });
    });
  }));
}

function openLessonDialog(id = null, presetType = null) {
  const dialog = $("#lessonDialog");
  const lesson = data.lessons.find(item => item.id === id);
  $("#lessonForm").reset();
  $("#lessonDuration").value = 60;
  $("#lessonDate").value = toISODate(new Date());
  $("#lessonTime").value = "09:00";
  $("#lessonId").value = lesson?.id || "";
  $("#lessonDialogTitle").textContent = lesson ? "Edit lesson" : "Add lesson";
  $("#deleteLessonButton").classList.toggle("hidden", !lesson);

  if (lesson) {
    $("#lessonTitle").value = lesson.title;
    $("#lessonDate").value = lesson.date;
    $("#lessonTime").value = lesson.time || "09:00";
    $("#lessonDuration").value = lesson.duration || 60;
    $("#lessonType").value = lesson.type || "Class";
    $("#lessonLearner").value = lesson.learner || "";
    $("#lessonObjective").value = lesson.objective || "";
    $("#lessonNotes").value = lesson.notes || "";
    $("#lessonMaterialUrl").value = lesson.materialUrl || "";
  } else if (presetType) {
    $("#lessonType").value = presetType;
  }
  dialog.showModal();
}

function getBumpSequence(lessonId) {
  const selected = data.lessons.find(item => item.id === lessonId);
  if (!selected) return { selected: null, affected: [] };
  const selectedKey = `${selected.date}T${selected.time || "00:00"}`;
  const sequence = selected.learner || selected.type || "Lesson sequence";
  const affected = sortedLessons().filter(item => (item.learner || item.type || "Lesson sequence") === sequence && `${item.date}T${item.time || "00:00"}` >= selectedKey);
  return { selected, affected, sequence };
}

function openBumpDialog(id) {
  $("#bumpLessonId").value = id;
  $("#bumpDays").value = "1";
  $("#skipWeekends").checked = true;
  updateBumpPreview();
  $("#bumpDialog").showModal();
}

function updateBumpPreview() {
  const { selected, affected, sequence } = getBumpSequence($("#bumpLessonId").value);
  if (!selected) return;
  const days = Number($("#bumpDays").value);
  const skip = $("#skipWeekends").checked;
  $("#bumpSummary").textContent = `Move “${selected.title}” and later lessons in ${sequence} forward.`;
  const firstNew = shiftDate(selected.date, days, skip && isWeekday(selected.date));
  $("#bumpConfirmation").innerHTML = `<strong>${affected.length} lesson${affected.length === 1 ? "" : "s"} will move.</strong><br>${formatDate(selected.date)} → ${formatDate(firstNew)}${skip ? ", skipping weekends for weekday lessons" : ""}. You can undo the last bump afterward.`;
}

function isWeekday(dateString) {
  const day = parseLocalDate(dateString).getDay();
  return day >= 1 && day <= 5;
}

function shiftDate(dateString, days, skipWeekends) {
  let date = parseLocalDate(dateString);
  let remaining = days;
  while (remaining > 0) {
    date = addDays(date, 1);
    if (!skipWeekends || (date.getDay() !== 0 && date.getDay() !== 6)) remaining--;
  }
  return toISODate(date);
}

function bumpSchedule(lessonId, days, skipWeekends) {
  const { selected, affected, sequence } = getBumpSequence(lessonId);
  if (!selected || !affected.length) return;
  const snapshot = deepClone(data);
  pushUndo("Bump schedule", snapshot);
  const changes = affected.map(item => {
    const beforeDate = item.date;
    const afterDate = shiftDate(item.date, days, skipWeekends && isWeekday(item.date));
    return { id: item.id, beforeDate, afterDate };
  });
  const changeMap = new Map(changes.map(item => [item.id, item.afterDate]));
  data.lessons = data.lessons.map(item => changeMap.has(item.id) ? { ...item, date: changeMap.get(item.id) } : item);
  localStorage.setItem(BUMP_UNDO_KEY, JSON.stringify({ changes, sequence, timestamp: Date.now() }));
  saveData(`${changes.length} lesson${changes.length === 1 ? "" : "s"} bumped`, { undo: true });
}

function undoLastBump() {
  let action;
  try { action = JSON.parse(localStorage.getItem(BUMP_UNDO_KEY)); }
  catch { action = null; }
  if (!action?.changes?.length) return;
  let restored = 0;
  let skipped = 0;
  const changeMap = new Map(action.changes.map(change => [change.id, change]));
  data.lessons = data.lessons.map(item => {
    const change = changeMap.get(item.id);
    if (!change) return item;
    if (item.date === change.afterDate) {
      restored++;
      return { ...item, date: change.beforeDate };
    }
    skipped++;
    return item;
  });
  localStorage.removeItem(BUMP_UNDO_KEY);
  const stack = getUndoStack();
  const bumpIndex = stack.findIndex(item => item.label === "Bump schedule");
  if (bumpIndex >= 0) {
    stack.splice(bumpIndex, 1);
    localStorage.setItem(UNDO_STACK_KEY, JSON.stringify(stack));
  }
  persistData();
  renderAll();
  showToast(`${restored} lesson${restored === 1 ? "" : "s"} restored${skipped ? `; ${skipped} manually changed lesson${skipped === 1 ? " was" : "s were"} left untouched` : ""}.`);
}

function exportData() {
  const payload = { ...data, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `classroom-backup-${toISODate(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Local backup exported");
}

function showToast(message, undoHandler = null) {
  const toast = $("#toast");
  $("#toastMessage").textContent = message;
  const undoButton = $("#toastUndoButton");
  undoButton.classList.toggle("hidden", !undoHandler);
  undoButton.onclick = undoHandler || null;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), undoHandler ? 6000 : 2600);
}

function askConfirmation(title, message, buttonText, callback) {
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  $("#confirmActionButton").textContent = buttonText;
  confirmCallback = callback;
  $("#confirmDialog").showModal();
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch { return "#"; }
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
}

function escapeAttribute(value = "") {
  return escapeHTML(value).replace(/`/g, "&#096;");
}

// -----------------------------
// Import Center
// -----------------------------

function freshImportState() {
  return {
    file: null,
    fileType: "",
    rows: [],
    columns: [],
    category: "lessons",
    mapping: {},
    validation: null,
    sheets: null,
    activeSheet: null,
    backup: null
  };
}

function renderImportCenter() {
  const inventory = [
    ["Lessons", data.lessons.length],
    ["Calendar", data.calendarEvents.length],
    ["Library", data.materials.length],
    ["Students", data.students.length],
    ["Memories", data.memories.length],
    ["Templates", data.templates.length]
  ];
  $("#inventoryGrid").innerHTML = inventory.map(([label, count]) => `<div class="inventory-card"><span>${label}</span><strong>${count}</strong></div>`).join("");

  const history = [...data.importHistory].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
  $("#importHistory").innerHTML = history.map(item => `
    <div class="history-item">
      <strong>${escapeHTML(item.fileName || "Imported data")}</strong>
      <span>${escapeHTML(item.categoryLabel || item.category)} · ${item.importedCount || 0} imported · ${formatDateTime(item.timestamp)}</span>
    </div>`).join("") || '<div class="empty-state compact">No imports yet.</div>';
}

function formatDateTime(timestamp) {
  if (!timestamp) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

function resetImportWorkbench() {
  importState = freshImportState();
  $("#importFileInput").value = "";
  $("#fileCard").classList.add("hidden");
  $("#importConfig").classList.add("hidden");
  $("#clearImportButton").disabled = true;
  $("#sheetSelectField").classList.add("hidden");
  $("#mappingGrid").innerHTML = "";
  $("#previewHead").innerHTML = "";
  $("#previewBody").innerHTML = "";
}

async function handleImportFile(file) {
  if (!file) return;
  resetImportWorkbench();
  importState.file = file;
  $("#fileCard").classList.remove("hidden");
  $("#clearImportButton").disabled = false;
  $("#fileName").textContent = file.name;
  $("#fileMeta").textContent = `${formatFileSize(file.size)} · Reading locally…`;
  $("#fileStatus").textContent = "Reading";
  $("#fileStatus").className = "status-pill warning";

  try {
    const parsed = await parseImportFile(file);
    Object.assign(importState, parsed);
    $("#fileMeta").textContent = `${formatFileSize(file.size)} · ${parsed.backup ? "Full backup detected" : `${parsed.rows.length} row${parsed.rows.length === 1 ? "" : "s"} detected`}`;
    $("#fileStatus").textContent = "Ready";
    $("#fileStatus").className = "status-pill success";
    setupImportConfiguration();
  } catch (error) {
    console.error(error);
    $("#fileStatus").textContent = "Could not read";
    $("#fileStatus").className = "status-pill danger";
    $("#fileMeta").textContent = error.message || "Unsupported or invalid file.";
    showToast(error.message || "Could not read this file.");
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function parseImportFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (["xlsx", "xls"].includes(extension)) return parseWorkbook(file);
  if (extension === "csv") {
    const text = await file.text();
    const rows = parseDelimited(text);
    return rowsToImportState(rows, "csv");
  }
  if (extension === "json") {
    const text = await file.text();
    return parseJSONImport(text);
  }
  if (extension === "ics") {
    const text = await file.text();
    const rows = parseICS(text);
    return { ...rowsToImportState(rows, "ics"), category: "calendar" };
  }
  throw new Error("Please choose an Excel, CSV, JSON, or ICS file.");
}

async function parseWorkbook(file) {
  if (!window.XLSX) throw new Error("The Excel reader did not load. Check your internet connection, then refresh, or save the sheet as CSV.");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheets = {};
  workbook.SheetNames.forEach(name => {
    sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: "", raw: true });
  });
  const activeSheet = workbook.SheetNames[0];
  const state = rowsToImportState(sheets[activeSheet], "xlsx");
  return { ...state, sheets, activeSheet };
}

function parseJSONImport(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("This JSON file is not valid."); }
  const looksLikeBackup = parsed && typeof parsed === "object" && !Array.isArray(parsed) && (parsed.schemaVersion || parsed.lessons || parsed.materials || parsed.calendarEvents);
  if (looksLikeBackup) {
    const backup = ensureDataShape(parsed);
    return { fileType: "json", rows: [], columns: [], category: "backup", mapping: {}, validation: null, sheets: null, activeSheet: null, backup };
  }
  let rows;
  if (Array.isArray(parsed)) rows = parsed;
  else {
    const firstArray = Object.values(parsed || {}).find(Array.isArray);
    rows = firstArray || [parsed];
  }
  return rowsToImportState(rows, "json");
}

function rowsToImportState(rows, fileType) {
  const cleanRows = (rows || []).filter(row => row && typeof row === "object" && Object.values(row).some(value => String(value ?? "").trim() !== ""));
  if (!cleanRows.length) throw new Error("No data rows were found in this file.");
  const columns = [...new Set(cleanRows.flatMap(row => Object.keys(row)))];
  const category = detectCategory(columns);
  return { fileType, rows: cleanRows, columns, category, mapping: {}, validation: null, sheets: null, activeSheet: null, backup: null };
}

function parseDelimited(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = normalized.split("\n").find(line => line.trim()) || "";
  const candidates = [",", "\t", ";"];
  const delimiter = candidates.sort((a, b) => countDelimiter(firstLine, b) - countDelimiter(firstLine, a))[0];
  const matrix = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(value); value = ""; }
    else if (char === "\n" && !quoted) { row.push(value); matrix.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value.length || row.length) { row.push(value); matrix.push(row); }
  const nonEmpty = matrix.filter(cells => cells.some(cell => String(cell).trim()));
  if (nonEmpty.length < 2) throw new Error("The CSV file needs a header row and at least one data row.");
  const headers = makeUniqueHeaders(nonEmpty[0].map((header, index) => String(header).trim() || `Column ${index + 1}`));
  return nonEmpty.slice(1).map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === delimiter && !quoted) count++;
  }
  return count;
}

function makeUniqueHeaders(headers) {
  const seen = {};
  return headers.map(header => {
    const base = header || "Column";
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] === 1 ? base : `${base} ${seen[base]}`;
  });
}

function parseICS(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return blocks.map(block => {
    const get = key => {
      const match = block.match(new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, "mi"));
      return match ? decodeICS(match[1].trim()) : "";
    };
    const startRaw = get("DTSTART");
    const endRaw = get("DTEND");
    const startDate = parseICSDate(startRaw);
    let endDate = parseICSDate(endRaw) || startDate;
    if (endRaw && /^\d{8}$/.test(endRaw) && endDate > startDate) endDate = toISODate(addDays(parseLocalDate(endDate), -1));
    return {
      "Event title": get("SUMMARY") || "Calendar event",
      "Start date": startDate,
      "End date": endDate,
      "Event type": get("CATEGORIES") || "Calendar event",
      "Notes": get("DESCRIPTION")
    };
  }).filter(row => row["Start date"]);
}

function decodeICS(value) {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseICSDate(value) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().trim().replace(/[\s_\-\/]+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "");
}

function detectCategory(columns) {
  const normalizedColumns = columns.map(normalizeHeader);
  let best = { category: "lessons", score: -1 };
  Object.entries(CATEGORY_SCHEMAS).filter(([key]) => key !== "backup").forEach(([category, schema]) => {
    let score = 0;
    schema.fields.forEach(fieldDef => {
      const aliases = [fieldDef.label, fieldDef.key, ...fieldDef.aliases].map(normalizeHeader);
      if (normalizedColumns.some(column => aliases.includes(column))) score += fieldDef.required ? 4 : 2;
      else if (normalizedColumns.some(column => aliases.some(alias => alias.length > 2 && (column.includes(alias) || alias.includes(column))))) score += 1;
    });
    if (score > best.score) best = { category, score };
  });
  return best.category;
}

function setupImportConfiguration() {
  $("#importConfig").classList.remove("hidden");
  const categorySelect = $("#importCategory");
  const categoryEntries = importState.backup
    ? [["backup", CATEGORY_SCHEMAS.backup]]
    : Object.entries(CATEGORY_SCHEMAS).filter(([key]) => key !== "backup");
  categorySelect.innerHTML = categoryEntries.map(([key, schema]) => `<option value="${key}">${schema.label}</option>`).join("");
  categorySelect.value = importState.backup ? "backup" : importState.category;
  importState.category = categorySelect.value;

  if (importState.sheets) {
    $("#sheetSelectField").classList.remove("hidden");
    $("#sheetSelect").innerHTML = Object.keys(importState.sheets).map(name => `<option value="${escapeAttribute(name)}">${escapeHTML(name)}</option>`).join("");
    $("#sheetSelect").value = importState.activeSheet;
  } else {
    $("#sheetSelectField").classList.add("hidden");
  }

  $("#importMode").value = importState.backup ? "replace" : "add";
  $("#importMode").disabled = Boolean(importState.backup);
  renderMappingAndPreview();
}

function suggestMapping(category) {
  const schema = CATEGORY_SCHEMAS[category];
  const result = {};
  schema.fields.forEach(fieldDef => {
    const aliases = [fieldDef.label, fieldDef.key, ...fieldDef.aliases].map(normalizeHeader);
    let match = importState.columns.find(column => aliases.includes(normalizeHeader(column)));
    if (!match) match = importState.columns.find(column => aliases.some(alias => alias.length > 2 && (normalizeHeader(column).includes(alias) || alias.includes(normalizeHeader(column)))));
    result[fieldDef.key] = match || "";
  });
  return result;
}

function renderMappingAndPreview() {
  importState.category = $("#importCategory").value;
  if (importState.category === "backup") {
    $("#mappingGrid").innerHTML = '<div class="empty-state compact full-width">This file contains a full Classroom backup. Restoring it will replace all local Classroom data.</div>';
    renderBackupPreview();
    return;
  }

  importState.mapping = suggestMapping(importState.category);
  const schema = CATEGORY_SCHEMAS[importState.category];
  $("#mappingGrid").innerHTML = schema.fields.map(fieldDef => `
    <div class="mapping-row">
      <label>${escapeHTML(fieldDef.label)}${fieldDef.required ? ' <span class="required">*</span>' : ""}</label>
      <select data-map-field="${fieldDef.key}">
        <option value="">Do not import</option>
        ${importState.columns.map(column => `<option value="${escapeAttribute(column)}" ${importState.mapping[fieldDef.key] === column ? "selected" : ""}>${escapeHTML(column)}</option>`).join("")}
      </select>
      <small>${fieldDef.required ? "Required" : "Optional"}</small>
    </div>`).join("");

  $$('[data-map-field]').forEach(select => select.addEventListener("change", () => {
    importState.mapping[select.dataset.mapField] = select.value;
    validateAndRenderPreview();
  }));
  validateAndRenderPreview();
}

function renderBackupPreview() {
  const backup = importState.backup;
  const counts = [
    ["Lessons", backup.lessons.length], ["Calendar", backup.calendarEvents.length], ["Library", backup.materials.length],
    ["Students", backup.students.length], ["Memories", backup.memories.length], ["Templates", backup.templates.length]
  ];
  const total = counts.reduce((sum, [, count]) => sum + count, 0);
  $("#validationStrip").innerHTML = `
    <div class="validation-stat"><span>Backup type</span><strong>Full</strong></div>
    <div class="validation-stat good"><span>Total records</span><strong>${total}</strong></div>
    <div class="validation-stat warn"><span>Import mode</span><strong>Replace</strong></div>
    <div class="validation-stat"><span>Version</span><strong>${backup.schemaVersion || 1}</strong></div>`;
  $("#previewHead").innerHTML = "<tr><th>Category</th><th>Records in backup</th></tr>";
  $("#previewBody").innerHTML = counts.map(([label, count]) => `<tr><td>${label}</td><td>${count}</td></tr>`).join("");
  $("#importReadyText").textContent = "Restoring this backup replaces all current local data. An undo snapshot will be created first.";
  $("#runImportButton").textContent = "Restore full backup";
  $("#runImportButton").disabled = false;
}

function validateAndRenderPreview() {
  const category = importState.category;
  const schema = CATEGORY_SCHEMAS[category];
  const mode = $("#importMode").value;
  const existing = data[schema.collection] || [];
  const records = importState.rows.map((row, index) => buildRecord(category, row, index));
  const seen = new Set();

  records.forEach(result => {
    if (!result.valid) return;
    const key = identityKey(category, result.record);
    result.identity = key;
    result.duplicateExisting = existing.some(item => identityKey(category, item) === key);
    result.duplicateFile = seen.has(key);
    if (key) seen.add(key);
    result.duplicate = result.duplicateExisting || result.duplicateFile;
  });

  const invalid = records.filter(item => !item.valid).length;
  const duplicates = records.filter(item => item.valid && item.duplicate).length;
  const valid = records.length - invalid;
  const willImport = mode === "add" ? records.filter(item => item.valid && !item.duplicate).length : valid;
  importState.validation = { records, invalid, duplicates, valid, willImport };

  $("#validationStrip").innerHTML = `
    <div class="validation-stat"><span>Rows found</span><strong>${records.length}</strong></div>
    <div class="validation-stat good"><span>Valid</span><strong>${valid}</strong></div>
    <div class="validation-stat ${duplicates ? "warn" : ""}"><span>Duplicates</span><strong>${duplicates}</strong></div>
    <div class="validation-stat ${invalid ? "bad" : ""}"><span>Invalid</span><strong>${invalid}</strong></div>`;

  const previewFields = schema.fields.filter(fieldDef => importState.mapping[fieldDef.key]).slice(0, 5);
  $("#previewHead").innerHTML = `<tr><th>Status</th>${previewFields.map(fieldDef => `<th>${escapeHTML(fieldDef.label)}</th>`).join("")}<th>Issue</th></tr>`;
  $("#previewBody").innerHTML = records.slice(0, 30).map(result => {
    let status = "Ready";
    let statusClass = "valid";
    let rowClass = "";
    if (!result.valid) { status = "Invalid"; statusClass = "invalid"; rowClass = "invalid-row"; }
    else if (result.duplicate) { status = mode === "add" ? "Skip duplicate" : mode === "merge" ? "Merge" : "Replace"; statusClass = "duplicate"; rowClass = "duplicate-row"; }
    return `<tr class="${rowClass}"><td><span class="preview-status ${statusClass}">${status}</span></td>${previewFields.map(fieldDef => `<td title="${escapeAttribute(result.record[fieldDef.key] ?? "")}">${escapeHTML(displayValue(result.record[fieldDef.key]))}</td>`).join("")}<td>${escapeHTML(result.errors.join("; ") || (result.duplicate ? "Matching record found" : ""))}</td></tr>`;
  }).join("");

  $("#importReadyText").textContent = `${willImport} record${willImport === 1 ? "" : "s"} will be imported. ${invalid ? `${invalid} invalid row${invalid === 1 ? "" : "s"} will be skipped.` : "All mapped rows are valid."}`;
  $("#runImportButton").textContent = "Import valid records";
  $("#runImportButton").disabled = willImport === 0;
}

function buildRecord(category, row, rowIndex) {
  const schema = CATEGORY_SCHEMAS[category];
  const record = {};
  const errors = [];
  schema.fields.forEach(fieldDef => {
    const sourceColumn = importState.mapping[fieldDef.key];
    const rawValue = sourceColumn ? row[sourceColumn] : "";
    record[fieldDef.key] = normalizeFieldValue(category, fieldDef.key, rawValue);
    if (fieldDef.required && isEmpty(record[fieldDef.key])) errors.push(`${fieldDef.label} is required`);
  });

  if (category === "lessons") {
    if (record.date && !isISODate(record.date)) errors.push("Date is not recognized");
    record.time = record.time || "09:00";
    record.duration = record.duration || 60;
    record.type = normalizeLessonType(record.type);
  }
  if (category === "calendar") {
    if (record.startDate && !isISODate(record.startDate)) errors.push("Start date is not recognized");
    if (record.endDate && !isISODate(record.endDate)) errors.push("End date is not recognized");
    record.endDate = record.endDate || record.startDate;
    record.type = record.type || "Calendar event";
  }
  if (category === "materials") {
    record.type = normalizeMaterialType(record.type);
  }
  if (category === "memories") {
    record.date = record.date || toISODate(new Date());
  }
  if (["templates"].includes(category)) record.duration = record.duration || 60;

  return { rowIndex, record, errors, valid: errors.length === 0, duplicate: false };
}

function normalizeFieldValue(category, key, value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (/date/i.test(key)) return toISODate(value);
    return value.toISOString();
  }
  if (/date/i.test(key)) return normalizeDate(value);
  if (key === "time") return normalizeTime(value);
  if (key === "duration") {
    const number = Number(String(value ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(number) && number > 0 ? Math.round(number) : "";
  }
  if (key === "tags") return normalizeTags(value);
  return String(value ?? "").trim();
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toISODate(value);
  if (typeof value === "number" && value > 20000 && value < 100000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return utc.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(text)) {
    const [year, month, day] = text.slice(0, 10).split("-").map(Number);
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const chineseDate = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (chineseDate) return `${chineseDate[1]}-${String(Number(chineseDate[2])).padStart(2, "0")}-${String(Number(chineseDate[3])).padStart(2, "0")}`;
  const mdY = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (mdY) {
    let year = Number(mdY[3]);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    return `${year}-${String(Number(mdY[1])).padStart(2, "0")}-${String(Number(mdY[2])).padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : toISODate(parsed);
}

function normalizeTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  if (typeof value === "number" && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 1440);
    return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return text;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = (match[3] || "").toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean).join(", ");
  return String(value ?? "").split(/[,;|]/).map(item => item.trim()).filter(Boolean).join(", ");
}

function normalizeLessonType(value) {
  const text = String(value || "").trim();
  if (/one.?on.?one|1.?1|individual|private|一对一/i.test(text)) return "One-on-one";
  if (/plan|prep|planning|备课/i.test(text)) return "Planning";
  return text || "Class";
}

function normalizeMaterialType(value) {
  const text = String(value || "").trim();
  if (/slide|ppt|powerpoint|canva|课件/i.test(text)) return "Slides";
  if (/worksheet|handout|工作纸|练习/i.test(text)) return "Worksheet";
  if (/drive|google doc|google sheet/i.test(text)) return "Drive";
  if (/video|youtube|影片|视频/i.test(text)) return "Video";
  if (/web|site|网页|网站/i.test(text)) return "Website";
  return text || "Other";
}

function isISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = parseLocalDate(value);
  return !Number.isNaN(date.getTime()) && toISODate(date) === value;
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function displayValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  return value ?? "";
}

function identityKey(category, record) {
  const normalize = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const keys = {
    lessons: [record.title, record.date, record.time, record.learner],
    calendar: [record.title, record.startDate, record.endDate],
    materials: [record.title, record.url || record.topic],
    students: [record.name, record.group],
    memories: [record.learner, record.date, record.note],
    templates: [record.title, record.category]
  }[category] || Object.values(record);
  return keys.map(normalize).join("|");
}


function storeImportUndo(payload) {
  try {
    localStorage.setItem(IMPORT_UNDO_KEY, JSON.stringify(payload));
    return true;
  } catch {
    localStorage.removeItem(IMPORT_UNDO_KEY);
    return false;
  }
}

function runImport() {
  if (importState.category === "backup") {
    askConfirmation("Restore this full backup?", "All current local Classroom data will be replaced by the selected backup. You can undo the restore immediately afterward.", "Restore backup", restoreBackup);
    return;
  }
  const validation = importState.validation;
  if (!validation?.willImport) return;
  const mode = $("#importMode").value;
  if (mode === "replace") {
    const schema = CATEGORY_SCHEMAS[importState.category];
    askConfirmation(`Replace all ${schema.label.toLowerCase()}?`, `The current local ${schema.label.toLowerCase()} collection will be replaced by valid records from this file. An undo snapshot will be created first.`, "Replace and import", executeCategoryImport);
    return;
  }
  executeCategoryImport();
}

function executeCategoryImport() {
  const validation = importState.validation;
  if (!validation?.willImport) return;
  const category = importState.category;
  const schema = CATEGORY_SCHEMAS[category];
  const mode = $("#importMode").value;
  const before = deepClone(data);
  const beforeCollection = deepClone(data[schema.collection]);
  const beforeHistory = deepClone(data.importHistory);
  const importId = crypto.randomUUID();
  const timestamp = Date.now();
  const source = { importId, fileName: importState.file.name, importedAt: timestamp, sheet: importState.activeSheet || "" };
  const validResults = validation.records.filter(result => result.valid);
  let collection = [...data[schema.collection]];
  let importedCount = 0;
  let skippedCount = validation.invalid;

  if (mode === "replace") collection = [];

  validResults.forEach(result => {
    const record = { ...result.record, source };
    const existingIndex = collection.findIndex(item => identityKey(category, item) === result.identity);
    if (mode === "add" && (result.duplicate || existingIndex >= 0)) {
      skippedCount++;
      return;
    }
    if (mode === "merge" && existingIndex >= 0) {
      collection[existingIndex] = { ...collection[existingIndex], ...record, id: collection[existingIndex].id };
      importedCount++;
      return;
    }
    if (mode === "replace" && existingIndex >= 0) {
      collection[existingIndex] = { ...record, id: collection[existingIndex].id };
      importedCount++;
      return;
    }
    collection.push({ ...record, id: crypto.randomUUID(), createdAt: timestamp });
    importedCount++;
  });

  data[schema.collection] = collection;
  data.importHistory.unshift({
    id: importId,
    fileName: importState.file.name,
    category,
    categoryLabel: schema.label,
    mode,
    importedCount,
    skippedCount,
    timestamp
  });
  data.importHistory = data.importHistory.slice(0, 50);
  const undoStored = storeImportUndo({
    type: "category",
    collection: schema.collection,
    beforeCollection,
    beforeHistory,
    importId,
    description: `Import ${schema.label}`
  });
  if (!persistData()) {
    data = before;
    persistData();
    localStorage.removeItem(IMPORT_UNDO_KEY);
    renderAll();
    showToast("This import is too large for the browser's local storage. No records were changed.");
    return;
  }
  renderAll();
  showToast(`${importedCount} record${importedCount === 1 ? "" : "s"} imported locally${undoStored ? "" : "; export a backup before further edits"}`, undoStored ? undoLastImport : null);
  resetImportWorkbench();
}

function restoreBackup() {
  $("#confirmDialog").close();
  const before = deepClone(data);
  const restored = ensureDataShape(importState.backup);
  const importId = crypto.randomUUID();
  restored.importHistory.unshift({
    id: importId,
    fileName: importState.file.name,
    category: "backup",
    categoryLabel: "Full Classroom backup",
    mode: "replace",
    importedCount: restored.lessons.length + restored.materials.length + restored.calendarEvents.length + restored.students.length + restored.memories.length + restored.templates.length,
    skippedCount: 0,
    timestamp: Date.now()
  });
  data = restored;
  const undoStored = storeImportUndo({ type: "full", before, importId, description: "Restore full backup" });
  if (!persistData()) {
    data = before;
    persistData();
    localStorage.removeItem(IMPORT_UNDO_KEY);
    renderAll();
    showToast("This backup is too large for the browser's local storage. Nothing was replaced.");
    return;
  }
  renderAll();
  showToast(`Full backup restored locally${undoStored ? "" : "; undo was not available"}`, undoStored ? undoLastImport : null);
  resetImportWorkbench();
}

function undoLastImport() {
  let action;
  try { action = JSON.parse(localStorage.getItem(IMPORT_UNDO_KEY)); }
  catch { action = null; }
  if (!action) return;
  if (action.type === "category" && action.collection && Array.isArray(action.beforeCollection)) {
    data[action.collection] = action.beforeCollection;
    if (Array.isArray(action.beforeHistory)) data.importHistory = action.beforeHistory;
  } else if (action.before) {
    data = ensureDataShape(action.before);
  } else {
    return;
  }
  localStorage.removeItem(IMPORT_UNDO_KEY);
  persistData();
  renderAll();
  showToast("Last import was undone");
}


function downloadCSVTemplate() {
  const category = $("#templateCategory").value;
  const schema = CATEGORY_SCHEMAS[category];
  const headers = schema.fields.map(fieldDef => fieldDef.label);
  const csv = `\uFEFF${headers.map(csvEscape).join(",")}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `classroom-${category}-template.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`${schema.label} template downloaded`);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// -----------------------------
// Event listeners
// -----------------------------

$$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$$('.nav-item').forEach(item => item.addEventListener('click', () => switchView(item.dataset.view)));
$$('[data-go-to]').forEach(item => item.addEventListener('click', () => switchView(item.dataset.goTo)));

$("#addLessonButton").addEventListener("click", () => openLessonDialog());
$("#addSessionButton").addEventListener("click", () => openLessonDialog(null, "One-on-one"));
$("#addMaterialButton").addEventListener("click", () => $("#materialDialog").showModal());
$("#exportButton").addEventListener("click", exportData);
$("#undoActionButton").addEventListener("click", undoLastAction);
$("#undoBumpButton").addEventListener("click", undoLastBump);
$("#undoImportButton").addEventListener("click", undoLastImport);
$("#materialSearch").addEventListener("input", renderMaterials);
$("#materialTypeFilter").addEventListener("change", renderMaterials);
$("#materialSkillFilter").addEventListener("change", renderMaterials);

$("#previousWeek").addEventListener("click", () => { weekStart = addDays(weekStart, -7); renderAll(); });
$("#nextWeek").addEventListener("click", () => { weekStart = addDays(weekStart, 7); renderAll(); });
$("#todayButton").addEventListener("click", () => { weekStart = getMonday(new Date()); renderAll(); });

$("#lessonForm").addEventListener("submit", event => {
  event.preventDefault();
  const lesson = {
    id: $("#lessonId").value || crypto.randomUUID(),
    title: $("#lessonTitle").value.trim(),
    date: $("#lessonDate").value,
    time: $("#lessonTime").value,
    duration: Number($("#lessonDuration").value),
    type: $("#lessonType").value,
    learner: $("#lessonLearner").value.trim(),
    objective: $("#lessonObjective").value.trim(),
    notes: $("#lessonNotes").value.trim(),
    materialUrl: $("#lessonMaterialUrl").value.trim()
  };
  const index = data.lessons.findIndex(item => item.id === lesson.id);
  pushUndo(index >= 0 ? "Edit lesson" : "Add lesson");
  if (index >= 0) data.lessons[index] = { ...data.lessons[index], ...lesson }; else data.lessons.push(lesson);
  $("#lessonDialog").close();
  saveData(index >= 0 ? "Lesson updated" : "Lesson added", { undo: true });
});

$("#deleteLessonButton").addEventListener("click", () => {
  const id = $("#lessonId").value;
  const lesson = data.lessons.find(item => item.id === id);
  askConfirmation("Delete this lesson?", `“${lesson?.title || "This lesson"}” will be removed from this browser.`, "Delete", () => {
    pushUndo("Delete lesson");
    data.lessons = data.lessons.filter(item => item.id !== id);
    $("#lessonDialog").close();
    saveData("Lesson deleted", { undo: true });
  });
});

$("#materialForm").addEventListener("submit", event => {
  event.preventDefault();
  pushUndo("Add material");
  data.materials.push({
    id: crypto.randomUUID(),
    title: $("#materialTitle").value.trim(),
    type: $("#materialType").value,
    tag: $("#materialTag").value.trim(),
    grade: $("#materialGrade").value.trim(),
    skill: $("#materialSkill").value.trim(),
    topic: $("#materialTopic").value.trim(),
    url: $("#materialUrl").value.trim(),
    notes: $("#materialNotes").value.trim(),
    createdAt: Date.now()
  });
  event.target.reset();
  $("#materialDialog").close();
  saveData("Material added", { undo: true });
});

$("#bumpForm").addEventListener("submit", event => {
  event.preventDefault();
  bumpSchedule($("#bumpLessonId").value, Number($("#bumpDays").value), $("#skipWeekends").checked);
  $("#bumpDialog").close();
});
$("#bumpDays").addEventListener("change", updateBumpPreview);
$("#skipWeekends").addEventListener("change", updateBumpPreview);

$("#confirmForm").addEventListener("submit", event => {
  event.preventDefault();
  const callback = confirmCallback;
  confirmCallback = null;
  $("#confirmDialog").close();
  if (callback) callback();
});

const dropZone = $("#dropZone");
$("#importFileInput").addEventListener("change", event => handleImportFile(event.target.files[0]));
["dragenter", "dragover"].forEach(name => dropZone.addEventListener(name, event => {
  event.preventDefault();
  dropZone.classList.add("dragover");
}));
["dragleave", "drop"].forEach(name => dropZone.addEventListener(name, event => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
}));
dropZone.addEventListener("drop", event => handleImportFile(event.dataTransfer.files[0]));
$("#clearImportButton").addEventListener("click", resetImportWorkbench);
$("#importCategory").addEventListener("change", () => {
  importState.category = $("#importCategory").value;
  $("#importMode").disabled = importState.category === "backup";
  if (importState.category === "backup") $("#importMode").value = "replace";
  renderMappingAndPreview();
});
$("#importMode").addEventListener("change", () => importState.category === "backup" ? renderBackupPreview() : validateAndRenderPreview());
$("#sheetSelect").addEventListener("change", () => {
  importState.activeSheet = $("#sheetSelect").value;
  const state = rowsToImportState(importState.sheets[importState.activeSheet], "xlsx");
  importState.rows = state.rows;
  importState.columns = state.columns;
  importState.category = state.category;
  $("#importCategory").value = state.category;
  $("#fileMeta").textContent = `${formatFileSize(importState.file.size)} · ${importState.rows.length} rows in “${importState.activeSheet}”`;
  renderMappingAndPreview();
});
$("#runImportButton").addEventListener("click", runImport);
$("#downloadTemplateButton").addEventListener("click", downloadCSVTemplate);

renderAll();
