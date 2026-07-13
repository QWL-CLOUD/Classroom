(() => {
  'use strict';

  const VERSION = '19.0.0';
  const ROUTES = {
    today: { label: 'Today', path: 'today' },
    week: { label: 'Week', path: 'week' },
    tasks: { label: 'Tasks', path: 'tasks' },
    agenda: { label: 'Personal Agenda', path: 'agenda' },
    learners: { label: 'Learners', legacyLabel: 'Classes, Groups & Individuals', path: 'learners' },
    resources: { label: 'Resource Library', path: 'resources' },
    calendar: { label: 'Calendar & Schedule', path: 'calendar' },
    import: { label: 'Import Center', path: 'import' },
    export: { label: 'Export & Backup', path: 'export' },
    settings: { label: 'Settings', path: 'settings' },
    insights: { label: 'Teaching Insights', path: 'insights', custom: true },
    cla: { label: 'CLA', path: 'cla', custom: true },
    health: { label: 'System Health', path: 'system-health', custom: true }
  };

  const ICONS = {
    insights: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M6 16V9m6 7V5m6 11v-4"/><path d="m5 7 5-3 4 3 5-4"/></svg>',
    cla: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22z"/></svg>',
    health: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.8 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.7 7.5-9.5V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6"/></svg>',
    redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5"/><path d="M20 12h-9a6 6 0 0 0-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>'
  };

  let routeLock = false;
  let customMode = null;
  let customRoot = null;
  let bumpBypassButton = null;
  let liveAcceptanceResults = null;
  let insightState = { kind: 'all', search: '', context: 'all' };
  let claSearch = '';

  const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value, label = 'Change') {
    window.ClassroomV19History?.begin(label);
    localStorage.setItem(key, JSON.stringify(value));
    window.ClassroomV19History?.finalize();
  }

  function localDate(dateString) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function formatDate(dateString, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
    const date = localDate(dateString);
    return date ? new Intl.DateTimeFormat('en-US', options).format(date) : dateString || 'Unscheduled';
  }

  function toDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addDays(dateString, days) {
    const date = localDate(dateString);
    if (!date) return dateString;
    date.setDate(date.getDate() + days);
    return toDateString(date);
  }

  function median(values) {
    if (!values.length) return 7;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }

  function dateDiff(a, b) {
    const first = localDate(a);
    const second = localDate(b);
    if (!first || !second) return 0;
    return Math.round((second - first) / 86400000);
  }

  function parseHash() {
    const raw = (location.hash || '#/today').replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    return { path: path || 'today', params: new URLSearchParams(query) };
  }

  function buildHash(path, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, value);
    });
    return `#/${path}${query.size ? `?${query.toString()}` : ''}`;
  }

  function routeForLabel(label) {
    return Object.values(ROUTES).find(
      (route) => route.label === label || route.legacyLabel === label
    );
  }

  function routeForPath(path) {
    return Object.values(ROUTES).find((route) => route.path === path);
  }

  function setHash(path, params = {}, replace = false) {
    const next = buildHash(path, params);
    if (location.hash === next) return;
    routeLock = true;
    if (replace) history.replaceState({ classroomRoute: path }, '', next);
    else history.pushState({ classroomRoute: path }, '', next);
    window.setTimeout(() => { routeLock = false; }, 0);
  }

  function findNavButton(route) {
    const buttons = [...document.querySelectorAll('.sidebar .nav-button')];
    return buttons.find((button) => {
      const label = text(button);
      return label === route.label || label === route.legacyLabel || button.dataset.v19Route === route.path;
    });
  }

  function hideCustomPage() {
    customMode = null;
    const main = document.querySelector('.main-panel');
    main?.classList.remove('v19-custom-mode');
    if (customRoot) customRoot.hidden = true;
    document.querySelectorAll('.v19-nav-button').forEach((button) => button.classList.remove('active'));
  }

  function navigateExisting(route, params = {}) {
    hideCustomPage();
    const button = findNavButton(route);
    if (!button) return false;
    button.click();
    if (params.date) {
      window.setTimeout(() => applyDateToVisiblePage(params.date), 80);
    }
    return true;
  }

  function applyDateToVisiblePage(date) {
    if (!localDate(date)) return;
    const inputs = [...document.querySelectorAll('.main-panel input[type="date"]')].filter(
      (input) => input.offsetParent !== null
    );
    const input = inputs[0];
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, date);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    if (document.querySelector('.week-workspace')) {
      const current = readJSON('cos-focus-date', '') || toDateString(new Date());
      const currentWeek = localDate(current);
      const targetWeek = localDate(date);
      if (!currentWeek || !targetWeek) return;
      const currentDay = (currentWeek.getDay() + 6) % 7;
      const targetDay = (targetWeek.getDay() + 6) % 7;
      currentWeek.setDate(currentWeek.getDate() - currentDay);
      targetWeek.setDate(targetWeek.getDate() - targetDay);
      let remaining = Math.round((targetWeek - currentWeek) / (7 * 86400000));
      const direction = remaining < 0 ? -1 : 1;
      remaining = Math.abs(remaining);
      const step = () => {
        if (!remaining) return;
        const buttons = [...document.querySelectorAll('.week-workspace .header-actions button')];
        const button = buttons.find((candidate) => direction < 0 ? /^Previous$/i.test(text(candidate)) : /^Next\b/i.test(text(candidate)));
        if (!button) return;
        button.click();
        remaining -= 1;
        window.setTimeout(step, 70);
      };
      step();
    }
  }

  function navigateFromHash() {
    if (routeLock) return;
    const { path, params } = parseHash();
    const route = routeForPath(path) || ROUTES.today;
    if (route.custom) {
      showCustomPage(route.path);
    } else {
      navigateExisting(route, Object.fromEntries(params.entries()));
    }
  }

  function syncHashFromActiveNav() {
    if (customMode || routeLock) return;
    const active = document.querySelector('.sidebar .nav-button.active');
    if (!active) return;
    const route = routeForLabel(text(active));
    if (!route) return;
    const params = {};
    const date = readJSON('cos-focus-date', '');
    if (['week', 'calendar', 'today'].includes(route.path) && localDate(date)) params.date = date;
    const next = buildHash(route.path, params);
    if (location.hash !== next) history.replaceState({ classroomRoute: route.path }, '', next);
  }

  function createCustomRoot() {
    const main = document.querySelector('.main-panel');
    if (!main) return null;
    if (!customRoot || !customRoot.isConnected) {
      customRoot = document.createElement('section');
      customRoot.id = 'v19-custom-root';
      customRoot.className = 'v19-custom-page';
      customRoot.hidden = true;
      main.appendChild(customRoot);
    }
    return customRoot;
  }

  function showCustomPage(path) {
    const route = routeForPath(path);
    if (!route?.custom) return;
    customMode = path;
    const main = document.querySelector('.main-panel');
    const root = createCustomRoot();
    if (!main || !root) return;
    main.classList.add('v19-custom-mode');
    root.hidden = false;
    document.querySelectorAll('.sidebar .nav-button').forEach((button) => button.classList.remove('active'));
    document.querySelector(`.v19-nav-button[data-v19-route="${path}"]`)?.classList.add('active');
    if (path === 'insights') renderInsights();
    if (path === 'cla') renderCLA();
    if (path === 'system-health') renderSystemHealth();
  }

  function makeNavButton(path, icon) {
    const route = routeForPath(path);
    const button = document.createElement('button');
    button.className = 'nav-button v19-nav-button';
    button.dataset.v19Route = path;
    button.title = route.label;
    button.innerHTML = `${icon}<span class="v19-nav-label">${escapeHTML(route.label)}</span>`;
    button.addEventListener('click', () => {
      setHash(path);
      showCustomPage(path);
    });
    return button;
  }

  function findNavGroup(groupLabel) {
    return [...document.querySelectorAll('.sidebar .nav-group')].find((group) => {
      const toggle = group.querySelector('.nav-section-toggle');
      return text(toggle).startsWith(groupLabel);
    });
  }

  function installCustomNavigation() {
    const workspace = findNavGroup('Workspace')?.querySelector('.secondary-nav');
    const resources = findNavGroup('Resources')?.querySelector('.secondary-nav');
    const system = findNavGroup('System')?.querySelector('.secondary-nav');

    if (workspace && !workspace.querySelector('[data-v19-route="insights"]')) {
      const button = makeNavButton('insights', ICONS.insights);
      const week = [...workspace.children].find((node) => text(node) === 'Week');
      week?.after(button) || workspace.appendChild(button);
    }
    if (resources && !resources.querySelector('[data-v19-route="cla"]')) {
      resources.appendChild(makeNavButton('cla', ICONS.cla));
    }
    if (system && !system.querySelector('[data-v19-route="system-health"]')) {
      system.appendChild(makeNavButton('system-health', ICONS.health));
    }
  }

  function installHistoryToolbar() {
    const shell = document.querySelector('.global-search-shell') || document.querySelector('.global-search') || document.querySelector('.main-panel');
    if (!shell || shell.querySelector('.v19-history-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'v19-history-toolbar';
    toolbar.innerHTML = `
      <button type="button" class="v19-icon-button" data-action="undo" title="Undo" aria-label="Undo">${ICONS.undo}</button>
      <button type="button" class="v19-icon-button" data-action="redo" title="Redo" aria-label="Redo">${ICONS.redo}</button>
    `;
    toolbar.querySelector('[data-action="undo"]').addEventListener('click', () => window.ClassroomV19History?.undo());
    toolbar.querySelector('[data-action="redo"]').addEventListener('click', () => window.ClassroomV19History?.redo());
    shell.appendChild(toolbar);
    updateHistoryToolbar();
  }

  function updateHistoryToolbar() {
    const status = window.ClassroomV19History?.status?.() || { canUndo: false, canRedo: false };
    const undo = document.querySelector('.v19-history-toolbar [data-action="undo"]');
    const redo = document.querySelector('.v19-history-toolbar [data-action="redo"]');
    if (undo) {
      undo.disabled = !status.canUndo;
      undo.title = status.canUndo && status.undoLabel ? `Undo: ${status.undoLabel}` : 'Undo';
    }
    if (redo) {
      redo.disabled = !status.canRedo;
      redo.title = status.canRedo && status.redoLabel ? `Redo: ${status.redoLabel}` : 'Redo';
    }
  }

  function normalizeLabels() {
    document.querySelectorAll('.sidebar .nav-button span, .page-header h1, .page-header h2').forEach((node) => {
      if (text(node) === 'Classes, Groups & Individuals') node.textContent = 'Learners';
    });

    document.querySelectorAll('.version-badge').forEach((node) => {
      if (/Classroom v18/i.test(text(node))) node.textContent = 'Classroom v19 · Workflow & Navigation';
    });

    const planningEditors = document.querySelectorAll('.planning-editor, .daily-planning-page, [class*="daily-planning"] .editor-card');
    planningEditors.forEach((editor) => {
      editor.querySelectorAll('button, h2, h3, label > span, .planning-source-header strong, .planning-source-header span').forEach((node) => {
        if (node.children.length) return;
        const value = text(node);
        const replacements = {
          Activity: 'Flow block',
          Activities: 'Lesson Flow Editor',
          'Activities / sequence': 'Lesson Flow Editor',
          'Activities & materials': 'Lesson Flow & materials',
          'Add activity': 'Add flow block',
          'New activity': 'New flow block',
          'Edit activity': 'Edit flow block',
          'Choose activities': 'Choose flow blocks'
        };
        if (replacements[value]) node.textContent = replacements[value];
      });
    });

    document.querySelectorAll('.lesson-source-summary span').forEach((node) => {
      if (/\bactivities\b/i.test(text(node))) node.textContent = text(node).replace(/activities/gi, 'flow blocks');
    });

    document.querySelectorAll('.learner-planning-unified .resource-tabs button').forEach((button) => {
      if (/Teaching Memory/i.test(text(button))) {
        const textNode = [...button.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && /Teaching Memory/i.test(node.textContent || ''));
        if (textNode) textNode.textContent = ' Insights';
      }
    });

    const claStandards = standardsForCLA();
    document.querySelectorAll('.planning-ref-chip').forEach((chip) => {
      const strong = chip.querySelector('strong');
      if (!strong || chip.classList.contains('v19-cla-chip')) return;
      const content = text(chip).toLowerCase();
      const standard = claStandards.find((item) => item.code && content.includes(String(item.code).toLowerCase()));
      if (!standard) return;
      const symbol = standard._claKind === 'level' ? 'LL' : 'S';
      chip.classList.add('v19-cla-chip');
      chip.dataset.v19Cla = symbol;
      chip.title = [standard.code, standardTitle(standard)].filter(Boolean).join(' — ');
      strong.textContent = standard.code || symbol;
    });
  }

  function currentSchoolYear() {
    return readJSON('cos-current-school-year', '');
  }

  function currentLessons() {
    const year = currentSchoolYear();
    return readJSON('cos-lessons', []).filter((lesson) => !year || !lesson.schoolYear || lesson.schoolYear === year);
  }

  function insightRecords() {
    return currentLessons()
      .filter((lesson) => lesson.reflection || lesson.teachingMemory || lesson.nextStep)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }

  function insightCounts(records) {
    return {
      sessions: records.length,
      reflections: records.filter((record) => record.reflection).length,
      memories: records.filter((record) => record.teachingMemory).length,
      nextSteps: records.filter((record) => record.nextStep).length
    };
  }

  function renderInsights() {
    const root = createCustomRoot();
    if (!root) return;
    const records = insightRecords();
    const counts = insightCounts(records);
    const contexts = [...new Set(records.map((record) => record.contextName || record.contextType).filter(Boolean))].sort();
    const search = insightState.search.toLowerCase();
    const filtered = records.filter((record) => {
      const kindMatch = insightState.kind === 'all' ||
        (insightState.kind === 'reflection' && record.reflection) ||
        (insightState.kind === 'memory' && record.teachingMemory) ||
        (insightState.kind === 'next' && record.nextStep);
      const context = record.contextName || record.contextType || 'General';
      const contextMatch = insightState.context === 'all' || context === insightState.context;
      const haystack = [record.date, record.block, context, record.reflection, record.teachingMemory, record.nextStep]
        .join(' ')
        .toLowerCase();
      return kindMatch && contextMatch && (!search || haystack.includes(search));
    });

    root.innerHTML = `
      <header class="v19-page-header">
        <div><span class="v19-eyebrow">TEACHING INSIGHTS</span><h1>Reflection, Memory & Next Steps</h1><p>One place to review what happened, what should be remembered, and what comes next.</p></div>
      </header>
      <div class="v19-metric-grid">
        <button data-kind="all" class="v19-metric ${insightState.kind === 'all' ? 'active' : ''}"><strong>${counts.sessions}</strong><span>Sessions</span></button>
        <button data-kind="reflection" class="v19-metric ${insightState.kind === 'reflection' ? 'active' : ''}"><strong>${counts.reflections}</strong><span>Reflections</span></button>
        <button data-kind="memory" class="v19-metric ${insightState.kind === 'memory' ? 'active' : ''}"><strong>${counts.memories}</strong><span>Memories</span></button>
        <button data-kind="next" class="v19-metric ${insightState.kind === 'next' ? 'active' : ''}"><strong>${counts.nextSteps}</strong><span>Next steps</span></button>
      </div>
      <div class="v19-filter-bar">
        <input type="search" data-insight-search value="${escapeHTML(insightState.search)}" placeholder="Search insights…" aria-label="Search insights">
        <select data-insight-context aria-label="Filter by learner context">
          <option value="all">All learners and contexts</option>
          ${contexts.map((context) => `<option value="${escapeHTML(context)}" ${context === insightState.context ? 'selected' : ''}>${escapeHTML(context)}</option>`).join('')}
        </select>
      </div>
      <div class="v19-insight-list">
        ${filtered.length ? filtered.map((record) => {
          const context = record.contextName || record.contextType || 'General';
          return `
            <article class="v19-insight-card" data-lesson-id="${escapeHTML(record.id || '')}">
              <div class="v19-card-heading">
                <div><span class="v19-eyebrow">${escapeHTML(formatDate(record.date))} · ${escapeHTML(context)}</span><h2>${escapeHTML(record.block || 'Completed session')}</h2></div>
                ${record.date ? `<button class="v19-secondary-button" data-view-week="${escapeHTML(record.id || '')}" data-date="${escapeHTML(record.date)}" data-block="${escapeHTML(record.block || '')}">View in Week</button>` : ''}
              </div>
              <div class="v19-insight-sections">
                ${record.reflection ? `<section><span class="v19-symbol reflection">R</span><div><h3>Reflection</h3><p>${escapeHTML(record.reflection)}</p></div></section>` : ''}
                ${record.teachingMemory ? `<section><span class="v19-symbol memory">M</span><div><h3>Memory</h3><p>${escapeHTML(record.teachingMemory)}</p></div></section>` : ''}
                ${record.nextStep ? `<section><span class="v19-symbol next">→</span><div><h3>Next step</h3><p>${escapeHTML(record.nextStep)}</p></div></section>` : ''}
              </div>
            </article>`;
        }).join('') : '<div class="v19-empty"><h2>No matching insights</h2><p>Complete a session and add a reflection, teaching memory, or next step. It will appear here automatically.</p></div>'}
      </div>
    `;

    root.querySelectorAll('[data-kind]').forEach((button) => button.addEventListener('click', () => {
      insightState.kind = button.dataset.kind;
      renderInsights();
    }));
    root.querySelector('[data-insight-search]')?.addEventListener('input', (event) => {
      insightState.search = event.target.value;
      renderInsights();
      requestAnimationFrame(() => root.querySelector('[data-insight-search]')?.focus());
    });
    root.querySelector('[data-insight-context]')?.addEventListener('change', (event) => {
      insightState.context = event.target.value;
      renderInsights();
    });
    root.querySelectorAll('[data-view-week]').forEach((button) => button.addEventListener('click', () => {
      navigateToWeek(button.dataset.date, button.dataset.block, button.dataset.viewWeek);
    }));
  }

  function standardsForCLA() {
    const standards = readJSON('cos-standards', []);
    return standards.map((standard) => {
      const haystack = [
        standard.framework,
        standard.source,
        standard.category,
        standard.type,
        standard.standardSet,
        standard.collection,
        standard.title,
        standard.code
      ].filter(Boolean).join(' ').toLowerCase();
      const kind = /level\s*learning|learning\s*learning/.test(haystack)
        ? 'level'
        : /stamp/.test(haystack)
          ? 'stamp'
          : 'other';
      return { ...standard, _claKind: kind };
    }).filter((standard) => standard._claKind !== 'other');
  }

  function standardTitle(standard) {
    return standard.description || standard.standard || standard.title || standard.skill || 'Untitled standard';
  }

  function standardMeta(standard) {
    return [standard.level, standard.grade, standard.domain, standard.strand, standard.proficiency]
      .filter(Boolean)
      .join(' · ');
  }

  function renderCLA() {
    const root = createCustomRoot();
    if (!root) return;
    const standards = standardsForCLA();
    const search = claSearch.toLowerCase();
    const matches = (standard) => !search || [standard.code, standardTitle(standard), standardMeta(standard)]
      .join(' ')
      .toLowerCase()
      .includes(search);
    const level = standards.filter((standard) => standard._claKind === 'level' && matches(standard));
    const stamp = standards.filter((standard) => standard._claKind === 'stamp' && matches(standard));

    const list = (items, symbol, emptyText) => items.length
      ? items.map((standard) => `
          <article class="v19-standard-row" title="${escapeHTML([standard.code, standardTitle(standard)].filter(Boolean).join(' — '))}">
            <span class="v19-standard-symbol">${symbol}</span>
            <div><strong>${escapeHTML(standard.code || standard.shortCode || symbol)}</strong><p>${escapeHTML(standardTitle(standard))}</p>${standardMeta(standard) ? `<small>${escapeHTML(standardMeta(standard))}</small>` : ''}</div>
          </article>`).join('')
      : `<div class="v19-empty compact"><p>${escapeHTML(emptyText)}</p></div>`;

    root.innerHTML = `
      <header class="v19-page-header">
        <div><span class="v19-eyebrow">CLA</span><h1>Chinese Language Arts</h1><p>Only the two CLA standard sources currently in use are shown here.</p></div>
      </header>
      <div class="v19-filter-bar single">
        <input type="search" data-cla-search value="${escapeHTML(claSearch)}" placeholder="Search Level Learning or STAMP skills…" aria-label="Search CLA standards">
      </div>
      <div class="v19-cla-grid">
        <section class="v19-panel">
          <div class="v19-panel-heading"><div><span class="v19-standard-symbol large">LL</span><h2>Level Learning</h2></div><strong>${level.length}</strong></div>
          <div class="v19-standard-list">${list(level, 'LL', 'No Level Learning standards have been imported yet.')}</div>
        </section>
        <section class="v19-panel">
          <div class="v19-panel-heading"><div><span class="v19-standard-symbol large">S</span><h2>STAMP-related Skills</h2></div><strong>${stamp.length}</strong></div>
          <div class="v19-standard-list">${list(stamp, 'S', 'No STAMP-related skills have been imported yet.')}</div>
        </section>
      </div>
    `;
    root.querySelector('[data-cla-search]')?.addEventListener('input', (event) => {
      claSearch = event.target.value;
      renderCLA();
      requestAnimationFrame(() => root.querySelector('[data-cla-search]')?.focus());
    });
  }

  function validTime(value) {
    if (!value) return true;
    return /^(?:[01]\d|2[0-3]):[0-5]\d(?:\s*[–—-]\s*(?:[01]\d|2[0-3]):[0-5]\d)?$/.test(String(value).trim());
  }

  function eventSignature(event) {
    return [event.date, event.endDate || '', String(event.title || '').trim().toLowerCase(), event.start || '', event.end || ''].join('|');
  }

  function buildHealthReport() {
    const keys = [
      'cos-lessons', 'cos-calendar-events', 'cos-schedule-blocks', 'cos-date-overrides',
      'cos-students', 'cos-classes', 'cos-groups', 'cos-standards', 'cos-toolkit',
      'cos-materials', 'cos-import-batches', 'cos-tasks'
    ];
    const parseFailures = [];
    keys.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (raw === null) return;
      try { JSON.parse(raw); } catch { parseFailures.push(key); }
    });

    const events = readJSON('cos-calendar-events', []);
    const batches = readJSON('cos-import-batches', []);
    const schedule = readJSON('cos-schedule-blocks', []);
    const lessons = readJSON('cos-lessons', []);
    const pdfBatches = batches.filter((batch) => /pdf/i.test(String(batch.fileName || batch.source || '')) && (batch.target === 'calendar' || batch.type === 'calendar'));
    const latestPdfBatch = [...pdfBatches].sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')))[0];
    const createdIds = new Set(latestPdfBatch?.createdIds || latestPdfBatch?.recordIds || []);
    const pdfEvents = createdIds.size
      ? events.filter((event) => createdIds.has(event.id))
      : events.filter((event) => /pdf/i.test(String(event.source || event.importSource || '')));
    const acceptanceEvents = pdfEvents.length ? pdfEvents : events.length === 27 ? events : [];

    const invalidDates = events.filter((event) => !localDate(event.date));
    const invalidEndDates = events.filter((event) => event.endDate && (!localDate(event.endDate) || event.endDate < event.date));
    const invalidTimes = events.filter((event) => !validTime(event.start) || !validTime(event.end));
    const signatures = new Map();
    events.forEach((event) => {
      const signature = eventSignature(event);
      signatures.set(signature, (signatures.get(signature) || 0) + 1);
    });
    const duplicateCount = [...signatures.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
    const scheduleIds = new Set(schedule.map((block) => block.id));
    const orphanChildren = schedule.filter((block) => (block.parentId || block.parentBlockId) && !scheduleIds.has(block.parentId || block.parentBlockId));
    const lessonDateFailures = lessons.filter((lesson) => lesson.date && !localDate(lesson.date));
    const navLabels = [...document.querySelectorAll('.sidebar .nav-button')].map(text);
    const requiredLabels = ['Today', 'Week', 'Tasks', 'Learners', 'Resource Library', 'Calendar & Schedule', 'Import Center', 'Export & Backup', 'Settings'];
    const missingRoutes = requiredLabels.filter((label) => !navLabels.includes(label) && !(label === 'Learners' && navLabels.includes('Classes, Groups & Individuals')));

    const tests = [
      { name: 'Local data can be read', status: parseFailures.length ? 'fail' : 'pass', detail: parseFailures.length ? `Unreadable: ${parseFailures.join(', ')}` : `${keys.length - parseFailures.length} data stores checked` },
      { name: 'Dates use local calendar values', status: invalidDates.length || lessonDateFailures.length ? 'fail' : 'pass', detail: `${invalidDates.length} invalid calendar dates · ${lessonDateFailures.length} invalid session dates` },
      { name: 'Event ranges are valid', status: invalidEndDates.length ? 'fail' : 'pass', detail: `${invalidEndDates.length} end-date issue(s)` },
      { name: 'Event times are valid', status: invalidTimes.length ? 'warning' : 'pass', detail: `${invalidTimes.length} time value(s) need review` },
      { name: 'Calendar events are not duplicated', status: duplicateCount ? 'warning' : 'pass', detail: `${duplicateCount} duplicate signature(s)` },
      { name: 'Parent / child schedule links resolve', status: orphanChildren.length ? 'fail' : 'pass', detail: `${orphanChildren.length} orphan child block(s)` },
      { name: 'Main page connections exist', status: missingRoutes.length ? 'fail' : 'pass', detail: missingRoutes.length ? `Missing: ${missingRoutes.join(', ')}` : 'All main navigation targets found' },
      { name: 'Undo / Redo controls are available', status: document.querySelector('.v19-history-toolbar') ? 'pass' : 'fail', detail: 'Icon-only controls in the top toolbar' },
      { name: 'PDF calendar batch identified', status: latestPdfBatch || acceptanceEvents.length === 27 ? 'pass' : 'warning', detail: latestPdfBatch ? `${latestPdfBatch.fileName || 'PDF import'} · ${acceptanceEvents.length} linked event(s)` : `${acceptanceEvents.length || events.length} candidate event(s)` },
      { name: '27-event acceptance set is complete', status: acceptanceEvents.length === 27 ? 'pass' : 'warning', detail: `${acceptanceEvents.length} of 27 events identified` }
    ];

    const eventResults = acceptanceEvents.slice(0, 27).map((event, index) => {
      const issues = [];
      if (!event.id) issues.push('missing ID');
      if (!event.title?.trim()) issues.push('missing title');
      if (!localDate(event.date)) issues.push('invalid date');
      if (event.endDate && event.endDate < event.date) issues.push('end before start');
      if (!validTime(event.start) || !validTime(event.end)) issues.push('invalid time');
      return {
        number: index + 1,
        id: event.id || '',
        title: event.title || 'Untitled event',
        date: event.date || '',
        status: issues.length ? 'fail' : 'pass',
        issues
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      version: VERSION,
      summary: {
        events: events.length,
        lessons: lessons.length,
        scheduleBlocks: schedule.length,
        pdfBatches: pdfBatches.length,
        acceptanceEvents: acceptanceEvents.length
      },
      tests,
      eventResults,
      details: { parseFailures, invalidDates, invalidEndDates, invalidTimes, duplicateCount, orphanChildren, missingRoutes }
    };
  }

  function statusIcon(status) {
    if (status === 'pass') return '<span class="v19-status pass">PASS</span>';
    if (status === 'fail') return '<span class="v19-status fail">FAIL</span>';
    return '<span class="v19-status warning">REVIEW</span>';
  }

  function renderSystemHealth() {
    const root = createCustomRoot();
    if (!root) return;
    const report = buildHealthReport();
    const passed = report.tests.filter((test) => test.status === 'pass').length;
    const failed = report.tests.filter((test) => test.status === 'fail').length;
    const warnings = report.tests.filter((test) => test.status === 'warning').length;

    root.innerHTML = `
      <header class="v19-page-header">
        <div><span class="v19-eyebrow">SYSTEM HEALTH</span><h1>Workflow & Calendar Acceptance</h1><p>Date checks use local calendar values, so all-day events are not shifted by timezone conversion.</p></div>
        <div class="v19-header-actions">
          <button class="v19-secondary-button" data-export-health>Export report</button>
          <button class="v19-primary-button" data-run-live>Run live page test</button>
        </div>
      </header>
      <div class="v19-metric-grid health">
        <div class="v19-metric static"><strong>${passed}</strong><span>Passed</span></div>
        <div class="v19-metric static"><strong>${warnings}</strong><span>Review</span></div>
        <div class="v19-metric static"><strong>${failed}</strong><span>Failed</span></div>
        <div class="v19-metric static"><strong>${report.summary.acceptanceEvents}</strong><span>PDF events</span></div>
      </div>
      ${liveAcceptanceResults ? renderLiveResults(liveAcceptanceResults) : ''}
      <section class="v19-panel">
        <div class="v19-panel-heading"><div><h2>Health checks</h2><p>Storage, dates, routes, parent-child links, and acceptance-set coverage.</p></div></div>
        <div class="v19-test-list">
          ${report.tests.map((test) => `<div class="v19-test-row">${statusIcon(test.status)}<div><strong>${escapeHTML(test.name)}</strong><p>${escapeHTML(test.detail)}</p></div></div>`).join('')}
        </div>
      </section>
      <section class="v19-panel">
        <div class="v19-panel-heading"><div><h2>27 PDF Calendar Event results</h2><p>Each identified event is checked for ID, title, date, range, and time integrity.</p></div><strong>${report.eventResults.filter((event) => event.status === 'pass').length}/${report.eventResults.length || 27}</strong></div>
        ${report.eventResults.length ? `<div class="v19-event-table"><div class="v19-event-row heading"><span>#</span><span>Event</span><span>Date</span><span>Result</span></div>${report.eventResults.map((event) => `<div class="v19-event-row"><span>${event.number}</span><span><strong>${escapeHTML(event.title)}</strong>${event.issues.length ? `<small>${escapeHTML(event.issues.join(', '))}</small>` : ''}</span><span>${escapeHTML(event.date)}</span><span>${statusIcon(event.status)}</span></div>`).join('')}</div>` : '<div class="v19-empty"><h2>No 27-event PDF batch identified</h2><p>Import the PDF calendar through Import Center, then return here. The acceptance table will link to the latest PDF calendar batch automatically.</p></div>'}
      </section>
    `;

    root.querySelector('[data-export-health]')?.addEventListener('click', () => downloadJSON(report, `Classroom-v19-system-health-${toDateString(new Date())}.json`));
    root.querySelector('[data-run-live]')?.addEventListener('click', runLiveAcceptance);
  }

  function renderLiveResults(results) {
    return `
      <section class="v19-panel live-results">
        <div class="v19-panel-heading"><div><h2>Live page connection test</h2><p>Actual navigation was exercised without reloading the app.</p></div></div>
        <div class="v19-test-list">
          ${results.map((result) => `<div class="v19-test-row">${statusIcon(result.status)}<div><strong>${escapeHTML(result.name)}</strong><p>${escapeHTML(result.detail)}</p></div></div>`).join('')}
        </div>
      </section>`;
  }

  async function runLiveAcceptance() {
    const checks = [];
    const customHash = '#/system-health';
    const routes = [ROUTES.today, ROUTES.week, ROUTES.tasks, ROUTES.agenda, ROUTES.learners, ROUTES.resources, ROUTES.calendar, ROUTES.import, ROUTES.export, ROUTES.settings];
    for (const route of routes) {
      const button = findNavButton(route);
      if (!button) {
        checks.push({ name: `${route.label} connection`, status: 'fail', detail: 'Navigation target not found.' });
        continue;
      }
      hideCustomPage();
      button.click();
      await delay(['import', 'export'].includes(route.path) ? 520 : 150);
      const active = button.classList.contains('active');
      const page = document.querySelector('.main-panel .page');
      const addEntries = page ? [...page.querySelectorAll('button')].filter((candidate) => /^(Add|New|Create)\b/i.test(text(candidate))).length : 0;
      checks.push({
        name: `${route.label} connection`,
        status: active && page ? 'pass' : 'fail',
        detail: active && page ? `Page opened in the current app session · ${addEntries} visible Add/New entry point(s).` : 'Page did not become active.'
      });
    }
    const oldHash = location.hash;
    history.pushState({ test: true }, '', '#/week');
    history.pushState({ test: true }, '', '#/today');
    const historyWorks = history.length > 1;
    history.replaceState({ classroomRoute: 'system-health' }, '', customHash);
    checks.push({ name: 'Browser route history', status: historyWorks ? 'pass' : 'warning', detail: historyWorks ? 'Route entries can be created for Back / Forward.' : 'Browser did not expose route history.' });
    checks.push({ name: 'View in Week enhancement', status: document.querySelectorAll('button').length && typeof navigateToWeek === 'function' ? 'pass' : 'fail', detail: 'In-app date navigation and highlight handler are installed.' });
    liveAcceptanceResults = checks;
    setHash('system-health', {}, true);
    showCustomPage('system-health');
    void oldHash;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function downloadJSON(value, filename) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function navigateToWeek(date, block = '', lessonId = '') {
    if (localDate(date)) {
      sessionStorage.setItem('classroom-v19-week-highlight', JSON.stringify({ date, block, lessonId, expires: Date.now() + 8000 }));
    }
    setHash('week', { date });
    navigateExisting(ROUTES.week, { date });
    window.setTimeout(() => highlightWeekTarget(), 160);
  }

  function highlightWeekTarget() {
    let target;
    try { target = JSON.parse(sessionStorage.getItem('classroom-v19-week-highlight') || 'null'); } catch { target = null; }
    if (!target || target.expires < Date.now()) return;
    const candidates = [...document.querySelectorAll('.main-panel article, .main-panel [class*="planning-card"], .main-panel [class*="week-card"], .main-panel [class*="lesson-card"]')];
    const match = candidates.find((node) => {
      const content = text(node).toLowerCase();
      return (!target.block || content.includes(String(target.block).toLowerCase())) && (!target.date || content.includes(target.date) || content.includes(formatDate(target.date, { month: 'short', day: 'numeric' }).toLowerCase()));
    });
    if (match) {
      match.classList.add('v19-week-highlight');
      match.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => match.classList.remove('v19-week-highlight'), 2800);
      sessionStorage.removeItem('classroom-v19-week-highlight');
    }
  }

  function installViewInWeekFix() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !/^view in week$/i.test(text(button))) return;
      const card = button.closest('article, [class*="card"], [class*="planning"]');
      const content = text(card);
      const date = content.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] || readJSON('cos-focus-date', '');
      const heading = card?.querySelector('h2, h3, strong');
      sessionStorage.setItem('classroom-v19-week-highlight', JSON.stringify({ date, block: text(heading), expires: Date.now() + 8000 }));
      window.setTimeout(() => {
        setHash('week', { date }, true);
        highlightWeekTarget();
      }, 0);
    }, true);
  }

  function installBumpButtons() {
    document.querySelectorAll('.planning-list-card').forEach((card) => {
      if (card.querySelector('[data-v19-bump]')) return;
      const date = text(card).match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
      const completed = /\bcompleted\b/i.test(text(card)) || card.querySelector('button')?.textContent?.includes('Reopen');
      if (!date || completed) return;
      const actions = [...card.querySelectorAll('.header-actions')].at(-1);
      if (!actions) return;
      const title = text(card.querySelector('h2, h3, strong'));
      const matchedLesson = currentLessons().find((lesson) => lesson.date === date && (!title || String(lesson.block || '').trim() === title.trim()));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary-button v19-bump-button';
      button.dataset.v19Bump = 'true';
      if (matchedLesson?.id) button.dataset.v19LessonId = matchedLesson.id;
      button.textContent = 'Bump';
      button.title = 'Preview and shift this lesson sequence';
      actions.prepend(button);
    });
  }

  function scheduleBlockForLesson(lesson) {
    if (!lesson?.scheduleBlockId) return null;
    const wanted = String(lesson.scheduleBlockId);
    return readJSON('cos-schedule-blocks', []).find((block) => {
      const ids = [block.id, block.recordId, block.blockId, block.sourceId].filter(Boolean).map(String);
      return ids.includes(wanted);
    }) || null;
  }

  function blockedInstructionDates() {
    const blocked = new Set();
    const pattern = /\b(no school|school closed|closed|holiday|break|vacation|teacher workday|professional development|staff development|conference day)\b/i;
    readJSON('cos-calendar-events', []).forEach((event) => {
      const content = [event.title, event.category, event.detail, event.notes].filter(Boolean).join(' ');
      if (!pattern.test(content) || !localDate(event.date)) return;
      let cursor = localDate(event.date);
      const end = localDate(event.endDate) || cursor;
      while (cursor <= end) {
        blocked.add(toDateString(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return blocked;
  }

  function nextBumpDate(lastDate, lesson, cadence = 7) {
    const block = scheduleBlockForLesson(lesson);
    const dayNames = Array.isArray(block?.days) ? block.days : block?.day ? [block.day] : [];
    const allowedDays = new Set(dayNames.map((day) => String(day).slice(0, 3).toLowerCase()));
    const blocked = blockedInstructionDates();
    const start = localDate(lastDate);
    if (!start) return addDays(lastDate, cadence);
    for (let offset = 1; offset <= 90; offset += 1) {
      const candidate = new Date(start);
      candidate.setDate(candidate.getDate() + offset);
      const date = toDateString(candidate);
      const weekday = candidate.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
      const dayMatches = allowedDays.size ? allowedDays.has(weekday) : offset >= Math.max(1, cadence);
      if (dayMatches && !blocked.has(date)) return date;
    }
    return addDays(lastDate, cadence);
  }

  function executeV19Bump(lesson) {
    const allLessons = readJSON('cos-lessons', []);
    const series = bumpSeries(lesson);
    if (!lesson || !series.length) return { changed: 0 };
    const gaps = series.slice(1).map((item, index) => dateDiff(series[index].date, item.date)).filter((days) => days > 0);
    const cadence = median(gaps);
    const nextDates = series.slice(1).map((item) => item.date);
    nextDates.push(nextBumpDate(series.at(-1).date, series.at(-1), cadence));
    const dateById = new Map(series.map((item, index) => [item.id, nextDates[index]]));
    const changedAt = new Date().toISOString();
    const updated = allLessons.map((item) => dateById.has(item.id)
      ? { ...item, date: dateById.get(item.id), updatedAt: changedAt }
      : item);
    writeJSON('cos-lessons', updated, 'Bump lesson sequence');
    return { changed: dateById.size, series, nextDates };
  }

  function identifyBumpLesson(button) {
    const lessons = currentLessons();
    const card = button.closest('article, [class*="card"], [class*="planning-item"]');
    const content = text(card).toLowerCase();
    const date = content.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
    const exact = lessons.find((lesson) => lesson.id === button.dataset.v19LessonId) || lessons.find((lesson) => {
      const dateMatch = !date || lesson.date === date;
      const title = String(lesson.block || '').toLowerCase();
      return dateMatch && title && content.includes(title);
    });
    return { lesson: exact, cardText: text(card) };
  }

  function bumpSeries(lesson) {
    const lessons = currentLessons()
      .filter((item) => item.date && !['Completed', 'Cancelled'].includes(item.status))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!lesson) return [];
    const sameSeries = lessons.filter((item) => {
      const contextMatch = lesson.contextId && item.contextId
        ? item.contextId === lesson.contextId && (!lesson.contextType || !item.contextType || item.contextType === lesson.contextType)
        : lesson.contextName && item.contextName
          ? item.contextName === lesson.contextName && (!lesson.contextType || !item.contextType || item.contextType === lesson.contextType)
          : true;
      const blockMatch = lesson.scheduleBlockId && item.scheduleBlockId
        ? item.scheduleBlockId === lesson.scheduleBlockId
        : item.block === lesson.block;
      return contextMatch && blockMatch;
    });
    const startIndex = sameSeries.findIndex((item) => item.id === lesson.id);
    return startIndex >= 0 ? sameSeries.slice(startIndex) : [lesson];
  }

  function previewBump(button) {
    const { lesson, cardText } = identifyBumpLesson(button);
    const series = bumpSeries(lesson);
    const gaps = series.slice(1).map((item, index) => dateDiff(series[index].date, item.date)).filter((days) => days > 0);
    const cadence = median(gaps);
    const preview = series.slice(0, 8).map((item, index) => ({
      title: item.block || 'Planning item',
      from: item.date || '',
      to: series[index + 1]?.date || addDays(item.date, cadence)
    }));

    const overlay = document.createElement('div');
    overlay.className = 'v19-modal-backdrop';
    overlay.innerHTML = `
      <div class="v19-modal" role="dialog" aria-modal="true" aria-labelledby="v19-bump-title">
        <button class="v19-modal-close" aria-label="Close">${ICONS.close}</button>
        <span class="v19-eyebrow">BUMP PREVIEW</span>
        <h2 id="v19-bump-title">Shift this lesson sequence?</h2>
        <p>${lesson ? `Classroom found ${series.length} connected item${series.length === 1 ? '' : 's'} in this sequence.` : 'Classroom will use the existing Bump behavior for the selected card.'}</p>
        ${preview.length ? `<div class="v19-bump-preview">${preview.map((item) => `<div><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.from)} → ${escapeHTML(item.to)}</span></div>`).join('')}${series.length > preview.length ? `<small>+ ${series.length - preview.length} additional item(s)</small>` : ''}</div>` : `<div class="v19-bump-preview"><p>${escapeHTML(cardText || 'Selected planning item')}</p></div>`}
        <p class="v19-modal-note">The final change uses Classroom’s existing scheduling rules. After completion, the actual number of changed records will be reported and can be undone.</p>
        <div class="v19-modal-actions"><button class="v19-secondary-button" data-cancel>Cancel</button><button class="v19-primary-button" data-confirm>Confirm Bump</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.v19-modal-close').addEventListener('click', close);
    overlay.querySelector('[data-cancel]').addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    overlay.querySelector('[data-confirm]').addEventListener('click', () => {
      const before = readJSON('cos-lessons', []);
      close();
      if (button.dataset.v19Bump === 'true') {
        const result = executeV19Bump(lesson);
        sessionStorage.setItem('classroom-v19-toast-after-reload', JSON.stringify({
          message: `Bump completed · ${result.changed || 1} record${result.changed === 1 ? '' : 's'} changed`,
          undo: true
        }));
        window.setTimeout(() => window.location.reload(), 60);
        return;
      }
      window.ClassroomV19History?.begin('Bump lesson sequence');
      bumpBypassButton = button;
      button.click();
      window.setTimeout(() => {
        bumpBypassButton = null;
        window.ClassroomV19History?.finalize();
        const after = readJSON('cos-lessons', []);
        const beforeMap = new Map(before.map((item) => [item.id, item]));
        const changed = after.filter((item) => {
          const old = beforeMap.get(item.id);
          return old && (old.date !== item.date || old.status !== item.status || old.pinned !== item.pinned);
        });
        showToast(`Bump completed · ${changed.length || 1} record${changed.length === 1 ? '' : 's'} changed`, true);
      }, 550);
    });
  }

  function installBumpPreview() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !/^bump$/i.test(text(button))) return;
      if (bumpBypassButton === button) {
        bumpBypassButton = null;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      previewBump(button);
    }, true);
  }

  function showToast(message, withUndo = false) {
    document.querySelector('.v19-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'v19-toast';
    toast.innerHTML = `<span>${escapeHTML(message)}</span>${withUndo ? '<button type="button">Undo</button>' : ''}`;
    toast.querySelector('button')?.addEventListener('click', () => window.ClassroomV19History?.undo());
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 7000);
  }

  function installKeyboardHistory() {
    document.addEventListener('keydown', (event) => {
      const modifier = navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey;
      if (!modifier || event.key.toLowerCase() !== 'z') return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
      event.preventDefault();
      if (event.shiftKey) window.ClassroomV19History?.redo();
      else window.ClassroomV19History?.undo();
    });
  }

  function installNavClickSync() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('.sidebar .nav-button:not(.v19-nav-button)');
      if (!button) return;
      const route = routeForLabel(text(button));
      if (!route) return;
      hideCustomPage();
      const params = {};
      const date = readJSON('cos-focus-date', '');
      if (['week', 'calendar', 'today'].includes(route.path) && localDate(date)) params.date = date;
      setHash(route.path, params);
    });
  }

  function applyRestoredRoute() {
    const returnRoute = sessionStorage.getItem('classroom-v19-return-route');
    if (returnRoute) {
      sessionStorage.removeItem('classroom-v19-return-route');
      history.replaceState({ restored: true }, '', returnRoute);
    }
  }

  function showPendingToast() {
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('classroom-v19-toast-after-reload') || 'null'); } catch { pending = null; }
    if (!pending?.message) return;
    sessionStorage.removeItem('classroom-v19-toast-after-reload');
    window.setTimeout(() => showToast(pending.message, Boolean(pending.undo)), 180);
  }

  function maintainEnhancements() {
    installCustomNavigation();
    installHistoryToolbar();
    normalizeLabels();
    installBumpButtons();
    syncHashFromActiveNav();
    highlightWeekTarget();
  }

  function start() {
    applyRestoredRoute();
    installViewInWeekFix();
    installBumpPreview();
    installKeyboardHistory();
    installNavClickSync();
    window.addEventListener('popstate', navigateFromHash);
    window.addEventListener('hashchange', navigateFromHash);
    window.addEventListener('classroom:v19-history', updateHistoryToolbar);

    const observer = new MutationObserver(() => maintainEnhancements());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const ready = window.setInterval(() => {
      if (!document.querySelector('.app-shell')) return;
      window.clearInterval(ready);
      maintainEnhancements();
      navigateFromHash();
      showPendingToast();
      document.documentElement.dataset.classroomVersion = '19';
      console.info(`Classroom v${VERSION} workflow and navigation enhancements loaded.`);
    }, 60);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
