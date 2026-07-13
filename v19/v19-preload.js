(() => {
  'use strict';

  const DATA_PREFIX = 'cos-';
  const UI_KEYS = new Set([
    'cos-nav-groups',
    'cos-sidebar-collapsed',
    'cos-focus-date',
    'cos-theme',
    'cos-display-name',
    'cos-current-school-year',
    'cos-summer-countdown',
    'cos-summer-break-date'
  ]);
  const SESSION_KEY = 'classroom-v19-history';
  const MAX_HISTORY = 20;
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  const nativeClear = Storage.prototype.clear;

  let armed = false;
  let restoring = false;
  let pendingLabel = '';
  let transaction = null;
  let transactionTimer = null;
  let state = loadState();


  function validLocalDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return false;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
  }

  function isImportedPdfEvent(event) {
    return /pdf/i.test([event?.source, event?.importSource, event?._importFile, event?.parser].filter(Boolean).join(' ')) || /^E-pdfcal-/i.test(String(event?.id || ''));
  }

  function eventQuality(event) {
    return (event?.parser === 'structured-table-v2' ? 10 : 0)
      + (String(event?.confidence || '').toLowerCase() === 'high' ? 4 : 0)
      + (event?.sourceKey ? 3 : 0)
      + (/^E-pdfcal-/i.test(String(event?.id || '')) ? 3 : 0)
      + (validLocalDate(event?.date) ? 5 : 0)
      + (String(event?.title || '').trim() ? 2 : 0);
  }

  function repairCalendarBeforeApp() {
    let events;
    try { events = JSON.parse(localStorage.getItem('cos-calendar-events') || '[]'); } catch { return; }
    if (!Array.isArray(events)) return;
    let quarantine;
    try { quarantine = JSON.parse(localStorage.getItem('cos-calendar-quarantine-v19') || '[]'); } catch { quarantine = []; }
    if (!Array.isArray(quarantine)) quarantine = [];
    const known = new Set(quarantine.map((item) => `${item?.id}|${item?.quarantineReason || ''}`));
    const kept = [];
    const removed = [];
    let normalized = 0;

    for (const original of events) {
      const event = { ...original };
      if (validLocalDate(event.start) && !validLocalDate(event.date)) {
        event.date = event.start;
        event.start = '';
        normalized += 1;
      }
      if (validLocalDate(event.end)) {
        if (!validLocalDate(event.endDate)) event.endDate = event.end;
        event.end = '';
        normalized += 1;
      }
      if (event.endDate && (!validLocalDate(event.endDate) || (validLocalDate(event.date) && event.endDate < event.date))) {
        event.calendarRepairNote = `Removed invalid end date: ${event.endDate}`;
        event.endDate = '';
        normalized += 1;
      }
      if (!validLocalDate(event.date)) {
        removed.push({ ...event, quarantineReason: isImportedPdfEvent(event) ? 'Invalid imported calendar date' : 'Invalid calendar date', quarantinedAt: new Date().toISOString() });
      } else {
        kept.push(event);
      }
    }

    const groups = new Map();
    for (const event of kept) {
      if (!isImportedPdfEvent(event) || !validLocalDate(event.date)) continue;
      const signature = [event.date, event.endDate || '', String(event.title || '').trim().toLowerCase()].join('|');
      if (!groups.has(signature)) groups.set(signature, []);
      groups.get(signature).push(event);
    }
    const duplicateIds = new Set();
    for (const items of groups.values()) {
      if (items.length < 2) continue;
      const ordered = [...items].sort((a, b) => eventQuality(b) - eventQuality(a));
      for (const event of ordered.slice(1)) {
        duplicateIds.add(String(event.id));
        removed.push({ ...event, quarantineReason: 'Duplicate imported calendar event', quarantinedAt: new Date().toISOString() });
      }
    }
    const active = kept.filter((event) => !duplicateIds.has(String(event.id)));
    for (const item of removed) {
      const key = `${item.id}|${item.quarantineReason}`;
      if (!known.has(key)) { quarantine.push(item); known.add(key); }
    }
    if (normalized || removed.length || JSON.stringify(active) !== JSON.stringify(events)) {
      localStorage.setItem('cos-calendar-events', JSON.stringify(active));
      localStorage.setItem('cos-calendar-quarantine-v19', JSON.stringify(quarantine));
    }
    localStorage.setItem('cos-calendar-repair-v19', JSON.stringify({
      ranAt: new Date().toISOString(), normalized, quarantined: removed.length,
      invalidRemoved: removed.filter((item) => /Invalid/.test(item.quarantineReason)).length,
      duplicatesRemoved: removed.filter((item) => /Duplicate/.test(item.quarantineReason)).length,
      activeEvents: active.length, quarantineTotal: quarantine.length,
      stage: 'preload-before-react'
    }));
  }

  repairCalendarBeforeApp();

  function isTrackedStorage(storage) {
    return storage === window.localStorage;
  }

  function isTrackedKey(key) {
    return typeof key === 'string' && key.startsWith(DATA_PREFIX) && !UI_KEYS.has(key);
  }

  function loadState() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      return {
        undo: Array.isArray(parsed.undo) ? parsed.undo.slice(-MAX_HISTORY) : [],
        redo: Array.isArray(parsed.redo) ? parsed.redo.slice(-MAX_HISTORY) : []
      };
    } catch {
      return { undo: [], redo: [] };
    }
  }

  function saveState() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Classroom v19 could not persist undo history.', error);
    }
    window.dispatchEvent(new CustomEvent('classroom:v19-history', { detail: getStatus() }));
  }

  function getStatus() {
    return {
      canUndo: state.undo.length > 0 || Boolean(transaction),
      canRedo: state.redo.length > 0,
      undoLabel: transaction?.label || state.undo.at(-1)?.label || '',
      redoLabel: state.redo.at(-1)?.label || ''
    };
  }

  function startTransaction(label = '') {
    if (!transaction) {
      transaction = {
        label: label || pendingLabel || 'Change',
        timestamp: Date.now(),
        changes: new Map()
      };
      pendingLabel = '';
    } else if (label && transaction.label === 'Change') {
      transaction.label = label;
    }
    return transaction;
  }

  function scheduleFinalize() {
    clearTimeout(transactionTimer);
    transactionTimer = window.setTimeout(finalizeTransaction, 350);
  }

  function registerChange(key, oldValue, newValue) {
    if (oldValue === newValue) return;
    const tx = startTransaction();
    if (!tx.changes.has(key)) {
      tx.changes.set(key, { key, oldValue, newValue });
    } else {
      tx.changes.get(key).newValue = newValue;
    }
    scheduleFinalize();
  }

  function finalizeTransaction() {
    clearTimeout(transactionTimer);
    transactionTimer = null;
    if (!transaction) return;
    const changes = Array.from(transaction.changes.values()).filter(
      (change) => change.oldValue !== change.newValue
    );
    if (changes.length) {
      state.undo.push({
        label: transaction.label || 'Change',
        timestamp: transaction.timestamp,
        changes
      });
      state.undo = state.undo.slice(-MAX_HISTORY);
      state.redo = [];
    }
    transaction = null;
    saveState();
  }

  function applyValue(key, value) {
    if (value === null || value === undefined) {
      nativeRemoveItem.call(localStorage, key);
    } else {
      nativeSetItem.call(localStorage, key, value);
    }
  }

  function applyTransaction(entry, direction) {
    restoring = true;
    try {
      const ordered = direction === 'undo' ? [...entry.changes].reverse() : entry.changes;
      ordered.forEach((change) => {
        applyValue(change.key, direction === 'undo' ? change.oldValue : change.newValue);
      });
    } finally {
      restoring = false;
    }
  }

  function restoreAndRefresh(entry, direction) {
    applyTransaction(entry, direction);
    saveState();
    window.dispatchEvent(
      new CustomEvent('classroom:v19-restored', {
        detail: { direction, label: entry.label, changeCount: entry.changes.length }
      })
    );
    const route = window.location.hash || '#/today';
    sessionStorage.setItem('classroom-v19-return-route', route);
    window.setTimeout(() => window.location.reload(), 45);
  }

  function undo() {
    finalizeTransaction();
    const entry = state.undo.pop();
    if (!entry) return false;
    state.redo.push(entry);
    state.redo = state.redo.slice(-MAX_HISTORY);
    restoreAndRefresh(entry, 'undo');
    return true;
  }

  function redo() {
    finalizeTransaction();
    const entry = state.redo.pop();
    if (!entry) return false;
    state.undo.push(entry);
    state.undo = state.undo.slice(-MAX_HISTORY);
    restoreAndRefresh(entry, 'redo');
    return true;
  }

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    const normalizedKey = String(key);
    const normalizedValue = String(value);
    if (!restoring && armed && isTrackedStorage(this) && isTrackedKey(normalizedKey)) {
      const oldValue = this.getItem(normalizedKey);
      registerChange(normalizedKey, oldValue, normalizedValue);
    }
    return nativeSetItem.call(this, normalizedKey, normalizedValue);
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    const normalizedKey = String(key);
    if (!restoring && armed && isTrackedStorage(this) && isTrackedKey(normalizedKey)) {
      const oldValue = this.getItem(normalizedKey);
      registerChange(normalizedKey, oldValue, null);
    }
    return nativeRemoveItem.call(this, normalizedKey);
  };

  Storage.prototype.clear = function patchedClear() {
    if (!restoring && armed && isTrackedStorage(this)) {
      const tracked = [];
      for (let index = 0; index < this.length; index += 1) {
        const key = this.key(index);
        if (isTrackedKey(key)) tracked.push([key, this.getItem(key)]);
      }
      if (tracked.length) {
        const tx = startTransaction(pendingLabel || 'Clear Classroom data');
        tracked.forEach(([key, oldValue]) => {
          tx.changes.set(key, { key, oldValue, newValue: null });
        });
        scheduleFinalize();
      }
    }
    return nativeClear.call(this);
  };

  window.ClassroomV19History = {
    begin(label) {
      pendingLabel = String(label || 'Change');
      if (transaction && transaction.changes.size === 0) transaction.label = pendingLabel;
    },
    finalize: finalizeTransaction,
    undo,
    redo,
    status: getStatus,
    clear() {
      transaction = null;
      clearTimeout(transactionTimer);
      state = { undo: [], redo: [] };
      saveState();
    },
    arm() {
      armed = true;
    }
  };

  window.addEventListener('load', () => {
    window.setTimeout(() => {
      armed = true;
      saveState();
    }, 700);
  });
})();
