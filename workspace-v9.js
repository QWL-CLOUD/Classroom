"use strict";

// Classroom v9 — linked Today / Calendar / Learner Record workflow.
// This file intentionally layers on top of app-v8.2-base.js so existing local
// data remains compatible with STORAGE_KEY = classroomDataV1.

let v9DayScheduleDate = toISODate(new Date());
let v9DailyPlanningDate = toISODate(new Date());
let v9LearnerSelection = null;
let v9LearnerRecordTab = "overview";

// Extend existing entry models without changing stored records.
if (!ENTRY_DEFINITIONS.lesson.fields.some((field) => field[0] === "standard")) {
  const notesIndex = ENTRY_DEFINITIONS.lesson.fields.findIndex((field) => field[0] === "notes");
  ENTRY_DEFINITIONS.lesson.fields.splice(notesIndex, 0,
    ["standard", "Standard", "text", false, null, "span-2"],
    ["learningTarget", "Learning target", "textarea", false, null, "span-2"],
    ["learningExperience", "Learning experience", "textarea", false, null, "span-2"],
    ["evidence", "Evidence / assessment", "textarea", false, null, "span-2"]
  );
}
if (!ENTRY_DEFINITIONS.event.fields.some((field) => field[0] === "googleUrl")) {
  ENTRY_DEFINITIONS.event.fields.push(["googleUrl", "Google Calendar event link", "text", false, null, "span-2"]);
}

data.version = Math.max(Number(data.version || 0), 9);

function v9OpenGoogleCalendar(url = "https://calendar.google.com/calendar/u/0/r") {
  window.open(url, "_blank", "noopener,noreferrer");
}

function v9CompactDate(dateISO) {
  return String(dateISO || "").replaceAll("-", "");
}

function v9GoogleCalendarEventUrl(event) {
  if (event?.googleUrl) return event.googleUrl;
  const startDate = event?.date || toISODate(new Date());
  const endDate = event?.endDate || startDate;
  let dates;
  if (event?.time) {
    const start = `${v9CompactDate(startDate)}T${String(event.time).replace(":", "")}00`;
    let endTime = event.endTime || "";
    if (!endTime) {
      const minutes = minutesFromTime(event.time) + 60;
      endTime = timeFromMinutes(minutes % 1440);
    }
    const end = `${v9CompactDate(endDate)}T${String(endTime).replace(":", "")}00`;
    dates = `${start}/${end}`;
  } else {
    const endExclusive = toISODate(addDays(parseDate(endDate), 1));
    dates = `${v9CompactDate(startDate)}/${v9CompactDate(endExclusive)}`;
  }
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event?.title || "Classroom event",
    dates,
    details: event?.notes || "",
    location: event?.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function v9OpenCalendarEvent(eventId) {
  const event = data.calendarEvents.find((item) => item.id === eventId);
  if (!event) return;
  const dateText = event.endDate && event.endDate !== event.date ? `${event.date} – ${event.endDate}` : event.date;
  const timeText = event.time ? `${displayTime(event.time)}${event.endTime ? `–${displayTime(event.endTime)}` : ""}` : "All day";
  openDrawer("Calendar event", event.title || "Event", `
    <div class="detail-section"><div class="detail-grid">
      <div><span>Date</span><strong>${escapeHTML(dateText || "—")}</strong></div>
      <div><span>Time</span><strong>${escapeHTML(timeText)}</strong></div>
      <div><span>Type</span><strong>${escapeHTML(event.type || "School event")}</strong></div>
      <div><span>Learner</span><strong>${escapeHTML(event.learner || "—")}</strong></div>
      <div><span>Location</span><strong>${escapeHTML(event.location || "—")}</strong></div>
      <div><span>Source</span><strong>${escapeHTML(event.sourceFile || "Classroom")}</strong></div>
    </div></div>
    ${event.notes ? `<div class="detail-section"><h4>Notes</h4><p>${escapeHTML(event.notes)}</p></div>` : ""}
    <div class="button-row">
      <button class="button primary" id="v9EditCalendarEvent">Edit event</button>
      <button class="button subtle" id="v9OpenClassroomCalendar">Open Calendar</button>
      <button class="button subtle" id="v9OpenGoogleEvent">Open in Google Calendar ↗</button>
    </div>
  `);
  $("#v9EditCalendarEvent")?.addEventListener("click", () => { closeDrawer(); openEntryDialog("event", event.id); });
  $("#v9OpenClassroomCalendar")?.addEventListener("click", () => { closeDrawer(); switchView("calendar"); });
  $("#v9OpenGoogleEvent")?.addEventListener("click", () => v9OpenGoogleCalendar(v9GoogleCalendarEventUrl(event)));
}

// ─────────────────────────────────────────────────────────────
// Today: Tasks ↔ To-do, Calendar ↔ Reminders, schedule actions.
// ─────────────────────────────────────────────────────────────

renderTodayTasks = function renderTodayTasksV9() {
  const today = toISODate(new Date());
  const items = [...data.tasks]
    .filter((task) => !task.dueDate || task.dueDate <= today || task.completed)
    .sort((a, b) => Number(a.completed) - Number(b.completed) || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")))
    .slice(0, 6);
  $("#todayTasks").innerHTML = items.length ? items.map((task) => `
    <div class="stack-item task-stack-item ${task.completed ? "completed" : ""}">
      <label class="task-check"><input type="checkbox" data-v9-complete-task="${task.id}" ${task.completed ? "checked" : ""} /><span aria-hidden="true">✓</span></label>
      <button class="grow stack-item-main" data-v9-edit-task="${task.id}">
        <strong>${escapeHTML(task.title)}</strong>
        <small>${escapeHTML(task.priority || "Normal")} · ${task.dueDate ? `Due ${escapeHTML(task.dueDate)}` : escapeHTML(task.category || "Task")}</small>
      </button>
    </div>`).join("") : `<div class="stack-item"><span class="grow"><strong>Nothing urgent</strong><small>Add a task when something needs your attention.</small></span></div>`;
  $$('[data-v9-complete-task]').forEach((input) => input.addEventListener("change", () => {
    const task = data.tasks.find((item) => item.id === input.dataset.v9CompleteTask);
    if (!task) return;
    task.completed = input.checked;
    task.completedAt = input.checked ? Date.now() : null;
    persist(input.checked ? "Task completed" : "Task reopened");
  }));
  $$('[data-v9-edit-task]').forEach((button) => button.addEventListener("click", () => openEntryDialog("task", button.dataset.v9EditTask)));
};

renderTodayReminders = function renderTodayRemindersV9() {
  const today = toISODate(new Date());
  const tomorrow = toISODate(addDays(new Date(), 1));
  const events = [...data.calendarEvents]
    .filter((event) => event.date === today || event.date === tomorrow)
    .sort((a, b) => `${a.date || ""} ${a.time || "99:99"}`.localeCompare(`${b.date || ""} ${b.time || "99:99"}`))
    .slice(0, 7);
  $("#todayReminders").innerHTML = events.length ? events.map((event) => `
    <div class="stack-item reminder-stack-item">
      <span class="reminder-icon" aria-hidden="true">◔</span>
      <button class="grow stack-item-main" data-v9-calendar-event="${event.id}">
        <strong>${event.time ? `${displayTime(event.time)} · ` : ""}${escapeHTML(event.title)}</strong>
        <small>${event.date === today ? "Today" : "Tomorrow"} · ${escapeHTML(event.type || "Calendar")}${event.notes ? `<br>${escapeHTML(event.notes)}` : ""}</small>
      </button>
      <button class="mini-button icon-only" data-v9-google-event="${event.id}" title="Open in Google Calendar">↗</button>
    </div>`).join("") : `<div class="stack-item"><span class="grow"><strong>No calendar reminders</strong><small>School events and schedule changes appear here.</small></span></div>`;
  $$('[data-v9-calendar-event]').forEach((button) => button.addEventListener("click", () => v9OpenCalendarEvent(button.dataset.v9CalendarEvent)));
  $$('[data-v9-google-event]').forEach((button) => button.addEventListener("click", () => {
    const event = data.calendarEvents.find((item) => item.id === button.dataset.v9GoogleEvent);
    if (event) v9OpenGoogleCalendar(v9GoogleCalendarEventUrl(event));
  }));
};

const v9BaseRenderToday = renderToday;
renderToday = function renderTodayV9() {
  v9BaseRenderToday();
  $("#todayTasks")?.classList.remove("hidden");
  $("#todayReminders")?.classList.remove("hidden");
  $("#inlineTaskForm")?.classList.remove("hidden");

  const actualNow = new Date();
  const displayedDate = todayPreviewDate ? parseDate(todayPreviewDate) : actualNow;
  const fullDate = dateLabel(displayedDate);
  if ($("#todayScheduleDateLabel")) $("#todayScheduleDateLabel").textContent = fullDate;

  const instances = topLevelInstances(scheduleInstancesForDate(actualNow));
  const nowMinutes = actualNow.getHours() * 60 + actualNow.getMinutes();
  const current = instances.find((item) => item.start <= nowMinutes && item.end > nowMinutes);
  const next = instances.find((item) => item.start > nowMinutes);
  const clock = actualNow.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const countdown = $("#summerCountdown")?.textContent?.trim();
  if ($("#summerCountdown")) $("#summerCountdown").classList.add("hidden");
  const focusText = current ? `Now: ${current.title} · ${clock}` : next ? `Next: ${next.title} · ${displayTime(next.start)}` : `No more scheduled blocks · ${clock}`;
  $("#todayMeta").textContent = countdown ? `${focusText} · ${countdown}` : focusText;

  const activeISO = toISODate(displayedDate);
  $("#editTodaySchedule")?.setAttribute("data-date", activeISO);
  $("#openDailyPlanning")?.setAttribute("data-date", activeISO);
};

// ─────────────────────────────────────────────────────────────
// Day Schedule view: events, default schedule, date overrides.
// ─────────────────────────────────────────────────────────────

function v9SetDayScheduleDate(dateISO) {
  v9DayScheduleDate = dateISO || toISODate(new Date());
  if ($("#dayScheduleDate")) $("#dayScheduleDate").value = v9DayScheduleDate;
  v9RenderDaySchedule();
}

function v9DayEvents(dateISO) {
  return data.calendarEvents.filter((event) => dateISO >= event.date && dateISO <= (event.endDate || event.date));
}

function v9RenderDaySchedule() {
  const host = $("#dayScheduleBlocks");
  if (!host) return;
  const date = parseDate(v9DayScheduleDate) || new Date();
  const day = dayNameFromDate(date);
  $("#dayScheduleDate").value = v9DayScheduleDate;
  $("#dayScheduleEventsTitle").textContent = `Events · ${v9DayScheduleDate}`;
  $("#dayDefaultScheduleTitle").textContent = `${day} Default Schedule`;

  const events = v9DayEvents(v9DayScheduleDate).sort((a, b) => String(a.time || "99:99").localeCompare(String(b.time || "99:99")));
  $("#dayScheduleEvents").innerHTML = events.length ? events.map((event) => `
    <div class="data-row">
      <div><h4>${escapeHTML(event.title)}</h4><p>${escapeHTML(event.type || "Calendar")}${event.notes ? ` · ${escapeHTML(event.notes)}` : ""}</p></div>
      <div class="meta">${event.time ? displayTime(event.time) : "All day"}</div>
      <div class="row-actions"><button class="mini-button" data-v9-day-event="${event.id}">Open</button><button class="mini-button" data-v9-day-event-edit="${event.id}">Edit</button></div>
    </div>`).join("") : `<div class="empty-state compact">No calendar events for this date.</div>`;

  const instances = topLevelInstances(scheduleInstancesForDate(date)).filter((instance) => Boolean(instance.defaultBlockId));
  const exceptions = data.scheduleExceptions.filter((item) => item.date === v9DayScheduleDate);
  $("#dayDefaultSummary").textContent = `${instances.length} active ${day} blocks.`;
  $("#dayOverrideSummary").textContent = exceptions.length ? `${exceptions.length} date-specific ${exceptions.length === 1 ? "change" : "changes"}.` : `No changes for ${v9DayScheduleDate}.`;
  host.innerHTML = instances.length ? instances.map((instance) => `
    <div class="data-row schedule-row ${instance.isException ? "is-override" : ""}">
      <div><h4>${displayTime(instance.start)}–${displayTime(instance.end)}</h4><p><strong>${escapeHTML(instance.title)}</strong> · ${escapeHTML(instance.subject || instance.category || "Schedule")}${instance.isException ? ` · Modified for this date` : ""}</p></div>
      <div class="meta">${escapeHTML(instance.className || "Class")}</div>
      <div class="row-actions"><button class="mini-button" data-v9-edit-occurrence="${instance.defaultBlockId}">Edit this date</button><button class="mini-button" data-v9-edit-default="${instance.defaultBlockId}">Edit default</button></div>
    </div>`).join("") : `<div class="empty-state">No default schedule blocks are assigned to ${escapeHTML(day)}.</div>`;

  $$('[data-v9-day-event]').forEach((button) => button.addEventListener("click", () => v9OpenCalendarEvent(button.dataset.v9DayEvent)));
  $$('[data-v9-day-event-edit]').forEach((button) => button.addEventListener("click", () => openEntryDialog("event", button.dataset.v9DayEventEdit)));
  $$('[data-v9-edit-occurrence]').forEach((button) => button.addEventListener("click", () => openScheduleDialog(button.dataset.v9EditOccurrence, v9DayScheduleDate, "occurrence")));
  $$('[data-v9-edit-default]').forEach((button) => button.addEventListener("click", () => openScheduleDialog(button.dataset.v9EditDefault, null, "default")));
}

// ─────────────────────────────────────────────────────────────
// Daily Planning: one plan per teachable schedule block.
// ─────────────────────────────────────────────────────────────

function v9SetDailyPlanningDate(dateISO) {
  v9DailyPlanningDate = dateISO || toISODate(new Date());
  if ($("#dailyPlanningDate")) $("#dailyPlanningDate").value = v9DailyPlanningDate;
  v9RenderDailyPlanning();
}

function v9PlanningInstances(dateISO) {
  const date = parseDate(dateISO) || new Date();
  return topLevelInstances(scheduleInstancesForDate(date)).filter((instance) => (Boolean(instance.defaultBlockId) || Boolean(instance.lessonId)) && !String(instance.id || "").startsWith("event-") && !String(instance.id || "").startsWith("personal-") && (instance.participatesInBump || Boolean(lessonForInstance(instance))));
}

function v9PlanStatusClass(status) {
  return String(status || "needs-plan").toLowerCase().replace(/[^a-z]+/g, "-");
}

function v9RenderDailyPlanning() {
  const host = $("#dailyPlanningGrid");
  if (!host) return;
  $("#dailyPlanningDate").value = v9DailyPlanningDate;
  const instances = v9PlanningInstances(v9DailyPlanningDate);
  host.innerHTML = instances.length ? instances.map((instance) => {
    const lesson = lessonForInstance(instance);
    const status = lesson ? (lesson.status === "Planned" ? "Draft" : lesson.status) : "Needs plan";
    if (!lesson) return `
      <article class="planning-card empty-plan-card">
        <div class="planning-card-head"><div><span>${displayTime(instance.start)}–${displayTime(instance.end)}</span><h3>${escapeHTML(instance.title)}</h3></div></div>
        <p>${escapeHTML(instance.subject || instance.category || "Teaching block")}</p>
        <p>No plan has been created for this block.</p>
        <button class="text-button large-link" data-v9-create-plan="${instance.defaultBlockId}">Create plan →</button>
      </article>`;
    return `
      <article class="planning-card">
        <div class="planning-card-head"><div><span>${displayTime(instance.start)}–${displayTime(instance.end)}</span><h3>${escapeHTML(lesson.title || instance.title)}</h3></div><div class="icon-actions"><button class="mini-button icon-only" data-v9-edit-plan-lesson="${lesson.id}" title="Edit">✎</button><button class="mini-button icon-only danger-quiet" data-v9-delete-plan-lesson="${lesson.id}" title="Delete">⌫</button></div></div>
        <p>${escapeHTML(instance.subject || instance.category || lesson.subject || "Teaching block")}</p>
        <span class="status-badge ${v9PlanStatusClass(status)}">${escapeHTML(status)}</span>
        <dl class="plan-detail-list">
          <div><dt>Standard</dt><dd>${escapeHTML(lesson.standard || "Not selected")}</dd></div>
          <div><dt>Learning target</dt><dd>${escapeHTML(lesson.learningTarget || lesson.notes || "Not added")}</dd></div>
          <div><dt>Learning experience</dt><dd>${escapeHTML(lesson.learningExperience || "Not added")}</dd></div>
          <div><dt>Evidence</dt><dd>${escapeHTML(lesson.evidence || "Not added")}</dd></div>
        </dl>
      </article>`;
  }).join("") : `<div class="empty-state">No teachable schedule blocks are available for this date.</div>`;

  $$('[data-v9-create-plan]').forEach((button) => button.addEventListener("click", () => {
    const instance = scheduleInstancesForDate(parseDate(v9DailyPlanningDate)).find((item) => item.defaultBlockId === button.dataset.v9CreatePlan);
    if (!instance) return;
    openEntryDialog("lesson", null, { title: instance.title, date: v9DailyPlanningDate, time: instance.startTime, duration: instance.end - instance.start, type: "Class", subject: instance.subject || instance.category, learner: instance.className, scheduleBlockId: instance.defaultBlockId, status: "Planned" });
  }));
  $$('[data-v9-edit-plan-lesson]').forEach((button) => button.addEventListener("click", () => openEntryDialog("lesson", button.dataset.v9EditPlanLesson)));
  $$('[data-v9-delete-plan-lesson]').forEach((button) => button.addEventListener("click", () => {
    if (!confirm("Delete this daily lesson plan? The recurring schedule block will remain.")) return;
    data.lessons = data.lessons.filter((item) => item.id !== button.dataset.v9DeletePlanLesson);
    persist("Daily lesson plan deleted; schedule kept");
  }));
}

// ─────────────────────────────────────────────────────────────
// Week: card columns, not a duplicate full recurring timetable.
// ─────────────────────────────────────────────────────────────

function v9WeekRecordsForDate(date) {
  const dateISO = toISODate(date);
  const instances = topLevelInstances(scheduleInstancesForDate(date)).filter((instance) => (Boolean(instance.defaultBlockId) || Boolean(instance.lessonId)) && !String(instance.id || "").startsWith("event-") && !String(instance.id || "").startsWith("personal-") && (instance.participatesInBump || Boolean(lessonForInstance(instance))));
  const records = instances.map((instance) => ({ kind: "block", instance, lesson: lessonForInstance(instance), start: instance.start, title: lessonForInstance(instance)?.title || instance.title }));
  data.calendarEvents.filter((event) => dateISO >= event.date && dateISO <= (event.endDate || event.date) && !/social worker|\bot\b|speech|counsel|learner service/i.test(`${event.type || ""} ${event.title || ""}`)).forEach((event) => records.push({ kind: "event", event, start: event.time ? minutesFromTime(event.time) : -1, title: event.title }));
  return records.sort((a, b) => a.start - b.start || String(a.title).localeCompare(String(b.title)));
}

function v9RenderWeekCard(record, dateISO) {
  if (record.kind === "event") {
    const event = record.event;
    return `<article class="week-card calendar-card"><span class="week-card-time">${event.time ? displayTime(event.time) : "All day"}</span><h4>${escapeHTML(event.title)}</h4><p>${escapeHTML(event.type || "Calendar")}</p><div class="week-card-actions"><button data-v9-calendar-event="${event.id}" title="Open">↗</button></div></article>`;
  }
  const { instance, lesson } = record;
  const status = lesson ? (lesson.status === "Planned" ? "Draft" : lesson.status) : "Needs plan";
  return `<article class="week-card ${lesson?.pinned ? "pinned" : ""}" style="--event-color:${categoryColor(instance.category)}">
    <span class="week-card-time">${displayTime(instance.start)}</span>
    <h4>${escapeHTML(lesson?.title || instance.title)}</h4>
    <p>${escapeHTML(lesson?.type || "Class")} · ${escapeHTML(instance.subject || instance.category || "Schedule")}</p>
    ${lesson?.learner ? `<p>With ${escapeHTML(lesson.learner)}</p>` : ""}
    <span class="status-badge ${v9PlanStatusClass(status)}">${escapeHTML(status)}</span>
    <div class="week-card-actions">
      ${lesson ? `<button data-v9-week-pin="${lesson.id}" title="Pin">⌖</button>${instance.participatesInBump ? `<button data-v9-week-bump="${lesson.id}" title="Bump">→</button>` : ""}<button data-v9-week-duplicate="${lesson.id}" title="Duplicate to next week">⧉</button><button data-v9-week-delete="${lesson.id}" title="Delete plan">⌫</button>` : `<button data-v9-week-create="${instance.defaultBlockId}" data-date="${dateISO}">Plan</button>`}
    </div>
  </article>`;
}

renderWeek = function renderWeekV9() {
  const end = addDays(weekStart, 6);
  $("#weekRange").textContent = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  $("#showWeekends").checked = data.settings.showWeekends;
  const dayCount = weekMode === "workweek" || !data.settings.showWeekends || $("#showWeekends")?.checked === false ? 5 : 7;
  const days = Array.from({ length: dayCount }, (_, index) => addDays(weekStart, index));
  const typeFilter = $("#weekTypeFilter").value;
  const subjectFilter = $("#weekSubjectFilter").value;
  const allInstances = days.flatMap((date) => topLevelInstances(scheduleInstancesForDate(date)));
  populateSubjectFilter(allInstances);

  if (weekMode === "list") {
    $("#weekCalendar").innerHTML = `<div class="agenda-list">${days.map((date) => {
      const dateISO = toISODate(date);
      const rows = v9WeekRecordsForDate(date).filter((record) => record.kind === "event" || ((!typeFilter || (record.lesson?.type || "Class") === typeFilter) && (!subjectFilter || (record.instance.subject || record.instance.category) === subjectFilter)));
      return `<section class="agenda-day"><h3>${date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</h3>${rows.map((record) => record.kind === "event" ? `<div class="data-row"><div><h4>${escapeHTML(record.event.title)}</h4><p>${escapeHTML(record.event.type || "Calendar")}</p></div><div class="meta">${record.event.time ? displayTime(record.event.time) : "All day"}</div><div class="row-actions"><button class="mini-button" data-v9-calendar-event="${record.event.id}">Open</button></div></div>` : `<div class="data-row"><div><h4>${escapeHTML(record.lesson?.title || record.instance.title)}</h4><p>${displayTime(record.instance.start)} · ${escapeHTML(record.instance.subject || record.instance.category)}</p></div><div class="meta">${escapeHTML(record.lesson?.status || "Needs plan")}</div><div class="row-actions"><button class="mini-button" data-open-block="${record.instance.defaultBlockId || record.instance.id}" data-occurrence-date="${dateISO}">Open</button></div></div>`).join("") || `<p class="meta">No items</p>`}</section>`;
    }).join("")}</div>`;
    bindScheduleBlockButtons($("#weekCalendar"));
  } else {
    $("#weekCalendar").innerHTML = `<div class="week-card-grid" style="--week-columns:${dayCount}">${days.map((date) => {
      const dateISO = toISODate(date);
      const records = v9WeekRecordsForDate(date).filter((record) => record.kind === "event" || ((!typeFilter || (record.lesson?.type || "Class") === typeFilter) && (!subjectFilter || (record.instance.subject || record.instance.category) === subjectFilter)));
      return `<section class="week-card-column"><header><div><strong>${date.toLocaleDateString("en-US", { weekday: "long" })}</strong><span>${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div><button data-v9-add-week="${dateISO}" title="Add session">+</button></header><div class="week-card-list">${records.map((record) => v9RenderWeekCard(record, dateISO)).join("") || `<div class="empty-week-day">No items</div>`}</div></section>`;
    }).join("")}</div>`;
  }

  $$('[data-v9-calendar-event]').forEach((button) => button.addEventListener("click", () => v9OpenCalendarEvent(button.dataset.v9CalendarEvent)));
  $$('[data-v9-add-week]').forEach((button) => button.addEventListener("click", () => openEntryDialog("lesson", null, { date: button.dataset.v9AddWeek })));
  $$('[data-v9-week-create]').forEach((button) => button.addEventListener("click", () => {
    const instance = scheduleInstancesForDate(parseDate(button.dataset.date)).find((item) => item.defaultBlockId === button.dataset.v9WeekCreate);
    if (instance) openEntryDialog("lesson", null, { title: instance.title, date: button.dataset.date, time: instance.startTime, duration: instance.end - instance.start, type: "Class", subject: instance.subject || instance.category, learner: instance.className, scheduleBlockId: instance.defaultBlockId, status: "Planned" });
  }));
  $$('[data-v9-week-pin]').forEach((button) => button.addEventListener("click", () => { const lesson = data.lessons.find((item) => item.id === button.dataset.v9WeekPin); if (lesson) { lesson.pinned = !lesson.pinned; persist(lesson.pinned ? "Session pinned" : "Session unpinned"); } }));
  $$('[data-v9-week-bump]').forEach((button) => button.addEventListener("click", () => openBumpDialog(button.dataset.v9WeekBump)));
  $$('[data-v9-week-duplicate]').forEach((button) => button.addEventListener("click", () => { const lesson = data.lessons.find((item) => item.id === button.dataset.v9WeekDuplicate); if (!lesson) return; data.lessons.push({ ...clone(lesson), id: uid(), date: toISODate(addDays(parseDate(lesson.date), 7)), createdAt: Date.now(), updatedAt: Date.now() }); persist("Duplicated to next week"); }));
  $$('[data-v9-week-delete]').forEach((button) => button.addEventListener("click", () => { if (!confirm("Delete this lesson plan? The recurring schedule remains.")) return; data.lessons = data.lessons.filter((item) => item.id !== button.dataset.v9WeekDelete); persist("Lesson plan deleted"); }));
};

// ─────────────────────────────────────────────────────────────
// Learner records: profile + plans + sessions + memory + services.
// ─────────────────────────────────────────────────────────────

function v9LearnerObject() {
  if (!v9LearnerSelection) return null;
  const collection = v9LearnerSelection.kind === "group" ? data.smallGroups : data.learners;
  return collection.find((item) => item.id === v9LearnerSelection.id) || null;
}

function v9OpenLearnerRecord(kind, id, tab = "overview") {
  v9LearnerSelection = { kind, id };
  v9LearnerRecordTab = tab;
  switchView("learnerRecord");
}

renderLearners = function renderLearnersV9() {
  const isGroup = learnerTab === "groups";
  const items = isGroup ? data.smallGroups : data.learners;
  $("#learnersContent").innerHTML = items.map((item) => {
    const name = item.name || "Unnamed learner";
    const sessionCount = data.lessons.filter((lesson) => String(lesson.learner || "").trim().toLowerCase() === name.trim().toLowerCase()).length;
    return `<article class="item-card learner-card"><span class="eyebrow">${isGroup ? "Small group" : "Individual"}</span><h3>${escapeHTML(name)}</h3><p>${escapeHTML(item.grade || item.goal || item.goals || "No goal added yet.")}</p><p class="meta">${sessionCount} planning session(s)</p><div class="card-actions"><button class="button primary compact" data-v9-open-learner="${item.id}" data-kind="${isGroup ? "group" : "learner"}">Open record →</button><button class="mini-button" data-edit-${isGroup ? "group" : "learner"}="${item.id}">Edit</button></div></article>`;
  }).join("") || `<div class="empty-state">No ${isGroup ? "small groups" : "individual learners"} yet.</div>`;
  $$('[data-v9-open-learner]').forEach((button) => button.addEventListener("click", () => v9OpenLearnerRecord(button.dataset.kind, button.dataset.v9OpenLearner)));
  $$('[data-edit-learner]').forEach((button) => button.addEventListener("click", () => openEntryDialog("learner", button.dataset.editLearner)));
  $$('[data-edit-group]').forEach((button) => button.addEventListener("click", () => openEntryDialog("group", button.dataset.editGroup)));
};

function v9LearnerSessions(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return data.lessons.filter((lesson) => String(lesson.learner || "").trim().toLowerCase() === normalized).sort((a, b) => `${b.date || ""} ${b.time || ""}`.localeCompare(`${a.date || ""} ${a.time || ""}`));
}

function v9LearnerPlans(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return data.learnerPlans.filter((plan) => String(plan.learner || "").trim().toLowerCase() === normalized);
}

function v9LearnerMemories(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return data.teachingMemory.filter((memory) => String(memory.learner || "").trim().toLowerCase() === normalized).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function v9LearnerServices(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return data.calendarEvents.filter((event) => String(event.learner || "").trim().toLowerCase() === normalized && /social worker|\bot\b|speech|counsel|learner service|service/i.test(`${event.type || ""} ${event.title || ""}`)).sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));
}

function v9RenderLearnerRecord() {
  const learner = v9LearnerObject();
  const host = $("#learnerRecordContent");
  if (!host) return;
  if (!learner) {
    $("#learnerRecordName").textContent = "Learner not found";
    host.innerHTML = `<div class="empty-state">Return to Learners and choose a record.</div>`;
    return;
  }
  const kindLabel = v9LearnerSelection.kind === "group" ? "Small group record" : "Learner record";
  $("#learnerRecordEyebrow").textContent = kindLabel;
  $("#learnerRecordName").textContent = learner.name || "Learner";
  $("#learnerRecordSummary").textContent = v9LearnerSelection.kind === "group" ? (learner.goal || "Shared planning record for this small group.") : (learner.goals || "One long-term record with lesson plans and planning sessions over time.");
  $$('[data-record-tab]').forEach((button) => button.classList.toggle("active", button.dataset.recordTab === v9LearnerRecordTab));

  const plans = v9LearnerPlans(learner.name);
  const sessions = v9LearnerSessions(learner.name);
  const memories = v9LearnerMemories(learner.name);
  const services = v9LearnerServices(learner.name);

  if (v9LearnerRecordTab === "overview") {
    const nextSession = [...sessions].filter((item) => item.date >= toISODate(new Date())).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
    host.innerHTML = `<div class="record-summary-grid"><article class="panel"><span class="eyebrow">Profile</span><h3>${escapeHTML(learner.grade || "Level not set")}</h3><p>${escapeHTML(learner.goals || learner.goal || "No long-term goal added.")}</p></article><article class="panel"><span class="eyebrow">Lesson plans</span><h3>${plans.length}</h3><p>${plans.filter((item) => item.status !== "Completed").length} active plan(s)</p></article><article class="panel"><span class="eyebrow">Planning sessions</span><h3>${sessions.length}</h3><p>${nextSession ? `Next: ${escapeHTML(nextSession.date)} · ${escapeHTML(nextSession.title)}` : "No upcoming session"}</p></article><article class="panel"><span class="eyebrow">Notice</span><h3>${services.length + memories.filter((item) => item.status !== "Resolved").length}</h3><p>Services and open Teaching Memory records</p></article></div>`;
  } else if (v9LearnerRecordTab === "profile") {
    const rows = v9LearnerSelection.kind === "group" ? [["Members", learner.members], ["Shared goal", learner.goal], ["Notes", learner.notes]] : [["Preferred name", learner.name], ["Grade / level", learner.grade], ["Goals", learner.goals], ["Interests", learner.interests], ["Notes", learner.notes]];
    host.innerHTML = `<article class="panel profile-panel"><div class="panel-heading"><div><span class="eyebrow">Long-term record</span><h3>Profile</h3></div><button class="button primary compact" id="v9ProfileEdit">Edit profile</button></div><dl class="profile-list">${rows.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value || "Not added")}</dd></div>`).join("")}</dl></article>`;
    $("#v9ProfileEdit")?.addEventListener("click", () => openEntryDialog(v9LearnerSelection.kind === "group" ? "group" : "learner", learner.id));
  } else if (v9LearnerRecordTab === "plans") {
    host.innerHTML = `<div class="record-section-heading"><div><span class="eyebrow">Individualized sequence</span><h3>Lesson Plans</h3></div><button class="button primary" id="v9AddLearnerPlan">+ Lesson plan</button></div><div class="card-grid">${plans.map((plan) => `<article class="item-card"><span class="eyebrow">${escapeHTML(plan.status || "Active")}</span><h3>${escapeHTML(plan.title)}</h3><p>${escapeHTML(plan.currentFocus || plan.goal || "No focus added")}</p><div class="card-actions"><button class="mini-button" data-v9-edit-learner-plan="${plan.id}">Edit</button></div></article>`).join("") || `<div class="empty-state">No lesson plans yet.</div>`}</div>`;
    $("#v9AddLearnerPlan")?.addEventListener("click", () => openEntryDialog("plan", null, { learner: learner.name, planType: v9LearnerSelection.kind === "group" ? "Small Group" : "Individual" }));
    $$('[data-v9-edit-learner-plan]').forEach((button) => button.addEventListener("click", () => openEntryDialog("plan", button.dataset.v9EditLearnerPlan)));
  } else if (v9LearnerRecordTab === "sessions") {
    host.innerHTML = `<div class="record-section-heading"><div><span class="eyebrow">Dated work</span><h3>Planning Sessions</h3></div><button class="button primary" id="v9AddPlanningSession">+ Planning session</button></div><div class="data-list">${sessions.map((session) => `<div class="data-row"><div><h4>${escapeHTML(session.title)}</h4><p>${escapeHTML(session.subject || session.type || "Session")}${session.notes ? ` · ${escapeHTML(session.notes)}` : ""}</p></div><div class="meta">${escapeHTML(session.date || "")} · ${session.time ? displayTime(session.time) : "No time"}<br>${escapeHTML(session.status || "Planned")}</div><div class="row-actions"><button class="mini-button" data-v9-edit-session="${session.id}">Edit</button></div></div>`).join("") || `<div class="empty-state">No planning sessions yet.</div>`}</div>`;
    $("#v9AddPlanningSession")?.addEventListener("click", () => openEntryDialog("lesson", null, { title: `${learner.name} planning session`, learner: learner.name, type: v9LearnerSelection.kind === "group" ? "Small Group" : "Individual", date: toISODate(new Date()), time: "15:30", duration: 45, status: "Planned" }));
    $$('[data-v9-edit-session]').forEach((button) => button.addEventListener("click", () => openEntryDialog("lesson", button.dataset.v9EditSession)));
  } else if (v9LearnerRecordTab === "memory") {
    host.innerHTML = `<div class="record-section-heading"><div><span class="eyebrow">Continuity</span><h3>Teaching Memory</h3></div><button class="button primary" id="v9AddLearnerMemory">+ Memory</button></div><div class="data-list">${memories.map((memory) => `<div class="data-row"><div><h4>${escapeHTML(memory.category || "Observation")}</h4><p>${escapeHTML(memory.observation || "")}</p></div><div class="meta">${escapeHTML(memory.date || "")} · ${escapeHTML(memory.status || "No action")}${memory.nextStep ? `<br>Next: ${escapeHTML(memory.nextStep)}` : ""}</div><div class="row-actions"><button class="mini-button" data-v9-edit-memory="${memory.id}">Edit</button></div></div>`).join("") || `<div class="empty-state">No Teaching Memory records yet.</div>`}</div>`;
    $("#v9AddLearnerMemory")?.addEventListener("click", () => openEntryDialog("memory", null, { learner: learner.name }));
    $$('[data-v9-edit-memory]').forEach((button) => button.addEventListener("click", () => openEntryDialog("memory", button.dataset.v9EditMemory)));
  } else if (v9LearnerRecordTab === "services") {
    host.innerHTML = `<div class="record-section-heading"><div><span class="eyebrow">Calendar-linked</span><h3>Services</h3></div><button class="button primary" id="v9AddLearnerService">+ Service</button></div><div class="data-list">${services.map((event) => `<div class="data-row"><div><h4>${escapeHTML(event.title)}</h4><p>${escapeHTML(event.type || "Learner service")}${event.location ? ` · ${escapeHTML(event.location)}` : ""}</p></div><div class="meta">${escapeHTML(event.date || "")} · ${event.time ? displayTime(event.time) : "All day"}</div><div class="row-actions"><button class="mini-button" data-v9-service-event="${event.id}">Open</button></div></div>`).join("") || `<div class="empty-state">No linked learner services yet.</div>`}</div>`;
    $("#v9AddLearnerService")?.addEventListener("click", () => openEntryDialog("event", null, { learner: learner.name, type: "Learner service", date: toISODate(new Date()) }));
    $$('[data-v9-service-event]').forEach((button) => button.addEventListener("click", () => v9OpenCalendarEvent(button.dataset.v9ServiceEvent)));
  }
}

// Calendar page now offers direct Google Calendar handoff.
renderCalendar = function renderCalendarV9() {
  $("#calendarContent").innerHTML = [...data.calendarEvents].sort((a, b) => `${a.date || ""} ${a.time || "99:99"}`.localeCompare(`${b.date || ""} ${b.time || "99:99"}`)).map((event) => `<div class="data-row"><div><h4>${escapeHTML(event.title)}</h4><p>${escapeHTML(event.type || "School event")}${event.notes ? ` · ${escapeHTML(event.notes)}` : ""}</p></div><div class="meta">${escapeHTML(event.date || "")}${event.endDate && event.endDate !== event.date ? ` – ${escapeHTML(event.endDate)}` : ""}${event.time ? `<br>${displayTime(event.time)}` : ""}</div><div class="row-actions"><button class="mini-button" data-v9-calendar-event="${event.id}">Open</button><button class="mini-button" data-edit-event="${event.id}">Edit</button><button class="mini-button" data-v9-google-event="${event.id}">Google ↗</button></div></div>`).join("") || `<div class="empty-state">No school calendar events yet.</div>`;
  $$('[data-v9-calendar-event]').forEach((button) => button.addEventListener("click", () => v9OpenCalendarEvent(button.dataset.v9CalendarEvent)));
  $$('[data-edit-event]').forEach((button) => button.addEventListener("click", () => openEntryDialog("event", button.dataset.editEvent)));
  $$('[data-v9-google-event]').forEach((button) => button.addEventListener("click", () => { const event = data.calendarEvents.find((item) => item.id === button.dataset.v9GoogleEvent); if (event) v9OpenGoogleCalendar(v9GoogleCalendarEventUrl(event)); }));
};

// Extend rendering to the new views.
const v9BaseRenderAll = renderAll;
renderAll = function renderAllV9() {
  v9BaseRenderAll();
  if (currentView === "daySchedule") v9RenderDaySchedule();
  if (currentView === "dailyPlanning") v9RenderDailyPlanning();
  if (currentView === "learnerRecord") v9RenderLearnerRecord();
};

function v9SetupEvents() {
  $("#editTodaySchedule")?.addEventListener("click", () => { v9DayScheduleDate = $("#editTodaySchedule").dataset.date || toISODate(new Date()); switchView("daySchedule"); });
  $("#openDailyPlanning")?.addEventListener("click", () => { v9DailyPlanningDate = $("#openDailyPlanning").dataset.date || toISODate(new Date()); switchView("dailyPlanning"); });
  $("#dayScheduleDate")?.addEventListener("change", () => v9SetDayScheduleDate($("#dayScheduleDate").value));
  $("#dailyPlanningDate")?.addEventListener("change", () => v9SetDailyPlanningDate($("#dailyPlanningDate").value));
  $("#addDayEvent")?.addEventListener("click", () => openEntryDialog("event", null, { date: v9DayScheduleDate, endDate: v9DayScheduleDate }));
  $("#addBlockForDay")?.addEventListener("click", () => { openScheduleDialog(); requestAnimationFrame(() => { $("#scheduleDay").value = dayNameFromDate(parseDate(v9DayScheduleDate)); $("#scheduleDay").dispatchEvent(new Event("change")); }); });
  $("#editDateSchedule")?.addEventListener("click", () => { const first = topLevelInstances(scheduleInstancesForDate(parseDate(v9DayScheduleDate)))[0]; if (first) openScheduleDialog(first.defaultBlockId, v9DayScheduleDate, "occurrence"); else $("#addBlockForDay")?.click(); });
  $("#todayGoogleCalendar")?.addEventListener("click", () => v9OpenGoogleCalendar());
  $("#openGoogleCalendar")?.addEventListener("click", () => v9OpenGoogleCalendar());
  $("#sidebarExpandRail")?.addEventListener("click", () => { data.settings.sidebarCollapsed = false; localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); applySidebarState(); });
  $("#backToLearners")?.addEventListener("click", () => switchView("learners"));
  $("#editLearnerRecord")?.addEventListener("click", () => { const learner = v9LearnerObject(); if (learner) openEntryDialog(v9LearnerSelection.kind === "group" ? "group" : "learner", learner.id); });
  $$('[data-record-tab]').forEach((button) => button.addEventListener("click", () => { v9LearnerRecordTab = button.dataset.recordTab; v9RenderLearnerRecord(); }));
}

// Make global search open the exact learner record rather than a generic page.
const v9BaseGlobalSearchRecords = globalSearchRecords;
globalSearchRecords = function globalSearchRecordsV9() {
  const records = v9BaseGlobalSearchRecords();
  const learnerNames = new Set([...data.learners, ...data.smallGroups].map((item) => item.name));
  return records.map((record) => {
    if (record.type === "Learner" && learnerNames.has(record.title)) {
      const learner = data.learners.find((item) => item.name === record.title);
      return { ...record, action: () => v9OpenLearnerRecord("learner", learner.id) };
    }
    if (record.type === "Small group" && learnerNames.has(record.title)) {
      const group = data.smallGroups.find((item) => item.name === record.title);
      return { ...record, action: () => v9OpenLearnerRecord("group", group.id) };
    }
    return record;
  });
};

v9SetupEvents();
v9DayScheduleDate = toISODate(new Date());
v9DailyPlanningDate = toISODate(new Date());
renderAll();
