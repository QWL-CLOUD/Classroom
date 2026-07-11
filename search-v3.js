"use strict";

/* Sprint 3 — local unified search */
const SEARCH_RESULT_LIMIT_V3 = 250;
let searchRecordsV3 = [];
let searchRenderQueuedV3 = false;

viewMeta.search = ["Find anything", "Search your workspace"];
if (!Array.isArray(data.savedSearches)) data.savedSearches = [];

const SEARCH_SCOPE_LABELS_V3 = {
  all: "Everything", lesson: "Lessons", material: "Library resources", calendar: "School calendar",
  student: "Learners", memory: "Teaching memory", template: "Lesson templates", import: "Import history"
};
const SEARCH_TYPE_META_V3 = {
  lesson: { label: "Lesson", icon: "L" }, material: { label: "Resource", icon: "R" },
  calendar: { label: "Calendar", icon: "C" }, student: { label: "Learner", icon: "S" },
  memory: { label: "Memory", icon: "M" }, template: { label: "Template", icon: "T" },
  import: { label: "Import", icon: "I" }
};

function searchTextV3(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function searchTokensV3(value) {
  return searchTextV3(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
function searchDateValueV3(value) {
  if (!value) return "";
  if (typeof value === "number") return toISODate(new Date(value));
  return normalizeDate(value);
}
function searchDisplayDateV3(value) {
  if (!value) return "";
  try { return parseLocalDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return String(value); }
}
function searchCompactTextV3(values) {
  return values.map(v => String(v ?? "").trim()).filter(Boolean).join(" · ");
}
function searchCollectionNameV3(id) {
  return data.libraryCollections?.find(c => c.id === id)?.name || "";
}
function searchRecordV3(type, source, title, subtitle, body, date, learner, tags, fields) {
  const meta = SEARCH_TYPE_META_V3[type];
  const rawValues = [title, subtitle, body, learner, tags, ...Object.values(fields || {}), source.sourceFile, source.importBatchId];
  return {
    type, id: source.id || crypto.randomUUID(), source, title: String(title || meta.label),
    subtitle: String(subtitle || ""), body: String(body || ""), date: searchDateValueV3(date),
    learner: String(learner || ""), tags: String(tags || ""), fields: fields || {},
    searchText: searchTextV3(rawValues.join(" ")), titleText: searchTextV3(title),
    sortTime: date ? new Date(`${searchDateValueV3(date)}T12:00:00`).getTime() : Number(source.createdAt || source.importedAt || source.lastUsedAt || 0),
    meta
  };
}
function buildSearchIndexV3() {
  const records = [];
  for (const x of data.lessons || []) records.push(searchRecordV3(
    "lesson", x, x.title, searchCompactTextV3([x.type, x.learner, x.time ? formatTime(x.time) : ""]),
    searchCompactTextV3([x.objective, x.notes]), x.date, x.learner,
    searchCompactTextV3([x.type, x.unit, x.tags]),
    { "Lesson type": x.type, Learner: x.learner, Date: x.date, Time: x.time, Duration: x.duration ? `${x.duration} minutes` : "", Objective: x.objective, Notes: x.notes, "Material link": x.materialUrl, "Source file": x.sourceFile }
  ));
  for (const x of data.materials || []) records.push(searchRecordV3(
    "material", x, x.title, searchCompactTextV3([x.type, x.grade, x.skill, x.topic]),
    searchCompactTextV3([x.notes, x.url]), x.lastUsedAt || x.createdAt, x.learner,
    searchCompactTextV3([x.tags, x.grade, x.skill, x.topic, x.unit, searchCollectionNameV3(x.collectionId)]),
    { Type: x.type, Collection: searchCollectionNameV3(x.collectionId), Grade: x.grade, Skill: x.skill, Topic: x.topic, Unit: x.unit, "Learner / audience": x.learner, Tags: x.tags, Notes: x.notes, Link: x.url, Favorite: x.favorite ? "Yes" : "No", "Use count": x.useCount || 0, "Source file": x.sourceFile }
  ));
  for (const x of data.calendarEvents || []) records.push(searchRecordV3(
    "calendar", x, x.title, searchCompactTextV3([x.type, searchDisplayDateV3(x.date)]), x.notes,
    x.date, "", x.type,
    { Type: x.type, "Start date": x.date, "End date": x.endDate, Notes: x.notes, "Source file": x.sourceFile }
  ));
  for (const x of data.students || []) records.push(searchRecordV3(
    "student", x, x.name || x.title, searchCompactTextV3([x.grade, x.group]),
    searchCompactTextV3([x.goals, x.interests, x.notes]), x.importedAt || x.createdAt, x.name,
    searchCompactTextV3([x.grade, x.group]),
    { Name: x.name, Grade: x.grade, "Class / group": x.group, Goals: x.goals, Interests: x.interests, Notes: x.notes, "Source file": x.sourceFile }
  ));
  for (const x of data.teachingMemory || []) records.push(searchRecordV3(
    "memory", x, x.learner || "Teaching memory", searchCompactTextV3([x.category, searchDisplayDateV3(x.date)]),
    searchCompactTextV3([x.observation, x.nextStep]), x.date || x.importedAt, x.learner, x.tags,
    { Learner: x.learner, Date: x.date, Category: x.category, Observation: x.observation, "Next step": x.nextStep, Tags: x.tags, "Source file": x.sourceFile }
  ));
  for (const x of data.templates || []) records.push(searchRecordV3(
    "template", x, x.title, searchCompactTextV3([x.type, x.grade, x.skill]),
    searchCompactTextV3([x.objective, x.activities, x.materials]), x.importedAt || x.createdAt, "",
    searchCompactTextV3([x.tags, x.grade, x.skill]),
    { Type: x.type, Grade: x.grade, Skill: x.skill, Objective: x.objective, Activities: x.activities, Materials: x.materials, Tags: x.tags, "Source file": x.sourceFile }
  ));
  for (const x of data.imports || []) records.push(searchRecordV3(
    "import", x, x.fileName || "Imported data", searchCompactTextV3([SEARCH_SCOPE_LABELS_V3[x.category] || x.category, x.mode]),
    `${x.count || 0} records`, x.createdAt, "", x.category,
    { File: x.fileName, Category: SEARCH_SCOPE_LABELS_V3[x.category] || x.category, Mode: x.mode, Records: x.count || 0, Imported: x.createdAt ? new Date(x.createdAt).toLocaleString() : "" }
  ));
  searchRecordsV3 = records;
  return records;
}
function searchStateV3() {
  return {
    query: $("#globalSearchInput")?.value.trim() || "", scope: $("#searchScope")?.value || "all",
    from: $("#searchDateFrom")?.value || "", to: $("#searchDateTo")?.value || "",
    learner: $("#searchLearner")?.value || "all", tags: $("#searchTags")?.value.trim() || "",
    sort: $("#searchSort")?.value || "relevance"
  };
}
function applySearchStateV3(state) {
  $("#globalSearchInput").value = state.query || "";
  $("#searchScope").value = state.scope || "all";
  $("#searchDateFrom").value = state.from || "";
  $("#searchDateTo").value = state.to || "";
  populateSearchLearnersV3(state.learner || "all");
  $("#searchTags").value = state.tags || "";
  $("#searchSort").value = state.sort || "relevance";
  renderSearchV3();
}
function populateSearchLearnersV3(preferred) {
  const values = new Set();
  for (const r of searchRecordsV3) if (r.learner) values.add(r.learner);
  const select = $("#searchLearner");
  if (!select) return;
  const current = preferred || select.value || "all";
  select.innerHTML = '<option value="all">All learners</option>' + [...values].sort((a,b)=>a.localeCompare(b)).map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join("");
  select.value = [...values].includes(current) ? current : "all";
}
function scoreSearchRecordV3(record, query, tokens) {
  if (!query) return 1;
  const q = searchTextV3(query);
  let score = 0;
  if (record.titleText === q) score += 120;
  else if (record.titleText.startsWith(q)) score += 75;
  else if (record.titleText.includes(q)) score += 55;
  if (record.searchText.includes(q)) score += 30;
  for (const token of tokens) {
    if (record.titleText.includes(token)) score += 16;
    if (record.searchText.includes(token)) score += 6;
    else return 0;
  }
  return score;
}
function filteredSearchResultsV3() {
  const state = searchStateV3();
  const tokens = searchTokensV3(state.query);
  const tagTokens = searchTokensV3(state.tags);
  let rows = searchRecordsV3.map(record => ({ record, score: scoreSearchRecordV3(record, state.query, tokens) }))
    .filter(x => x.score > 0)
    .filter(x => state.scope === "all" || x.record.type === state.scope)
    .filter(x => !state.from || (x.record.date && x.record.date >= state.from))
    .filter(x => !state.to || (x.record.date && x.record.date <= state.to))
    .filter(x => state.learner === "all" || searchTextV3(x.record.learner) === searchTextV3(state.learner))
    .filter(x => tagTokens.every(t => searchTextV3(x.record.tags).includes(t)));
  if (state.sort === "newest") rows.sort((a,b) => b.record.sortTime - a.record.sortTime || a.record.title.localeCompare(b.record.title));
  else if (state.sort === "oldest") rows.sort((a,b) => a.record.sortTime - b.record.sortTime || a.record.title.localeCompare(b.record.title));
  else if (state.sort === "title") rows.sort((a,b) => a.record.title.localeCompare(b.record.title));
  else if (state.sort === "type") rows.sort((a,b) => a.record.meta.label.localeCompare(b.record.meta.label) || a.record.title.localeCompare(b.record.title));
  else rows.sort((a,b) => b.score - a.score || b.record.sortTime - a.record.sortTime || a.record.title.localeCompare(b.record.title));
  return rows;
}
function highlightSearchTextV3(value, query) {
  const escaped = escapeHTML(value || "");
  const tokens = [...new Set(searchTokensV3(query))].filter(t => t.length > 1).sort((a,b)=>b.length-a.length);
  if (!tokens.length) return escaped;
  // Highlight on the escaped display string; tokens are escaped before becoming regex patterns.
  let output = escaped;
  for (const token of tokens) {
    const safe = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`(${safe})`, "gi"), '<mark class="search-highlight">$1</mark>');
  }
  return output;
}
function searchResultActionsV3(record) {
  if (record.type === "lesson") return `<button class="mini-button" data-search-show-planner="${record.id}">Show in planner</button><button class="mini-button" data-search-edit-lesson="${record.id}">Edit</button>`;
  if (record.type === "material") return `${record.source.url ? `<button class="mini-button" data-search-open-link="${record.id}">Open link</button>` : ""}<button class="mini-button" data-search-edit-material="${record.id}">Edit</button>`;
  return `<button class="mini-button" data-search-details="${record.type}|${record.id}">View details</button>`;
}
function renderSearchCardV3(record, query) {
  const chips = [record.learner, record.tags].flatMap(v => String(v || "").split(/[·,]/)).map(v => v.trim()).filter(Boolean).slice(0,5);
  return `<article class="search-result-card">
    <div class="search-result-icon" aria-hidden="true">${record.meta.icon}</div>
    <div class="search-result-main">
      <div class="search-result-topline"><span class="search-result-type">${record.meta.label}</span>${record.date ? `<span class="search-result-date">${escapeHTML(searchDisplayDateV3(record.date))}</span>` : ""}</div>
      <h4>${highlightSearchTextV3(record.title, query)}</h4>
      ${record.subtitle ? `<p>${highlightSearchTextV3(record.subtitle, query)}</p>` : ""}
      ${record.body ? `<p>${highlightSearchTextV3(record.body, query)}</p>` : ""}
      ${chips.length ? `<div class="search-result-meta">${chips.map(c => `<span class="search-meta-chip">${highlightSearchTextV3(c, query)}</span>`).join("")}</div>` : ""}
    </div>
    <div class="search-result-actions">${searchResultActionsV3(record)}</div>
  </article>`;
}
function renderActiveSearchFiltersV3(state) {
  const filters = [];
  if (state.query) filters.push(["query", `“${state.query}”`]);
  if (state.scope !== "all") filters.push(["scope", SEARCH_SCOPE_LABELS_V3[state.scope]]);
  if (state.from) filters.push(["from", `From ${searchDisplayDateV3(state.from)}`]);
  if (state.to) filters.push(["to", `To ${searchDisplayDateV3(state.to)}`]);
  if (state.learner !== "all") filters.push(["learner", state.learner]);
  if (state.tags) filters.push(["tags", `Tags: ${state.tags}`]);
  $("#activeSearchFilters").innerHTML = filters.map(([key,label]) => `<span class="search-filter-chip">${escapeHTML(label)}<button type="button" data-clear-search-filter="${key}" aria-label="Remove ${escapeHTML(label)}">×</button></span>`).join("");
}
function searchStateSummaryV3(state) {
  const pieces = [];
  if (state.query) pieces.push(state.query);
  if (state.scope !== "all") pieces.push(SEARCH_SCOPE_LABELS_V3[state.scope]);
  if (state.learner !== "all") pieces.push(state.learner);
  if (state.from || state.to) pieces.push(`${state.from || "…"}–${state.to || "…"}`);
  if (state.tags) pieces.push(`tags: ${state.tags}`);
  return pieces.join(" · ") || "Everything in your local workspace";
}
function renderSavedSearchesV3() {
  const list = $("#savedSearchList");
  if (!list) return;
  const saved = [...(data.savedSearches || [])].sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  list.innerHTML = saved.map(s => `<div class="saved-search-item"><button class="saved-search-run" data-run-saved-search="${s.id}"><strong>${escapeHTML(s.name)}</strong><span>${escapeHTML(searchStateSummaryV3(s.state || {}))}</span></button><button class="saved-search-delete" data-delete-saved-search="${s.id}" aria-label="Delete saved search">×</button></div>`).join("") || '<div class="empty-state compact">No saved searches yet.</div>';
}
function renderSearchV3() {
  if (!$("#searchView")) return;
  buildSearchIndexV3();
  populateSearchLearnersV3($("#searchLearner")?.value || "all");
  const state = searchStateV3();
  const rows = filteredSearchResultsV3();
  const counts = { lesson:0, material:0, student:0, memory:0 };
  rows.forEach(x => { if (counts[x.record.type] !== undefined) counts[x.record.type] += 1; });
  $("#searchAllCount").textContent = rows.length;
  $("#searchLessonCount").textContent = counts.lesson;
  $("#searchResourceCount").textContent = counts.material;
  $("#searchPeopleCount").textContent = counts.student + counts.memory;
  $("#clearSearchInputButton").classList.toggle("hidden", !state.query);
  renderActiveSearchFiltersV3(state);
  renderSavedSearchesV3();
  const phrase = state.query ? `Matches for “${state.query}”` : (state.scope !== "all" ? SEARCH_SCOPE_LABELS_V3[state.scope] : "Your workspace");
  $("#searchResultsTitle").textContent = phrase;
  $("#searchResultsSummary").textContent = `${rows.length} result${rows.length === 1 ? "" : "s"} · ${searchStateSummaryV3(state)}`;
  const visible = rows.slice(0, SEARCH_RESULT_LIMIT_V3);
  $("#searchResultLimitNote").textContent = rows.length > SEARCH_RESULT_LIMIT_V3 ? `Showing first ${SEARCH_RESULT_LIMIT_V3}` : "";
  $("#searchResults").innerHTML = visible.length ? visible.map(x => renderSearchCardV3(x.record, state.query)).join("") : '<div class="search-empty"><strong>No matching records</strong><span>Try a broader word, clear a filter, or import more local data.</span></div>';
}
function queueSearchRenderV3() {
  if (searchRenderQueuedV3) return;
  searchRenderQueuedV3 = true;
  requestAnimationFrame(() => { searchRenderQueuedV3 = false; renderSearchV3(); });
}
function clearSearchV3() {
  applySearchStateV3({ query:"", scope:"all", from:"", to:"", learner:"all", tags:"", sort:"relevance" });
  $("#globalSearchInput").focus();
}
function openSaveSearchV3() {
  const state = searchStateV3();
  const suggested = state.query || (state.scope !== "all" ? SEARCH_SCOPE_LABELS_V3[state.scope] : "My search");
  $("#saveSearchForm").reset();
  $("#savedSearchName").value = suggested.slice(0,80);
  $("#saveSearchDialog").showModal();
  setTimeout(()=>$("#savedSearchName").select(), 30);
}
function saveCurrentSearchV3() {
  const name = $("#savedSearchName").value.trim();
  if (!name) return;
  const existing = data.savedSearches.find(s => searchTextV3(s.name) === searchTextV3(name));
  if (existing) { existing.state = searchStateV3(); existing.updatedAt = Date.now(); }
  else data.savedSearches.push({ id:crypto.randomUUID(), name, state:searchStateV3(), createdAt:Date.now(), updatedAt:Date.now() });
  $("#saveSearchDialog").close();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderSearchV3();
  showToast(existing ? "Saved search updated" : "Search saved");
}
function runSavedSearchV3(id) {
  const saved = data.savedSearches.find(s => s.id === id);
  if (!saved) return;
  applySearchStateV3(saved.state || {});
  showToast(`Loaded “${saved.name}”`);
}
function deleteSavedSearchV3(id) {
  const saved = data.savedSearches.find(s => s.id === id);
  if (!saved || !confirm(`Delete the saved search “${saved.name}”?`)) return;
  data.savedSearches = data.savedSearches.filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderSearchV3();
  showToast("Saved search deleted");
}
function showSearchDetailsV3(record) {
  if (!record) return;
  $("#searchDetailEyebrow").textContent = record.meta.label;
  $("#searchDetailTitle").textContent = record.title;
  $("#searchDetailSubtitle").textContent = record.subtitle || (record.date ? searchDisplayDateV3(record.date) : "Local Classroom record");
  const rows = Object.entries(record.fields || {}).filter(([,v]) => String(v ?? "").trim() !== "");
  $("#searchDetailBody").innerHTML = `<dl>${rows.map(([k,v]) => {
    const value = String(v);
    const display = /^https?:\/\//i.test(value) ? `<a href="${safeUrl(value)}" target="_blank" rel="noreferrer">${escapeHTML(value)}</a>` : escapeHTML(value);
    return `<div class="search-detail-row"><dt>${escapeHTML(k)}</dt><dd>${display}</dd></div>`;
  }).join("")}</dl>`;
  $("#searchDetailDialog").showModal();
}
function searchRecordByIdV3(type, id) { return searchRecordsV3.find(r => r.type === type && r.id === id); }
function showLessonInPlannerV3(id) {
  const lesson = data.lessons.find(x => x.id === id);
  if (!lesson) return;
  weekStart = getMonday(parseLocalDate(lesson.date));
  resetWeekScroll = true;
  switchView("calendar");
  renderAll();
  showToast(`Showing week of ${searchDisplayDateV3(toISODate(weekStart))}`);
}
function applySearchPresetV3(name) {
  const today = toISODate(new Date());
  if (name === "upcoming") applySearchStateV3({ query:"", scope:"lesson", from:today, to:toISODate(addDays(new Date(),30)), learner:"all", tags:"", sort:"newest" });
  else if (name === "one-on-one") applySearchStateV3({ query:"One-on-one", scope:"lesson", from:"", to:"", learner:"all", tags:"", sort:"newest" });
  else if (name === "resources") applySearchStateV3({ query:"", scope:"material", from:"", to:"", learner:"all", tags:"", sort:"title" });
  else if (name === "memory") applySearchStateV3({ query:"", scope:"memory", from:"", to:"", learner:"all", tags:"", sort:"newest" });
}

// Keep the search index synchronized with every normal Classroom render.
const renderAllBeforeSearchV3 = renderAll;
renderAll = function() {
  renderAllBeforeSearchV3();
  renderSearchV3();
};

for (const id of ["globalSearchInput","searchTags"]) $("#"+id).addEventListener("input", queueSearchRenderV3);
for (const id of ["searchScope","searchDateFrom","searchDateTo","searchLearner","searchSort"]) $("#"+id).addEventListener("change", renderSearchV3);
$("#clearSearchButton").addEventListener("click", clearSearchV3);
$("#clearSearchInputButton").addEventListener("click", ()=>{ $("#globalSearchInput").value=""; renderSearchV3(); $("#globalSearchInput").focus(); });
$("#saveSearchButton").addEventListener("click", openSaveSearchV3);
$("#saveSearchForm").addEventListener("submit", e=>{ e.preventDefault(); saveCurrentSearchV3(); });
$("#activeSearchFilters").addEventListener("click", e=>{
  const button=e.target.closest("[data-clear-search-filter]"); if(!button)return;
  const key=button.dataset.clearSearchFilter;
  if(key==="query") $("#globalSearchInput").value="";
  else if(key==="scope") $("#searchScope").value="all";
  else if(key==="from") $("#searchDateFrom").value="";
  else if(key==="to") $("#searchDateTo").value="";
  else if(key==="learner") $("#searchLearner").value="all";
  else if(key==="tags") $("#searchTags").value="";
  renderSearchV3();
});
$("#savedSearchList").addEventListener("click", e=>{
  const run=e.target.closest("[data-run-saved-search]"); if(run){runSavedSearchV3(run.dataset.runSavedSearch);return;}
  const del=e.target.closest("[data-delete-saved-search]"); if(del)deleteSavedSearchV3(del.dataset.deleteSavedSearch);
});
$$('[data-search-preset]').forEach(b=>b.addEventListener('click',()=>applySearchPresetV3(b.dataset.searchPreset)));
$("#searchResults").addEventListener("click", e=>{
  const planner=e.target.closest("[data-search-show-planner]"); if(planner){showLessonInPlannerV3(planner.dataset.searchShowPlanner);return;}
  const lesson=e.target.closest("[data-search-edit-lesson]"); if(lesson){openLessonDialog(lesson.dataset.searchEditLesson);return;}
  const material=e.target.closest("[data-search-edit-material]"); if(material){openMaterialDialogV2B(material.dataset.searchEditMaterial);return;}
  const link=e.target.closest("[data-search-open-link]"); if(link){const r=searchRecordByIdV3("material",link.dataset.searchOpenLink);if(r?.source.url)window.open(safeUrl(r.source.url),"_blank","noopener");return;}
  const details=e.target.closest("[data-search-details]"); if(details){const [type,id]=details.dataset.searchDetails.split("|");showSearchDetailsV3(searchRecordByIdV3(type,id));}
});

document.addEventListener("keydown", e=>{
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault(); switchView("search"); renderSearchV3(); setTimeout(()=>$("#globalSearchInput").focus(),30);
  }
});

// Search dialogs are injected after the core registered its close buttons, so bind them here.
$$("#saveSearchDialog [data-close-dialog], #searchDetailDialog [data-close-dialog]").forEach(b=>b.addEventListener("click",()=>b.closest("dialog").close()));

buildSearchIndexV3();
populateSearchLearnersV3("all");
renderSearchV3();
