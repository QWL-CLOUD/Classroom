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
