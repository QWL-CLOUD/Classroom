"use strict";

let learnerTabV3C="individuals";
let planTabV3C="individual";

function textMatchV3C(value,query){return String(value||"").toLowerCase().includes(String(query||"").toLowerCase().trim())}
function dateLabelV3C(value){if(!value)return"No next date";try{return parseLocalDate(value).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}catch{return value}}
function learnerByIdV3C(id){return (data.learners||[]).find(x=>x.id===id)}
function groupByIdV3C(id){return (data.smallGroups||[]).find(x=>x.id===id)}
function planTargetV3C(plan){return plan.planType==="group"?groupByIdV3C(plan.targetId):learnerByIdV3C(plan.targetId)}
function saveWorkspaceV3C(message){localStorage.setItem(STORAGE_KEY,JSON.stringify(data));renderAll();showToast(message)}

function renderLearnerWorkspaceV3C(){
 if(!Array.isArray(data.learners))data.learners=[];
 if(!Array.isArray(data.smallGroups))data.smallGroups=[];
 if(!Array.isArray(data.learnerPlans))data.learnerPlans=[];
 const individualCount=$("#individualCount"),smallGroupCount=$("#smallGroupCount"),activePlanCount=$("#activePlanCount"),memoryCount=$("#learnerMemoryCount");
 if(individualCount)individualCount.textContent=data.learners.length;
 if(smallGroupCount)smallGroupCount.textContent=data.smallGroups.length;
 if(activePlanCount)activePlanCount.textContent=data.learnerPlans.filter(x=>x.status!=="Completed").length;
 if(memoryCount)memoryCount.textContent=(data.teachingMemory||[]).length;
 renderLearnerTabsV3C();renderLearnerListV3C();renderPlanTabsV3C();renderPlanListV3C();
 const banner=$("#legacyMigrationBanner");if(banner)banner.classList.toggle("hidden",!(Number(data._legacyPlansMigrated)>0&&!localStorage.getItem("classroomLegacyMigrationDismissedV3C")));
}
function renderLearnerTabsV3C(){
 $$('[data-learner-tab]').forEach(b=>b.classList.toggle("active",b.dataset.learnerTab===learnerTabV3C));
}
function renderPlanTabsV3C(){
 $$('[data-plan-tab]').forEach(b=>b.classList.toggle("active",b.dataset.planTab===planTabV3C));
}
function renderLearnerListV3C(){
 const target=$("#learnerWorkspaceList");if(!target)return;
 const q=$("#learnerSearchInput")?.value||"";
 if(learnerTabV3C==="individuals"){
   const list=data.learners.filter(x=>textMatchV3C(`${x.name} ${x.grade} ${x.group} ${x.goals} ${x.interests} ${x.notes}`,q)).sort((a,b)=>a.name.localeCompare(b.name));
   $("#learnerResultCount").textContent=`${list.length} individual${list.length===1?"":"s"}`;
   target.innerHTML=list.map(x=>{const plans=data.learnerPlans.filter(p=>p.planType==="individual"&&p.targetId===x.id&&p.status!=="Completed").length;return`<article class="learner-card"><div class="learner-card-heading"><div class="learner-avatar">${escapeHTML(x.name.slice(0,1).toUpperCase())}</div><div><span class="eyebrow">${escapeHTML(x.grade||"Individual learner")}</span><h4>${escapeHTML(x.name)}</h4><p>${escapeHTML(x.group||"No current group")}</p></div><button class="icon-button" data-edit-individual="${x.id}" aria-label="Edit ${escapeHTML(x.name)}">✎</button></div><div class="learner-card-body"><div><span>Goals</span><p>${escapeHTML(x.goals||"No goals added yet.")}</p></div><div><span>Interests / notes</span><p>${escapeHTML(x.interests||x.notes||"No notes added yet.")}</p></div></div><div class="learner-card-footer"><span>${plans} active plan${plans===1?"":"s"}</span><button class="text-button" data-plan-for-individual="${x.id}">Create plan</button></div></article>`}).join("")||'<div class="empty-state">No individuals yet. Add only the learners who need focused tracking or planning.</div>';
 }else{
   const list=data.smallGroups.filter(x=>textMatchV3C(`${x.name} ${x.focus} ${x.cadence} ${x.notes}`,q)).sort((a,b)=>a.name.localeCompare(b.name));
   $("#learnerResultCount").textContent=`${list.length} small group${list.length===1?"":"s"}`;
   target.innerHTML=list.map(x=>{const members=(x.memberIds||[]).map(learnerByIdV3C).filter(Boolean),plans=data.learnerPlans.filter(p=>p.planType==="group"&&p.targetId===x.id&&p.status!=="Completed").length;return`<article class="learner-card group-card"><div class="learner-card-heading"><div class="learner-avatar group-avatar">G</div><div><span class="eyebrow">Small group</span><h4>${escapeHTML(x.name)}</h4><p>${escapeHTML(x.focus||"No focus added")}</p></div><button class="icon-button" data-edit-group="${x.id}" aria-label="Edit ${escapeHTML(x.name)}">✎</button></div><div class="member-chip-row">${members.map(m=>`<span class="member-chip">${escapeHTML(m.name)}</span>`).join("")||'<span class="member-chip muted">No members selected</span>'}</div><div class="learner-card-body"><div><span>Cadence</span><p>${escapeHTML(x.cadence||"Not specified")}</p></div><div><span>Notes</span><p>${escapeHTML(x.notes||"No notes added yet.")}</p></div></div><div class="learner-card-footer"><span>${plans} active plan${plans===1?"":"s"}</span><button class="text-button" data-plan-for-group="${x.id}">Create plan</button></div></article>`}).join("")||'<div class="empty-state">No small groups yet. Whole classes remain in Weekly Planner.</div>';
 }
}
function renderPlanListV3C(){
 const target=$("#learnerPlanList");if(!target)return;
 const q=$("#planSearchInput")?.value||"",status=$("#planStatusFilter")?.value||"all";
 const list=data.learnerPlans.filter(x=>x.planType===planTabV3C).filter(x=>status==="all"||x.status===status).filter(x=>{const t=planTargetV3C(x);return textMatchV3C(`${x.title} ${x.targetName} ${t?.name} ${x.focus} ${x.goals} ${x.cadence} ${x.notes} ${x.tags}`,q)}).sort((a,b)=>(a.status==="Completed")-(b.status==="Completed")||String(a.nextDate||"9999").localeCompare(String(b.nextDate||"9999")));
 $("#planResultCount").textContent=`${list.length} plan${list.length===1?"":"s"}`;
 target.innerHTML=list.map(x=>{const targetRecord=planTargetV3C(x),name=targetRecord?.name||x.targetName||"Unassigned";return`<article class="learner-plan-card"><div class="plan-status-row"><span class="plan-type-pill">${x.planType==="group"?"Small-Group Plan":"Individual Plan"}</span><span class="plan-status ${String(x.status).toLowerCase()}">${escapeHTML(x.status)}</span></div><h4>${escapeHTML(x.title)}</h4><p class="plan-target">${escapeHTML(name)}</p><dl><div><dt>Focus</dt><dd>${escapeHTML(x.focus||"Not specified")}</dd></div><div><dt>Goals</dt><dd>${escapeHTML(x.goals||"No goals added yet.")}</dd></div><div><dt>Next</dt><dd>${escapeHTML(dateLabelV3C(x.nextDate))}${x.cadence?` · ${escapeHTML(x.cadence)}`:""}</dd></div></dl><div class="tag-row">${String(x.tags||"").split(",").map(v=>v.trim()).filter(Boolean).map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join("")}</div><div class="learner-card-footer"><span>${x.legacyLessonId?"Migrated session":"Local plan"}</span><div><button class="mini-button" data-schedule-plan="${x.id}">Schedule</button><button class="mini-button" data-edit-plan="${x.id}">Edit</button></div></div></article>`}).join("")||`<div class="empty-state">No ${planTabV3C==="group"?"small-group":"individual"} plans match these filters.</div>`;
}

function openIndividualDialogV3C(id=null){
 const x=data.learners.find(v=>v.id===id);$("#individualForm").reset();$("#individualId").value=x?.id||"";$("#individualDialogTitle").textContent=x?"Edit individual":"Add individual";$("#deleteIndividualButton").classList.toggle("hidden",!x);if(x){$("#individualName").value=x.name||"";$("#individualGrade").value=x.grade||"";$("#individualGroup").value=x.group||"";$("#individualGoals").value=x.goals||"";$("#individualInterests").value=x.interests||"";$("#individualNotes").value=x.notes||""}$("#individualDialog").showModal();
}
function openSmallGroupDialogV3C(id=null){
 const x=data.smallGroups.find(v=>v.id===id);$("#smallGroupForm").reset();$("#smallGroupId").value=x?.id||"";$("#smallGroupDialogTitle").textContent=x?"Edit small group":"Add small group";$("#deleteSmallGroupButton").classList.toggle("hidden",!x);if(x){$("#smallGroupName").value=x.name||"";$("#smallGroupFocus").value=x.focus||"";$("#smallGroupCadence").value=x.cadence||"";$("#smallGroupNotes").value=x.notes||""}renderMemberPickerV3C(x?.memberIds||[]);$("#smallGroupDialog").showModal();
}
function renderMemberPickerV3C(selected=[]){const chosen=new Set(selected);$("#groupMemberPicker").innerHTML=data.learners.map(x=>`<label class="member-option"><input type="checkbox" value="${x.id}" ${chosen.has(x.id)?"checked":""}/><span>${escapeHTML(x.name)}<small>${escapeHTML(x.grade||x.group||"")}</small></span></label>`).join("")||'<div class="empty-state compact">Add individuals before selecting group members.</div>'}
function populatePlanTargetsV3C(type,selected=""){
 const select=$("#learnerPlanTarget"),items=type==="group"?data.smallGroups:data.learners;select.innerHTML='<option value="">Select…</option>'+items.map(x=>`<option value="${x.id}" ${x.id===selected?"selected":""}>${escapeHTML(x.name)}</option>`).join("");
}
function openLearnerPlanDialogV3C(id=null,presetType="individual",targetId=""){
 const x=data.learnerPlans.find(v=>v.id===id);$("#learnerPlanForm").reset();const type=x?.planType||presetType;$("#learnerPlanId").value=x?.id||"";$("#learnerPlanType").value=type;populatePlanTargetsV3C(type,x?.targetId||targetId);$("#learnerPlanDialogTitle").textContent=x?"Edit learner plan":type==="group"?"Add small-group plan":"Add individual plan";$("#deleteLearnerPlanButton").classList.toggle("hidden",!x);$("#scheduleLearnerPlanButton").classList.toggle("hidden",!x);if(x){$("#learnerPlanTitle").value=x.title||"";$("#learnerPlanStatus").value=x.status||"Active";$("#learnerPlanNextDate").value=x.nextDate||"";$("#learnerPlanFocus").value=x.focus||"";$("#learnerPlanCadence").value=x.cadence||"";$("#learnerPlanGoals").value=x.goals||"";$("#learnerPlanNotes").value=x.notes||"";$("#learnerPlanTags").value=x.tags||""}$("#learnerPlanDialog").showModal();
}
function schedulePlanV3C(id){
 const p=data.learnerPlans.find(x=>x.id===id);if(!p)return;const target=planTargetV3C(p);$("#learnerPlanDialog").close();openLessonDialog(null,p.planType==="group"?"Small-group session":"One-on-one");$("#lessonTitle").value=p.title;$("#lessonLearner").value=target?.name||p.targetName||"";$("#lessonObjective").value=p.goals||"";$("#lessonNotes").value=p.notes||"";if(p.nextDate)$("#lessonDate").value=p.nextDate;
}

$("#addIndividualButton").addEventListener("click",()=>openIndividualDialogV3C());
$("#addSmallGroupButton").addEventListener("click",()=>openSmallGroupDialogV3C());
$("#addIndividualPlanButton").addEventListener("click",()=>openLearnerPlanDialogV3C(null,"individual"));
$("#addGroupPlanButton").addEventListener("click",()=>openLearnerPlanDialogV3C(null,"group"));
$$('[data-learner-tab]').forEach(b=>b.addEventListener("click",()=>{learnerTabV3C=b.dataset.learnerTab;renderLearnerTabsV3C();renderLearnerListV3C()}));
$$('[data-plan-tab]').forEach(b=>b.addEventListener("click",()=>{planTabV3C=b.dataset.planTab;renderPlanTabsV3C();renderPlanListV3C()}));
$("#learnerSearchInput").addEventListener("input",renderLearnerListV3C);
$("#planSearchInput").addEventListener("input",renderPlanListV3C);
$("#planStatusFilter").addEventListener("change",renderPlanListV3C);
$("#dismissMigrationBanner").addEventListener("click",()=>{localStorage.setItem("classroomLegacyMigrationDismissedV3C","1");$("#legacyMigrationBanner").classList.add("hidden")});

$("#learnerWorkspaceList").addEventListener("click",e=>{const a=e.target.closest("[data-edit-individual]");if(a)return openIndividualDialogV3C(a.dataset.editIndividual);const g=e.target.closest("[data-edit-group]");if(g)return openSmallGroupDialogV3C(g.dataset.editGroup);const pi=e.target.closest("[data-plan-for-individual]");if(pi){planTabV3C="individual";switchView("learnerPlanning");renderPlanTabsV3C();return openLearnerPlanDialogV3C(null,"individual",pi.dataset.planForIndividual)}const pg=e.target.closest("[data-plan-for-group]");if(pg){planTabV3C="group";switchView("learnerPlanning");renderPlanTabsV3C();return openLearnerPlanDialogV3C(null,"group",pg.dataset.planForGroup)}});
$("#learnerPlanList").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-plan]");if(edit)return openLearnerPlanDialogV3C(edit.dataset.editPlan);const schedule=e.target.closest("[data-schedule-plan]");if(schedule)return schedulePlanV3C(schedule.dataset.schedulePlan)});

$("#individualForm").addEventListener("submit",e=>{e.preventDefault();const id=$("#individualId").value||crypto.randomUUID(),existing=data.learners.find(x=>x.id===id),record={id,name:$("#individualName").value.trim(),grade:$("#individualGrade").value.trim(),group:$("#individualGroup").value.trim(),goals:$("#individualGoals").value.trim(),interests:$("#individualInterests").value.trim(),notes:$("#individualNotes").value.trim(),createdAt:existing?.createdAt||Date.now(),updatedAt:Date.now()};const i=data.learners.findIndex(x=>x.id===id);if(i>=0)data.learners[i]=record;else data.learners.push(record);data.learnerPlans.forEach(p=>{if(p.planType==="individual"&&p.targetId===id)p.targetName=record.name});$("#individualDialog").close();saveWorkspaceV3C(i>=0?"Individual updated":"Individual added")});
$("#deleteIndividualButton").addEventListener("click",()=>{const id=$("#individualId").value;if(!id||!confirm("Delete this individual? Existing plans will remain but become unassigned."))return;data.learners=data.learners.filter(x=>x.id!==id);data.smallGroups=data.smallGroups.map(g=>({...g,memberIds:(g.memberIds||[]).filter(v=>v!==id)}));$("#individualDialog").close();saveWorkspaceV3C("Individual deleted")});
$("#smallGroupForm").addEventListener("submit",e=>{e.preventDefault();const id=$("#smallGroupId").value||crypto.randomUUID(),existing=data.smallGroups.find(x=>x.id===id),record={id,name:$("#smallGroupName").value.trim(),focus:$("#smallGroupFocus").value.trim(),cadence:$("#smallGroupCadence").value.trim(),memberIds:$$('#groupMemberPicker input:checked').map(x=>x.value),notes:$("#smallGroupNotes").value.trim(),createdAt:existing?.createdAt||Date.now(),updatedAt:Date.now()};const i=data.smallGroups.findIndex(x=>x.id===id);if(i>=0)data.smallGroups[i]=record;else data.smallGroups.push(record);data.learnerPlans.forEach(p=>{if(p.planType==="group"&&p.targetId===id)p.targetName=record.name});$("#smallGroupDialog").close();saveWorkspaceV3C(i>=0?"Small group updated":"Small group added")});
$("#deleteSmallGroupButton").addEventListener("click",()=>{const id=$("#smallGroupId").value;if(!id||!confirm("Delete this small group? Existing plans will remain but become unassigned."))return;data.smallGroups=data.smallGroups.filter(x=>x.id!==id);$("#smallGroupDialog").close();saveWorkspaceV3C("Small group deleted")});
$("#learnerPlanType").addEventListener("change",e=>populatePlanTargetsV3C(e.target.value));
$("#learnerPlanForm").addEventListener("submit",e=>{e.preventDefault();const id=$("#learnerPlanId").value||crypto.randomUUID(),type=$("#learnerPlanType").value,targetId=$("#learnerPlanTarget").value,target=type==="group"?groupByIdV3C(targetId):learnerByIdV3C(targetId),existing=data.learnerPlans.find(x=>x.id===id),record={id,planType:type,targetId,targetName:target?.name||existing?.targetName||"",title:$("#learnerPlanTitle").value.trim(),status:$("#learnerPlanStatus").value,focus:$("#learnerPlanFocus").value.trim(),goals:$("#learnerPlanGoals").value.trim(),cadence:$("#learnerPlanCadence").value.trim(),nextDate:$("#learnerPlanNextDate").value,notes:$("#learnerPlanNotes").value.trim(),tags:$("#learnerPlanTags").value.trim(),legacyLessonId:existing?.legacyLessonId||"",createdAt:existing?.createdAt||Date.now(),updatedAt:Date.now()};const i=data.learnerPlans.findIndex(x=>x.id===id);if(i>=0)data.learnerPlans[i]=record;else data.learnerPlans.push(record);$("#learnerPlanDialog").close();planTabV3C=type;saveWorkspaceV3C(i>=0?"Learner plan updated":"Learner plan added")});
$("#deleteLearnerPlanButton").addEventListener("click",()=>{const id=$("#learnerPlanId").value;if(!id||!confirm("Delete this learner plan?"))return;data.learnerPlans=data.learnerPlans.filter(x=>x.id!==id);$("#learnerPlanDialog").close();saveWorkspaceV3C("Learner plan deleted")});
$("#scheduleLearnerPlanButton").addEventListener("click",()=>schedulePlanV3C($("#learnerPlanId").value));

renderLearnerWorkspaceV3C();
