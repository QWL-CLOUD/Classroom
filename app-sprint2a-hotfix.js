const STORAGE_KEY = "classroomDataV1";

const initialData = {
  lessons: [
    {
      id: crypto.randomUUID(),
      title: "Greetings and self-introduction",
      date: nextDateForDay(1),
      time: "09:00",
      duration: 60,
      type: "One-on-one",
      learner: "Leadership Chinese",
      objective: "Use a preferred Chinese name and greet staff confidently.",
      notes: "Practice with role-play and a personalized greeting routine.",
      materialUrl: ""
    },
    {
      id: crypto.randomUUID(),
      title: "Classroom language: listen, look, repeat",
      date: nextDateForDay(3),
      time: "13:30",
      duration: 45,
      type: "Class",
      learner: "Grade 3 Chinese",
      objective: "Respond to three high-frequency classroom directions.",
      notes: "Use TPR and quick response games.",
      materialUrl: ""
    },
    {
      id: crypto.randomUUID(),
      title: "Weekend speaking practice",
      date: nextDateForDay(6),
      time: "10:00",
      duration: 60,
      type: "One-on-one",
      learner: "Weekend learner",
      objective: "Talk about family and weekend activities.",
      notes: "Bring 3 personal photos for the speaking task.",
      materialUrl: ""
    }
  ],
  materials: [
    { id: crypto.randomUUID(), title: "Greeting slide deck", type: "Slides", tag: "Unit 1", url: "https://drive.google.com", notes: "Visual prompts for greeting practice.", createdAt: Date.now() - 2000 },
    { id: crypto.randomUUID(), title: "Role and identity worksheet", type: "Worksheet", tag: "One-on-one", url: "https://drive.google.com", notes: "Pre-course content co-construction worksheet.", createdAt: Date.now() - 1000 }
  ]
};

let data = loadData();
let weekStart = getMonday(new Date());

const viewMeta = {
  dashboard: ["Workspace", "Teaching overview"],
  calendar: ["Plan and adjust", "Weekly planner"],
  sessions: ["Personalized learning", "One-on-one sessions"],
  materials: ["Centralized resources", "Teaching materials"]
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialData));
    return structuredClone(initialData);
  }
  try { return JSON.parse(saved); }
  catch { return structuredClone(initialData); }
}

function saveData(message = "Saved") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderAll();
  showToast(message);
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
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })
    .format(new Date(2020, 1, 1, hours, minutes));
}

function sortedLessons() {
  return [...data.lessons].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
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
}

function renderDashboard() {
  const today = toISODate(new Date());
  const todayLessons = sortedLessons().filter(item => item.date === today);
  $("#todayHeading").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  $("#todaySummary").textContent = todayLessons.length
    ? `${todayLessons.length} lesson${todayLessons.length === 1 ? "" : "s"} planned today. Your first lesson starts at ${formatTime(todayLessons[0].time)}.`
    : "No lessons are scheduled today. Use the open time for planning, feedback, or material preparation.";

  const weekEnd = addDays(weekStart, 7);
  const lessonsThisWeek = data.lessons.filter(item => {
    const date = parseLocalDate(item.date);
    return date >= weekStart && date < weekEnd;
  });

  $("#weekLessonCount").textContent = lessonsThisWeek.length;
  $("#oneOnOneCount").textContent = lessonsThisWeek.filter(item => item.type === "One-on-one").length;
  $("#materialCount").textContent = data.materials.length;

  const nowKey = `${today}T${new Date().toTimeString().slice(0, 5)}`;
  const upcoming = sortedLessons().filter(item => `${item.date}T${item.time}` >= nowKey);
  const next = upcoming[0];
  $("#nextLessonTime").textContent = next ? formatTime(next.time) : "—";
  $("#nextLessonLabel").textContent = next ? next.title : "No lesson scheduled";

  const upcomingList = $("#upcomingList");
  upcomingList.innerHTML = upcoming.slice(0, 4).map(item => {
    const date = parseLocalDate(item.date);
    return `
      <article class="upcoming-card">
        <div class="date-badge"><span>${date.toLocaleDateString("en-US", { month: "short" })}</span><strong>${date.getDate()}</strong></div>
        <div><h4>${escapeHTML(item.title)}</h4><p>${formatTime(item.time)} · ${escapeHTML(item.learner || item.type)}</p></div>
        <span class="type-pill">${escapeHTML(item.type)}</span>
      </article>`;
  }).join("") || '<div class="empty-state">No upcoming lessons yet.</div>';

  const recent = [...data.materials].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  $("#recentMaterials").innerHTML = recent.map(item => `
    <a class="resource-item" href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">
      <span class="resource-icon">↗</span>
      <span><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.type)} · ${escapeHTML(item.tag || "General")}</span></span>
    </a>`).join("") || '<div class="empty-state">No materials saved yet.</div>';
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
    const cards = dayLessons.map(item => `
      <article class="lesson-card ${item.type.toLowerCase().replaceAll(" ", "-")}">
        <span class="eyebrow">${formatTime(item.time)} · ${item.duration} min</span>
        <h4>${escapeHTML(item.title)}</h4>
        <p>${escapeHTML(item.learner || item.type)}</p>
        <div class="lesson-card-actions">
          <button class="mini-button" data-edit-lesson="${item.id}">Edit</button>
          <button class="mini-button" data-bump-lesson="${item.id}">Bump</button>
        </div>
      </article>`).join("") || '<div class="empty-day">No lessons</div>';

    return `
      <section class="day-column ${dateKey === today ? "today" : ""} ${index >= 5 ? "weekend" : ""}">
        <div class="day-heading"><div><span>${dayName}</span></div><strong>${date.getDate()}</strong></div>
        <div class="day-lessons">${cards}</div>
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
        <div><span class="eyebrow">${escapeHTML(item.learner || "Individual learner")}</span><h4>${escapeHTML(item.title)}</h4><span class="session-date">${parseLocalDate(item.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · ${formatTime(item.time)}</span></div>
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
  const filtered = [...data.materials]
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter(item => type === "all" || item.type === type)
    .filter(item => `${item.title} ${item.tag} ${item.notes}`.toLowerCase().includes(query));

  $("#materialLibrary").innerHTML = filtered.map(item => `
    <article class="material-card">
      <div class="material-header"><span class="type-pill">${escapeHTML(item.type)}</span><button data-delete-material="${item.id}">Delete</button></div>
      <h4>${escapeHTML(item.title)}</h4>
      <p>${escapeHTML(item.notes || "No notes added.")}</p>
      <a href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">Open resource ↗</a>
    </article>`).join("") || '<div class="empty-state">No materials match this filter.</div>';

  $$('[data-delete-material]').forEach(button => button.addEventListener('click', () => {
    data.materials = data.materials.filter(item => item.id !== button.dataset.deleteMaterial);
    saveData("Material deleted");
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
    $("#lessonTime").value = lesson.time;
    $("#lessonDuration").value = lesson.duration;
    $("#lessonType").value = lesson.type;
    $("#lessonLearner").value = lesson.learner || "";
    $("#lessonObjective").value = lesson.objective || "";
    $("#lessonNotes").value = lesson.notes || "";
    $("#lessonMaterialUrl").value = lesson.materialUrl || "";
  } else if (presetType) {
    $("#lessonType").value = presetType;
  }
  dialog.showModal();
}

function openBumpDialog(id) {
  $("#bumpLessonId").value = id;
  $("#bumpDays").value = "1";
  $("#skipWeekends").checked = true;
  $("#bumpDialog").showModal();
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
  const selected = data.lessons.find(item => item.id === lessonId);
  if (!selected) return;
  const selectedKey = `${selected.date}T${selected.time}`;
  const sequence = selected.learner || selected.type;
  data.lessons = data.lessons.map(item => {
    const itemKey = `${item.date}T${item.time}`;
    const sameSequence = (item.learner || item.type) === sequence;
    if (sameSequence && itemKey >= selectedKey) {
      return { ...item, date: shiftDate(item.date, days, skipWeekends && parseLocalDate(item.date).getDay() >= 1 && parseLocalDate(item.date).getDay() <= 5) };
    }
    return item;
  });
  saveData(`Schedule bumped by ${days} day${days === 1 ? "" : "s"}`);
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `classroom-backup-${toISODate(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Backup exported");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
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

$$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

$$('.nav-item').forEach(item => item.addEventListener('click', () => switchView(item.dataset.view)));
$$('[data-go-to]').forEach(item => item.addEventListener('click', () => switchView(item.dataset.goTo)));
$("#addLessonButton").addEventListener("click", () => openLessonDialog());
$("#addSessionButton").addEventListener("click", () => openLessonDialog(null, "One-on-one"));
$("#addMaterialButton").addEventListener("click", () => $("#materialDialog").showModal());
$("#exportButton").addEventListener("click", exportData);
$("#materialSearch").addEventListener("input", renderMaterials);
$("#materialTypeFilter").addEventListener("change", renderMaterials);

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
  if (index >= 0) data.lessons[index] = lesson; else data.lessons.push(lesson);
  $("#lessonDialog").close();
  saveData(index >= 0 ? "Lesson updated" : "Lesson added");
});

$("#deleteLessonButton").addEventListener("click", () => {
  const id = $("#lessonId").value;
  data.lessons = data.lessons.filter(item => item.id !== id);
  $("#lessonDialog").close();
  saveData("Lesson deleted");
});

$("#materialForm").addEventListener("submit", event => {
  event.preventDefault();
  data.materials.push({
    id: crypto.randomUUID(),
    title: $("#materialTitle").value.trim(),
    type: $("#materialType").value,
    tag: $("#materialTag").value.trim(),
    url: $("#materialUrl").value.trim(),
    notes: $("#materialNotes").value.trim(),
    createdAt: Date.now()
  });
  event.target.reset();
  $("#materialDialog").close();
  saveData("Material added");
});

$("#bumpForm").addEventListener("submit", event => {
  event.preventDefault();
  bumpSchedule($("#bumpLessonId").value, Number($("#bumpDays").value), $("#skipWeekends").checked);
  $("#bumpDialog").close();
});

renderAll();
