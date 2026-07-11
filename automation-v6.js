"use strict";

const UNDO_AUTOMATION_KEY = "classroomUndoAutomationV4";
let automationTabV4 = "review";
let automationIssuesV4 = [];
let automationPreviewContextV4 = null;

viewMeta.automation = ["Preview and apply", "Automation"];

function ensureAutomationDataV4(save=false){
  if(!Array.isArray(data.automationRules))data.automationRules=[];
  if(!Array.isArray(data.automationRuns))data.automationRuns=[];
  data.automationRules=data.automationRules.map(x=>({
    ...x,id:x.id||crypto.randomUUID(),title:String(x.title||"Recurring lesson").trim(),active:x.active!==false,
    startDate:normalizeDate(x.startDate||toISODate(new Date())),endDate:normalizeDate(x.endDate||""),
    weekdays:Array.isArray(x.weekdays)&&x.weekdays.length?x.weekdays.map(Number):[1],time:normalizeTime(x.time||"09:00"),
    duration:Number(x.duration)||60,type:x.type||"Class",learner:x.learner||"",objective:x.objective||"",notes:x.notes||"",
    materialUrl:x.materialUrl||"",skipClosures:x.skipClosures!==false,closureBehavior:x.closureBehavior==="skip"?"skip":"move",
    createdAt:Number(x.createdAt)||Date.now(),updatedAt:Number(x.updatedAt)||Number(x.createdAt)||Date.now()
  }));
  data.automationRuns=data.automationRuns.map(x=>({...x,id:x.id||crypto.randomUUID(),createdAt:Number(x.createdAt)||Date.now(),count:Number(x.count)||0}));
  data.lessons=data.lessons.map(x=>({...x,status:x.status||"Planned"}));
  if(save)localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
}
function automationDateLabelV4(v){return v?parseLocalDate(v).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"}
function automationDateTimeLabelV4(v){return v?new Date(v).toLocaleString():"—"}
function automationClosureTextV4(e){return `${e.title||""} ${e.type||""} ${e.notes||""}`.toLowerCase()}
function isClosureEventV4(e){return /(closed|closure|no school|holiday|break|vacation|non[- ]instructional|school cancelled|school canceled|teacher workday|professional development day)/i.test(automationClosureTextV4(e))}
function dateInEventV4(date,e){const start=normalizeDate(e.date),end=normalizeDate(e.endDate||e.date);return start&&date>=start&&date<=end}
function closureForDateV4(date){return (data.calendarEvents||[]).find(e=>isClosureEventV4(e)&&dateInEventV4(date,e))||null}
function nextOpenDateV4(date){let d=parseLocalDate(date);for(let i=0;i<370;i++){d=addDays(d,1);const key=toISODate(d);if(!closureForDateV4(key))return key}return date}
function learnerPlanTargetNameV4(plan){const rec=plan.planType==="group"?(data.smallGroups||[]).find(x=>x.id===plan.targetId):(data.learners||[]).find(x=>x.id===plan.targetId);return rec?.name||plan.targetName||"Learner"}
function lessonHasMaterialsV4(x){return Boolean(String(x.materialUrl||"").trim()||(Array.isArray(x.materialIds)&&x.materialIds.length))}
function automationIssueKeyV4(type,id){return `${type}:${id}`}

function buildAutomationIssuesV4(){
  ensureAutomationDataV4();
  const today=toISODate(new Date()),soon=toISODate(addDays(new Date(),14));
  const issues=[];
  for(const lesson of data.lessons){
    const status=lesson.status||"Planned";
    if(status==="Cancelled")continue;
    const closure=closureForDateV4(lesson.date);
    if(closure&&status!=="Completed"){
      const proposed=nextOpenDateV4(lesson.date);
      issues.push({id:automationIssueKeyV4("closure",lesson.id),kind:"closure",selectable:true,severity:"high",lessonId:lesson.id,title:`${lesson.title} falls on a closed date`,detail:`${automationDateLabelV4(lesson.date)} · ${closure.title||closure.type||"School closure"}`,proposal:`Move to ${automationDateLabelV4(proposed)}`,targetDate:proposed});
      continue;
    }
    if(lesson.date<today&&status==="Planned"){
      const proposed=closureForDateV4(today)?nextOpenDateV4(today):today;
      issues.push({id:automationIssueKeyV4("overdue",lesson.id),kind:"overdue",selectable:true,severity:"medium",lessonId:lesson.id,title:`${lesson.title} is still planned in the past`,detail:`Scheduled ${automationDateLabelV4(lesson.date)}`,proposal:`Carry forward to ${automationDateLabelV4(proposed)}`,targetDate:proposed});
    }
    if(lesson.date>=today&&lesson.date<=soon&&status==="Planned"&&!lessonHasMaterialsV4(lesson)){
      issues.push({id:automationIssueKeyV4("materials",lesson.id),kind:"materials",selectable:false,severity:"low",lessonId:lesson.id,title:`${lesson.title} has no linked materials`,detail:`${automationDateLabelV4(lesson.date)} · ${lesson.learner||lesson.type}`,proposal:"Open the lesson or Library to attach a resource."});
    }
  }
  for(const plan of data.learnerPlans||[]){
    if(plan.status==="Completed"||!plan.nextDate||plan.nextDate>soon)continue;
    const target=learnerPlanTargetNameV4(plan);
    const already=data.lessons.some(x=>x.learner===target&&x.date>=today&&x.date<=soon&&x.learnerPlanId===plan.id);
    if(!already){
      const date=plan.nextDate<today?today:plan.nextDate;
      const proposed=closureForDateV4(date)?nextOpenDateV4(date):date;
      issues.push({id:automationIssueKeyV4("plan",plan.id),kind:"plan",selectable:true,severity:"medium",planId:plan.id,title:`${plan.title} is ready to schedule`,detail:`${target} · next date ${automationDateLabelV4(plan.nextDate)}`,proposal:`Add a session on ${automationDateLabelV4(proposed)}`,targetDate:proposed});
    }
  }
  for(const memory of data.teachingMemory||[]){
    if(memory.status!=="Needs follow-up"||!memory.reviewDate||memory.reviewDate>soon)continue;
    issues.push({id:automationIssueKeyV4("memory",memory.id),kind:"memory",selectable:false,severity:memory.reviewDate<=today?"high":"medium",memoryId:memory.id,title:`Teaching-memory follow-up for ${memoryTargetNameV5(memory)}`,detail:`${memory.category||"Memory"} · review ${automationDateLabelV4(memory.reviewDate)}`,proposal:memory.nextStep||"Open the memory and decide the next step."});
  }
  automationIssuesV4=issues;
  return issues;
}
function issueIconV4(kind){return kind==="closure"?"!":kind==="overdue"?"↪":kind==="plan"?"＋":kind==="memory"?"M":"○"}
function renderAutomationIssuesV4(){
  const box=$("#automationIssueList");if(!box)return;
  const selected=new Set($$("[data-automation-issue-check]:checked").map(x=>x.value));
  const issues=buildAutomationIssuesV4();
  box.innerHTML=issues.map(x=>`<article class="automation-issue-card severity-${x.severity}"><div class="automation-issue-icon">${issueIconV4(x.kind)}</div><div class="automation-issue-copy"><div class="automation-issue-title-row"><h4>${escapeHTML(x.title)}</h4><span class="automation-kind-pill">${escapeHTML(x.kind==="materials"?"Materials":x.kind==="plan"?"Learner plan":x.kind==="closure"?"Calendar conflict":x.kind==="memory"?"Teaching memory":"Carry forward")}</span></div><p>${escapeHTML(x.detail)}</p><strong>${escapeHTML(x.proposal)}</strong></div><div class="automation-issue-actions">${x.selectable?`<label class="automation-select"><input type="checkbox" data-automation-issue-check value="${x.id}" ${selected.has(x.id)?"checked":""}/><span>Select</span></label>`:x.kind==="memory"?`<button class="button button-secondary button-small" data-open-issue-memory="${x.memoryId}">Open memory</button>`:`<button class="button button-secondary button-small" data-open-issue-lesson="${x.lessonId}">Edit lesson</button>`}</div></article>`).join("")||'<div class="empty-state">No actions need review right now. Your workspace was not changed.</div>';
  updateAutomationApplyButtonV4();
}
function updateAutomationApplyButtonV4(){const b=$("#applyAutomationActionsButton");if(b)b.disabled=!$("[data-automation-issue-check]:checked");}
function takeAutomationSnapshotV4(label){localStorage.setItem(UNDO_AUTOMATION_KEY,JSON.stringify({label,createdAt:Date.now(),snapshot:structuredClone(data)}));}
function recordAutomationRunV4(type,count,summary){data.automationRuns.unshift({id:crypto.randomUUID(),type,count,summary,createdAt:Date.now()});data.automationRuns=data.automationRuns.slice(0,100);}
function persistAutomationV4(message,showUndo=true){localStorage.setItem(STORAGE_KEY,JSON.stringify(data));renderAll();showToast(message,showUndo?"Undo":"",showUndo?undoAutomationV4:null)}
function undoAutomationV4(){let u;try{u=JSON.parse(localStorage.getItem(UNDO_AUTOMATION_KEY)||"null")}catch{}if(!u?.snapshot){showToast("No automation to undo");return}data=normalizeData(u.snapshot);ensureAutomationDataV4();localStorage.setItem(STORAGE_KEY,JSON.stringify(data));localStorage.removeItem(UNDO_AUTOMATION_KEY);renderAll();showToast("Last automation undone")}
function applySelectedIssuesV4(){
  const ids=new Set($$("[data-automation-issue-check]:checked").map(x=>x.value));if(!ids.size)return;
  const selected=automationIssuesV4.filter(x=>ids.has(x.id)&&x.selectable);if(!selected.length)return;
  if(!confirm(`Apply ${selected.length} selected automation action${selected.length===1?"":"s"}? You can undo the entire run.`))return;
  takeAutomationSnapshotV4("Apply review actions");let count=0;
  for(const issue of selected){
    if(issue.kind==="closure"||issue.kind==="overdue"){
      const lesson=data.lessons.find(x=>x.id===issue.lessonId);if(lesson){lesson.date=issue.targetDate;lesson.automationUpdatedAt=Date.now();count++;}
    }else if(issue.kind==="plan"){
      const plan=data.learnerPlans.find(x=>x.id===issue.planId);if(!plan)continue;const target=learnerPlanTargetNameV4(plan);
      data.lessons.push({id:crypto.randomUUID(),title:plan.title,date:issue.targetDate,time:"09:00",duration:60,type:plan.planType==="group"?"Small-group session":"One-on-one",learner:target,objective:plan.goals||plan.focus||"",notes:plan.notes||"",materialUrl:"",materialIds:[],status:"Planned",learnerPlanId:plan.id,automationCreatedAt:Date.now()});count++;
    }
  }
  recordAutomationRunV4("review",count,`Applied ${count} reviewed action${count===1?"":"s"}`);persistAutomationV4(`${count} automation action${count===1?"":"s"} applied`);
}

function automationWeekdayLabelsV4(days){const names=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];return [...days].sort((a,b)=>((a+6)%7)-((b+6)%7)).map(d=>names[d]).join(", ")}
function openAutomationRuleDialogV4(id=null){
  ensureAutomationDataV4();const x=data.automationRules.find(r=>r.id===id);$("#automationRuleForm").reset();$("#automationRuleId").value=x?.id||"";$("#automationRuleDialogTitle").textContent=x?"Edit recurring rule":"Add recurring rule";$("#deleteAutomationRuleButton").classList.toggle("hidden",!x);$("#automationRuleStart").value=x?.startDate||toISODate(new Date());$("#automationRuleEnd").value=x?.endDate||"";$("#automationRuleTime").value=x?.time||"09:00";$("#automationRuleDuration").value=x?.duration||60;$("#automationRuleActive").checked=x?.active!==false;$("#automationRuleSkipClosures").checked=x?.skipClosures!==false;$("#automationRuleClosureBehavior").value=x?.closureBehavior||"move";
  $$("#automationWeekdayPicker input").forEach(cb=>cb.checked=(x?.weekdays||[1]).includes(Number(cb.value)));
  if(x){$("#automationRuleTitle").value=x.title;$("#automationRuleType").value=x.type;$("#automationRuleLearner").value=x.learner||"";$("#automationRuleObjective").value=x.objective||"";$("#automationRuleNotes").value=x.notes||"";$("#automationRuleMaterialUrl").value=x.materialUrl||""}
  $("#automationRuleDialog").showModal();
}
function saveAutomationRuleV4(e){
  e.preventDefault();const weekdays=$$("#automationWeekdayPicker input:checked").map(x=>Number(x.value));if(!weekdays.length){showToast("Choose at least one weekday");return}
  const id=$("#automationRuleId").value||crypto.randomUUID(),existing=data.automationRules.find(x=>x.id===id),rule={...(existing||{}),id,title:$("#automationRuleTitle").value.trim(),startDate:$("#automationRuleStart").value,endDate:$("#automationRuleEnd").value,weekdays,time:$("#automationRuleTime").value,duration:Number($("#automationRuleDuration").value),type:$("#automationRuleType").value,learner:$("#automationRuleLearner").value.trim(),objective:$("#automationRuleObjective").value.trim(),notes:$("#automationRuleNotes").value.trim(),materialUrl:$("#automationRuleMaterialUrl").value.trim(),skipClosures:$("#automationRuleSkipClosures").checked,closureBehavior:$("#automationRuleClosureBehavior").value,active:$("#automationRuleActive").checked,createdAt:existing?.createdAt||Date.now(),updatedAt:Date.now()};
  const i=data.automationRules.findIndex(x=>x.id===id);if(i>=0)data.automationRules[i]=rule;else data.automationRules.push(rule);$("#automationRuleDialog").close();localStorage.setItem(STORAGE_KEY,JSON.stringify(data));renderAll();showToast(i>=0?"Recurring rule updated":"Recurring rule added")
}
function deleteAutomationRuleV4(){const id=$("#automationRuleId").value;if(!id||!confirm("Delete this recurring rule? Existing generated lessons will remain."))return;takeAutomationSnapshotV4("Delete recurring rule");data.automationRules=data.automationRules.filter(x=>x.id!==id);$("#automationRuleDialog").close();recordAutomationRunV4("rule",1,"Deleted a recurring rule");persistAutomationV4("Recurring rule deleted")}
function toggleAutomationRuleV4(id){const r=data.automationRules.find(x=>x.id===id);if(!r)return;r.active=!r.active;r.updatedAt=Date.now();localStorage.setItem(STORAGE_KEY,JSON.stringify(data));renderAll();showToast(r.active?"Rule resumed":"Rule paused")}
function deleteRuleFromCardV4(id){openAutomationRuleDialogV4(id)}

function dateRangeV4(start,end){const arr=[];let d=parseLocalDate(start),last=parseLocalDate(end);while(d<=last&&arr.length<800){arr.push(toISODate(d));d=addDays(d,1)}return arr}
function buildRulePreviewV4(ruleIds,through){
  const today=toISODate(new Date()),items=[];const rules=data.automationRules.filter(r=>ruleIds.includes(r.id));
  for(const rule of rules){
    const start=rule.startDate>today?rule.startDate:today;const end=[through,rule.endDate||through].sort()[0];if(!start||!end||start>end)continue;
    for(const occurrenceDate of dateRangeV4(start,end)){
      if(!rule.weekdays.includes(parseLocalDate(occurrenceDate).getDay()))continue;
      const duplicate=data.lessons.some(x=>(x.automationRuleId===rule.id&&x.automationOccurrenceDate===occurrenceDate)||(x.date===occurrenceDate&&x.time===rule.time&&x.title.toLowerCase()===rule.title.toLowerCase()&&String(x.learner||"").toLowerCase()===String(rule.learner||"").toLowerCase()));
      if(duplicate){items.push({rule,occurrenceDate,targetDate:occurrenceDate,status:"duplicate",reason:"Already exists"});continue}
      const closure=rule.skipClosures?closureForDateV4(occurrenceDate):null;
      if(closure&&rule.closureBehavior==="skip"){items.push({rule,occurrenceDate,targetDate:occurrenceDate,status:"skipped",reason:closure.title||"Closed date"});continue}
      const targetDate=closure?nextOpenDateV4(occurrenceDate):occurrenceDate;
      const collision=data.lessons.some(x=>x.date===targetDate&&x.time===rule.time&&x.title.toLowerCase()===rule.title.toLowerCase()&&String(x.learner||"").toLowerCase()===String(rule.learner||"").toLowerCase());
      items.push({rule,occurrenceDate,targetDate,status:collision?"duplicate":"create",reason:closure?`Moved from ${automationDateLabelV4(occurrenceDate)} because ${closure.title||"date is closed"}`:""});
    }
  }
  return items;
}
function openAutomationPreviewV4(ruleIds){
  if(!ruleIds.length){showToast("No active recurring rules");return}
  automationPreviewContextV4={ruleIds};const through=toISODate(addDays(new Date(),56));$("#automationPreviewThrough").value=through;$("#automationPreviewTitle").textContent=ruleIds.length===1?"Review generated lessons":"Review all active rules";refreshAutomationPreviewV4();$("#automationPreviewDialog").showModal();
}
function refreshAutomationPreviewV4(){
  if(!automationPreviewContextV4)return;const through=$("#automationPreviewThrough").value||toISODate(addDays(new Date(),56));const items=buildRulePreviewV4(automationPreviewContextV4.ruleIds,through);automationPreviewContextV4={...automationPreviewContextV4,through,items};const create=items.filter(x=>x.status==="create"),skipped=items.filter(x=>x.status!=="create");$("#automationPreviewSubtitle").textContent=`Preview through ${automationDateLabelV4(through)}. Existing lessons are never overwritten.`;$("#automationPreviewList").innerHTML=items.map(x=>`<div class="automation-preview-row ${x.status}"><div><strong>${escapeHTML(x.rule.title)}</strong><span>${automationDateLabelV4(x.targetDate)} · ${formatTime(x.rule.time)} · ${escapeHTML(x.rule.learner||x.rule.type)}</span>${x.reason?`<small>${escapeHTML(x.reason)}</small>`:""}</div><span class="automation-preview-status">${x.status==="create"?"Will add":x.status==="skipped"?"Skipped":"Already exists"}</span></div>`).join("")||'<div class="empty-state compact">No matching dates in this range.</div>';$("#automationPreviewCount").textContent=`${create.length} to add · ${skipped.length} skipped`;$("#applyAutomationPreviewButton").disabled=!create.length;
}
function applyAutomationPreviewV4(){
  const items=automationPreviewContextV4?.items?.filter(x=>x.status==="create")||[];if(!items.length)return;if(!confirm(`Add ${items.length} generated lesson${items.length===1?"":"s"} to Weekly Planner?`))return;takeAutomationSnapshotV4("Generate recurring lessons");
  for(const x of items){const r=x.rule;data.lessons.push({id:crypto.randomUUID(),title:r.title,date:x.targetDate,time:r.time,duration:r.duration,type:r.type,learner:r.learner,objective:r.objective,notes:r.notes,materialUrl:r.materialUrl,materialIds:[],status:"Planned",automationRuleId:r.id,automationOccurrenceDate:x.occurrenceDate,automationCreatedAt:Date.now()})}
  recordAutomationRunV4("recurring",items.length,`Generated ${items.length} recurring lesson${items.length===1?"":"s"}`);$("#automationPreviewDialog").close();persistAutomationV4(`${items.length} recurring lesson${items.length===1?"":"s"} added`)
}

function renderAutomationRulesV4(){
  const box=$("#automationRuleList");if(!box)return;const rules=[...data.automationRules].sort((a,b)=>Number(b.active)-Number(a.active)||a.title.localeCompare(b.title));
  box.innerHTML=rules.map(r=>`<article class="automation-rule-card ${r.active?"":"paused"}"><div class="automation-rule-head"><div><span class="automation-rule-state">${r.active?"Active":"Paused"}</span><h4>${escapeHTML(r.title)}</h4><p>${escapeHTML(r.learner||r.type)}</p></div><button class="icon-button" data-edit-automation-rule="${r.id}" aria-label="Edit rule">✎</button></div><dl><div><dt>Schedule</dt><dd>${escapeHTML(automationWeekdayLabelsV4(r.weekdays))} · ${formatTime(r.time)}</dd></div><div><dt>Dates</dt><dd>${automationDateLabelV4(r.startDate)}${r.endDate?` – ${automationDateLabelV4(r.endDate)}`:" onward"}</dd></div><div><dt>Closures</dt><dd>${r.skipClosures?(r.closureBehavior==="skip"?"Skip":"Move forward"):"Ignore calendar"}</dd></div></dl><div class="automation-rule-actions"><button class="button button-secondary button-small" data-toggle-automation-rule="${r.id}">${r.active?"Pause":"Resume"}</button><button class="button button-primary button-small" data-preview-automation-rule="${r.id}">Preview 8 weeks</button></div></article>`).join("")||'<div class="empty-state">No recurring rules yet. Add one for a regular class, individual session, or small group.</div>';
}
function renderAutomationHistoryV4(){const box=$("#automationRunHistory");if(!box)return;box.innerHTML=(data.automationRuns||[]).slice(0,30).map(x=>`<div class="history-item"><div><strong>${escapeHTML(x.summary||"Automation run")}</strong><p>${escapeHTML(x.type||"automation")}</p></div><div><strong>${x.count||0}</strong><small> changes<br>${automationDateTimeLabelV4(x.createdAt)}</small></div></div>`).join("")||'<div class="empty-state compact">No automation runs yet.</div>'}
function renderAutomationTabsV4(){$$('[data-automation-tab]').forEach(b=>b.classList.toggle("active",b.dataset.automationTab===automationTabV4));$("#automationReviewPanel").classList.toggle("hidden",automationTabV4!=="review");$("#automationRulesPanel").classList.toggle("hidden",automationTabV4!=="rules");$("#automationHistoryPanel").classList.toggle("hidden",automationTabV4!=="history")}
function renderAutomationV4(){
  ensureAutomationDataV4();const issues=buildAutomationIssuesV4();const active=data.automationRules.filter(x=>x.active).length,missing=issues.filter(x=>x.kind==="materials").length,last=data.automationRuns[0]?.createdAt;$("#automationActiveRuleCount").textContent=active;$("#automationIssueCount").textContent=issues.filter(x=>x.kind!=="materials").length;$("#automationMissingMaterialCount").textContent=missing;$("#automationLastRun").textContent=last?new Date(last).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"—";$("#undoAutomationButton").disabled=!localStorage.getItem(UNDO_AUTOMATION_KEY);renderAutomationTabsV4();renderAutomationIssuesV4();renderAutomationRulesV4();renderAutomationHistoryV4();
}

$("#automationRuleForm").addEventListener("submit",saveAutomationRuleV4);
$("#deleteAutomationRuleButton").addEventListener("click",deleteAutomationRuleV4);
$("#addAutomationRuleButton").addEventListener("click",()=>openAutomationRuleDialogV4());
$("#addAutomationRuleButtonSecondary").addEventListener("click",()=>openAutomationRuleDialogV4());
$("#undoAutomationButton").addEventListener("click",undoAutomationV4);
$("#refreshAutomationButton").addEventListener("click",()=>{renderAutomationV4();showToast("Automation review refreshed")});
$("#applyAutomationActionsButton").addEventListener("click",applySelectedIssuesV4);
$("#selectAllAutomationActions").addEventListener("click",()=>{$$('[data-automation-issue-check]').forEach(x=>x.checked=true);updateAutomationApplyButtonV4()});
$("#automationIssueList").addEventListener("change",e=>{if(e.target.matches('[data-automation-issue-check]'))updateAutomationApplyButtonV4()});
$("#automationIssueList").addEventListener("click",e=>{const m=e.target.closest('[data-open-issue-memory]');if(m){openTeachingMemoryViewV5();return openTeachingMemoryDialogV5(m.dataset.openIssueMemory)}const b=e.target.closest('[data-open-issue-lesson]');if(b)openLessonDialog(b.dataset.openIssueLesson)});
$$('[data-automation-tab]').forEach(b=>b.addEventListener("click",()=>{automationTabV4=b.dataset.automationTab;renderAutomationTabsV4()}));
$("#automationRuleList").addEventListener("click",e=>{const edit=e.target.closest('[data-edit-automation-rule]');if(edit)return openAutomationRuleDialogV4(edit.dataset.editAutomationRule);const toggle=e.target.closest('[data-toggle-automation-rule]');if(toggle)return toggleAutomationRuleV4(toggle.dataset.toggleAutomationRule);const preview=e.target.closest('[data-preview-automation-rule]');if(preview)return openAutomationPreviewV4([preview.dataset.previewAutomationRule])});
$("#runActiveRulesButton").addEventListener("click",()=>openAutomationPreviewV4(data.automationRules.filter(x=>x.active).map(x=>x.id)));
$("#refreshAutomationPreviewButton").addEventListener("click",refreshAutomationPreviewV4);
$("#automationPreviewThrough").addEventListener("change",refreshAutomationPreviewV4);
$("#applyAutomationPreviewButton").addEventListener("click",applyAutomationPreviewV4);

ensureAutomationDataV4(true);
renderAutomationV4();
