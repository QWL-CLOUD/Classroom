(() => {
  'use strict';

  const VERSION = '19.4.4';
  const KEYS = {
    templates: 'cos-planning-templates-v19',
    notices: 'cos-learner-notices-v19',
    lessons: 'cos-lessons',
    schedule: 'cos-schedule-blocks',
    tasks: 'cos-tasks',
    students: 'cos-students',
    groups: 'cos-groups',
    classes: 'cos-classes'
  };

  const DEFAULT_FORMATS = ['Full Lesson', 'Mini Lesson', 'Workshop', 'Routine', 'Other'];
  const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const nowISO = () => new Date().toISOString();
  const dateISO = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const validDate = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return false;
    const d = new Date(Number(match[1]), Number(match[2])-1, Number(match[3]), 12);
    return d.getFullYear() === Number(match[1]) && d.getMonth() === Number(match[2])-1 && d.getDate() === Number(match[3]);
  };
  const id = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

  let maintenanceQueued = false;
  let supportMode = null;
  let supportFilter = 'active';
  let draggedFlowId = '';
  let draggedEditor = null;

  function diagnostics() { return window.ClassroomV19Diagnostics || {}; }
  function read(key, fallback = []) {
    try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); }
    catch { return fallback; }
  }
  function dispatchDataChange(key, oldValue, newValue) {
    try { window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage, url: location.href })); }
    catch { window.dispatchEvent(new CustomEvent('storage', { detail: { key, oldValue, newValue } })); }
    window.dispatchEvent(new CustomEvent('classroom:v19-data-change', { detail: { key, oldValue, newValue } }));
  }
  function write(key, value, label = 'Workflow change') {
    const oldValue = localStorage.getItem(key);
    const newValue = JSON.stringify(value);
    if (oldValue === newValue) return false;
    window.ClassroomV19History?.begin?.(label);
    localStorage.setItem(key, newValue);
    window.ClassroomV19History?.finalize?.();
    dispatchDataChange(key, oldValue, newValue);
    return true;
  }
  function normalize(value) {
    return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }
  function meaningfulWords(value) {
    const stop = new Set(['block','class','lesson','session','period','planned','ready','needs','plan','teaching']);
    return normalize(value).split(' ').filter((word) => word.length > 1 && !stop.has(word));
  }
  function sameBlockName(first, second) {
    if (diagnostics().namesRepresentSameBlock) return diagnostics().namesRepresentSameBlock(first, second);
    const a = meaningfulWords(first), b = meaningfulWords(second);
    if (!a.length || !b.length) return false;
    const bs = new Set(b);
    const shared = a.filter((word) => bs.has(word)).length;
    return shared >= Math.min(new Set(a).size, new Set(b).size) && shared >= 1;
  }
  function scheduleBlocks() { return read(KEYS.schedule, []); }
  function blockName(block) { return block?.name || block?.title || block?.label || block?.block || ''; }
  function blockParentId(block) { return String(block?.parentId || block?.parentBlockId || ''); }
  function blockById(blockId) { return scheduleBlocks().find((block) => String(block.id) === String(blockId)) || null; }
  function parentBlockFor(blockOrId) {
    const block = typeof blockOrId === 'object' ? blockOrId : blockById(blockOrId);
    if (!block) return null;
    const parentId = blockParentId(block);
    return parentId ? blockById(parentId) || block : block;
  }
  function topLevelBlocks() {
    const blocks = scheduleBlocks();
    const ids = new Set(blocks.map((block) => String(block.id || '')));
    return blocks.filter((block) => !blockParentId(block) || !ids.has(blockParentId(block)));
  }
  function toMinutes(value) {
    if (Number.isFinite(Number(value))) return Number(value);
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
    return match ? Number(match[1])*60 + Number(match[2]) : NaN;
  }
  function cardTimeRange(card) {
    const value = text(card.querySelector('.v19-week-card-time, .workspace-item-time'));
    const match = value.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
    return match ? { start:Number(match[1])*60+Number(match[2]), end:Number(match[3])*60+Number(match[4]) } : null;
  }
  function weekdayForDate(value) {
    if (!validDate(value)) return '';
    return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { weekday:'long' });
  }
  function cardTitle(card) { return text(card.querySelector(':scope > .workspace-item-main > strong, :scope > .v19-week-card-main > strong')); }
  function cardSubtitle(card) { return text(card.querySelector(':scope > .workspace-item-main > span:not(.workspace-item-time):not(.status-chip), :scope > .v19-week-card-main > span:not(.workspace-item-time):not(.status-chip)')); }
  const WEEKDAY_INDEX = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
  function weekdayIndex(value) {
    const token = normalize(value).slice(0,3);
    return Object.prototype.hasOwnProperty.call(WEEKDAY_INDEX, token) ? WEEKDAY_INDEX[token] : -1;
  }
  function blockDaySet(block) {
    const blockId = String(block?.id || '').toUpperCase();
    if (/^MT[-_]/.test(blockId)) return new Set([1,2,3,4]);
    if (/^FR[-_]/.test(blockId)) return new Set([5]);
    if (/^MWF[-_]/.test(blockId)) return new Set([1,3,5]);
    if (/^(TTH|TUTH)[-_]/.test(blockId)) return new Set([2,4]);

    const fields = [block?.days, block?.weekdays, block?.repeatDays, block?.day, block?.weekday, block?.dayName]
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .filter((value) => value !== undefined && value !== null && String(value).trim());
    const out = new Set();
    const aliases = '(?:sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)';
    fields.forEach((field) => {
      const raw = String(field).toLowerCase().replace(/[–—]/g, '-').replace(/\./g, ' ');
      const rangePattern = new RegExp(`(${aliases})\s*-\s*(${aliases})`, 'g');
      let match;
      while ((match = rangePattern.exec(raw))) {
        const start = weekdayIndex(match[1]);
        const end = weekdayIndex(match[2]);
        if (start >= 0 && end >= 0) {
          let cursor = start;
          out.add(cursor);
          while (cursor !== end) { cursor = (cursor + 1) % 7; out.add(cursor); if (out.size >= 7) break; }
        }
      }
      const tokenPattern = new RegExp(aliases, 'g');
      while ((match = tokenPattern.exec(raw))) {
        const index = weekdayIndex(match[0]);
        if (index >= 0) out.add(index);
      }
      if (/\bm\s*-\s*th\b/.test(raw) || /monday\s+through\s+thursday/.test(raw)) [1,2,3,4].forEach((day) => out.add(day));
      if (/\bt\s*(?:\/|&|and)\s*th\b/.test(raw)) [2,4].forEach((day) => out.add(day));
    });
    return out;
  }
  function blockAppliesToWeekday(block, weekday) {
    const index = weekdayIndex(weekday);
    const days = blockDaySet(block);
    return index < 0 || !days.size || days.has(index);
  }
  function blockMatchesCard(block, card) {
    const date = card.dataset.v19StableDate || card.dataset.date || card.dataset.v19CardDate || '';
    const weekday = weekdayForDate(date);
    if (weekday && !blockAppliesToWeekday(block, weekday)) return false;
    const range = cardTimeRange(card);
    const start = toMinutes(block.start ?? block.startTime);
    const end = toMinutes(block.end ?? block.endTime);
    if (range && Number.isFinite(start) && Math.abs(range.start-start) > 1) return false;
    if (range && Number.isFinite(end) && Math.abs(range.end-end) > 1) return false;
    const names = [cardTitle(card), cardSubtitle(card)].filter(Boolean);
    return names.some((name) => sameBlockName(blockName(block), name));
  }
  function stableBlockForCard(card) {
    const existing = card.dataset.scheduleBlockId || card.dataset.blockId || card.querySelector('[data-schedule-block-id]')?.dataset.scheduleBlockId || '';
    if (existing && blockById(existing)) return blockById(existing);
    const lesson = diagnostics().lessonForBumpCard?.(card);
    if (lesson?.scheduleBlockId && blockById(lesson.scheduleBlockId)) return blockById(lesson.scheduleBlockId);
    const blocks = scheduleBlocks();
    let candidates = blocks.filter((block) => !blockParentId(block) && blockMatchesCard(block, card));
    if (candidates.length !== 1) candidates = blocks.filter((block) => blockMatchesCard(block, card));
    return candidates.length === 1 ? candidates[0] : null;
  }
  function decorateStableBlockLinks() {
    const cards = diagnostics().weekCards?.() || [...document.querySelectorAll('.week-workspace .v19-week-card')];
    let updatedLessons = false;
    const lessons = read(KEYS.lessons, []);
    cards.forEach((card) => {
      const block = stableBlockForCard(card);
      if (!block) return;
      card.dataset.scheduleBlockId = String(block.id);
      const parent = parentBlockFor(block);
      if (parent?.id) card.dataset.parentBlockId = String(parent.id);
      const lesson = diagnostics().lessonForBumpCard?.(card);
      if (lesson && (!lesson.scheduleBlockId || String(lesson.scheduleBlockId) !== String(block.id))) {
        const record = lessons.find((item) => String(item.id) === String(lesson.id));
        if (record) {
          record.scheduleBlockId = block.id;
          record.parentBlockId = parent?.id || block.id;
          record.updatedAt = nowISO();
          updatedLessons = true;
        }
      }
      diagnostics().reconcileWeekCardActions?.(card);
    });
    if (updatedLessons) write(KEYS.lessons, lessons, 'Repair stable Schedule Block links');
  }

  function installPlanTargetBridge() {
    if (document.documentElement.dataset.v194PlanBridge) return;
    document.documentElement.dataset.v194PlanBridge = 'true';
    document.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('[data-v19-create-plan]');
      if (!button) return;
      const card = button.closest('.v19-week-card, .schedule-week-item, .schedule-tree-card');
      const block = card ? stableBlockForCard(card) : null;
      const date = card?.dataset.v19StableDate || card?.dataset.date || card?.dataset.v19CardDate || '';
      if (!block || !validDate(date)) return;
      const parent = parentBlockFor(block);
      sessionStorage.setItem('classroom-v19-plan-target', JSON.stringify({
        date, scheduleBlockId:block.id, parentBlockId:parent?.id || block.id,
        title:cardTitle(card), storedAt:Date.now()
      }));
    }, true);
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !/Save planning record|Save lesson|Update planning record/i.test(text(button))) return;
      let target = null;
      try { target = JSON.parse(sessionStorage.getItem('classroom-v19-plan-target') || 'null'); } catch { target = null; }
      if (!target || Date.now()-Number(target.storedAt||0) > 20*60*1000) return;
      const before = new Set(read(KEYS.lessons, []).map((lesson) => String(lesson.id)));
      window.setTimeout(() => {
        const lessons = read(KEYS.lessons, []);
        const candidates = lessons.filter((lesson) => lesson.date === target.date && (!before.has(String(lesson.id)) || !lesson.scheduleBlockId));
        const record = candidates.sort((a,b) => String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0];
        if (!record) return;
        record.scheduleBlockId = target.scheduleBlockId;
        record.parentBlockId = target.parentBlockId;
        record.updatedAt = nowISO();
        write(KEYS.lessons, lessons, 'Attach lesson to Schedule Block');
        sessionStorage.removeItem('classroom-v19-plan-target');
      }, 700);
    }, true);
  }

  function cloneFlowBlocks(blocks) {
    const normalized = diagnostics().normalizeFlowBlocks?.(blocks || []) || blocks || [];
    const map = new Map(normalized.map((block) => [String(block.id), id('flow')]));
    return normalized.map((block, index) => ({
      ...JSON.parse(JSON.stringify(block)),
      id: map.get(String(block.id)),
      parentId: block.parentId ? (map.get(String(block.parentId)) || '') : '',
      order: index
    }));
  }
  function templates() { return read(KEYS.templates, []); }
  function saveTemplates(items, label='Update planning templates') { write(KEYS.templates, items, label); }
  function editorParentBlockId(editor) {
    const lesson = diagnostics().resolveEditorLesson?.(editor);
    const target = (() => { try { return JSON.parse(sessionStorage.getItem('classroom-v19-plan-target') || 'null'); } catch { return null; } })();
    const blockId = lesson?.scheduleBlockId || target?.scheduleBlockId || '';
    return parentBlockFor(blockId)?.id || '';
  }
  function flowMinutes(blocks) { return blocks.reduce((sum, block) => sum + (Number.parseInt(block.duration,10) || 0), 0); }
  function templateParentOptions(selected='') {
    return topLevelBlocks().map((block) => `<option value="${esc(block.id)}" ${String(selected)===String(block.id)?'selected':''}>${esc(blockName(block))}</option>`).join('');
  }
  function openModal(content, className='') {
    document.querySelector('.v194-modal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = `v19-modal-backdrop v19-modal-overlay v194-modal-overlay ${className}`;
    overlay.innerHTML = `<div class="v19-modal v194-modal">${content}</div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-v194-close]').forEach((button) => button.addEventListener('click', close));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    return { overlay, close };
  }
  function showToast(message) {
    if (typeof window.ClassroomV19WorkflowToast === 'function') return window.ClassroomV19WorkflowToast(message);
    document.querySelector('.v194-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'v19-toast v194-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4500);
  }
  function openSaveTemplate(editor) {
    const state = editor?._v19FlowState;
    if (!state) return;
    const parentId = editorParentBlockId(editor);
    const formats = [...new Set([...DEFAULT_FORMATS, ...templates().map((item) => item.format).filter(Boolean)])];
    const { overlay, close } = openModal(`
      <div class="v19-modal-heading"><div><span class="v19-eyebrow">PLANNING TEMPLATE</span><h2>Save this lesson flow as a template</h2><p>The template keeps the reusable structure, not the date, learner, status, or reflection.</p></div><button class="v19-modal-close" data-v194-close aria-label="Close">×</button></div>
      <form data-v194-template-form class="v194-form-grid">
        <label class="wide"><span>Template name</span><input name="name" required placeholder="Vocabulary Mini Lesson"></label>
        <label><span>Schedule Parent Block</span><select name="parentBlockId"><option value="">General / Unassigned</option>${templateParentOptions(parentId)}</select></label>
        <label><span>Format</span><input name="format" list="v194-format-list" value="Full Lesson"><datalist id="v194-format-list">${formats.map((item)=>`<option value="${esc(item)}">`).join('')}</datalist></label>
        <label><span>Default duration</span><input name="duration" inputmode="numeric" value="${flowMinutes(state.blocks)}"></label>
        <label><span>Tags</span><input name="tags" placeholder="Reading, Vocabulary"></label>
        <label class="v194-check"><input type="checkbox" name="reusable"><span>Reusable across Parent Blocks</span></label>
        <div class="v19-modal-actions wide"><button type="button" class="v19-secondary-button" data-v194-close>Cancel</button><button type="submit" class="v19-primary-button">Save template</button></div>
      </form>`);
    overlay.querySelector('[data-v194-template-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const name = String(form.get('name') || '').trim();
      if (!name) return;
      const item = {
        id:id('template'), name,
        parentBlockId:String(form.get('parentBlockId')||''),
        format:String(form.get('format')||'Other').trim() || 'Other',
        defaultDuration:String(form.get('duration')||''),
        tags:String(form.get('tags')||'').split(',').map((tag)=>tag.trim()).filter(Boolean),
        reusableAcrossBlocks:form.get('reusable') === 'on',
        flowBlocks:cloneFlowBlocks(state.blocks),
        archived:false, createdAt:nowISO(), updatedAt:nowISO()
      };
      saveTemplates([...templates(), item], 'Create planning template');
      close(); showToast(`Template saved: ${name}`);
    });
  }
  function applyTemplate(editor, template, mode='replace') {
    const state = editor?._v19FlowState;
    if (!state || !template) return;
    const incoming = cloneFlowBlocks(template.flowBlocks || []);
    state.blocks = diagnostics().normalizeFlowBlocks?.(mode === 'append' ? [...state.blocks, ...incoming] : incoming) || incoming;
    diagnostics().saveFlowDraft?.(editor, state);
    diagnostics().rerenderFlowEditor?.(editor);
    scheduleMaintenance();
    showToast(`${template.name} applied`);
  }
  function openApplyTemplate(editor) {
    const currentParent = editorParentBlockId(editor);
    const list = templates().filter((item) => !item.archived).sort((a,b) => {
      const aRank = String(a.parentBlockId)===String(currentParent) ? 0 : a.reusableAcrossBlocks || !a.parentBlockId ? 1 : 2;
      const bRank = String(b.parentBlockId)===String(currentParent) ? 0 : b.reusableAcrossBlocks || !b.parentBlockId ? 1 : 2;
      return aRank-bRank || String(a.name).localeCompare(String(b.name));
    });
    const { overlay, close } = openModal(`
      <div class="v19-modal-heading"><div><span class="v19-eyebrow">PLANNING TEMPLATES</span><h2>Start from a template</h2><p>Recommended templates for this Schedule Parent Block appear first.</p></div><button class="v19-modal-close" data-v194-close aria-label="Close">×</button></div>
      <div class="v194-template-list">${list.length ? list.map((item)=>{
        const parent = parentBlockFor(item.parentBlockId);
        return `<article class="v194-template-card"><div><strong>${esc(item.name)}</strong><span>${esc(parent ? blockName(parent) : 'General')} · ${esc(item.format || 'Other')} · ${esc(item.defaultDuration || flowMinutes(item.flowBlocks || []))} min</span><small>${(item.flowBlocks||[]).length} flow block(s)${item.tags?.length ? ` · ${esc(item.tags.join(', '))}` : ''}</small></div><button class="v19-primary-button compact" data-v194-use-template="${esc(item.id)}">Use</button></article>`;
      }).join('') : '<div class="v19-empty"><h3>No templates yet</h3><p>Save a lesson flow as a template first.</p></div>'}</div>
      <div class="v19-modal-actions"><button class="v19-secondary-button" data-v194-manage-templates>Manage templates</button><button class="v19-secondary-button" data-v194-close>Close</button></div>`);
    overlay.querySelectorAll('[data-v194-use-template]').forEach((button) => button.addEventListener('click', () => {
      const item = templates().find((template) => String(template.id)===String(button.dataset.v194UseTemplate));
      if (!item) return;
      const hasBlocks = Boolean(editor?._v19FlowState?.blocks?.length);
      if (!hasBlocks) { close(); applyTemplate(editor, item, 'replace'); return; }
      const choice = window.confirm('Replace the current lesson flow? Choose Cancel to append the template blocks instead.');
      close(); applyTemplate(editor, item, choice ? 'replace' : 'append');
    }));
    overlay.querySelector('[data-v194-manage-templates]')?.addEventListener('click', () => { close(); openTemplateManager(editor); });
  }
  function openTemplateManager(editor=null) {
    const list = templates().sort((a,b)=>Number(Boolean(a.archived))-Number(Boolean(b.archived)) || String(a.name).localeCompare(String(b.name)));
    const { overlay, close } = openModal(`
      <div class="v19-modal-heading"><div><span class="v19-eyebrow">PLANNING</span><h2>Manage templates</h2><p>Template names, formats, and tags can be changed later without changing lessons already created from them.</p></div><button class="v19-modal-close" data-v194-close aria-label="Close">×</button></div>
      <div class="v194-template-list manage">${list.length ? list.map((item)=>{
        const parent = parentBlockFor(item.parentBlockId);
        return `<article class="v194-template-card ${item.archived?'archived':''}" data-v194-template-id="${esc(item.id)}"><div><strong>${esc(item.name)}</strong><span>${esc(parent ? blockName(parent) : 'General')} · ${esc(item.format || 'Other')}</span><small>${(item.flowBlocks||[]).length} flow block(s)${item.archived?' · Archived':''}</small></div><div class="v194-template-actions">${editor && !item.archived ? `<button class="v19-primary-button compact" data-v194-use-managed>Use</button>`:''}<button class="v19-secondary-button compact" data-v194-rename>Rename</button><button class="v19-secondary-button compact" data-v194-duplicate>Duplicate</button><button class="v19-secondary-button compact" data-v194-archive>${item.archived?'Restore':'Archive'}</button><button class="v19-danger-button compact" data-v194-delete>Delete</button></div></article>`;
      }).join('') : '<div class="v19-empty"><h3>No templates</h3><p>Open a Lesson Flow Editor and choose Save as template.</p></div>'}</div>
      <div class="v19-modal-actions"><button class="v19-secondary-button" data-v194-close>Done</button></div>`);
    const refresh = () => { close(); openTemplateManager(editor); };
    overlay.querySelectorAll('[data-v194-template-id]').forEach((card) => {
      const templateId = card.dataset.v194TemplateId;
      card.querySelector('[data-v194-use-managed]')?.addEventListener('click', () => { const item=templates().find(t=>String(t.id)===String(templateId)); close(); if(item) applyTemplate(editor,item,'replace'); });
      card.querySelector('[data-v194-rename]')?.addEventListener('click', () => {
        const items=templates(); const item=items.find(t=>String(t.id)===String(templateId)); if(!item)return;
        const next=window.prompt('Template name',item.name); if(!next?.trim())return;
        item.name=next.trim(); item.updatedAt=nowISO(); saveTemplates(items,'Rename planning template'); refresh();
      });
      card.querySelector('[data-v194-duplicate]')?.addEventListener('click', () => {
        const items=templates(); const item=items.find(t=>String(t.id)===String(templateId)); if(!item)return;
        items.push({...JSON.parse(JSON.stringify(item)),id:id('template'),name:`${item.name} copy`,archived:false,flowBlocks:cloneFlowBlocks(item.flowBlocks||[]),createdAt:nowISO(),updatedAt:nowISO()});
        saveTemplates(items,'Duplicate planning template'); refresh();
      });
      card.querySelector('[data-v194-archive]')?.addEventListener('click', () => {
        const items=templates(); const item=items.find(t=>String(t.id)===String(templateId)); if(!item)return;
        item.archived=!item.archived; item.updatedAt=nowISO(); saveTemplates(items,item.archived?'Archive planning template':'Restore planning template'); refresh();
      });
      card.querySelector('[data-v194-delete]')?.addEventListener('click', () => {
        if(!window.confirm('Delete this template? Existing lessons will not change.'))return;
        saveTemplates(templates().filter(t=>String(t.id)!==String(templateId)),'Delete planning template'); refresh();
      });
    });
  }
  function nativeWeekButton(week, pattern) {
    return [...week.querySelectorAll('button')].find((button) => !button.closest('[data-v1942-week-header]') && pattern.test(text(button))) || null;
  }
  function nativeWeekSelect(week) {
    return [...week.querySelectorAll('select')].find((select) => !select.closest('[data-v1942-week-header]')) || null;
  }
  function nativeWeekendCheckbox(week) {
    return [...week.querySelectorAll('input[type="checkbox"]')].find((input) => {
      if (input.closest('[data-v1942-week-header]')) return false;
      const label = input.closest('label');
      return /show weekends|weekends/i.test(text(label || input.parentElement));
    }) || null;
  }
  function setReactControlValue(control, value) {
    if (!control) return false;
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : Object.getPrototypeOf(control);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    try {
      if (descriptor?.set) descriptor.set.call(control, value);
      else control.value = value;
    } catch { control.value = value; }
    control.dispatchEvent(new Event('input', { bubbles:true }));
    control.dispatchEvent(new Event('change', { bubbles:true }));
    return String(control.value) === String(value);
  }
  function setReactCheckbox(control, checked) {
    if (!control) return false;
    const desired = Boolean(checked);
    if (control.checked === desired) return true;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
    try {
      // Put the native control in the opposite state, then let a real click
      // perform the final toggle. React's checkbox onChange listens to click.
      if (descriptor?.set) descriptor.set.call(control, !desired);
      else control.checked = !desired;
      control.click();
    } catch {
      try {
        if (descriptor?.set) descriptor.set.call(control, desired);
        else control.checked = desired;
      } catch { control.checked = desired; }
      control.dispatchEvent(new Event('input', { bubbles:true }));
      control.dispatchEvent(new Event('change', { bubbles:true }));
    }
    return control.checked === desired;
  }
  function weekDateRangeLabel(week) {
    const routeStart = diagnostics().visibleWeekAnchorDate?.() || diagnostics().visibleWeekRouteDate?.() || '';
    if (validDate(routeStart)) {
      const start = new Date(`${routeStart}T12:00:00`);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const left = start.toLocaleDateString('en-US', { month:'short', day:'numeric' });
      const right = end.toLocaleDateString('en-US', { month:start.getMonth()===end.getMonth() ? undefined : 'short', day:'numeric' });
      return `${left} – ${right}`;
    }
    const candidate = [...week.querySelectorAll('p,span,small,div')]
      .filter((node) => !node.closest('[data-v1942-week-header]'))
      .find((node) => /^[A-Z][a-z]{2}\s+\d{1,2}\s*[–—-]\s*(?:[A-Z][a-z]{2}\s+)?\d{1,2}$/.test(text(node)));
    return text(candidate) || 'Current teaching week';
  }
  function hideNativeWeekControl(node, shell=false) {
    if (!node) return;
    const target = shell ? node.parentElement : node;
    if (target) target.classList.add('v1942-native-week-control');
  }
  function installWeekHeader() {
    const week = document.querySelector('.week-workspace');
    if (!week) return;
    week.querySelectorAll('[data-v194-week-templates]').forEach((button) => button.remove());

    let panel = week.querySelector('[data-v1942-week-header]');
    if (!panel) {
      panel = document.createElement('section');
      panel.dataset.v1942WeekHeader = 'true';
      panel.className = 'v1942-week-header';
      panel.innerHTML = `
        <div class="v1942-week-title-row">
          <div class="v1942-week-title"><span>WORKSPACE</span><h1>Week</h1><p data-v1942-week-range></p></div>
          <div class="v1942-week-nav" role="group" aria-label="Week navigation">
            <button type="button" data-v1942-week-action="previous" aria-label="Previous week">‹ <span>Previous</span></button>
            <button type="button" class="today" data-v1942-week-action="today">This week</button>
            <button type="button" data-v1942-week-action="next" aria-label="Next week"><span>Next</span> ›</button>
          </div>
        </div>
        <div class="v1942-week-tools-row">
          <label class="v1942-week-filter"><span>View</span><select data-v1942-week-filter aria-label="Week view filter"></select></label>
          <div class="v1942-week-tools">
            <label class="v1942-weekend-toggle"><input type="checkbox" data-v1942-weekends><span class="track" aria-hidden="true"></span><span>Weekends</span></label>
            <button type="button" class="v1942-template-launcher" data-v1942-open-templates>Lesson templates</button>
          </div>
        </div>`;
      week.prepend(panel);
      panel.querySelector('[data-v1942-week-action="previous"]').addEventListener('click', () => nativeWeekButton(week, /^(previous|prev)\b|‹|←/i)?.click());
      panel.querySelector('[data-v1942-week-action="today"]').addEventListener('click', () => nativeWeekButton(week, /^this week$|^today$/i)?.click());
      panel.querySelector('[data-v1942-week-action="next"]').addEventListener('click', () => nativeWeekButton(week, /^next\b|›|→/i)?.click());
      panel.querySelector('[data-v1942-open-templates]').addEventListener('click', () => openTemplateManager(null));
      panel.querySelector('[data-v1942-week-filter]').addEventListener('change', (event) => {
        const proxy = event.currentTarget;
        const native = nativeWeekSelect(week);
        if (!native) { proxy.setAttribute('aria-invalid', 'true'); return; }
        proxy.removeAttribute('aria-invalid');
        setReactControlValue(native, proxy.value);
        window.setTimeout(() => {
          const current = nativeWeekSelect(week);
          if (current && String(current.value) !== String(proxy.value)) setReactControlValue(current, proxy.value);
          scheduleMaintenance();
        }, 40);
      });
      panel.querySelector('[data-v1942-weekends]').addEventListener('change', (event) => {
        const proxy = event.currentTarget;
        const native = nativeWeekendCheckbox(week);
        if (!native) { proxy.setAttribute('aria-invalid', 'true'); return; }
        proxy.removeAttribute('aria-invalid');
        setReactCheckbox(native, proxy.checked);
        window.setTimeout(() => {
          const current = nativeWeekendCheckbox(week);
          if (current && current.checked !== proxy.checked) setReactCheckbox(current, proxy.checked);
          scheduleMaintenance();
        }, 40);
      });
    }

    panel.querySelector('[data-v1942-week-range]').textContent = weekDateRangeLabel(week);
    const templateButton = panel.querySelector('[data-v1942-open-templates]');
    const activeTemplateCount = templates().filter((item) => !item.archived).length;
    templateButton.textContent = activeTemplateCount ? `Lesson templates · ${activeTemplateCount}` : 'Lesson templates';

    const sourceSelect = nativeWeekSelect(week);
    const proxySelect = panel.querySelector('[data-v1942-week-filter]');
    if (sourceSelect && proxySelect) {
      const signature = [...sourceSelect.options].map((option) => `${option.value}:${option.textContent}`).join('|');
      if (proxySelect.dataset.optionsSignature !== signature) {
        proxySelect.innerHTML = [...sourceSelect.options].map((option) => `<option value="${esc(option.value)}">${esc(option.textContent)}</option>`).join('');
        proxySelect.dataset.optionsSignature = signature;
      }
      proxySelect.value = sourceSelect.value;
      proxySelect.disabled = false;
      proxySelect.removeAttribute('aria-invalid');
      hideNativeWeekControl(sourceSelect.closest('label') || sourceSelect.parentElement);
    } else if (proxySelect) {
      proxySelect.disabled = true;
      proxySelect.setAttribute('aria-invalid', 'true');
    }
    const sourceWeekend = nativeWeekendCheckbox(week);
    const proxyWeekend = panel.querySelector('[data-v1942-weekends]');
    if (sourceWeekend && proxyWeekend) {
      proxyWeekend.checked = sourceWeekend.checked;
      proxyWeekend.disabled = false;
      proxyWeekend.removeAttribute('aria-invalid');
      hideNativeWeekControl(sourceWeekend.closest('label') || sourceWeekend.parentElement);
    } else if (proxyWeekend) {
      proxyWeekend.disabled = true;
      proxyWeekend.setAttribute('aria-invalid', 'true');
    }

    const heading = [...week.querySelectorAll('h1,h2')].find((node) => !node.closest('[data-v1942-week-header]') && /^week$/i.test(text(node)));
    if (heading) {
      const nativeHeader = heading.closest('.page-header') || heading.parentElement;
      hideNativeWeekControl(nativeHeader);
    }
    const navButtons = [
      nativeWeekButton(week, /^(previous|prev)\b|‹|←/i),
      nativeWeekButton(week, /^this week$|^today$/i),
      nativeWeekButton(week, /^next\b|›|→/i)
    ].filter(Boolean);
    const navParent = navButtons.length === 3 && navButtons.every((button) => button.parentElement === navButtons[0].parentElement) ? navButtons[0].parentElement : null;
    if (navParent) hideNativeWeekControl(navParent); else navButtons.forEach((button) => hideNativeWeekControl(button));
    const nativeToolbar = week.querySelector('.week-toolbar');
    if (nativeToolbar) hideNativeWeekControl(nativeToolbar);
    panel.dataset.controlsReady = String(Boolean(sourceSelect && sourceWeekend));
    document.documentElement.dataset.v1942WeekHeader = 'true';
    document.documentElement.dataset.v1943WeekControls = panel.dataset.controlsReady;
  }
  function installTemplateControls() {
    document.querySelectorAll('.planning-editor .v19-flow-editor').forEach((shell) => {
      const editor = shell.closest('.planning-editor');
      const toolbar = shell.querySelector('.v19-flow-toolbar');
      if (!editor || !toolbar || toolbar.querySelector('[data-v194-template-controls]')) return;
      const group=document.createElement('span');
      group.dataset.v194TemplateControls='true'; group.className='v194-template-control-group';
      group.innerHTML='<button type="button" class="v19-secondary-button" data-v194-start-template>Start from template</button><button type="button" class="v19-secondary-button" data-v194-save-template>Save as template</button><button type="button" class="v19-secondary-button" data-v194-manage-template>Manage</button>';
      toolbar.prepend(group);
      group.querySelector('[data-v194-start-template]').addEventListener('click',()=>openApplyTemplate(editor));
      group.querySelector('[data-v194-save-template]').addEventListener('click',()=>openSaveTemplate(editor));
      group.querySelector('[data-v194-manage-template]').addEventListener('click',()=>openTemplateManager(editor));
    });
    installWeekHeader();
  }

  function installFlowDragAndCollapse() {
    document.querySelectorAll('.planning-editor .v19-flow-card').forEach((card) => {
      const editor=card.closest('.planning-editor'); const handle=card.querySelector(':scope > .v19-flow-card-head .v19-flow-handle');
      if(handle && !handle.dataset.v194Drag){
        handle.dataset.v194Drag='true'; handle.draggable=true; handle.title='Drag to reorder';
        handle.addEventListener('dragstart',(event)=>{ draggedFlowId=card.dataset.flowId||''; draggedEditor=editor; event.dataTransfer?.setData('text/plain',draggedFlowId); event.dataTransfer?.setDragImage(card,20,20); card.classList.add('dragging'); });
        handle.addEventListener('dragend',()=>{ card.classList.remove('dragging'); draggedFlowId=''; draggedEditor=null; document.querySelectorAll('.v19-flow-card.drag-over').forEach(n=>n.classList.remove('drag-over')); });
      }
      if(!card.dataset.v194Drop){
        card.dataset.v194Drop='true';
        card.addEventListener('dragover',(event)=>{ if(!draggedFlowId||draggedEditor!==editor)return; event.preventDefault(); card.classList.add('drag-over'); });
        card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
        card.addEventListener('drop',(event)=>{
          event.preventDefault(); card.classList.remove('drag-over');
          const targetId=card.dataset.flowId; if(!draggedFlowId||!targetId||draggedFlowId===targetId)return;
          const state=editor?._v19FlowState; if(!state)return;
          const source=state.blocks.find(b=>String(b.id)===String(draggedFlowId)); const target=state.blocks.find(b=>String(b.id)===String(targetId)); if(!source||!target)return;
          const descendants=new Set(); const visit=(pid)=>state.blocks.filter(b=>String(b.parentId||'')===String(pid)).forEach(b=>{descendants.add(String(b.id));visit(b.id)}); visit(source.id); if(descendants.has(String(target.id)))return;
          source.parentId=target.parentId||'';
          const siblings=state.blocks.filter(b=>String(b.parentId||'')===String(source.parentId||'')&&String(b.id)!==String(source.id)).sort((a,b)=>a.order-b.order);
          const index=Math.max(0,siblings.findIndex(b=>String(b.id)===String(target.id)));
          siblings.splice(index,0,source); siblings.forEach((b,i)=>{b.order=i});
          state.blocks=diagnostics().normalizeFlowBlocks?.(state.blocks)||state.blocks;
          diagnostics().saveFlowDraft?.(editor,state); diagnostics().rerenderFlowEditor?.(editor); scheduleMaintenance();
        });
      }
      const head=card.querySelector(':scope > .v19-flow-card-head');
      if(head && !head.querySelector('[data-v194-collapse-flow]')){
        const button=document.createElement('button'); button.type='button'; button.dataset.v194CollapseFlow='true'; button.className='v194-flow-collapse'; button.title='Collapse block'; button.textContent='⌄';
        head.querySelector('.v19-flow-role')?.before(button);
        button.addEventListener('click',()=>{ const collapsed=card.classList.toggle('collapsed'); button.textContent=collapsed?'›':'⌄'; button.title=collapsed?'Expand block':'Collapse block'; });
      }
    });
  }

  function people() {
    const seen=new Set(); const out=[];
    [[KEYS.students,'individual'],[KEYS.groups,'group'],[KEYS.classes,'class']].forEach(([key,kind])=>read(key,[]).forEach((person)=>{
      const name=person.name||person.title||person.className||''; if(!name)return; const stable=`${kind}:${person.id||normalize(name)}`; if(seen.has(stable))return; seen.add(stable); out.push({id:String(person.id||stable),name,kind});
    }));
    return out.sort((a,b)=>a.name.localeCompare(b.name));
  }
  function currentLearnerContext() {
    const name=text(document.querySelector('#learnerRecordName,.learner-record-page .page-header h1,.learner-record-header h1'));
    if(!name)return null;
    const exact=people().filter((person)=>normalize(person.name)===normalize(name));
    return exact.length===1?exact[0]:{id:`name:${normalize(name)}`,name,kind:'individual'};
  }
  function notices(){return read(KEYS.notices,[])}
  function saveNotices(items,label='Update learner notices'){write(KEYS.notices,items,label)}
  function noticeActiveOn(notice,date){
    if(normalize(notice.status)==='resolved'||normalize(notice.status)==='archived')return false;
    if(notice.startDate&&validDate(notice.startDate)&&notice.startDate>date)return false;
    if(notice.endDate&&validDate(notice.endDate)&&notice.endDate<date)return false;
    return true;
  }
  function noticeTypeLabel(type){return ({ongoing:'Ongoing Support','date-specific':'Date-specific Notice',service:'Learner Service'}[type]||type||'Notice')}
  function openNoticeForm(context, defaults={}) {
    const persons=people(); const today=defaults.startDate||dateISO(); const existing=defaults.id?notices().find(item=>String(item.id)===String(defaults.id)):null; const value={...defaults,...existing};
    const {overlay,close}=openModal(`
      <div class="v19-modal-heading"><div><span class="v19-eyebrow">SUPPORT & NOTICES</span><h2>${existing?'Edit notice':'Add learner notice'}</h2><p>Today and the learner record read the same notice.</p></div><button class="v19-modal-close" data-v194-close aria-label="Close">×</button></div>
      <form data-v194-notice-form class="v194-form-grid">
        <label><span>Learner / context</span><select name="contextId" required>${persons.map((person)=>`<option value="${esc(person.id)}" data-kind="${esc(person.kind)}" ${String(value.contextId||context?.id)===String(person.id)?'selected':''}>${esc(person.name)}</option>`).join('')}</select></label>
        <label><span>Type</span><select name="type"><option value="ongoing" ${value.type==='ongoing'?'selected':''}>Ongoing Support</option><option value="date-specific" ${value.type==='date-specific'?'selected':''}>Date-specific Notice</option><option value="service" ${value.type==='service'?'selected':''}>Learner Service</option></select></label>
        <label class="wide"><span>Title</span><input name="title" required value="${esc(value.title||'')}"></label>
        <label class="wide"><span>Details</span><textarea name="details">${esc(value.details||'')}</textarea></label>
        <label><span>Priority</span><select name="priority"><option>Normal</option><option ${value.priority==='High'?'selected':''}>High</option><option ${value.priority==='Low'?'selected':''}>Low</option></select></label>
        <label><span>Context / class</span><input name="context" value="${esc(value.context||'')}"></label>
        <label><span>Start date</span><input type="date" name="startDate" value="${esc(value.startDate||today)}"></label>
        <label><span>End date</span><input type="date" name="endDate" value="${esc(value.endDate|| (value.type==='date-specific'?today:''))}"></label>
        <label><span>Repeat rule</span><input name="repeatRule" value="${esc(value.repeatRule||'') }" placeholder="Optional"></label>
        <div class="v19-modal-actions wide"><button type="button" class="v19-secondary-button" data-v194-close>Cancel</button><button type="submit" class="v19-primary-button">Save notice</button></div>
      </form>`);
    overlay.querySelector('[data-v194-notice-form]').addEventListener('submit',(event)=>{
      event.preventDefault(); const form=new FormData(event.currentTarget); const select=event.currentTarget.elements.contextId; const option=select.selectedOptions[0]; const person=persons.find(p=>String(p.id)===String(form.get('contextId')));
      const items=notices(); const record=existing||{id:id('notice'),createdAt:nowISO()};
      Object.assign(record,{contextId:String(form.get('contextId')||''),contextName:person?.name||option?.textContent||'',contextType:person?.kind||option?.dataset.kind||'individual',type:String(form.get('type')||'ongoing'),title:String(form.get('title')||'').trim(),details:String(form.get('details')||'').trim(),priority:String(form.get('priority')||'Normal'),context:String(form.get('context')||'').trim(),startDate:String(form.get('startDate')||''),endDate:String(form.get('endDate')||''),repeatRule:String(form.get('repeatRule')||'').trim(),status:record.status||'Active',source:record.source||defaults.source||'learner-record',updatedAt:nowISO()});
      if(!existing)items.push(record); saveNotices(items,existing?'Edit learner notice':'Create learner notice'); close(); supportMode=record.contextId; scheduleMaintenance(); showToast('Learner notice saved');
    });
  }
  function createFollowUpTask(notice) {
    const {overlay,close}=openModal(`
      <div class="v19-modal-heading"><div><span class="v19-eyebrow">FOLLOW-UP TASK</span><h2>Create a linked task</h2><p>The notice stays active until you resolve it.</p></div><button class="v19-modal-close" data-v194-close>×</button></div>
      <form data-v194-followup-form class="v194-form-grid"><label class="wide"><span>Task</span><input name="title" required value="${esc(`Follow up: ${notice.title}`)}"></label><label><span>Due date</span><input type="date" name="dueDate" value="${esc(notice.endDate||dateISO())}"></label><div class="v19-modal-actions wide"><button type="button" class="v19-secondary-button" data-v194-close>Cancel</button><button type="submit" class="v19-primary-button">Create task</button></div></form>`);
    overlay.querySelector('[data-v194-followup-form]').addEventListener('submit',(event)=>{
      event.preventDefault(); const form=new FormData(event.currentTarget); const tasks=read(KEYS.tasks,[]); const taskId=id('task'); tasks.push({id:taskId,title:String(form.get('title')||'').trim(),dueDate:String(form.get('dueDate')||''),category:'Learner follow-up',priority:notice.priority||'Normal',status:'Active',completed:false,learnerId:notice.contextId,learner:notice.contextName,linkedNoticeId:notice.id,sourceType:'learner-notice',sourceId:notice.id,createdAt:nowISO(),updatedAt:nowISO()}); write(KEYS.tasks,tasks,'Create follow-up task'); const items=notices(); const item=items.find(n=>String(n.id)===String(notice.id)); if(item){item.taskId=taskId;item.updatedAt=nowISO();saveNotices(items,'Link follow-up task');} close(); showToast('Follow-up task created');
    });
  }
  function filteredNotices(context){
    return notices().filter((notice)=>!context||String(notice.contextId)===String(context.id)||normalize(notice.contextName)===normalize(context.name)).filter((notice)=>{
      const resolved=['resolved','archived'].includes(normalize(notice.status));
      if(supportFilter==='history')return resolved;
      if(resolved)return false;
      if(supportFilter==='active')return true;
      if(supportFilter==='ongoing')return notice.type==='ongoing';
      if(supportFilter==='date-specific')return notice.type==='date-specific';
      if(supportFilter==='service')return notice.type==='service';
      return true;
    }).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));
  }
  function renderLearnerSupport(context){
    const host=document.querySelector('#learnerRecordContent,.learner-record-content'); if(!host||!context)return;
    const list=filteredNotices(context);
    host.innerHTML=`<section class="v194-support-page"><div class="v194-support-header"><div><span class="v19-eyebrow">CONTINUITY</span><h2>Support & Notices</h2><p>Ongoing support, dated notices, learner services, and history for ${esc(context.name)}.</p></div><button class="v19-primary-button" data-v194-add-notice>+ Notice</button></div><div class="v194-support-tabs">${[['active','Active'],['ongoing','Ongoing Support'],['date-specific','Date-specific'],['service','Learner Services'],['history','History']].map(([key,label])=>`<button class="${supportFilter===key?'active':''}" data-v194-support-filter="${key}">${label}</button>`).join('')}</div><div class="v194-notice-list">${list.length?list.map((notice)=>`<article class="v194-notice-card ${normalize(notice.priority)}"><div class="v194-notice-main"><span class="v194-notice-type">${esc(noticeTypeLabel(notice.type))}</span><h3>${esc(notice.title)}</h3><p>${esc(notice.details||'No details added.')}</p><small>${notice.startDate?esc(notice.startDate):'No start date'}${notice.endDate?` → ${esc(notice.endDate)}`:''}${notice.context?` · ${esc(notice.context)}`:''}${notice.taskId?' · Follow-up task linked':''}</small></div><div class="v194-notice-actions"><button class="v19-secondary-button compact" data-v194-edit-notice="${esc(notice.id)}">Edit</button>${!['resolved','archived'].includes(normalize(notice.status))?`<button class="v19-secondary-button compact" data-v194-task-notice="${esc(notice.id)}">Follow-up task</button><button class="v19-secondary-button compact" data-v194-resolve-notice="${esc(notice.id)}">Resolve</button>`:`<button class="v19-secondary-button compact" data-v194-reopen-notice="${esc(notice.id)}">Reopen</button>`}<button class="v19-danger-button compact" data-v194-delete-notice="${esc(notice.id)}">Delete</button></div></article>`).join(''):'<div class="v19-empty"><h3>No notices in this view</h3><p>Add support only when it helps future teaching decisions.</p></div>'}</div></section>`;
    host.querySelector('[data-v194-add-notice]')?.addEventListener('click',()=>openNoticeForm(context));
    host.querySelectorAll('[data-v194-support-filter]').forEach((button)=>button.addEventListener('click',()=>{supportFilter=button.dataset.v194SupportFilter;renderLearnerSupport(context)}));
    host.querySelectorAll('[data-v194-edit-notice]').forEach((button)=>button.addEventListener('click',()=>openNoticeForm(context,{id:button.dataset.v194EditNotice})));
    host.querySelectorAll('[data-v194-task-notice]').forEach((button)=>button.addEventListener('click',()=>{const notice=notices().find(n=>String(n.id)===String(button.dataset.v194TaskNotice));if(notice)createFollowUpTask(notice)}));
    const setStatus=(noticeId,status)=>{const items=notices();const item=items.find(n=>String(n.id)===String(noticeId));if(!item)return;item.status=status;item.updatedAt=nowISO();saveNotices(items,`${status} learner notice`);renderLearnerSupport(context)};
    host.querySelectorAll('[data-v194-resolve-notice]').forEach((button)=>button.addEventListener('click',()=>setStatus(button.dataset.v194ResolveNotice,'Resolved')));
    host.querySelectorAll('[data-v194-reopen-notice]').forEach((button)=>button.addEventListener('click',()=>setStatus(button.dataset.v194ReopenNotice,'Active')));
    host.querySelectorAll('[data-v194-delete-notice]').forEach((button)=>button.addEventListener('click',()=>{if(!window.confirm('Delete this notice?'))return;saveNotices(notices().filter(n=>String(n.id)!==String(button.dataset.v194DeleteNotice)),'Delete learner notice');renderLearnerSupport(context)}));
  }
  function installLearnerSupportTab(){
    const context=currentLearnerContext(); const host=document.querySelector('#learnerRecordContent,.learner-record-content'); const nativeTabs=[...document.querySelectorAll('[data-record-tab]')];
    if(!context||!host||!nativeTabs.length){supportMode=null;return;}
    const container=nativeTabs[0].parentElement;
    let button=container.querySelector('[data-v194-support-tab]');
    if(!button){button=document.createElement('button');button.type='button';button.dataset.v194SupportTab='true';button.textContent='Support & Notices';button.addEventListener('click',()=>{supportMode=context.id;nativeTabs.forEach(tab=>tab.classList.remove('active'));button.classList.add('active');renderLearnerSupport(context)});container.appendChild(button)}
    if(supportMode&&String(supportMode)===String(context.id)){nativeTabs.forEach(tab=>tab.classList.remove('active'));button.classList.add('active');renderLearnerSupport(context)}
    nativeTabs.forEach((tab)=>{if(tab.dataset.v194NativeBound)return;tab.dataset.v194NativeBound='true';tab.addEventListener('click',()=>{supportMode=null;button?.classList.remove('active')},true)});
  }
  function todayNoticeDate(){
    const hash=new URLSearchParams((location.hash.split('?')[1]||'')); const routeDate=hash.get('date'); if(validDate(routeDate))return routeDate;
    const focus=read('cos-focus-date',''); return validDate(focus)?focus:dateISO();
  }
  function renderTodayNotices(){
    const target=document.querySelector('#studentsToNotice'); if(!target)return;
    let panel=target.querySelector(':scope > .v194-today-notices'); if(!panel){panel=document.createElement('section');panel.className='v194-today-notices';target.prepend(panel)}
    const date=todayNoticeDate(); const active=notices().filter((notice)=>noticeActiveOn(notice,date)).slice(0,8);
    panel.innerHTML=`<div class="v194-today-notice-head"><strong>Support & Notices</strong><button type="button" class="v19-secondary-button compact" data-v194-quick-notice>+ Notice</button></div>${active.length?active.map((notice)=>`<button class="v194-today-notice" data-v194-open-notice="${esc(notice.id)}"><span>${esc(notice.contextName||'Learner')}</span><strong>${esc(notice.title)}</strong><small>${esc(noticeTypeLabel(notice.type))}</small></button>`).join(''):'<p class="v194-today-empty">No active learner notices for ${esc(date)}.</p>'}`;
    panel.querySelector('[data-v194-quick-notice]')?.addEventListener('click',()=>openNoticeForm(null,{type:'date-specific',startDate:date,endDate:date,source:'today-quick-add'}));
    panel.querySelectorAll('[data-v194-open-notice]').forEach((button)=>button.addEventListener('click',()=>{const notice=notices().find(n=>String(n.id)===String(button.dataset.v194OpenNotice));if(!notice)return;openNoticeForm({id:notice.contextId,name:notice.contextName,kind:notice.contextType},{id:notice.id})}));
  }

  function migrateChineseNewYear(){
    if(localStorage.getItem('classroom-v194-chinese-new-year-migrated')==='true')return;
    const keys=['cos-calendar-events','cos-calendar-quarantine-v19','cos-lessons','cos-materials','cos-toolkit','cos-standards','cos-tasks',KEYS.templates,KEYS.notices];
    const skipKeys=new Set(['id','sourceKey','parser','_importFile','importBatchId','rawText']);
    const walk=(value,key='')=>{
      if(typeof value==='string')return skipKeys.has(key)?value:value.replace(/Lunar New Year/gi,'Chinese New Year');
      if(Array.isArray(value))return value.map((item)=>walk(item,key));
      if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v,k)]));
      return value;
    };
    keys.forEach((key)=>{const raw=localStorage.getItem(key);if(raw===null)return;let value;try{value=JSON.parse(raw)}catch{return}const next=walk(value);if(JSON.stringify(next)!==JSON.stringify(value))write(key,next,'Standardize Chinese New Year naming')});
    localStorage.setItem('classroom-v194-chinese-new-year-migrated','true');
  }

  function scheduleMaintenance(){if(maintenanceQueued)return;maintenanceQueued=true;requestAnimationFrame(()=>{maintenanceQueued=false;maintain()})}
  function maintain(){decorateStableBlockLinks();installTemplateControls();installFlowDragAndCollapse();installLearnerSupportTab();renderTodayNotices()}
  function start(){migrateChineseNewYear();installPlanTargetBridge();const observer=new MutationObserver(scheduleMaintenance);observer.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('classroom:v19-data-change',scheduleMaintenance);window.addEventListener('classroom:v19-restored',scheduleMaintenance);const timer=setInterval(()=>{if(!document.querySelector('.app-shell'))return;clearInterval(timer);maintain();document.documentElement.dataset.classroomWorkflowVersion='19.4.4';console.info('Classroom v19.4.4 Week Controls & Draft Status loaded.')},60)}

  window.ClassroomV19WorkflowDiagnostics={
    decorateStableBlockLinks,stableBlockForCard,blockMatchesCard,blockDaySet,blockAppliesToWeekday,cloneFlowBlocks,noticeActiveOn,migrateChineseNewYear,templates,notices,openTemplateManager,installWeekHeader,setReactControlValue,setReactCheckbox
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
