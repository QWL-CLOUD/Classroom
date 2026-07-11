"use strict";

/* Sprint 2B — Library enhancement layer.
   The core planner remains unchanged. This layer migrates existing local data
   and adds library collections, editing, bulk classification, duplicate merging,
   lesson linking, usage tracking, and one-step undo. */

const UNDO_LIBRARY_KEY = "classroomUndoLibraryV2B";
let selectedMaterialIds = new Set();
let activeLibraryScope = "all";

function libraryNow() { return Date.now(); }
function normalizedTagList(value) {
  return [...new Set(String(value || "").split(/[,;，；]/).map(x => x.trim()).filter(Boolean))];
}
function mergeTags(...values) { return [...new Set(values.flatMap(normalizedTagList))].join(", "); }
function normalizeMaterialV2B(x = {}) {
  return {
    ...x,
    id: x.id || crypto.randomUUID(),
    title: String(x.title || "Untitled resource").trim(),
    type: String(x.type || "Other").trim(),
    url: String(x.url || "").trim(),
    grade: String(x.grade || "").trim(),
    skill: String(x.skill || "").trim(),
    topic: String(x.topic || "").trim(),
    unit: String(x.unit || x.tag || "").trim(),
    learner: String(x.learner || "").trim(),
    tags: mergeTags(x.tags || ""),
    notes: String(x.notes || "").trim(),
    collectionId: String(x.collectionId || "").trim(),
    collectionName: String(x.collectionName || "").trim(),
    favorite: Boolean(x.favorite),
    reviewed: x.reviewed === undefined ? !Boolean(x.importBatchId || x.sourceFile) : Boolean(x.reviewed),
    createdAt: Number(x.createdAt) || libraryNow(),
    updatedAt: Number(x.updatedAt) || Number(x.createdAt) || libraryNow(),
    lastUsedAt: Number(x.lastUsedAt) || 0,
    useCount: Number(x.useCount) || 0
  };
}
function migrateLibraryData(save = true) {
  if (!Array.isArray(data.libraryCollections)) data.libraryCollections = [];
  data.libraryCollections = data.libraryCollections.map(c => ({
    ...c,
    id: c.id || crypto.randomUUID(),
    name: String(c.name || "Untitled collection").trim(),
    createdAt: Number(c.createdAt) || libraryNow(),
    updatedAt: Number(c.updatedAt) || Number(c.createdAt) || libraryNow()
  }));
  data.materials = data.materials.map(normalizeMaterialV2B);
  data.lessons = data.lessons.map(l => ({ ...l, materialIds: Array.isArray(l.materialIds) ? [...new Set(l.materialIds)] : [] }));
  resolveImportedCollectionNames(false);
  if (save) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function resolveImportedCollectionNames(save = true) {
  let changed = false;
  for (const material of data.materials) {
    if (!material.collectionId && material.collectionName) {
      let collection = data.libraryCollections.find(c => c.name.toLowerCase() === material.collectionName.toLowerCase());
      if (!collection) {
        collection = { id: crypto.randomUUID(), name: material.collectionName, createdAt: libraryNow(), updatedAt: libraryNow() };
        data.libraryCollections.push(collection);
      }
      material.collectionId = collection.id;
      material.collectionName = "";
      changed = true;
    }
  }
  if (changed && save) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function takeLibrarySnapshot(label) {
  localStorage.setItem(UNDO_LIBRARY_KEY, JSON.stringify({ label, createdAt: libraryNow(), snapshot: structuredClone(data) }));
}
function persistLibrary(message, withUndo = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  selectedMaterialIds = new Set([...selectedMaterialIds].filter(id => data.materials.some(m => m.id === id)));
  renderAll();
  showToast(message, withUndo ? "Undo" : "", withUndo ? undoLastLibraryAction : null);
}
function undoLastLibraryAction() {
  let undo = null;
  try { undo = JSON.parse(localStorage.getItem(UNDO_LIBRARY_KEY) || "null"); } catch {}
  if (!undo?.snapshot) { showToast("No library action to undo"); return; }
  data = normalizeData(undo.snapshot);
  migrateLibraryData(false);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  localStorage.removeItem(UNDO_LIBRARY_KEY);
  selectedMaterialIds.clear();
  renderAll();
  showToast("Library action undone");
}
function collectionName(id) { return data.libraryCollections.find(c => c.id === id)?.name || "Unfiled"; }
function linkedLessonCount(materialId) { return data.lessons.filter(l => (l.materialIds || []).includes(materialId)).length; }
function needsLibraryReview(m) { return Boolean((m.importBatchId || m.sourceFile) && !m.reviewed); }
function resourceIcon(type) {
  const icons = { Slides:"▤", Worksheet:"▧", Drive:"◆", Website:"↗", Video:"▶", Book:"▥", Image:"▣", Audio:"♪", Assessment:"✓", Other:"•" };
  return icons[type] || "•";
}
function libraryDateLabel(timestamp) {
  if (!timestamp) return "Never used";
  return new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric" }).format(new Date(timestamp));
}
function setDynamicOptions(select, values, allLabel, selectedValue = null) {
  if (!select) return;
  const current = selectedValue ?? select.value;
  select.innerHTML = `<option value="all">${escapeHTML(allLabel)}</option>` + values.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join("");
  select.value = values.includes(current) ? current : "all";
}
function collectionOptions(includeBlank = true, blankLabel = "Unfiled") {
  return (includeBlank ? `<option value="">${escapeHTML(blankLabel)}</option>` : "") +
    [...data.libraryCollections].sort((a,b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join("");
}
function currentFilteredMaterials() {
  const q = String($("#materialSearch")?.value || "").trim().toLowerCase();
  const type = $("#materialTypeFilter")?.value || "all";
  const grade = $("#materialGradeFilter")?.value || "all";
  const skill = $("#materialSkillFilter")?.value || "all";
  const favoritesOnly = Boolean($("#favoritesOnly")?.checked);
  const sort = $("#materialSort")?.value || "recent";
  let items = data.materials.filter(m => {
    if (activeLibraryScope === "favorites" && !m.favorite) return false;
    if (activeLibraryScope === "unfiled" && m.collectionId) return false;
    if (activeLibraryScope === "needs-review" && !needsLibraryReview(m)) return false;
    if (activeLibraryScope.startsWith("collection:") && m.collectionId !== activeLibraryScope.slice(11)) return false;
    if (type !== "all" && m.type !== type) return false;
    if (grade !== "all" && m.grade !== grade) return false;
    if (skill !== "all" && m.skill !== skill) return false;
    if (favoritesOnly && !m.favorite) return false;
    const haystack = [m.title,m.type,m.grade,m.skill,m.topic,m.unit,m.learner,m.tags,m.notes,collectionName(m.collectionId),m.sourceFile].join(" ").toLowerCase();
    return !q || haystack.includes(q);
  });
  const sorters = {
    recent:(a,b)=>(b.createdAt||0)-(a.createdAt||0),
    used:(a,b)=>(b.lastUsedAt||0)-(a.lastUsedAt||0)||(b.createdAt||0)-(a.createdAt||0),
    popular:(a,b)=>(b.useCount||0)-(a.useCount||0)||(b.lastUsedAt||0)-(a.lastUsedAt||0),
    title:(a,b)=>a.title.localeCompare(b.title)
  };
  return items.sort(sorters[sort] || sorters.recent);
}

const coreRenderDashboardV2B = renderDashboard;
renderDashboard = function() {
  coreRenderDashboardV2B();
  const recent = [...data.materials].sort((a,b) => (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt)).slice(0,4);
  $("#recentMaterials").innerHTML = recent.map(m => `
    <button class="resource-item resource-dashboard-button" data-dashboard-open-resource="${m.id}">
      <span class="resource-icon">${resourceIcon(m.type)}</span>
      <span><strong>${escapeHTML(m.title)}</strong><span>${escapeHTML(m.type)} · ${escapeHTML(collectionName(m.collectionId))}</span></span>
    </button>`).join("") || '<div class="empty-state">No resources saved yet.</div>';
};

renderLibrary = function() {
  migrateLibraryData(false);
  const grades = [...new Set(data.materials.map(m => m.grade).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const skills = [...new Set(data.materials.map(m => m.skill).filter(Boolean))].sort();
  setDynamicOptions($("#materialGradeFilter"), grades, "All grades");
  setDynamicOptions($("#materialSkillFilter"), skills, "All skills");

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  $("#libraryTotalCount").textContent = data.materials.length;
  $("#libraryFavoriteCount").textContent = data.materials.filter(m => m.favorite).length;
  $("#libraryUsedMonthCount").textContent = data.materials.filter(m => m.lastUsedAt >= monthStart.getTime()).length;
  const reviewCount = data.materials.filter(needsLibraryReview).length;
  $("#libraryReviewCount").textContent = reviewCount;
  $("#classificationBanner").classList.toggle("hidden", reviewCount === 0 || activeLibraryScope === "needs-review");

  const builtIn = [
    ["all","All resources",data.materials.length],
    ["favorites","Favorites",data.materials.filter(m=>m.favorite).length],
    ["unfiled","Unfiled",data.materials.filter(m=>!m.collectionId).length],
    ["needs-review","Needs review",reviewCount]
  ];
  const custom = [...data.libraryCollections].sort((a,b)=>a.name.localeCompare(b.name));
  $("#collectionList").innerHTML = builtIn.map(([scope,label,count]) => `
    <div class="collection-row"><button class="collection-scope ${activeLibraryScope===scope?"active":""}" data-library-scope="${scope}"><span>${escapeHTML(label)}</span><span class="collection-count">${count}</span></button><span></span></div>`).join("") +
    (custom.length ? '<div class="collection-divider"></div>' : '') +
    custom.map(c => `<div class="collection-row"><button class="collection-scope ${activeLibraryScope===`collection:${c.id}`?"active":""}" data-library-scope="collection:${c.id}"><span>${escapeHTML(c.name)}</span><span class="collection-count">${data.materials.filter(m=>m.collectionId===c.id).length}</span></button><button class="collection-edit" data-edit-collection="${c.id}" aria-label="Edit ${escapeHTML(c.name)}">•••</button></div>`).join("");

  const filtered = currentFilteredMaterials();
  $("#libraryResultCount").textContent = `${filtered.length} resource${filtered.length===1?"":"s"}`;
  const selectedCount = selectedMaterialIds.size;
  $("#bulkSelectedCount").textContent = selectedCount;
  $("#bulkToolbar").classList.toggle("hidden", selectedCount === 0);
  $("#undoLibraryButton").disabled = !localStorage.getItem(UNDO_LIBRARY_KEY);

  $("#materialLibrary").innerHTML = filtered.map(m => {
    const tags = [m.grade,m.skill,m.topic,m.unit,m.learner,...normalizedTagList(m.tags)].filter(Boolean).slice(0,8);
    const lessonCount = linkedLessonCount(m.id);
    return `<article class="material-card enhanced ${selectedMaterialIds.has(m.id)?"selected":""}">
      <input class="material-card-select" type="checkbox" data-select-material="${m.id}" ${selectedMaterialIds.has(m.id)?"checked":""} aria-label="Select ${escapeHTML(m.title)}" />
      <div class="material-card-head"><span class="type-pill">${resourceIcon(m.type)} ${escapeHTML(m.type)}</span><button class="favorite-button ${m.favorite?"active":""}" data-toggle-favorite="${m.id}" title="${m.favorite?"Remove from favorites":"Add to favorites"}">${m.favorite?"★":"☆"}</button></div>
      <h4>${escapeHTML(m.title)}</h4>
      <div class="material-meta-line"><span class="collection-chip">${escapeHTML(collectionName(m.collectionId))}</span>${needsLibraryReview(m)?'<span class="review-badge">Needs review</span>':''}</div>
      <div class="tag-row compact">${tags.map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join("")}</div>
      <p class="material-card-note">${escapeHTML(m.notes || "No notes added.")}</p>
      <div class="material-card-bottom">
        <div class="material-usage"><span>${m.useCount || 0} use${m.useCount===1?"":"s"} · ${lessonCount} lesson${lessonCount===1?"":"s"}</span><span>${m.lastUsedAt?`Last used ${libraryDateLabel(m.lastUsedAt)}`:"Not used yet"}</span></div>
        <div class="material-actions">
          <button class="mini-button" data-open-resource="${m.id}" ${m.url?"":"disabled"}>Open</button>
          <button class="mini-button" data-attach-resource="${m.id}">Use in lesson</button>
          <button class="mini-button" data-edit-material="${m.id}">Edit</button>
        </div>
      </div>
    </article>`;
  }).join("") || '<div class="empty-state empty-library">No resources match this view.</div>';
};

const coreUpdateUndoButtonsV2B = updateUndoButtons;
updateUndoButtons = function() {
  coreUpdateUndoButtonsV2B();
  if ($("#undoLibraryButton")) $("#undoLibraryButton").disabled = !localStorage.getItem(UNDO_LIBRARY_KEY);
};

// Expand import mapping for the enhanced library schema.
categoryConfig.library.fields.collection = "Collection";
categoryConfig.library.fields.learner = "Learner / audience";
aliases.collection = ["collection","folder","library folder","resource collection","资源库","文件夹","集合","分类文件夹"];
const coreCleanImportedV2B = cleanImported;
cleanImported = function(category, row, batchId) {
  const result = coreCleanImportedV2B(category, row, batchId);
  if (category !== "library") return result;
  return normalizeMaterialV2B({
    ...result,
    learner: String(row.learner || "").trim(),
    collectionName: String(row.collection || "").trim(),
    reviewed: false,
    favorite: false,
    updatedAt: libraryNow()
  });
};

// Allow a Library-only export to be imported back through Import Center.
const coreParseFileV2B = parseFile;
parseFile = async function(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "json") {
    const object = JSON.parse(await file.text());
    if (object?.format === "Classroom Library" && Array.isArray(object.materials)) {
      const names = new Map((object.collections || []).map(c => [c.id, c.name]));
      return object.materials.map(m => ({ ...m, collection: names.get(m.collectionId) || m.collectionName || "" }));
    }
  }
  return coreParseFileV2B(file);
};

const coreOpenLessonDialogV2B = openLessonDialog;
openLessonDialog = function(id = null, preset = null) {
  coreOpenLessonDialogV2B(id, preset);
  renderLessonLinkedResources(id);
};
function renderLessonLinkedResources(lessonId) {
  const box = $("#lessonLinkedResources");
  if (!box) return;
  const lesson = data.lessons.find(l => l.id === lessonId);
  if (!lesson) { box.innerHTML = '<span class="modal-subtitle">Save the lesson, then attach resources from Library.</span>'; return; }
  const resources = (lesson.materialIds || []).map(id => data.materials.find(m => m.id === id)).filter(Boolean);
  box.innerHTML = resources.map(m => `<div class="lesson-linked-item"><div><strong>${escapeHTML(m.title)}</strong><span>${escapeHTML(m.type)} · ${escapeHTML(collectionName(m.collectionId))}</span></div><button type="button" data-detach-material="${m.id}" title="Detach resource">Remove</button></div>`).join("") || '<span class="modal-subtitle">No Library resources are attached yet.</span>';
}

function fillCollectionSelects() {
  $("#materialCollection").innerHTML = collectionOptions(true, "Unfiled");
  $("#bulkCollection").innerHTML = '<option value="">Leave unchanged</option><option value="__unfiled__">Move to Unfiled</option>' + collectionOptions(false);
}
function openMaterialDialogV2B(id = null) {
  const m = data.materials.find(x => x.id === id);
  $("#materialForm").reset();
  fillCollectionSelects();
  $("#materialId").value = m?.id || "";
  $("#materialDialogTitle").textContent = m ? "Edit resource" : "Add resource";
  $("#deleteMaterialButton").classList.toggle("hidden", !m);
  $("#duplicateMaterialButton").classList.toggle("hidden", !m);
  $("#materialReviewed").checked = true;
  $("#materialUsageSummary").textContent = m ? `${m.useCount || 0} uses · linked to ${linkedLessonCount(m.id)} lesson${linkedLessonCount(m.id)===1?"":"s"}` : "";
  if (m) {
    $("#materialTitle").value = m.title;
    $("#materialType").value = m.type;
    $("#materialCollection").value = m.collectionId || "";
    $("#materialGrade").value = m.grade;
    $("#materialSkill").value = m.skill;
    $("#materialTopic").value = m.topic;
    $("#materialUnit").value = m.unit;
    $("#materialLearner").value = m.learner;
    $("#materialTags").value = m.tags;
    $("#materialUrl").value = m.url;
    $("#materialNotes").value = m.notes;
    $("#materialFavorite").checked = m.favorite;
    $("#materialReviewed").checked = m.reviewed;
  }
  $("#materialDialog").showModal();
}
function saveMaterialFromDialog() {
  const id = $("#materialId").value;
  const existing = data.materials.find(m => m.id === id);
  const material = normalizeMaterialV2B({
    ...(existing || {}),
    id: id || crypto.randomUUID(),
    title: $("#materialTitle").value.trim(),
    type: $("#materialType").value,
    collectionId: $("#materialCollection").value,
    grade: $("#materialGrade").value.trim(),
    skill: $("#materialSkill").value.trim(),
    topic: $("#materialTopic").value.trim(),
    unit: $("#materialUnit").value.trim(),
    learner: $("#materialLearner").value.trim(),
    tags: $("#materialTags").value.trim(),
    url: $("#materialUrl").value.trim(),
    notes: $("#materialNotes").value.trim(),
    favorite: $("#materialFavorite").checked,
    reviewed: $("#materialReviewed").checked,
    createdAt: existing?.createdAt || libraryNow(),
    updatedAt: libraryNow()
  });
  takeLibrarySnapshot(existing ? "Edit resource" : "Add resource");
  if (existing) data.materials[data.materials.findIndex(m=>m.id===id)] = material;
  else data.materials.push(material);
  $("#materialDialog").close();
  persistLibrary(existing ? "Resource updated" : "Resource added");
}
function deleteMaterial(id) {
  const m = data.materials.find(x=>x.id===id); if (!m) return;
  if (!confirm(`Delete “${m.title}”? Lesson links to this resource will also be removed.`)) return;
  takeLibrarySnapshot("Delete resource");
  data.materials = data.materials.filter(x=>x.id!==id);
  data.lessons = data.lessons.map(l=>({...l,materialIds:(l.materialIds||[]).filter(mid=>mid!==id)}));
  selectedMaterialIds.delete(id);
  $("#materialDialog").close();
  persistLibrary("Resource deleted");
}
function duplicateMaterial(id) {
  const m = data.materials.find(x=>x.id===id); if (!m) return;
  takeLibrarySnapshot("Duplicate resource");
  data.materials.push(normalizeMaterialV2B({...m,id:crypto.randomUUID(),title:`${m.title} (copy)`,favorite:false,useCount:0,lastUsedAt:0,createdAt:libraryNow(),updatedAt:libraryNow(),reviewed:true}));
  $("#materialDialog").close();
  persistLibrary("Resource duplicated");
}
function toggleFavorite(id) {
  const m=data.materials.find(x=>x.id===id); if(!m)return;
  takeLibrarySnapshot(m.favorite?"Remove favorite":"Add favorite");
  m.favorite=!m.favorite; m.updatedAt=libraryNow();
  persistLibrary(m.favorite?"Added to favorites":"Removed from favorites");
}
function useResource(id) {
  const m=data.materials.find(x=>x.id===id); if(!m||!m.url)return;
  const href=safeUrl(m.url); if(href==="#"){showToast("This resource link is not valid");return;}
  window.open(href,"_blank","noopener,noreferrer");
  m.useCount=(m.useCount||0)+1; m.lastUsedAt=libraryNow(); m.updatedAt=libraryNow();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); renderAll();
}
function openAttachDialog(id) {
  const m=data.materials.find(x=>x.id===id); if(!m)return;
  const lessons=sortedLessons();
  if(!lessons.length){showToast("Add or import a lesson first");return;}
  $("#attachMaterialId").value=id;
  $("#attachResourceName").textContent=m.title;
  $("#attachLessonId").innerHTML=lessons.map(l=>`<option value="${l.id}">${escapeHTML(l.date)} · ${escapeHTML(formatTime(l.time))} · ${escapeHTML(l.title)}${l.learner?` · ${escapeHTML(l.learner)}`:""}</option>`).join("");
  $("#setPrimaryMaterialLink").checked=true;
  $("#attachResourceDialog").showModal();
}
function attachResourceToLesson() {
  const material=data.materials.find(m=>m.id===$("#attachMaterialId").value);
  const lesson=data.lessons.find(l=>l.id===$("#attachLessonId").value);
  if(!material||!lesson)return;
  takeLibrarySnapshot("Attach resource to lesson");
  lesson.materialIds=[...new Set([...(lesson.materialIds||[]),material.id])];
  if($("#setPrimaryMaterialLink").checked&&!lesson.materialUrl&&material.url)lesson.materialUrl=material.url;
  material.useCount=(material.useCount||0)+1; material.lastUsedAt=libraryNow(); material.updatedAt=libraryNow();
  $("#attachResourceDialog").close();
  persistLibrary("Resource attached to lesson");
}
function openCollectionDialog(id=null) {
  const c=data.libraryCollections.find(x=>x.id===id);
  $("#collectionForm").reset(); $("#collectionId").value=c?.id||"";
  $("#collectionDialogTitle").textContent=c?"Edit collection":"New collection";
  $("#deleteCollectionButton").classList.toggle("hidden",!c);
  if(c)$("#collectionName").value=c.name;
  $("#collectionDialog").showModal();
}
function saveCollection() {
  const id=$("#collectionId").value,name=$("#collectionName").value.trim(); if(!name)return;
  const duplicate=data.libraryCollections.find(c=>c.name.toLowerCase()===name.toLowerCase()&&c.id!==id);
  if(duplicate){showToast("A collection with this name already exists");return;}
  takeLibrarySnapshot(id?"Rename collection":"Add collection");
  const c=data.libraryCollections.find(x=>x.id===id);
  if(c){c.name=name;c.updatedAt=libraryNow();}else data.libraryCollections.push({id:crypto.randomUUID(),name,createdAt:libraryNow(),updatedAt:libraryNow()});
  $("#collectionDialog").close(); persistLibrary(id?"Collection renamed":"Collection added");
}
function deleteCollection() {
  const id=$("#collectionId").value,c=data.libraryCollections.find(x=>x.id===id); if(!c)return;
  const count=data.materials.filter(m=>m.collectionId===id).length;
  if(!confirm(`Delete “${c.name}”? ${count} resource${count===1?"":"s"} will move to Unfiled.`))return;
  takeLibrarySnapshot("Delete collection");
  data.libraryCollections=data.libraryCollections.filter(x=>x.id!==id);
  data.materials.forEach(m=>{if(m.collectionId===id)m.collectionId=""});
  if(activeLibraryScope===`collection:${id}`)activeLibraryScope="unfiled";
  $("#collectionDialog").close(); persistLibrary("Collection deleted; resources moved to Unfiled");
}
function clearLibraryFilters() {
  $("#materialSearch").value=""; $("#materialTypeFilter").value="all"; $("#materialGradeFilter").value="all"; $("#materialSkillFilter").value="all"; $("#favoritesOnly").checked=false; $("#materialSort").value="recent"; activeLibraryScope="all"; renderLibrary();
}
function openBulkDialog() {
  if(!selectedMaterialIds.size)return;
  $("#bulkEditForm").reset(); fillCollectionSelects(); $("#bulkEditDialog").showModal();
}
function applyBulkEdit() {
  const ids=new Set(selectedMaterialIds); if(!ids.size)return;
  const values={collectionId:$("#bulkCollection").value,grade:$("#bulkGrade").value.trim(),skill:$("#bulkSkill").value.trim(),topic:$("#bulkTopic").value.trim(),unit:$("#bulkUnit").value.trim(),learner:$("#bulkLearner").value.trim(),tags:$("#bulkTags").value.trim()};
  takeLibrarySnapshot("Bulk classify resources");
  data.materials.forEach(m=>{if(!ids.has(m.id))return;if(values.collectionId)m.collectionId=values.collectionId==="__unfiled__"?"":values.collectionId;["grade","skill","topic","unit","learner"].forEach(k=>{if(values[k])m[k]=values[k]});if(values.tags)m.tags=mergeTags(m.tags,values.tags);if($("#bulkMarkReviewed").checked)m.reviewed=true;m.updatedAt=libraryNow()});
  $("#bulkEditDialog").close(); persistLibrary(`${ids.size} resources updated`);
}
function bulkFavorite() {
  if(!selectedMaterialIds.size)return;takeLibrarySnapshot("Favorite selected resources");data.materials.forEach(m=>{if(selectedMaterialIds.has(m.id)){m.favorite=true;m.updatedAt=libraryNow()}});persistLibrary("Selected resources added to favorites");
}
function bulkMarkReviewed() {
  if(!selectedMaterialIds.size)return;takeLibrarySnapshot("Mark resources reviewed");data.materials.forEach(m=>{if(selectedMaterialIds.has(m.id)){m.reviewed=true;m.updatedAt=libraryNow()}});persistLibrary("Selected resources marked reviewed");
}
function bulkDelete() {
  const count=selectedMaterialIds.size;if(!count||!confirm(`Delete ${count} selected resource${count===1?"":"s"}?`))return;
  takeLibrarySnapshot("Delete selected resources");const ids=new Set(selectedMaterialIds);data.materials=data.materials.filter(m=>!ids.has(m.id));data.lessons=data.lessons.map(l=>({...l,materialIds:(l.materialIds||[]).filter(id=>!ids.has(id))}));selectedMaterialIds.clear();persistLibrary("Selected resources deleted");
}
function selectVisible() { currentFilteredMaterials().forEach(m=>selectedMaterialIds.add(m.id)); renderLibrary(); }
function markReviewScope() { activeLibraryScope="needs-review"; $("#materialSearch").value=""; selectedMaterialIds.clear(); renderLibrary(); }

function normalizedResourceUrl(value){try{const u=new URL(value);[...u.searchParams.keys()].filter(k=>k.toLowerCase().startsWith("utm_")).forEach(k=>u.searchParams.delete(k));return `${u.hostname}${u.pathname.replace(/\/$/,"")}${u.search}`.toLowerCase()}catch{return""}}
function normalizedResourceTitle(value){return String(value||"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9\u3400-\u9fff]+/g,"").trim()}
function findDuplicateGroups(){const items=data.materials,n=items.length,parent=Array.from({length:n},(_,i)=>i);const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a};for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const ui=normalizedResourceUrl(items[i].url),uj=normalizedResourceUrl(items[j].url),ti=normalizedResourceTitle(items[i].title),tj=normalizedResourceTitle(items[j].title);if((ui&&ui===uj)||(ti&&ti===tj&&items[i].type===items[j].type))union(i,j)}const groups=new Map();items.forEach((m,i)=>{const r=find(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(m)});return[...groups.values()].filter(g=>g.length>1)}
function materialCompleteness(m){return["title","url","grade","skill","topic","unit","learner","tags","notes","collectionId"].filter(k=>String(m[k]||"").trim()).length+(m.favorite?2:0)+(m.reviewed?1:0)+(m.useCount||0)*.01}
function mergeDuplicateGroup(ids,takeSnapshot=true){const group=data.materials.filter(m=>ids.includes(m.id));if(group.length<2)return 0;if(takeSnapshot)takeLibrarySnapshot("Merge duplicate resources");const keep=[...group].sort((a,b)=>materialCompleteness(b)-materialCompleteness(a))[0],remove=group.filter(m=>m.id!==keep.id);for(const m of remove){for(const k of["url","grade","skill","topic","unit","learner","notes","collectionId"])if(!keep[k]&&m[k])keep[k]=m[k];keep.tags=mergeTags(keep.tags,m.tags);keep.favorite=keep.favorite||m.favorite;keep.reviewed=keep.reviewed||m.reviewed;keep.useCount=(keep.useCount||0)+(m.useCount||0);keep.lastUsedAt=Math.max(keep.lastUsedAt||0,m.lastUsedAt||0);keep.updatedAt=libraryNow()}const removeIds=new Set(remove.map(m=>m.id));data.lessons=data.lessons.map(l=>({...l,materialIds:[...new Set((l.materialIds||[]).map(id=>removeIds.has(id)?keep.id:id))]}));data.materials=data.materials.filter(m=>!removeIds.has(m.id));removeIds.forEach(id=>selectedMaterialIds.delete(id));return remove.length}
function renderDuplicateDialog(){const groups=findDuplicateGroups();$("#duplicateGroups").innerHTML=groups.map((g,i)=>`<section class="duplicate-group"><div class="duplicate-group-head"><div><strong>Group ${i+1}</strong><span class="modal-subtitle">${g.length} possible duplicates</span></div><button class="button button-small button-secondary" data-merge-group="${g.map(m=>m.id).join(",")}">Merge this group</button></div><div class="duplicate-items">${g.map(m=>`<div class="duplicate-item"><strong>${escapeHTML(m.title)}</strong><span>${escapeHTML(m.type)} · ${escapeHTML(m.url||"No URL")} · ${escapeHTML(collectionName(m.collectionId))}</span></div>`).join("")}</div></section>`).join("")||'<div class="empty-state">No possible duplicates found.</div>';$("#mergeAllDuplicatesButton").disabled=groups.length===0;return groups}
function openDuplicatesDialog(){renderDuplicateDialog();$("#duplicatesDialog").showModal()}
function mergeAllDuplicates(){const groups=findDuplicateGroups();if(!groups.length)return;if(!confirm(`Merge ${groups.length} duplicate group${groups.length===1?"":"s"}? The most complete record in each group will be kept.`))return;takeLibrarySnapshot("Merge all duplicate resources");let removed=0;groups.forEach(g=>removed+=mergeDuplicateGroup(g.map(m=>m.id),false));persistLibrary(`${removed} duplicate record${removed===1?"":"s"} merged`);renderDuplicateDialog()}
function exportLibrary(){const payload={format:"Classroom Library",version:"2B",exportedAt:new Date().toISOString(),collections:data.libraryCollections,materials:data.materials,lessonLinks:data.lessons.filter(l=>(l.materialIds||[]).length).map(l=>({id:l.id,title:l.title,date:l.date,time:l.time,materialIds:l.materialIds}))};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`classroom-library-${toISODate(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);showToast("Library export downloaded")}

// Preserve Library links whenever a lesson is edited.
$("#lessonForm").addEventListener("submit", e => {
  e.preventDefault();
  e.stopImmediatePropagation();
  const id = $("#lessonId").value || crypto.randomUUID();
  const existing = data.lessons.find(l => l.id === id);
  const lesson = {
    ...(existing || {}),
    id,
    title: $("#lessonTitle").value.trim(),
    date: $("#lessonDate").value,
    time: $("#lessonTime").value,
    duration: Number($("#lessonDuration").value),
    type: $("#lessonType").value,
    status: $("#lessonStatus").value,
    learner: $("#lessonLearner").value.trim(),
    objective: $("#lessonObjective").value.trim(),
    notes: $("#lessonNotes").value.trim(),
    materialUrl: $("#lessonMaterialUrl").value.trim(),
    materialIds: existing?.materialIds || []
  };
  const index = data.lessons.findIndex(l => l.id === id);
  if (index >= 0) data.lessons[index] = lesson; else data.lessons.push(lesson);
  $("#lessonDialog").close();
  persist(index >= 0 ? "Lesson updated" : "Lesson added");
}, true);
$("#lessonLinkedResources").addEventListener("click", e => {
  const button = e.target.closest("[data-detach-material]");
  if (!button) return;
  const lesson = data.lessons.find(l => l.id === $("#lessonId").value);
  if (!lesson) return;
  takeLibrarySnapshot("Detach resource from lesson");
  lesson.materialIds = (lesson.materialIds || []).filter(id => id !== button.dataset.detachMaterial);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderAll();
  renderLessonLinkedResources(lesson.id);
  showToast("Resource detached from lesson", "Undo", undoLastLibraryAction);
});

// Capture handlers prevent the older Sprint 2A add-only form behavior.
$("#addMaterialButton").addEventListener("click",e=>{e.stopImmediatePropagation();openMaterialDialogV2B()},true);
$("#materialForm").addEventListener("submit",e=>{e.preventDefault();e.stopImmediatePropagation();saveMaterialFromDialog()},true);
$("#deleteMaterialButton").addEventListener("click",()=>deleteMaterial($("#materialId").value));
$("#duplicateMaterialButton").addEventListener("click",()=>duplicateMaterial($("#materialId").value));
$("#undoLibraryButton").addEventListener("click",undoLastLibraryAction);
$("#exportLibraryButton").addEventListener("click",exportLibrary);
$("#findDuplicatesButton").addEventListener("click",openDuplicatesDialog);
$("#addCollectionButton").addEventListener("click",()=>openCollectionDialog());
$("#addCollectionMiniButton").addEventListener("click",()=>openCollectionDialog());
$("#collectionForm").addEventListener("submit",e=>{e.preventDefault();saveCollection()});
$("#deleteCollectionButton").addEventListener("click",deleteCollection);
$("#bulkEditForm").addEventListener("submit",e=>{e.preventDefault();applyBulkEdit()});
$("#attachResourceForm").addEventListener("submit",e=>{e.preventDefault();attachResourceToLesson()});
$("#mergeAllDuplicatesButton").addEventListener("click",mergeAllDuplicates);
$("#bulkFavoriteButton").addEventListener("click",bulkFavorite);
$("#bulkEditButton").addEventListener("click",openBulkDialog);
$("#bulkReviewedButton").addEventListener("click",bulkMarkReviewed);
$("#bulkDeleteButton").addEventListener("click",bulkDelete);
$("#clearSelectionButton").addEventListener("click",()=>{selectedMaterialIds.clear();renderLibrary()});
$("#selectVisibleButton").addEventListener("click",selectVisible);
$("#clearLibraryFilters").addEventListener("click",clearLibraryFilters);
$("#reviewImportedButton").addEventListener("click",markReviewScope);
for(const id of["materialSearch","materialTypeFilter","materialGradeFilter","materialSkillFilter","materialSort","favoritesOnly"]){const el=$("#"+id);el.addEventListener(el.tagName==="INPUT"&&el.type==="search"?"input":"change",renderLibrary)}

$("#collectionList").addEventListener("click",e=>{const scope=e.target.closest("[data-library-scope]");if(scope){activeLibraryScope=scope.dataset.libraryScope;selectedMaterialIds.clear();renderLibrary();return}const edit=e.target.closest("[data-edit-collection]");if(edit)openCollectionDialog(edit.dataset.editCollection)});
$("#materialLibrary").addEventListener("click",e=>{const favorite=e.target.closest("[data-toggle-favorite]");if(favorite){toggleFavorite(favorite.dataset.toggleFavorite);return}const open=e.target.closest("[data-open-resource]");if(open){useResource(open.dataset.openResource);return}const attach=e.target.closest("[data-attach-resource]");if(attach){openAttachDialog(attach.dataset.attachResource);return}const edit=e.target.closest("[data-edit-material]");if(edit){openMaterialDialogV2B(edit.dataset.editMaterial);return}});
$("#materialLibrary").addEventListener("change",e=>{const box=e.target.closest("[data-select-material]");if(!box)return;if(box.checked)selectedMaterialIds.add(box.dataset.selectMaterial);else selectedMaterialIds.delete(box.dataset.selectMaterial);renderLibrary()});
$("#duplicatesDialog").addEventListener("click",e=>{const b=e.target.closest("[data-merge-group]");if(!b)return;const ids=b.dataset.mergeGroup.split(",");const removed=mergeDuplicateGroup(ids,true);persistLibrary(`${removed} duplicate record${removed===1?"":"s"} merged`);renderDuplicateDialog()});
$("#recentMaterials").addEventListener("click",e=>{const b=e.target.closest("[data-dashboard-open-resource]");if(b)useResource(b.dataset.dashboardOpenResource)});

// After a library import, resolve imported collection names and preserve review status.
$("#confirmImportButton").addEventListener("click",()=>setTimeout(()=>{migrateLibraryData(false);resolveImportedCollectionNames(false);localStorage.setItem(STORAGE_KEY,JSON.stringify(data));renderAll()},0));

migrateLibraryData(true);
renderAll();
