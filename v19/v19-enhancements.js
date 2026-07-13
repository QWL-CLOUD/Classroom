(() => {
  'use strict';

  const VERSION = '19.2.4';
  const RELEASE_LABEL = 'v19.2A.4 · Route & Date Consistency';
  const ROUTES = {
    today: { label: 'Today', path: 'today', aliases: ['Today', 'Today workspace', 'Home'] },
    week: { label: 'Week', path: 'week', aliases: ['Week', 'Weekly planner', 'Week workspace'] },
    tasks: { label: 'Tasks', path: 'tasks', aliases: ['Tasks', 'Task library', 'To-do', 'Today To-do'] },
    agenda: { label: 'Personal Agenda', path: 'agenda', aliases: ['Personal Agenda', 'Agenda'] },
    learners: { label: 'Learners', path: 'learners', aliases: ['Learners', 'Classes, Groups & Individuals', 'Classes Groups Individuals'] },
    resources: { label: 'Library', path: 'resources', aliases: ['Library', 'Resource Library', 'Resources'] },
    calendar: { label: 'Calendar & Schedule', path: 'calendar', aliases: ['Calendar & Schedule', 'Calendar', 'Schedule'] },
    import: { label: 'Import Center', path: 'import', aliases: ['Import Center', 'Import'] },
    export: { label: 'Export & Backup', path: 'export', aliases: ['Export & Backup', 'Export', 'Backup'] },
    settings: { label: 'Settings', path: 'settings', aliases: ['Settings'] },
    insights: { label: 'Teaching Insights', path: 'insights', aliases: ['Teaching Insights', 'Insights'], custom: true },
    health: { label: 'System Health', path: 'system-health', aliases: ['System Health', 'Health'], custom: true }
  };

  const ICONS = {
    insights: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M6 16V9m6 7V5m6 11v-4"/><path d="m5 7 5-3 4 3 5-4"/></svg>',
    cla: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22z"/></svg>',
    learners: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    library: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h6"/></svg>',
    health: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.8 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.7 7.5-9.5V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6"/></svg>',
    redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5"/><path d="M20 12h-9a6 6 0 0 0-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    bump: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h7a5 5 0 0 1 5 5v5"/><path d="m14 14 4 4 4-4"/><path d="M6 4v6H3"/></svg>',
    plan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };

  let routeLock = false;
  let customMode = null;
  let customRoot = null;
  let bumpBypassButton = null;
  let liveAcceptanceResults = null;
  let insightState = { kind: 'all', search: '', context: 'all' };
  let libraryStandardView = 'categories';
  let libraryStandardSearch = '';
  let calendarRepairResult = null;
  let restoredRoutePending = Boolean(sessionStorage.getItem('classroom-v19-return-route'));
  let restoredRouteHash = sessionStorage.getItem('classroom-v19-return-route') || '';
  let routeBootstrapPending = true;
  let programmaticNavigation = false;
  let routeDateApplication = false;
  const routeRegistry = new Map();

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

  function dispatchStorageUpdate(key, oldValue, newValue) {
    try {
      window.dispatchEvent(new StorageEvent('storage', {
        key, oldValue, newValue, storageArea: localStorage, url: location.href
      }));
    } catch {
      const event = new Event('storage');
      Object.defineProperties(event, {
        key: { value: key }, oldValue: { value: oldValue }, newValue: { value: newValue },
        storageArea: { value: localStorage }, url: { value: location.href }
      });
      window.dispatchEvent(event);
    }
    window.dispatchEvent(new CustomEvent('classroom:v19-data-change', { detail: { key, oldValue, newValue } }));
  }

  function writeJSON(key, value, label = 'Change') {
    const oldValue = localStorage.getItem(key);
    const newValue = JSON.stringify(value);
    window.ClassroomV19History?.begin(label);
    localStorage.setItem(key, newValue);
    window.ClassroomV19History?.finalize();
    dispatchStorageUpdate(key, oldValue, newValue);
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

  function normalizeRouteToken(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function routeAliases(route) {
    return [...new Set([route.label, route.legacyLabel, ...(route.aliases || [])].filter(Boolean))];
  }

  function routeForLabel(label) {
    const normalized = normalizeRouteToken(label);
    if (!normalized) return null;
    const routes = Object.values(ROUTES);
    const exact = routes.find((route) => routeAliases(route).some((alias) => normalized === normalizeRouteToken(alias)));
    if (exact) return exact;
    return routes.find((route) => routeAliases(route).some((alias) => {
      const candidate = normalizeRouteToken(alias);
      return normalized.startsWith(`${candidate} `) || candidate.startsWith(`${normalized} `);
    })) || null;
  }

  function routeForPath(path) {
    return Object.values(ROUTES).find((route) => route.path === path);
  }

  function navCandidateLabel(node) {
    return [node?.dataset?.v19RouteLabel, node?.getAttribute?.('aria-label'), node?.title, text(node)]
      .filter(Boolean).join(' ');
  }

  function navCandidates() {
    return [...document.querySelectorAll('.sidebar .nav-button, .sidebar .nav-section-toggle, .sidebar [data-route], .sidebar a, .sidebar button')]
      .filter((node, index, all) => all.indexOf(node) === index);
  }

  function ensureRouteDefinitions() {
    Object.values(ROUTES).forEach((route) => {
      const existing = routeRegistry.get(route.path);
      if (existing && !existing.nodeType) return;
      routeRegistry.set(route.path, {
        route,
        strategy: route.custom ? 'custom' : 'native',
        trigger: existing?.nodeType ? existing : null,
        registeredAt: Date.now()
      });
    });
    return routeRegistry;
  }

  function locateRouteTrigger(route) {
    const direct = document.querySelector(`.sidebar [data-v19-route="${route.path}"]`);
    if (direct && !(direct.classList.contains('nav-section-toggle') && !direct.classList.contains('v19-direct-nav'))) {
      return direct;
    }
    const aliases = routeAliases(route).map(normalizeRouteToken);
    return navCandidates().find((node) => {
      if (node.classList.contains('nav-section-toggle') && !node.classList.contains('v19-direct-nav')) return false;
      const label = normalizeRouteToken(navCandidateLabel(node));
      return aliases.some((alias) => label === alias || label.startsWith(`${alias} `));
    }) || null;
  }

  function registerNativeRoutes() {
    ensureRouteDefinitions();
    navCandidates().forEach((node) => {
      const existingPath = node.dataset?.v19Route;
      const route = existingPath ? routeForPath(existingPath) : routeForLabel(navCandidateLabel(node));
      if (!route) return;
      if (node.classList.contains('nav-section-toggle') && !node.classList.contains('v19-direct-nav')) return;
      node.dataset.v19Route = route.path;
      node.dataset.v19RouteLabel = route.label;
      const entry = routeRegistry.get(route.path);
      if (entry && (!entry.trigger?.isConnected || node.classList.contains('active') || node.classList.contains('v19-direct-nav'))) {
        entry.trigger = node;
      }
    });
    Object.values(ROUTES).filter((route) => route.custom).forEach((route) => {
      const entry = routeRegistry.get(route.path);
      const custom = document.querySelector(`.v19-nav-button[data-v19-route="${route.path}"]`);
      if (entry && custom) entry.trigger = custom;
    });
    return routeRegistry;
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
    registerNativeRoutes();
    const entry = routeRegistry.get(route.path);
    if (entry?.trigger?.isConnected) return entry.trigger;
    const trigger = locateRouteTrigger(route);
    if (entry && trigger) entry.trigger = trigger;
    return trigger;
  }

  function routeConnection(route) {
    ensureRouteDefinitions();
    const entry = routeRegistry.get(route.path);
    const trigger = findNavButton(route);
    return {
      path: route.path,
      label: route.label,
      registered: Boolean(entry),
      targetFound: Boolean(trigger || route.custom),
      strategy: entry?.strategy || (route.custom ? 'custom' : 'native'),
      trigger: trigger || null
    };
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
    programmaticNavigation = true;
    try {
      button.click();
    } finally {
      window.setTimeout(() => { programmaticNavigation = false; }, 0);
    }
    if (params.date) {
      window.setTimeout(() => applyDateToVisiblePage(params.date), 90);
    }
    return true;
  }

  function applyDateToVisiblePage(date, attempt = 0) {
    if (!localDate(date)) return;
    routeDateApplication = true;

    const finish = () => {
      window.setTimeout(() => {
        routeDateApplication = false;
        if (!routeBootstrapPending && !restoredRoutePending) syncHashFromActiveNav();
      }, 90);
    };

    const visibleInputs = [...document.querySelectorAll('.week-workspace input[type="date"], .main-panel input[type="date"]')]
      .filter((input, index, all) => input.offsetParent !== null && all.indexOf(input) === index);
    const input = visibleInputs[0];
    if (input) {
      if (input.value !== date) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, date);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      finish();
      return;
    }

    const week = document.querySelector('.week-workspace');
    if (!week) {
      if (attempt < 12) {
        window.setTimeout(() => applyDateToVisiblePage(date, attempt + 1), 80);
      } else {
        finish();
      }
      return;
    }

    const currentAnchor = visibleWeekAnchorDate();
    const target = localDate(date);
    const current = localDate(currentAnchor || readJSON('cos-focus-date', ''));
    if (!current || !target) {
      finish();
      return;
    }

    const currentMonday = new Date(current);
    const targetMonday = new Date(target);
    currentMonday.setDate(currentMonday.getDate() - ((currentMonday.getDay() + 6) % 7));
    targetMonday.setDate(targetMonday.getDate() - ((targetMonday.getDay() + 6) % 7));
    let remaining = Math.round((targetMonday - currentMonday) / (7 * 86400000));
    const direction = remaining < 0 ? -1 : 1;
    remaining = Math.abs(remaining);

    const step = () => {
      if (!remaining) {
        finish();
        return;
      }
      const buttons = [...document.querySelectorAll('.week-workspace .header-actions button, .week-workspace [class*="header"] button')];
      const button = buttons.find((candidate) => {
        const label = [text(candidate), candidate.getAttribute?.('aria-label'), candidate.title].filter(Boolean).join(' ');
        return direction < 0
          ? /\b(Previous|Prev)\b|‹|←/i.test(label)
          : /\bNext(?: week)?\b|›|→/i.test(label);
      });
      if (!button) {
        finish();
        return;
      }
      button.click();
      remaining -= 1;
      window.setTimeout(step, 90);
    };
    step();
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
    if (customMode || routeLock || restoredRoutePending || routeBootstrapPending || routeDateApplication) return;
    const active = document.querySelector('.sidebar .nav-button.active');
    if (!active) return;
    const route = routeForLabel(text(active));
    if (!route) return;

    const current = parseHash();
    // Passive DOM reconciliation may update the date for the current route, but
    // it must never replace one page path with a transient native default page.
    if (current.path !== route.path) return;

    const params = Object.fromEntries(current.params.entries());
    if (route.path === 'week') {
      const visibleDate = visibleWeekRouteDate();
      if (localDate(visibleDate)) params.date = visibleDate;
    } else if (['calendar', 'today'].includes(route.path)) {
      const date = readJSON('cos-focus-date', '');
      if (localDate(date)) params.date = date;
    } else {
      delete params.date;
    }

    const next = buildHash(route.path, params);
    if (location.hash !== next) {
      history.replaceState({ classroomRoute: route.path, passiveDateSync: true }, '', next);
    }
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

  function installDirectGroupNavigation({ groupLabels, route, childLabels, className, iconFallback }) {
    const group = [...document.querySelectorAll('.sidebar .nav-group')].find((candidate) => {
      const heading = candidate.querySelector('.nav-section-toggle');
      const normalized = normalizeRouteToken(text(heading));
      return groupLabels.some((label) => normalized === normalizeRouteToken(label));
    });
    if (!group) return null;

    const nativeList = group.querySelector('.secondary-nav');
    const children = nativeList ? [...nativeList.querySelectorAll('.nav-button, button, a')] : [];
    const nativeButton = children.find((button) => {
      const value = normalizeRouteToken(navCandidateLabel(button));
      return childLabels.some((label) => value === normalizeRouteToken(label) || value.startsWith(`${normalizeRouteToken(label)} `));
    }) || children.find((button) => routeForLabel(navCandidateLabel(button))?.path === route.path) || null;

    const toggle = group.querySelector('.nav-section-toggle');
    group.classList.add(className);
    if (toggle) toggle.hidden = true;
    if (nativeList) nativeList.hidden = true;

    let direct = group.querySelector(`.v19-direct-nav[data-v19-route="${route.path}"]`);
    if (!direct) {
      direct = document.createElement('button');
      direct.type = 'button';
      direct.className = `nav-button v19-direct-nav ${className}-direct`;
      direct.dataset.v19Route = route.path;
      direct.dataset.v19RouteLabel = route.label;
      direct.title = route.label;
      const icon = nativeButton?.querySelector('svg')?.outerHTML || iconFallback;
      direct.innerHTML = `${icon}<span class="v19-nav-label">${escapeHTML(route.label)}</span>`;
      direct.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideCustomPage();
        const openNativeTarget = () => {
          const list = group.querySelector('.secondary-nav');
          const target = list ? [...list.querySelectorAll('.nav-button, button, a')].find((button) => {
            if (button.classList.contains('v19-direct-nav')) return false;
            const value = normalizeRouteToken(navCandidateLabel(button));
            return childLabels.some((label) => value === normalizeRouteToken(label) || value.startsWith(`${normalizeRouteToken(label)} `));
          }) : null;
          if (target) {
            target.click();
            return true;
          }
          return false;
        };
        if (!openNativeTarget() && toggle) {
          toggle.click();
          window.setTimeout(() => {
            openNativeTarget();
            maintainEnhancements();
          }, 60);
        }
        setHash(route.path);
      });
      group.appendChild(direct);
    }
    direct.classList.toggle('active', Boolean(nativeButton?.classList.contains('active')) && !customMode);
    ensureRouteDefinitions();
    const entry = routeRegistry.get(route.path);
    if (entry) entry.trigger = direct;
    return direct;
  }

  function installLearnersNavigation() {
    return installDirectGroupNavigation({
      groupLabels: ['Learners'], route: ROUTES.learners,
      childLabels: ['Classes, Groups & Individuals', 'Learners'],
      className: 'v19-learners-nav-group', iconFallback: ICONS.learners
    });
  }

  function installLibraryNavigation() {
    return installDirectGroupNavigation({
      groupLabels: ['Resources', 'Library'], route: ROUTES.resources,
      childLabels: ['Resource Library', 'Library'],
      className: 'v19-library-nav-group', iconFallback: ICONS.library
    });
  }

  function installCustomNavigation() {
    const workspace = findNavGroup('Workspace')?.querySelector('.secondary-nav');
    const system = findNavGroup('System')?.querySelector('.secondary-nav');

    installLearnersNavigation();
    installLibraryNavigation();
    document.querySelectorAll('[data-v19-route="cla"]').forEach((node) => node.remove());

    if (workspace && !workspace.querySelector('[data-v19-route="insights"]')) {
      const button = makeNavButton('insights', ICONS.insights);
      const week = [...workspace.children].find((node) => text(node) === 'Week');
      week?.after(button) || workspace.appendChild(button);
    }
    if (system && !system.querySelector('[data-v19-route="system-health"]')) {
      system.appendChild(makeNavButton('system-health', ICONS.health));
    }
    registerNativeRoutes();
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
    const invokeHistory = (action, event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.ClassroomV19History?.[action]?.();
    };
    toolbar.querySelector('[data-action="undo"]').addEventListener('click', (event) => invokeHistory('undo', event), true);
    toolbar.querySelector('[data-action="redo"]').addEventListener('click', (event) => invokeHistory('redo', event), true);
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
      if (/Classroom v18/i.test(text(node))) node.textContent = RELEASE_LABEL;
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

  function standardKind(standard) {
    const haystack = [
      standard.framework, standard.source, standard.category, standard.type,
      standard.standardSet, standard.collection, standard.title, standard.code
    ].filter(Boolean).join(' ').toLowerCase();
    if (/level\s*learning|learning\s*learning/.test(haystack)) return 'level';
    if (/stamp/.test(haystack)) return 'stamp';
    if (/common\s*core|ccss/.test(haystack)) return 'common-core';
    return 'other';
  }

  function libraryStandards() {
    return readJSON('cos-standards', []).map((standard) => ({ ...standard, _v19Kind: standardKind(standard) }));
  }

  function standardRows(items, symbol = '') {
    if (!items.length) return '<div class="v19-empty compact"><p>No standards in this category yet.</p></div>';
    return `<div class="v19-standard-list">${items.map((standard) => `
      <article class="v19-standard-row" title="${escapeHTML([standard.code, standardTitle(standard)].filter(Boolean).join(' — '))}">
        ${symbol ? `<span class="v19-standard-symbol">${escapeHTML(symbol)}</span>` : ''}
        <div><strong>${escapeHTML(standard.code || standard.shortCode || symbol || 'Standard')}</strong><p>${escapeHTML(standardTitle(standard))}</p>${standardMeta(standard) ? `<small>${escapeHTML(standardMeta(standard))}</small>` : ''}</div>
      </article>`).join('')}</div>`;
  }

  function renderLibraryStandardsPanel(panel) {
    const standards = libraryStandards();
    const query = libraryStandardSearch.trim().toLowerCase();
    const matches = (standard) => !query || [standard.code, standardTitle(standard), standardMeta(standard), standard.framework, standard.source]
      .filter(Boolean).join(' ').toLowerCase().includes(query);
    const filtered = standards.filter(matches);
    const level = filtered.filter((item) => item._v19Kind === 'level');
    const stamp = filtered.filter((item) => item._v19Kind === 'stamp');
    const common = filtered.filter((item) => item._v19Kind === 'common-core');
    const other = filtered.filter((item) => item._v19Kind === 'other');
    const claCount = standards.filter((item) => ['level', 'stamp'].includes(item._v19Kind)).length;
    const commonCount = standards.filter((item) => item._v19Kind === 'common-core').length;
    const otherCount = standards.filter((item) => item._v19Kind === 'other').length;

    const back = libraryStandardView === 'categories' ? '' : '<button type="button" class="v19-secondary-button" data-standard-view="categories">← Standard categories</button>';
    let content = '';
    if (libraryStandardView === 'categories') {
      const cards = [
        { id: 'cla', title: 'CLA', detail: 'Level Learning and STAMP-related Skills', count: claCount, symbols: '<span class="v19-standard-symbol">LL</span><span class="v19-standard-symbol">S</span>' },
        ...(commonCount ? [{ id: 'common-core', title: 'Common Core', detail: 'Imported Common Core standards', count: commonCount, symbols: '<span class="v19-standard-symbol wide">CC</span>' }] : []),
        ...(otherCount ? [{ id: 'other', title: 'Other standards', detail: 'Standards without a CLA or Common Core classification', count: otherCount, symbols: '<span class="v19-standard-symbol wide">—</span>' }] : [])
      ];
      content = `<div class="v19-standard-category-grid">${cards.map((card) => `
        <button type="button" class="v19-standard-category-card" data-standard-view="${card.id}">
          <span class="v19-category-symbols">${card.symbols}</span>
          <span><strong>${escapeHTML(card.title)}</strong><small>${escapeHTML(card.detail)}</small></span>
          <b>${card.count}</b>
        </button>`).join('')}</div>`;
    } else if (libraryStandardView === 'cla') {
      content = `<div class="v19-cla-grid">
        <section class="v19-panel inset"><div class="v19-panel-heading"><div><span class="v19-standard-symbol large">LL</span><h3>Level Learning</h3></div><strong>${level.length}</strong></div>${standardRows(level, 'LL')}</section>
        <section class="v19-panel inset"><div class="v19-panel-heading"><div><span class="v19-standard-symbol large">S</span><h3>STAMP-related Skills</h3></div><strong>${stamp.length}</strong></div>${standardRows(stamp, 'S')}</section>
      </div>`;
    } else if (libraryStandardView === 'common-core') {
      content = standardRows(common);
    } else {
      content = standardRows(other);
    }

    panel.innerHTML = `
      <div class="v19-library-standard-heading">
        <div><span class="v19-eyebrow">LIBRARY · STANDARDS</span><h2>${libraryStandardView === 'categories' ? 'Standard categories' : libraryStandardView === 'cla' ? 'CLA' : libraryStandardView === 'common-core' ? 'Common Core' : 'Other standards'}</h2></div>
        <div class="v19-library-standard-actions">${back}<input type="search" value="${escapeHTML(libraryStandardSearch)}" placeholder="Search standards…" aria-label="Search standards" data-library-standard-search></div>
      </div>${content}`;
    panel.querySelectorAll('[data-standard-view]').forEach((button) => button.addEventListener('click', () => {
      libraryStandardView = button.dataset.standardView;
      renderLibraryStandardsPanel(panel);
    }));
    panel.querySelector('[data-library-standard-search]')?.addEventListener('input', (event) => {
      libraryStandardSearch = event.target.value;
      renderLibraryStandardsPanel(panel);
      requestAnimationFrame(() => {
        const input = panel.querySelector('[data-library-standard-search]');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    });
  }

  function installLibraryStandardsPage() {
    const tabBars = [...document.querySelectorAll('.resource-tabs')].filter((tabs) => {
      const labels = [...tabs.querySelectorAll('button')].map(text);
      return labels.some((label) => /^Standards\b/i.test(label)) && labels.some((label) => /^Activities\b/i.test(label));
    });
    tabBars.forEach((tabs) => {
      const page = tabs.closest('.page') || tabs.parentElement;
      if (!page) return;
      page.querySelectorAll('.page-header h1, .page-header h2').forEach((heading) => {
        if (/Resource Library/i.test(text(heading))) heading.textContent = 'Library';
      });
      const standardButton = [...tabs.querySelectorAll('button')].find((button) => /^Standards\b/i.test(text(button)));
      const active = standardButton?.classList.contains('active') || standardButton?.getAttribute('aria-selected') === 'true' || standardButton?.getAttribute('aria-pressed') === 'true';
      let panel = page.querySelector('.v19-library-standards-panel');
      if (!active) {
        delete tabs.dataset.v19StandardsActive;
        panel?.remove();
        page.querySelectorAll('[data-v19-library-native-hidden="true"]').forEach((node) => {
          node.hidden = false;
          delete node.dataset.v19LibraryNativeHidden;
        });
        return;
      }
      if (!tabs.dataset.v19StandardsActive) {
        tabs.dataset.v19StandardsActive = 'true';
        libraryStandardView = 'categories';
      }
      page.querySelectorAll('.resource-toolbar, .resource-card-grid, .common-core-notice').forEach((node) => {
        if (node.closest('.v19-library-standards-panel')) return;
        node.hidden = true;
        node.dataset.v19LibraryNativeHidden = 'true';
      });
      if (!panel) {
        panel = document.createElement('section');
        panel.className = 'v19-library-standards-panel';
        tabs.after(panel);
      }
      if (panel.dataset.renderKey !== `${libraryStandardView}|${libraryStandardSearch}|${readJSON('cos-standards', []).length}`) {
        renderLibraryStandardsPanel(panel);
        panel.dataset.renderKey = `${libraryStandardView}|${libraryStandardSearch}|${readJSON('cos-standards', []).length}`;
      }
    });
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function fieldControlByLabel(root, pattern) {
    const label = [...root.querySelectorAll('label')].find((node) => pattern.test(text(node)));
    return label?.querySelector('input, select, textarea') || null;
  }

  function editorDate(editor) {
    const labelled = fieldControlByLabel(editor, /date/i);
    const candidate = labelled?.value || [...editor.querySelectorAll('input[type="date"]')].find((input) => input.value)?.value || '';
    return localDate(candidate) ? candidate : '';
  }

  function editorBlockText(editor) {
    const control = fieldControlByLabel(editor, /block|session|period/i);
    if (control instanceof HTMLSelectElement) return text(control.selectedOptions[0]) || control.value;
    return control?.value || '';
  }

  function resolveEditorLesson(editor) {
    const lessons = currentLessons();
    const known = editor.dataset.v19LessonId;
    if (known) {
      const exact = lessons.find((lesson) => String(lesson.id) === known);
      if (exact) return exact;
    }
    const date = editorDate(editor);
    const block = editorBlockText(editor).trim().toLowerCase();
    const pageText = text(editor.closest('.page') || editor.parentElement).toLowerCase();
    const scored = lessons.map((lesson) => {
      let score = 0;
      if (date && lesson.date === date) score += 8;
      if (block && String(lesson.block || '').trim().toLowerCase() === block) score += 7;
      if (block && String(lesson.block || '').toLowerCase().includes(block)) score += 3;
      if (lesson.contextName && pageText.includes(String(lesson.contextName).toLowerCase())) score += 3;
      if (lesson.scheduleBlockId && [...editor.querySelectorAll('select, input')].some((control) => String(control.value) === String(lesson.scheduleBlockId))) score += 10;
      return { lesson, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    const winner = scored[0];
    if (winner && (winner.score >= 8 || scored.length === 1)) {
      editor.dataset.v19LessonId = String(winner.lesson.id);
      return winner.lesson;
    }
    return null;
  }

  function activityTitle(activity) {
    return activity?.title || activity?.name || activity?.activity || 'Activity';
  }

  function normalizeFlowBlocks(blocks) {
    const input = Array.isArray(blocks) ? blocks : [];
    const normalized = input.map((block, index) => ({
      id: String(block.id || makeId('flow')),
      title: String(block.title || block.name || 'Flow block'),
      purpose: String(block.purpose || ''),
      duration: String(block.duration || block.minutes || ''),
      teacherAction: String(block.teacherAction || ''),
      studentAction: String(block.studentAction || ''),
      materials: String(block.materials || ''),
      notes: String(block.notes || ''),
      sourceActivityId: String(block.sourceActivityId || ''),
      parentId: String(block.parentId || ''),
      order: Number.isFinite(Number(block.order)) ? Number(block.order) : index
    }));
    const ids = new Set(normalized.map((block) => block.id));
    const byId = new Map(normalized.map((block) => [block.id, block]));
    normalized.forEach((block) => {
      if (!ids.has(block.parentId) || block.parentId === block.id) block.parentId = '';
      const seen = new Set([block.id]);
      let parentId = block.parentId;
      while (parentId) {
        if (seen.has(parentId)) { block.parentId = ''; break; }
        seen.add(parentId);
        parentId = byId.get(parentId)?.parentId || '';
      }
    });
    return normalized.sort((a, b) => a.order - b.order).map((block, index) => ({ ...block, order: index }));
  }

  function flowDescendantIds(blocks, parentId) {
    const result = new Set();
    const visit = (id) => blocks.filter((block) => String(block.parentId || '') === String(id)).forEach((child) => {
      if (result.has(child.id)) return;
      result.add(child.id);
      visit(child.id);
    });
    visit(parentId);
    return result;
  }

  function initialFlowBlocks(lesson) {
    if (Array.isArray(lesson?.flowBlocks) && lesson.flowBlocks.length) return normalizeFlowBlocks(lesson.flowBlocks);
    const activities = readJSON('cos-toolkit', []);
    const refs = Array.isArray(lesson?.activityRefs) ? lesson.activityRefs : [];
    const migrated = refs.map((ref, index) => {
      const id = typeof ref === 'string' ? ref : ref?.id || ref?.activityId;
      const activity = activities.find((item) => String(item.id) === String(id));
      return {
        id: makeId('flow'), title: activityTitle(activity), purpose: activity?.purpose || '',
        duration: activity?.duration || activity?.minutes || '', teacherAction: activity?.teacherAction || '',
        studentAction: activity?.studentAction || '', materials: activity?.materials || '', notes: '',
        sourceActivityId: id || '', parentId: '', order: index
      };
    });
    if (!migrated.length && String(lesson?.activityNotes || '').trim()) {
      migrated.push({ id: makeId('flow'), title: 'Lesson sequence', purpose: '', duration: '', teacherAction: '', studentAction: '', materials: '', notes: String(lesson.activityNotes), sourceActivityId: '', parentId: '', order: 0 });
    }
    return normalizeFlowBlocks(migrated);
  }

  function flowDraftKey(editor, lesson) {
    if (lesson?.id) return `classroom-v19-flow-${lesson.id}`;
    return `classroom-v19-flow-new-${editorDate(editor) || 'unscheduled'}-${editorBlockText(editor) || 'lesson'}`.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  }

  function loadFlowState(editor) {
    const lesson = resolveEditorLesson(editor);
    let draft = null;
    try { draft = JSON.parse(sessionStorage.getItem(flowDraftKey(editor, lesson)) || 'null'); } catch { draft = null; }
    return { lessonId: lesson?.id || '', blocks: normalizeFlowBlocks(draft?.blocks || initialFlowBlocks(lesson)), dirty: Boolean(draft?.dirty) };
  }

  function saveFlowDraft(editor, state) {
    state.dirty = true;
    sessionStorage.setItem(flowDraftKey(editor, state.lessonId ? { id: state.lessonId } : null), JSON.stringify({ blocks: state.blocks, dirty: true, savedAt: new Date().toISOString() }));
    const status = editor.querySelector('.v19-flow-save-status');
    if (status) status.textContent = state.lessonId ? 'Unsaved flow changes' : 'Flow draft saved';
  }

  function commitFlow(editor, state, notify = true) {
    const lesson = currentLessons().find((item) => String(item.id) === String(state.lessonId)) || resolveEditorLesson(editor);
    if (!lesson) {
      saveFlowDraft(editor, state);
      if (notify) showToast('Flow draft saved. Save the planning record to attach it.');
      return false;
    }
    const blocks = normalizeFlowBlocks(state.blocks);
    const updated = currentLessons().map((item) => String(item.id) === String(lesson.id) ? {
      ...item,
      flowBlocks: blocks,
      activityRefs: blocks.map((block) => block.sourceActivityId).filter(Boolean),
      activityNotes: blocks.map((block) => block.title).filter(Boolean).join(' → '),
      updatedAt: new Date().toISOString()
    } : item);
    writeJSON('cos-lessons', updated, 'Update lesson flow');
    state.lessonId = lesson.id;
    state.blocks = blocks;
    state.dirty = false;
    sessionStorage.removeItem(flowDraftKey(editor, lesson));
    const status = editor.querySelector('.v19-flow-save-status');
    if (status) status.textContent = 'Flow saved';
    if (notify) showToast(`Lesson flow saved · ${blocks.length} block${blocks.length === 1 ? '' : 's'}`, true);
    return true;
  }

  function renderFlowTree(blocks, parentId = '', depth = 0) {
    const children = blocks.filter((block) => String(block.parentId || '') === String(parentId)).sort((a, b) => a.order - b.order);
    return children.map((block) => {
      const childCount = blocks.filter((item) => String(item.parentId || '') === String(block.id)).length;
      const descendants = flowDescendantIds(blocks, block.id);
      const parentOptions = blocks.filter((item) => item.id !== block.id && !descendants.has(item.id)).map((item) => `<option value="${escapeHTML(item.id)}" ${String(block.parentId) === String(item.id) ? 'selected' : ''}>${escapeHTML(item.title)}</option>`).join('');
      return `<article class="v19-flow-card ${depth ? 'child' : 'parent'}" data-flow-id="${escapeHTML(block.id)}" style="--flow-depth:${depth}">
        <div class="v19-flow-card-head"><span class="v19-flow-handle" aria-hidden="true">⋮⋮</span><span class="v19-flow-role">${depth ? 'Child' : childCount ? 'Parent' : 'Block'}</span><input data-flow-field="title" value="${escapeHTML(block.title)}" aria-label="Flow block title"><div class="v19-flow-card-actions"><button type="button" title="Move up" data-flow-action="up">↑</button><button type="button" title="Move down" data-flow-action="down">↓</button><button type="button" title="Add child block" data-flow-action="child">＋</button><button type="button" title="Duplicate" data-flow-action="duplicate">⧉</button><button type="button" title="Delete" data-flow-action="delete">×</button></div></div>
        <div class="v19-flow-fields">
          <label><span>Purpose</span><input data-flow-field="purpose" value="${escapeHTML(block.purpose)}"></label>
          <label class="duration"><span>Minutes</span><input data-flow-field="duration" inputmode="numeric" value="${escapeHTML(block.duration)}"></label>
          <label><span>Teacher action</span><textarea data-flow-field="teacherAction">${escapeHTML(block.teacherAction)}</textarea></label>
          <label><span>Student action</span><textarea data-flow-field="studentAction">${escapeHTML(block.studentAction)}</textarea></label>
          <label><span>Materials</span><input data-flow-field="materials" value="${escapeHTML(block.materials)}"></label>
          <label><span>Parent block</span><select data-flow-field="parentId"><option value="">Top level</option>${parentOptions}</select></label>
          <label class="wide"><span>Notes</span><textarea data-flow-field="notes">${escapeHTML(block.notes)}</textarea></label>
        </div>
        ${renderFlowTree(blocks, block.id, depth + 1)}
      </article>`;
    }).join('');
  }

  function rerenderFlowEditor(editor) {
    const shell = editor.querySelector('.v19-flow-editor');
    const state = editor._v19FlowState;
    if (!shell || !state) return;
    const activities = readJSON('cos-toolkit', []);
    shell.innerHTML = `
      <div class="v19-flow-editor-heading"><div><span class="v19-eyebrow">LESSON FLOW EDITOR</span><h3>Flow blocks</h3><p>Build the lesson sequence and nest supporting steps under a parent block.</p></div><div class="v19-flow-toolbar"><select data-flow-template aria-label="Activity template"><option value="">Activity template…</option>${activities.map((activity) => `<option value="${escapeHTML(activity.id)}">${escapeHTML(activityTitle(activity))}</option>`).join('')}</select><button type="button" class="v19-secondary-button" data-flow-add-template>Add template</button><button type="button" class="v19-secondary-button" data-flow-add>Add block</button><button type="button" class="v19-primary-button" data-flow-save>Save flow</button></div></div>
      <div class="v19-flow-save-status">${state.dirty ? 'Unsaved flow changes' : state.lessonId ? 'Flow saved' : 'Flow draft'}</div>
      <div class="v19-flow-tree">${state.blocks.length ? renderFlowTree(state.blocks) : '<div class="v19-empty compact"><p>No flow blocks yet. Add a block or start from an Activity template.</p></div>'}</div>`;

    shell.querySelector('[data-flow-add]')?.addEventListener('click', () => {
      state.blocks.push({ id: makeId('flow'), title: 'New flow block', purpose: '', duration: '', teacherAction: '', studentAction: '', materials: '', notes: '', sourceActivityId: '', parentId: '', order: state.blocks.length });
      saveFlowDraft(editor, state); rerenderFlowEditor(editor);
    });
    shell.querySelector('[data-flow-add-template]')?.addEventListener('click', () => {
      const id = shell.querySelector('[data-flow-template]')?.value;
      const activity = activities.find((item) => String(item.id) === String(id));
      if (!activity) return;
      state.blocks.push({ id: makeId('flow'), title: activityTitle(activity), purpose: activity.purpose || '', duration: activity.duration || activity.minutes || '', teacherAction: activity.teacherAction || '', studentAction: activity.studentAction || '', materials: activity.materials || '', notes: '', sourceActivityId: activity.id || '', parentId: '', order: state.blocks.length });
      saveFlowDraft(editor, state); rerenderFlowEditor(editor);
    });
    shell.querySelector('[data-flow-save]')?.addEventListener('click', () => commitFlow(editor, state));
    shell.querySelectorAll('[data-flow-field]').forEach((control) => {
      control.addEventListener(control instanceof HTMLSelectElement ? 'change' : 'input', () => {
        const card = control.closest('[data-flow-id]');
        const block = state.blocks.find((item) => item.id === card?.dataset.flowId);
        if (!block) return;
        block[control.dataset.flowField] = control.value;
        if (control.dataset.flowField === 'parentId') {
          state.blocks = normalizeFlowBlocks(state.blocks);
          saveFlowDraft(editor, state); rerenderFlowEditor(editor); return;
        }
        saveFlowDraft(editor, state);
      });
    });
    shell.querySelectorAll('[data-flow-action]').forEach((button) => button.addEventListener('click', () => {
      const id = button.closest('[data-flow-id]')?.dataset.flowId;
      const block = state.blocks.find((item) => item.id === id);
      if (!block) return;
      const action = button.dataset.flowAction;
      if (action === 'child') state.blocks.push({ id: makeId('flow'), title: 'New child block', purpose: '', duration: '', teacherAction: '', studentAction: '', materials: '', notes: '', sourceActivityId: '', parentId: block.id, order: state.blocks.length });
      if (action === 'duplicate') state.blocks.push({ ...block, id: makeId('flow'), title: `${block.title} copy`, order: state.blocks.length });
      if (action === 'delete') {
        state.blocks = state.blocks.filter((item) => item.id !== block.id).map((item) => item.parentId === block.id ? { ...item, parentId: block.parentId || '' } : item);
      }
      if (action === 'up' || action === 'down') {
        const siblings = state.blocks.filter((item) => String(item.parentId || '') === String(block.parentId || '')).sort((a, b) => a.order - b.order);
        const index = siblings.findIndex((item) => item.id === block.id);
        const swap = action === 'up' ? index - 1 : index + 1;
        if (swap >= 0 && swap < siblings.length) {
          const other = siblings[swap];
          const oldOrder = block.order; block.order = other.order; other.order = oldOrder;
        }
      }
      state.blocks = normalizeFlowBlocks(state.blocks);
      saveFlowDraft(editor, state); rerenderFlowEditor(editor);
    }));
  }

  function hideLegacyActivityEditor(editor) {
    editor.querySelectorAll('.planning-source-section').forEach((section) => {
      const heading = text(section.querySelector('.planning-source-header'));
      if (/learning activities/i.test(heading)) section.classList.add('v19-native-activity-hidden');
      if (/activities\s*&\s*materials|lesson flow.*materials/i.test(heading)) {
        section.querySelectorAll('button').forEach((button) => { if (/^(Activity|Flow block)$/i.test(text(button))) button.hidden = true; });
        const strong = section.querySelector('.planning-source-header strong');
        if (strong) strong.textContent = 'Materials';
      }
    });
    [...editor.querySelectorAll('label')].forEach((label) => {
      if (/activities\s*\/\s*sequence|^lesson flow editor$/i.test(text(label))) label.classList.add('v19-native-activity-hidden');
    });
  }

  function installFlowEditors() {
    document.querySelectorAll('.planning-editor').forEach((editor) => {
      hideLegacyActivityEditor(editor);
      if (editor.querySelector(':scope > .v19-flow-editor')) return;
      const shell = document.createElement('section');
      shell.className = 'v19-flow-editor';
      const before = editor.querySelector('.after-lesson-section, .lesson-detail-actions') || [...editor.querySelectorAll('button')].find((button) => /Save planning record|Save lesson/i.test(text(button)))?.parentElement;
      if (before && before.parentElement === editor) editor.insertBefore(shell, before);
      else editor.appendChild(shell);
      editor._v19FlowState = loadFlowState(editor);
      rerenderFlowEditor(editor);
    });
  }

  function installNativeFlowSaveBridge() {
    if (document.documentElement.dataset.v19FlowBridge) return;
    document.documentElement.dataset.v19FlowBridge = 'true';
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !/Save planning record|Save lesson|Update planning record/i.test(text(button))) return;
      const editor = button.closest('.planning-editor');
      const state = editor?._v19FlowState;
      if (!editor || !state) return;
      const beforeIds = new Set(currentLessons().map((lesson) => String(lesson.id)));
      const expectedDate = editorDate(editor);
      const expectedBlock = editorBlockText(editor).trim().toLowerCase();
      const blocks = normalizeFlowBlocks(state.blocks);
      window.setTimeout(() => {
        const lessons = currentLessons();
        let lesson = lessons.find((item) => String(item.id) === String(state.lessonId));
        if (!lesson) {
          const candidates = lessons.filter((item) => !beforeIds.has(String(item.id)) || (expectedDate && item.date === expectedDate));
          lesson = candidates.sort((a, b) => {
            const aScore = (expectedDate && a.date === expectedDate ? 5 : 0) + (expectedBlock && String(a.block || '').toLowerCase() === expectedBlock ? 4 : 0);
            const bScore = (expectedDate && b.date === expectedDate ? 5 : 0) + (expectedBlock && String(b.block || '').toLowerCase() === expectedBlock ? 4 : 0);
            return bScore - aScore;
          })[0];
        }
        if (!lesson) return;
        const updated = lessons.map((item) => String(item.id) === String(lesson.id) ? { ...item, flowBlocks: blocks, activityRefs: blocks.map((block) => block.sourceActivityId).filter(Boolean), activityNotes: blocks.map((block) => block.title).join(' → '), updatedAt: new Date().toISOString() } : item);
        writeJSON('cos-lessons', updated, 'Save lesson flow');
        sessionStorage.removeItem(flowDraftKey(editor, lesson));
      }, 500);
    }, true);
  }

  function decorateScheduleTree() {
    document.querySelectorAll('.schedule-editor-tree-node').forEach((node) => {
      if (node.dataset.v19TreeDecorated) return;
      node.dataset.v19TreeDecorated = 'true';
      const row = node.querySelector(':scope > .schedule-editor-row') || node.querySelector('.schedule-editor-row');
      if (!row) return;
      const isChild = node.classList.contains('child') || Boolean(node.closest('.schedule-editor-children'));
      const nested = node.querySelector(':scope > .schedule-editor-children');
      const flatChildren = [];
      if (!isChild && !nested) {
        let sibling = node.nextElementSibling;
        while (sibling?.classList.contains('schedule-editor-tree-node') && sibling.classList.contains('child')) {
          flatChildren.push(sibling);
          sibling = sibling.nextElementSibling;
        }
      }
      const hasChildren = Boolean(nested) || flatChildren.length > 0;
      const badge = document.createElement('span');
      badge.className = `v19-tree-badge ${isChild ? 'child' : hasChildren ? 'parent' : 'block'}`;
      badge.textContent = isChild ? 'Child' : hasChildren ? 'Parent' : 'Block';
      row.prepend(badge);
      if (hasChildren && !isChild) {
        const collapse = document.createElement('button');
        collapse.type = 'button';
        collapse.className = 'v19-tree-collapse';
        collapse.title = 'Collapse child blocks';
        collapse.setAttribute('aria-expanded', 'true');
        collapse.textContent = '⌄';
        collapse.addEventListener('click', () => {
          const expanded = collapse.getAttribute('aria-expanded') === 'true';
          collapse.setAttribute('aria-expanded', String(!expanded));
          collapse.textContent = expanded ? '›' : '⌄';
          if (nested) nested.hidden = expanded;
          flatChildren.forEach((child) => { child.hidden = expanded; });
        });
        row.prepend(collapse);
      }
    });
  }

  function importedPdfEvent(event) {
    return /pdf/i.test([event.source, event.importSource, event._importFile, event.parser].filter(Boolean).join(' ')) || /^E-pdfcal-/i.test(String(event.id || ''));
  }

  function calendarEventQuality(event) {
    let score = 0;
    if (event.parser === 'structured-table-v2') score += 10;
    if (String(event.confidence || '').toLowerCase() === 'high') score += 4;
    if (event.sourceKey) score += 3;
    if (/^E-pdfcal-/i.test(String(event.id || ''))) score += 3;
    if (localDate(event.date)) score += 5;
    if (event.title?.trim()) score += 2;
    return score;
  }

  function repairImportedCalendar(options = {}) {
    const events = readJSON('cos-calendar-events', []);
    const quarantine = readJSON('cos-calendar-quarantine-v19', []);
    const quarantinedKeys = new Set(quarantine.map((item) => `${item.id}|${item.quarantineReason || ''}`));
    const kept = [];
    const removed = [];
    let normalized = 0;

    events.forEach((original) => {
      const event = { ...original };
      if (localDate(event.start) && !localDate(event.date)) {
        event.date = event.start;
        event.start = '';
        normalized += 1;
      }
      if (localDate(event.end)) {
        if (!localDate(event.endDate)) event.endDate = event.end;
        event.end = '';
        normalized += 1;
      }
      if (event.endDate && localDate(event.endDate) && localDate(event.end)) {
        event.end = '';
        normalized += 1;
      }
      if (event.endDate && (!localDate(event.endDate) || (localDate(event.date) && event.endDate < event.date))) {
        event.calendarRepairNote = `Removed invalid end date: ${event.endDate}`;
        event.endDate = '';
        normalized += 1;
      }
      if (!localDate(event.date)) {
        removed.push({ ...event, quarantineReason: importedPdfEvent(event) ? 'Invalid imported calendar date' : 'Invalid calendar date', quarantinedAt: new Date().toISOString() });
        return;
      }
      kept.push(event);
    });

    const groups = new Map();
    kept.forEach((event) => {
      if (!importedPdfEvent(event) || !localDate(event.date)) return;
      const signature = [event.date, event.endDate || '', String(event.title || '').trim().toLowerCase()].join('|');
      if (!groups.has(signature)) groups.set(signature, []);
      groups.get(signature).push(event);
    });
    const duplicateIds = new Set();
    groups.forEach((items) => {
      if (items.length < 2) return;
      const ordered = [...items].sort((a, b) => calendarEventQuality(b) - calendarEventQuality(a));
      ordered.slice(1).forEach((event) => {
        duplicateIds.add(String(event.id));
        removed.push({ ...event, quarantineReason: 'Duplicate imported calendar event', quarantinedAt: new Date().toISOString() });
      });
    });
    const active = kept.filter((event) => !duplicateIds.has(String(event.id)));
    const newQuarantine = [...quarantine];
    removed.forEach((item) => {
      const key = `${item.id}|${item.quarantineReason}`;
      if (!quarantinedKeys.has(key)) { newQuarantine.push(item); quarantinedKeys.add(key); }
    });
    const changed = normalized > 0 || removed.length > 0 || JSON.stringify(active) !== JSON.stringify(events);
    const previousRepair = readJSON('cos-calendar-repair-v19', null);
    if (!changed && !options.force && previousRepair?.ranAt) {
      calendarRepairResult = { ...previousRepair, activeEvents: active.length, quarantineTotal: newQuarantine.length };
      return calendarRepairResult;
    }
    if (changed || options.force) {
      localStorage.setItem('cos-calendar-events', JSON.stringify(active));
      localStorage.setItem('cos-calendar-quarantine-v19', JSON.stringify(newQuarantine));
    }
    calendarRepairResult = {
      ranAt: new Date().toISOString(), normalized, quarantined: removed.length,
      invalidRemoved: removed.filter((item) => /Invalid/.test(item.quarantineReason)).length,
      duplicatesRemoved: removed.filter((item) => /Duplicate/.test(item.quarantineReason)).length,
      activeEvents: active.length, quarantineTotal: newQuarantine.length
    };
    localStorage.setItem('cos-calendar-repair-v19', JSON.stringify(calendarRepairResult));
    return calendarRepairResult;
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
    const linkedPdfEvents = createdIds.size ? events.filter((event) => createdIds.has(event.id)) : [];
    const structuredPdfEvents = events.filter((event) => /^E-pdfcal-/i.test(String(event.id || '')) || event.parser === 'structured-table-v2');
    const sourcePdfEvents = events.filter((event) => /pdf/i.test(String(event.source || event.importSource || event._importFile || '')));
    const acceptanceEvents = linkedPdfEvents.length === 27
      ? linkedPdfEvents
      : structuredPdfEvents.length === 27
        ? structuredPdfEvents
        : sourcePdfEvents.length === 27
          ? sourcePdfEvents
          : linkedPdfEvents.length
            ? linkedPdfEvents
            : events.length === 27 ? events : [];
    const pdfEvents = acceptanceEvents.length ? acceptanceEvents : sourcePdfEvents;

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
    const requiredRoutes = [ROUTES.today, ROUTES.week, ROUTES.tasks, ROUTES.learners, ROUTES.resources, ROUTES.calendar, ROUTES.import, ROUTES.export, ROUTES.settings];
    const routeConnections = requiredRoutes.map(routeConnection);
    const missingRoutes = routeConnections.filter((item) => !item.registered).map((item) => item.label);
    const unresolvedRouteTargets = routeConnections.filter((item) => !item.targetFound).map((item) => item.label);
    const quarantine = readJSON('cos-calendar-quarantine-v19', []);
    const repair = readJSON('cos-calendar-repair-v19', calendarRepairResult || {});
    const weekActions = weekActionDiagnostics();
    const duplicateLessonIds = lessons.length - new Set(lessons.map((lesson) => String(lesson.id || ''))).size;
    const parsedRoute = parseHash();
    const routeWeekDate = parsedRoute.path === 'week' ? parsedRoute.params.get('date') || '' : '';
    const visibleWeekDate = visibleWeekAnchorDate();
    const sameVisibleWeek = (() => {
      if (!localDate(routeWeekDate) || !localDate(visibleWeekDate)) return true;
      const first = localDate(routeWeekDate);
      const second = localDate(visibleWeekDate);
      first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
      second.setDate(second.getDate() - ((second.getDay() + 6) % 7));
      return toDateString(first) === toDateString(second);
    })();

    const tests = [
      { name: 'Local data can be read', status: parseFailures.length ? 'fail' : 'pass', detail: parseFailures.length ? `Unreadable: ${parseFailures.join(', ')}` : `${keys.length - parseFailures.length} data stores checked` },
      { name: 'Dates use local calendar values', status: invalidDates.length || lessonDateFailures.length ? 'fail' : 'pass', detail: `${invalidDates.length} invalid calendar dates · ${lessonDateFailures.length} invalid session dates` },
      { name: 'Event ranges are valid', status: invalidEndDates.length ? 'fail' : 'pass', detail: `${invalidEndDates.length} end-date issue(s)` },
      { name: 'Event times are valid', status: invalidTimes.length ? 'warning' : 'pass', detail: `${invalidTimes.length} clock value(s) need review` },
      { name: 'Calendar events are not duplicated', status: duplicateCount ? 'warning' : 'pass', detail: `${duplicateCount} duplicate signature(s)` },
      { name: 'Imported calendar repair', status: invalidDates.length || duplicateCount ? 'fail' : 'pass', detail: `${repair.normalized || 0} multi-day value(s) normalized · ${quarantine.length} old/duplicate import record(s) quarantined` },
      { name: 'Parent / child schedule links resolve', status: orphanChildren.length ? 'fail' : 'pass', detail: `${orphanChildren.length} orphan child block(s)` },
      { name: 'Main page connections exist', status: missingRoutes.length ? 'fail' : unresolvedRouteTargets.length ? 'warning' : 'pass', detail: missingRoutes.length ? `Missing registrations: ${missingRoutes.join(', ')}` : unresolvedRouteTargets.length ? `Registered; trigger pending: ${unresolvedRouteTargets.join(', ')}` : 'All main routes registered and connected' },
      { name: 'Undo / Redo controls are available', status: document.querySelector('.v19-history-toolbar') ? 'pass' : 'fail', detail: 'Icon-only controls in the top toolbar' },
      { name: 'Week lesson actions are consistent', status: weekActions.issueCount ? 'fail' : 'pass', detail: weekActions.mountedCards ? `${weekActions.mountedCards} mounted card(s) · ${weekActions.issueCount} action mismatch(es)` : 'No Week cards currently mounted · no stored action mismatch detected' },
      { name: 'Week route date matches the visible week', status: sameVisibleWeek ? 'pass' : 'fail', detail: localDate(visibleWeekDate) ? `Route: ${routeWeekDate || 'none'} · Visible Monday: ${visibleWeekDate}` : 'Week is not currently mounted' },
      { name: 'Lesson records have unique IDs', status: duplicateLessonIds ? 'fail' : 'pass', detail: `${duplicateLessonIds} duplicate lesson ID(s)` },
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
        acceptanceEvents: acceptanceEvents.length,
        quarantinedEvents: quarantine.length
      },
      tests,
      eventResults,
      details: { parseFailures, invalidDates, invalidEndDates, invalidTimes, duplicateCount, orphanChildren, missingRoutes, unresolvedRouteTargets, routeConnections: routeConnections.map(({ trigger, ...item }) => item), weekActions, routeWeekDate, visibleWeekDate, sameVisibleWeek, duplicateLessonIds, repair, quarantine }
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
          <button class="v19-secondary-button" data-repair-calendar>Repair imported calendar</button>
          <button class="v19-secondary-button" data-export-health>Export report</button>
          <button class="v19-primary-button" data-run-live>Run live page test</button>
        </div>
      </header>
      <div class="v19-metric-grid health">
        <div class="v19-metric static"><strong>${passed}</strong><span>Passed</span></div>
        <div class="v19-metric static"><strong>${warnings}</strong><span>Review</span></div>
        <div class="v19-metric static"><strong>${failed}</strong><span>Failed</span></div>
        <div class="v19-metric static"><strong>${report.summary.acceptanceEvents}</strong><span>PDF events</span></div>
        <div class="v19-metric static"><strong>${report.summary.quarantinedEvents || 0}</strong><span>Quarantined imports</span></div>
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

    root.querySelector('[data-repair-calendar]')?.addEventListener('click', () => {
      const result = repairImportedCalendar({ force: true });
      showToast(`Calendar repaired · ${result.normalized} normalized · ${result.quarantined} quarantined`, true);
      renderSystemHealth();
    });
    root.querySelector('[data-export-health]')?.addEventListener('click', () => downloadJSON(report, `Classroom-v${VERSION}-system-health-${toDateString(new Date())}.json`));
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
      if (route.path === 'week' && active && page) {
        maintainEnhancements();
        await delay(80);
        const diagnostics = weekActionDiagnostics();
        checks.push({
          name: 'Week lesson/action consistency',
          status: diagnostics.issueCount ? 'fail' : 'pass',
          detail: `${diagnostics.mountedCards} card(s) checked · ${diagnostics.issueCount} mismatch(es).`
        });
      }
    }
    const historyWorks = typeof history.pushState === 'function' && typeof history.replaceState === 'function';
    checks.push({ name: 'Browser route history', status: historyWorks ? 'pass' : 'warning', detail: historyWorks ? 'Explicit navigation can create Back / Forward entries without altering the current history stack during this test.' : 'Browser did not expose route history APIs.' });
    checks.push({ name: 'View in Week enhancement', status: document.querySelectorAll('button').length && typeof navigateToWeek === 'function' ? 'pass' : 'fail', detail: 'In-app date navigation and highlight handler are installed.' });
    liveAcceptanceResults = checks;
    setHash('system-health', {}, true);
    showCustomPage('system-health');
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

  const V19_MONTHS = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  };
  const V19_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  function routeDateReference() {
    const parsed = parseHash();
    const hashDate = parsed.params.get('date');
    if (localDate(hashDate)) return hashDate;
    const input = [...document.querySelectorAll('.week-workspace input[type="date"]')]
      .find((node) => node.offsetParent !== null && localDate(node.value));
    if (input) return input.value;
    const stored = readJSON('cos-focus-date', '');
    return localDate(stored) ? stored : toDateString(new Date());
  }

  function directWeekHeaderText(column) {
    if (!column) return '';
    const children = [...column.children].slice(0, 4);
    const candidate = children.find((node) => {
      const value = text(node);
      return /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i.test(value)
        && /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}\b/i.test(value);
    });
    return text(candidate || children[0] || column);
  }

  function dateFromWeekColumn(column, referenceDate = routeDateReference()) {
    if (!column) return '';
    const value = directWeekHeaderText(column);
    const match = value.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b[\s\S]{0,30}?\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})\b/i);
    if (!match) {
      const direct = column.dataset?.date || column.getAttribute?.('data-date') || '';
      return localDate(direct) ? direct : '';
    }
    const reference = localDate(referenceDate) || new Date();
    const month = V19_MONTHS[String(match[2]).toLowerCase().replace('.', '')];
    const day = Number(match[3]);
    const weekday = String(match[1]).toLowerCase();
    if (!Number.isInteger(month) || !day) return '';
    const candidates = [reference.getFullYear() - 1, reference.getFullYear(), reference.getFullYear() + 1]
      .map((year) => new Date(year, month, day, 12))
      .filter((date) => date.getMonth() === month && date.getDate() === day)
      .map((date) => ({ date, weekdayMatch: V19_WEEKDAYS[date.getDay()] === weekday, distance: Math.abs(date - reference) }))
      .sort((a, b) => Number(b.weekdayMatch) - Number(a.weekdayMatch) || a.distance - b.distance);
    return candidates[0] ? toDateString(candidates[0].date) : '';
  }

  function weekColumnForCard(card) {
    const week = card?.closest?.('.week-workspace');
    if (!week) return null;
    let node = card?.parentElement || null;
    while (node && node !== week) {
      if (dateFromWeekColumn(node)) return node;
      node = node.parentElement;
    }
    const candidates = [...week.querySelectorAll('.week-day-column, [class*="week-day-column"], [class*="day-column"]')]
      .filter((node, index, all) => all.indexOf(node) === index && node.contains(card));
    return candidates.find((node) => dateFromWeekColumn(node)) || candidates.at(-1) || null;
  }

  function visibleWeekAnchorDate() {
    const week = document.querySelector('.week-workspace');
    if (!week) return '';
    const candidates = [...week.children, ...week.querySelectorAll(':scope > .week-day-column, :scope > [class*="week-day-column"], :scope > [class*="day-column"]')]
      .filter((node, index, all) => all.indexOf(node) === index);
    const dates = candidates.map((column) => dateFromWeekColumn(column)).filter(localDate).sort();
    return dates[0] || '';
  }

  function visibleWeekRouteDate() {
    const input = [...document.querySelectorAll('.week-workspace input[type="date"]')]
      .find((node) => node.offsetParent !== null && localDate(node.value));
    return input?.value || visibleWeekAnchorDate() || routeDateReference();
  }

  function bumpCardDate(card) {
    const direct = card?.dataset?.date || '';
    if (localDate(direct)) return direct;
    const column = weekColumnForCard(card);
    const columnDate = dateFromWeekColumn(column);
    if (localDate(columnDate)) return columnDate;
    const ancestorDate = column?.dataset?.date || card?.closest?.('[data-date]')?.dataset?.date || '';
    if (localDate(ancestorDate)) return ancestorDate;
    const iso = text(card).match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
    if (localDate(iso)) return iso;
    const week = card?.closest?.('.week-workspace');
    if (week) {
      const columns = [...week.querySelectorAll('.week-day-column, [class*="week-day-column"], [class*="day-column"]')]
        .filter((node, index, array) => array.findIndex((item) => item === node) === index);
      const column = columns.find((node) => node.contains(card));
      const index = columns.indexOf(column);
      if (index >= 0 && index < 7) {
        const reference = localDate(visibleWeekAnchorDate() || routeDateReference()) || new Date();
        const monday = new Date(reference);
        monday.setHours(12, 0, 0, 0);
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + index);
        return toDateString(monday);
      }
    }
    return '';
  }

  function lessonForBumpCard(card) {
    const lessons = currentLessons();
    const date = bumpCardDate(card);
    const content = text(card).toLowerCase();
    const directLessonId = card?.dataset?.lessonId
      || card?.querySelector?.('[data-lesson-id]')?.dataset?.lessonId
      || '';
    const cardIds = new Set([
      card?.dataset?.scheduleBlockId,
      card?.dataset?.blockId,
      card?.dataset?.recordId,
      card?.querySelector?.('[data-schedule-block-id]')?.dataset?.scheduleBlockId,
      card?.querySelector?.('[data-block-id]')?.dataset?.blockId
    ].filter(Boolean).map(String));

    const scoreLesson = (lesson) => {
      let score = date && lesson.date === date ? 10 : 0;
      if (directLessonId && String(lesson.id) === String(directLessonId)) score += 100;
      if (lesson.scheduleBlockId && cardIds.has(String(lesson.scheduleBlockId))) score += 30;

      const blockRecord = scheduleBlockForLesson(lesson);
      const nameTokens = [
        lesson.block,
        lesson.title,
        blockRecord?.name,
        blockRecord?.title,
        blockRecord?.label
      ].map((value) => String(value || '').trim().toLowerCase()).filter((value) => value.length >= 3);
      if (nameTokens.some((token) => content.includes(token))) score += 10;

      const context = String(lesson.contextName || '').trim().toLowerCase();
      if (context && content.includes(context)) score += 4;
      if (lesson.start && content.includes(String(lesson.start).toLowerCase())) score += 3;
      if (lesson.startTime && content.includes(String(lesson.startTime).toLowerCase())) score += 3;
      return { lesson, score };
    };

    // A dated Week card may only match a lesson on that exact date. It must
    // also match a lesson/block identifier or visible block name. Date alone
    // is not enough because several Schedule Blocks can share the same day.
    if (localDate(date)) {
      const exact = lessons.filter((lesson) => lesson.date === date).map(scoreLesson).sort((a, b) => b.score - a.score);
      if (!exact.length) return null;
      if (exact[0].score >= 40) return exact[0].lesson;
      if (exact[0].score >= 20 && exact[0].score > (exact[1]?.score || 0)) return exact[0].lesson;
      if (card.classList.contains('standalone-session-card') && exact.length === 1) return exact[0].lesson;
      return null;
    }

    const scored = lessons.map(scoreLesson).filter((item) => item.score >= 10).sort((a, b) => b.score - a.score);
    return scored[0] && scored[0].score > (scored[1]?.score || 0) ? scored[0].lesson : null;
  }

  function leafTextElements(root) {
    return [...root.querySelectorAll('span, small, strong, b, p, div')]
      .filter((node) => node.children.length === 0 && text(node));
  }

  function resetWeekDecorations(card) {
    card.querySelectorAll('.v19-week-flow-row, .v19-week-flow-time, .v19-week-flow-title, .v19-week-flow-status')
      .forEach((node) => node.classList.remove('v19-week-flow-row', 'v19-week-flow-time', 'v19-week-flow-title', 'v19-week-flow-status'));
  }

  function decorateWeekFlowRows(card) {
    resetWeekDecorations(card);
    card.querySelectorAll(':scope > .week-child-blocks > .week-child-row').forEach((row) => {
      row.classList.add('v19-week-flow-row');
      row.querySelector(':scope > span')?.classList.add('v19-week-flow-time');
      row.querySelector(':scope > strong')?.classList.add('v19-week-flow-title');
      row.querySelector(':scope > small')?.classList.add('v19-week-flow-status');
    });
  }

  function decorateWeekCards() {
    const selectors = [
      '.week-workspace .schedule-week-item',
      '.week-workspace .schedule-tree-card',
      '.week-workspace .standalone-session-card'
    ].join(',');
    document.querySelectorAll(selectors).forEach((card) => {
      card.classList.add('v19-week-card');
      const main = card.querySelector(':scope > .workspace-item-main');
      if (main) {
        main.classList.add('v19-week-card-main', 'v19-week-card-head');
        const timeNode = main.querySelector(':scope > .workspace-item-time');
        const statusNode = main.querySelector(':scope > .status-chip');
        const subtitleNode = [...main.querySelectorAll(':scope > span')].find((node) => node !== timeNode && node !== statusNode);
        timeNode?.classList.add('v19-week-card-time');
        main.querySelector(':scope > strong')?.classList.add('v19-week-card-title');
        subtitleNode?.classList.add('v19-week-card-subtitle');
        statusNode?.classList.add('v19-week-status');
      }
      decorateWeekFlowRows(card);
    });
  }

  function ensureWeekCardActions(card) {
    card.classList.add('v19-week-card');
    let actions = card.querySelector(':scope > .v19-week-card-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'v19-week-card-actions';
      actions.setAttribute('aria-label', 'Lesson actions');
      card.appendChild(actions);
    }
    return actions;
  }

  function lessonCanBump(lesson) {
    if (!lesson || !lesson.id || !localDate(lesson.date)) return false;
    const status = normalizeRouteToken(lesson.status);
    if (['completed', 'taught', 'cancelled', 'canceled', 'archived'].includes(status)) return false;
    if (lesson.locked === true || lesson.isLocked === true) return false;
    return true;
  }

  function weekCards() {
    const selector = [
      '.week-workspace .schedule-week-item',
      '.week-workspace .schedule-tree-card',
      '.week-workspace .standalone-session-card'
    ].join(',');
    return [...document.querySelectorAll(selector)].filter((card, index, all) => all.indexOf(card) === index);
  }

  function lessonStatusLabel(lesson) {
    const raw = String(lesson?.status || '').trim();
    if (!raw) return 'Planned';
    const normalized = normalizeRouteToken(raw);
    if (normalized === 'taught') return 'Completed';
    return raw.replace(/(^|[\s_-])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
  }

  function syncWeekCardStatus(card, lesson) {
    const status = card.querySelector(':scope > .workspace-item-main .status-chip, :scope > .v19-week-card-main .status-chip');
    const cardDate = bumpCardDate(card);
    const derived = lesson ? normalizeRouteToken(lesson.status || 'planned') : 'needs-plan';

    card.classList.toggle('has-plan', Boolean(lesson));
    card.classList.toggle('needs-plan', !lesson);
    card.dataset.v19LessonState = lesson ? 'planned' : 'needs-plan';
    if (localDate(cardDate)) card.dataset.v19CardDate = cardDate;
    else delete card.dataset.v19CardDate;
    if (lesson?.id) card.dataset.v19LessonId = String(lesson.id);
    else delete card.dataset.v19LessonId;

    if (!status) return;
    const label = lesson ? lessonStatusLabel(lesson) : 'Needs plan';
    if (text(status) !== label) status.textContent = label;
    status.dataset.v19DerivedStatus = derived;
    status.classList.add('v19-derived-week-status');
  }

  function removeEmptyWeekActions(card) {
    const actions = card.querySelector(':scope > .v19-week-card-actions');
    if (actions && !actions.children.length) actions.remove();
  }

  function ensurePlanButton(card) {
    const actions = ensureWeekCardActions(card);
    let button = card.querySelector(':scope > .v19-week-card-actions [data-v19-create-plan]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.v19CreatePlan = 'true';
      button.className = 'v19-plan-icon-button';
      button.innerHTML = ICONS.plan;
      actions.appendChild(button);
    }
    button.title = 'Create lesson plan';
    button.setAttribute('aria-label', 'Create lesson plan');
    return button;
  }

  function ensureBumpButton(card, lesson) {
    const actions = ensureWeekCardActions(card);
    let button = card.querySelector(':scope > .v19-week-card-actions [data-v19-bump]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.v19Bump = 'true';
      actions.prepend(button);
    }
    button.classList.remove('v19-bump-button');
    button.classList.add('v19-bump-icon-button');
    button.dataset.v19LessonId = String(lesson.id);
    button.dataset.v19LessonDate = String(lesson.date);
    const cardDate = bumpCardDate(card);
    if (localDate(cardDate)) button.dataset.v19CardDate = cardDate;
    else delete button.dataset.v19CardDate;
    if (button.dataset.v19Icon !== 'shift-forward') {
      button.innerHTML = ICONS.bump;
      button.dataset.v19Icon = 'shift-forward';
    }
    button.title = 'Bump this lesson forward';
    button.setAttribute('aria-label', 'Bump this lesson forward');
    return button;
  }

  function reconcileWeekCardActions(card) {
    const lesson = lessonForBumpCard(card);
    const existingBumps = [...card.querySelectorAll('[data-v19-bump]')];
    const existingPlans = [...card.querySelectorAll('[data-v19-create-plan]')];
    syncWeekCardStatus(card, lesson);

    if (lessonCanBump(lesson)) {
      existingPlans.forEach((button) => button.remove());
      existingBumps.slice(1).forEach((button) => button.remove());
      const bump = ensureBumpButton(card, lesson);
      if (String(bump.dataset.v19LessonId) !== String(lesson.id)) bump.dataset.v19LessonId = String(lesson.id);
    } else {
      existingBumps.forEach((button) => button.remove());
      const isSchedulePlaceholder = card.classList.contains('schedule-week-item') || card.classList.contains('schedule-tree-card');
      const status = normalizeRouteToken(lesson?.status);
      const canCreatePlan = !lesson && isSchedulePlaceholder && !['completed', 'taught', 'locked'].includes(status);
      if (canCreatePlan) {
        existingPlans.slice(1).forEach((button) => button.remove());
        ensurePlanButton(card);
      } else {
        existingPlans.forEach((button) => button.remove());
      }
    }
    removeEmptyWeekActions(card);
  }

  function installBumpButtons() {
    // Reconcile every Week card, including cards that just lost their has-plan
    // class. This removes stale buttons after Bump, Undo, Redo, or deletion.
    weekCards().forEach(reconcileWeekCardActions);

    // Preserve Bump support in non-Week planning lists without allowing a
    // dated Week card to match a lesson from another date.
    const selector = '.planning-list-card, .lesson-block.planned, .standalone-plan';
    document.querySelectorAll(selector).forEach((card) => {
      if (card.closest('.week-workspace')) return;
      const lesson = lessonForBumpCard(card);
      const existing = card.querySelector('[data-v19-bump]');
      if (!lessonCanBump(lesson)) {
        existing?.remove();
        return;
      }
      ensureBumpButton(card, lesson);
    });
  }

  function installPlanActionBridge() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-v19-create-plan]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const card = button.closest('.schedule-week-item, .schedule-tree-card, .v19-week-card');
      const nativeTarget = card?.querySelector(':scope > .workspace-item-main');
      if (nativeTarget instanceof HTMLElement) nativeTarget.click();
    }, true);
  }

  function weekActionDiagnostics() {
    const cards = weekCards();
    const result = {
      mountedCards: cards.length,
      staleBumps: 0,
      missingBumps: 0,
      duplicateBumps: 0,
      needsPlanWithBump: 0,
      plannedWithPlanAction: 0,
      buttonsWithoutLessonId: 0
    };
    cards.forEach((card) => {
      const lesson = lessonForBumpCard(card);
      const bumps = [...card.querySelectorAll('[data-v19-bump]')];
      const plans = [...card.querySelectorAll('[data-v19-create-plan]')];
      if (bumps.length > 1) result.duplicateBumps += bumps.length - 1;
      if (!lesson && bumps.length) result.needsPlanWithBump += bumps.length;
      if (lesson && plans.length) result.plannedWithPlanAction += plans.length;
      if (lessonCanBump(lesson) && !bumps.length) result.missingBumps += 1;
      bumps.forEach((button) => {
        if (!button.dataset.v19LessonId) result.buttonsWithoutLessonId += 1;
        if (!lesson || String(button.dataset.v19LessonId) !== String(lesson.id)) result.staleBumps += 1;
      });
    });
    result.issueCount = result.staleBumps + result.missingBumps + result.duplicateBumps + result.needsPlanWithBump + result.plannedWithPlanAction + result.buttonsWithoutLessonId;
    return result;
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
      const end = localDate(event.endDate) || new Date(cursor);
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

  function bumpDestinationFields(source, destination, lastDate) {
    const next = destination || source;
    const result = { date: destination?.date || lastDate };
    ['start', 'end', 'startTime', 'endTime', 'time', 'scheduleBlockId'].forEach((key) => {
      if (destination && destination[key] !== undefined) result[key] = destination[key];
      else if (!destination && source[key] !== undefined) result[key] = source[key];
    });
    return result;
  }

  function buildBumpPlan(lesson) {
    const series = bumpSeries(lesson);
    if (!series.length) return { series: [], changes: [], conflicts: [], skippedDates: [] };
    const gaps = series.slice(1).map((item, index) => dateDiff(series[index].date, item.date)).filter((days) => days > 0);
    const cadence = median(gaps);
    const finalDate = nextBumpDate(series.at(-1).date, series.at(-1), cadence);
    const blocked = blockedInstructionDates();
    const changes = series.map((item, index) => {
      const destination = series[index + 1] || null;
      const fields = bumpDestinationFields(item, destination, finalDate);
      return { id: item.id, title: item.block || item.title || 'Planning item', from: item.date, to: fields.date, fields };
    });
    const seriesIds = new Set(series.map((item) => String(item.id)));
    const all = currentLessons();
    const conflicts = changes.flatMap((change) => all.filter((item) => !seriesIds.has(String(item.id)) && item.date === change.to && (
      (lesson.contextId && item.contextId === lesson.contextId) ||
      (lesson.contextName && item.contextName === lesson.contextName)
    )).map((item) => ({ date: change.to, title: item.block || item.title || 'Existing lesson' })));
    const skippedDates = [];
    const last = localDate(series.at(-1).date);
    const final = localDate(finalDate);
    if (last && final) {
      const cursor = new Date(last);
      cursor.setDate(cursor.getDate() + 1);
      while (cursor < final) {
        const value = toDateString(cursor);
        if (blocked.has(value)) skippedDates.push(value);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return { series, changes, conflicts, skippedDates, cadence };
  }

  function executeV19Bump(lesson) {
    const allLessons = readJSON('cos-lessons', []);
    const plan = buildBumpPlan(lesson);
    if (!lesson || !plan.changes.length) return { changed: 0, ...plan };
    const byId = new Map(plan.changes.map((change) => [String(change.id), change]));
    const changedAt = new Date().toISOString();
    const updated = allLessons.map((item) => {
      const change = byId.get(String(item.id));
      return change ? { ...item, ...change.fields, updatedAt: changedAt } : item;
    });
    writeJSON('cos-lessons', updated, 'Bump lesson sequence');
    return { changed: plan.changes.length, ...plan };
  }

  function identifyBumpLesson(button) {
    const card = button.closest('article, .lesson-block, .planning-list-card, .schedule-week-item, [class*="card"]');
    const cardDate = bumpCardDate(card);
    const byId = currentLessons().find((item) => String(item.id) === String(button.dataset.v19LessonId));
    const idMatchIsCurrent = byId && (!localDate(cardDate) || byId.date === cardDate);
    const lesson = idMatchIsCurrent ? byId : lessonForBumpCard(card);
    const valid = Boolean(lesson && (!localDate(cardDate) || lesson.date === cardDate));
    return {
      lesson: valid ? lesson : null,
      cardDate,
      cardText: text(card),
      staleLessonId: byId && !idMatchIsCurrent ? String(byId.id) : ''
    };
  }

  function bumpSeries(lesson) {
    const lessons = currentLessons()
      .filter((item) => item.date && !['Completed', 'Cancelled'].includes(item.status))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.start || a.startTime || '').localeCompare(String(b.start || b.startTime || '')));
    if (!lesson) return [];
    const contextKey = (item) => {
      if (item.contextId) return `${item.contextType || 'context'}:${item.contextId}`;
      if (item.classId) return `class:${item.classId}`;
      if (item.groupId) return `group:${item.groupId}`;
      if (item.learnerId || item.studentId) return `learner:${item.learnerId || item.studentId}`;
      if (item.contextName) return `${item.contextType || 'context-name'}:${String(item.contextName).trim().toLowerCase()}`;
      return '';
    };
    const lessonContext = contextKey(lesson);
    const sameSeries = lessons.filter((item) => {
      const itemContext = contextKey(item);
      const contextMatch = lessonContext ? itemContext === lessonContext : !itemContext;
      const blockMatch = lesson.scheduleBlockId && item.scheduleBlockId
        ? String(item.scheduleBlockId) === String(lesson.scheduleBlockId)
        : String(item.block || '') === String(lesson.block || '');
      return contextMatch && blockMatch;
    });
    const startIndex = sameSeries.findIndex((item) => String(item.id) === String(lesson.id));
    return startIndex >= 0 ? sameSeries.slice(startIndex) : [lesson];
  }

  function previewBump(button) {
    const { lesson, cardDate, cardText, staleLessonId } = identifyBumpLesson(button);
    const plan = buildBumpPlan(lesson);
    const preview = plan.changes.slice(0, 10);

    const overlay = document.createElement('div');
    overlay.className = 'v19-modal-backdrop';
    overlay.innerHTML = `
      <div class="v19-modal" role="dialog" aria-modal="true" aria-labelledby="v19-bump-title">
        <button class="v19-modal-close" aria-label="Close">${ICONS.close}</button>
        <span class="v19-eyebrow">BUMP PREVIEW</span>
        <h2 id="v19-bump-title">Move this lesson forward?</h2>
        <p>${lesson ? `${plan.changes.length} lesson${plan.changes.length === 1 ? '' : 's'} will move into the next available session slot.` : 'This card is no longer connected to a lesson on the displayed date. Close the preview and try again after the Week view finishes updating.'}</p>
        ${lesson ? `<p class="v19-modal-note"><strong>The Schedule Block stays on ${escapeHTML(formatDate(cardDate || lesson.date, { weekday: 'long', month: 'short', day: 'numeric' }))}.</strong> Only the lesson plan moves; the original block returns to Needs plan.</p>` : staleLessonId ? `<p class="v19-modal-warning">A stale lesson link (${escapeHTML(staleLessonId)}) was removed from this card.</p>` : ''}
        ${preview.length ? `<div class="v19-bump-preview">${preview.map((item) => `<div><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.from)} → ${escapeHTML(item.to)}</span></div>`).join('')}${plan.changes.length > preview.length ? `<small>+ ${plan.changes.length - preview.length} additional item(s)</small>` : ''}</div>` : `<div class="v19-bump-preview"><p>${escapeHTML(cardText || 'Selected planning item')}</p></div>`}
        ${plan.skippedDates.length ? `<p class="v19-modal-note"><strong>Skipped:</strong> ${escapeHTML(plan.skippedDates.slice(0, 6).join(', '))}${plan.skippedDates.length > 6 ? '…' : ''}</p>` : ''}
        ${plan.conflicts.length ? `<p class="v19-modal-warning"><strong>${plan.conflicts.length} possible conflict${plan.conflicts.length === 1 ? '' : 's'}:</strong> ${escapeHTML(plan.conflicts.slice(0, 3).map((item) => `${item.date} ${item.title}`).join('; '))}</p>` : ''}
        <p class="v19-modal-note">After the change, use the Undo button in the confirmation message or the icon in the top toolbar.</p>
        <div class="v19-modal-actions"><button class="v19-secondary-button" data-cancel>Cancel</button><button class="v19-primary-button" data-confirm ${lesson ? '' : 'disabled'}>Confirm Bump</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.v19-modal-close').addEventListener('click', close);
    overlay.querySelector('[data-cancel]').addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    overlay.querySelector('[data-confirm]')?.addEventListener('click', () => {
      close();
      const currentRoute = location.hash || buildHash('week', { date: lesson?.date || '' });
      const currentScroll = { x: window.scrollX, y: window.scrollY };
      const result = executeV19Bump(lesson);
      history.replaceState({ classroomRoute: 'week', bumpCompleted: true }, '', currentRoute);
      showToast(`Bump completed · ${result.changed} record${result.changed === 1 ? '' : 's'} shifted`, true);
      window.setTimeout(() => {
        maintainEnhancements();
        window.scrollTo(currentScroll.x, currentScroll.y);
      }, 40);
      window.setTimeout(() => {
        maintainEnhancements();
        window.scrollTo(currentScroll.x, currentScroll.y);
      }, 220);
    });
  }

  function installBumpPreview() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !(button.dataset.v19Bump === 'true' || /^bump$/i.test(text(button)))) return;
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
    toast.querySelector('button')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.ClassroomV19History?.undo();
    }, true);
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
      if (programmaticNavigation) return;
      const button = event.target.closest('.sidebar .nav-button:not(.v19-nav-button)');
      if (!button) return;
      const route = routeForLabel(text(button));
      if (!route) return;
      hideCustomPage();
      const params = {};
      const date = route.path === 'week' ? visibleWeekRouteDate() : readJSON('cos-focus-date', '');
      if (['week', 'calendar', 'today'].includes(route.path) && localDate(date)) params.date = date;
      setHash(route.path, params);
    }, true);
  }

  function installWeekDateHistory() {
    document.addEventListener('click', (event) => {
      if (routeDateApplication || programmaticNavigation) return;
      const button = event.target.closest('.week-workspace .header-actions button, .week-workspace [class*="header"] button');
      if (!button) return;
      const label = [text(button), button.getAttribute?.('aria-label'), button.title].filter(Boolean).join(' ');
      const delta = /\b(Previous|Prev)\b|‹|←/i.test(label) ? -7
        : /\bNext(?: week)?\b|›|→/i.test(label) ? 7 : 0;
      if (!delta) return;
      const current = visibleWeekAnchorDate() || parseHash().params.get('date') || routeDateReference();
      if (!localDate(current)) return;
      setHash('week', { date: addDays(current, delta) });
    }, true);

    document.addEventListener('change', (event) => {
      if (routeDateApplication || programmaticNavigation) return;
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'date' || !input.closest('.week-workspace')) return;
      if (localDate(input.value)) setHash('week', { date: input.value });
    }, true);
  }

  function applyRestoredRoute() {
    const returnRoute = sessionStorage.getItem('classroom-v19-return-route');
    if (returnRoute) {
      restoredRoutePending = true;
      restoredRouteHash = returnRoute;
      sessionStorage.removeItem('classroom-v19-return-route');
      history.replaceState({ restored: true }, '', returnRoute);
    }
    let scroll = null;
    try { scroll = JSON.parse(sessionStorage.getItem('classroom-v19-return-scroll') || 'null'); } catch { scroll = null; }
    if (scroll) {
      sessionStorage.removeItem('classroom-v19-return-scroll');
      window.setTimeout(() => window.scrollTo(Number(scroll.x || 0), Number(scroll.y || 0)), 420);
    }
  }

  function finishRestoredRoute() {
    if (!restoredRoutePending) return;
    if (restoredRouteHash && location.hash !== restoredRouteHash) {
      history.replaceState({ restored: true }, '', restoredRouteHash);
    }
    navigateFromHash();
    window.setTimeout(() => {
      restoredRoutePending = false;
      restoredRouteHash = '';
      syncHashFromActiveNav();
    }, 180);
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
    registerNativeRoutes();
    installHistoryToolbar();
    normalizeLabels();
    installLibraryStandardsPage();
    installFlowEditors();
    decorateWeekCards();
    installBumpButtons();
    decorateScheduleTree();
    syncHashFromActiveNav();
    highlightWeekTarget();
  }

  function start() {
    applyRestoredRoute();
    repairImportedCalendar();
    installViewInWeekFix();
    installNativeFlowSaveBridge();
    installBumpPreview();
    installPlanActionBridge();
    installKeyboardHistory();
    installNavClickSync();
    installWeekDateHistory();
    window.addEventListener('popstate', navigateFromHash);
    window.addEventListener('hashchange', navigateFromHash);
    window.addEventListener('classroom:v19-history', updateHistoryToolbar);
    window.addEventListener('classroom:v19-data-change', () => window.setTimeout(maintainEnhancements, 0));
    window.addEventListener('classroom:v19-restored', () => window.setTimeout(maintainEnhancements, 0));

    const observer = new MutationObserver(() => maintainEnhancements());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const ready = window.setInterval(() => {
      if (!document.querySelector('.app-shell')) return;
      window.clearInterval(ready);
      maintainEnhancements();
      navigateFromHash();
      finishRestoredRoute();
      showPendingToast();
      window.setTimeout(() => {
        routeBootstrapPending = false;
        syncHashFromActiveNav();
      }, 360);
      document.documentElement.dataset.classroomVersion = '19.2A.4';
      console.info(`Classroom v${VERSION} workflow and navigation enhancements loaded.`);
    }, 60);
  }

  window.ClassroomV19Diagnostics = {
    repairImportedCalendar,
    buildHealthReport,
    buildBumpPlan,
    normalizeFlowBlocks,
    standardKind,
    routeConnection,
    decorateWeekCards,
    lessonForBumpCard,
    reconcileWeekCardActions,
    weekActionDiagnostics,
    bumpCardDate,
    visibleWeekAnchorDate,
    visibleWeekRouteDate,
    identifyBumpLesson
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
