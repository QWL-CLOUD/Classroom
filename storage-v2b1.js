"use strict";
// Sprint 2B.1: Chrome local-folder connection, conflict-safe autosave, and recovery backups.
const FOLDER_DB_NAME = "ClassroomFolderAccessV1";
const FOLDER_DB_STORE = "handles";
const FOLDER_HANDLE_KEY = "classroomDataFolder";
const LOCAL_UPDATED_KEY = "classroomLocalUpdatedAtV1";
const AUTO_SAVE_KEY = "classroomAutoFolderSaveV1";
const LAST_MANUAL_BACKUP_KEY = "classroomLastManualBackupV1";
const LAST_RECOVERY_KEY = "classroomLastRecoveryV1";
const WORKSPACE_FILE = "Classroom-Workspace.classroom.json";
const PREVIOUS_FILE = "Classroom-Previous.classroom.json";
const MANAGED_FOLDERS = ["Imports", "Resource Files", "Backups", "Exports", "Archive"];
const FOLDER_ACCESS_SUPPORTED = typeof window.showDirectoryPicker === "function" && "indexedDB" in window;
const nativeStorageSetItemV2B1 = Storage.prototype.setItem;

let classroomFolderHandle = null;
let classroomFolderPermission = "none";
let classroomKnownFolderHash = "";
let classroomFolderSavedAt = 0;
let classroomLastManualBackup = Number(localStorage.getItem(LAST_MANUAL_BACKUP_KEY) || 0);
let classroomPreviousRecovery = null;
let classroomBackups = [];
let classroomFolderConflict = null;
let classroomFolderState = FOLDER_ACCESS_SUPPORTED ? "browser-only" : "unsupported";
let classroomFolderError = "";
let classroomAutoSaveTimer = null;
let classroomAutoSaveSuspended = false;
let classroomStoragePatchInstalled = false;

viewMeta.storage = ["Private local workspace", "Storage & backup"];

function classroomDataPayload() {
  const payload = structuredClone(data);
  delete payload._classroomMeta;
  return payload;
}
function classroomMeaningfulData(payload = classroomDataPayload()) {
  return ["lessons", "materials", "calendarEvents", "students", "teachingMemory", "templates", "imports", "libraryCollections"].some(k => Array.isArray(payload[k]) && payload[k].length);
}
function classroomStableString(payload) { return JSON.stringify(payload); }
async function classroomHash(payload) {
  const bytes = new TextEncoder().encode(classroomStableString(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function classroomFormatDateTime(value) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString(); } catch { return "—"; }
}
function classroomFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function classroomTimestampName(prefix = "Classroom-Backup") {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.classroom.json`;
}
function classroomLocalUpdatedAt() { return Number(localStorage.getItem(LOCAL_UPDATED_KEY) || 0); }
function classroomSetMeta(key, value) { nativeStorageSetItemV2B1.call(localStorage, key, String(value)); }

function classroomOpenHandleDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FOLDER_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(FOLDER_DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function classroomStoreHandle(handle) {
  const db = await classroomOpenHandleDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDER_DB_STORE, "readwrite");
    tx.objectStore(FOLDER_DB_STORE).put(handle, FOLDER_HANDLE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function classroomLoadStoredHandle() {
  const db = await classroomOpenHandleDB();
  const handle = await new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDER_DB_STORE, "readonly");
    const request = tx.objectStore(FOLDER_DB_STORE).get(FOLDER_HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}
async function classroomForgetStoredHandle() {
  const db = await classroomOpenHandleDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDER_DB_STORE, "readwrite");
    tx.objectStore(FOLDER_DB_STORE).delete(FOLDER_HANDLE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function classroomPermission(handle, request = false) {
  if (!handle) return "none";
  const options = { mode: "readwrite" };
  let status = await handle.queryPermission(options);
  if (status !== "granted" && request) status = await handle.requestPermission(options);
  return status;
}
async function classroomEnsureFolders() {
  if (!classroomFolderHandle) throw new Error("No Classroom Data folder is connected.");
  for (const name of MANAGED_FOLDERS) await classroomFolderHandle.getDirectoryHandle(name, { create: true });
  const backups = await classroomFolderHandle.getDirectoryHandle("Backups", { create: true });
  await backups.getDirectoryHandle("Recovery", { create: true });
}
async function classroomReadFile(directory, name) {
  try {
    const handle = await directory.getFileHandle(name);
    const file = await handle.getFile();
    return { text: await file.text(), file, handle };
  } catch (error) {
    if (error?.name === "NotFoundError") return null;
    throw error;
  }
}
async function classroomWriteFile(directory, name, text) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return handle;
}
async function classroomReadWorkspace() {
  if (!classroomFolderHandle) return null;
  const result = await classroomReadFile(classroomFolderHandle, WORKSPACE_FILE);
  if (!result) return null;
  let object;
  try { object = JSON.parse(result.text); } catch { throw new Error(`${WORKSPACE_FILE} is not valid JSON.`); }
  if (!object || !Array.isArray(object.lessons) || !Array.isArray(object.materials)) throw new Error(`${WORKSPACE_FILE} is not a valid Classroom workspace.`);
  const meta = object._classroomMeta || {};
  const payload = structuredClone(object);
  delete payload._classroomMeta;
  const actualHash = await classroomHash(payload);
  return { payload, hash: actualHash, savedAt: Number(meta.savedAt) || result.file.lastModified, text: result.text, file: result.file };
}
async function classroomWorkspaceText(payload = classroomDataPayload()) {
  const savedAt = Date.now();
  const dataHash = await classroomHash(payload);
  const object = { ...payload, _classroomMeta: { format: "Classroom Workspace", version: "2B.1", savedAt, dataHash } };
  return { text: JSON.stringify(object, null, 2), savedAt, dataHash };
}
async function classroomRecoveryDirectory() {
  const backups = await classroomFolderHandle.getDirectoryHandle("Backups", { create: true });
  return backups.getDirectoryHandle("Recovery", { create: true });
}
async function classroomPreservePrevious(currentWorkspace) {
  if (!currentWorkspace?.text) return;
  const recovery = await classroomRecoveryDirectory();
  await classroomWriteFile(recovery, PREVIOUS_FILE, currentWorkspace.text);
  classroomPreviousRecovery = { name: PREVIOUS_FILE, savedAt: currentWorkspace.savedAt, size: new Blob([currentWorkspace.text]).size };
  const lastRecovery = Number(localStorage.getItem(LAST_RECOVERY_KEY) || 0);
  if (Date.now() - lastRecovery >= 15 * 60 * 1000) {
    await classroomWriteFile(recovery, classroomTimestampName("Classroom-Recovery"), currentWorkspace.text);
    classroomSetMeta(LAST_RECOVERY_KEY, Date.now());
    await classroomTrimRecoveries(recovery, 20);
  }
}
async function classroomTrimRecoveries(recoveryDirectory, keep = 20) {
  const files = [];
  for await (const [name, handle] of recoveryDirectory.entries()) {
    if (handle.kind !== "file" || !name.startsWith("Classroom-Recovery-")) continue;
    const file = await handle.getFile();
    files.push({ name, modified: file.lastModified });
  }
  files.sort((a,b) => b.modified - a.modified);
  for (const item of files.slice(keep)) await recoveryDirectory.removeEntry(item.name);
}
async function classroomInspectPreviousRecovery() {
  if (!classroomFolderHandle || classroomFolderPermission !== "granted") { classroomPreviousRecovery = null; return; }
  const recovery = await classroomRecoveryDirectory();
  const result = await classroomReadFile(recovery, PREVIOUS_FILE);
  classroomPreviousRecovery = result ? { name: PREVIOUS_FILE, savedAt: result.file.lastModified, size: result.file.size } : null;
}

async function classroomInspectFolder() {
  if (!classroomFolderHandle || classroomFolderPermission !== "granted") return;
  classroomFolderState = "checking";
  classroomFolderError = "";
  renderStorageV2B1();
  try {
    await classroomEnsureFolders();
    const folder = await classroomReadWorkspace();
    const browserPayload = classroomDataPayload();
    const browserHash = await classroomHash(browserPayload);
    classroomFolderConflict = null;
    if (!folder) {
      classroomKnownFolderHash = "";
      classroomFolderSavedAt = 0;
      await classroomSaveWorkspace({ force: true, preservePrevious: false, message: "Initial folder workspace created" });
    } else {
      classroomKnownFolderHash = folder.hash;
      classroomFolderSavedAt = folder.savedAt;
      if (folder.hash === browserHash) {
        classroomFolderState = "synced";
      } else {
        const browserTime = classroomLocalUpdatedAt();
        classroomFolderConflict = { folder, browserHash, browserTime, reason: "different-copies" };
        classroomFolderState = "conflict";
      }
    }
    await classroomInspectPreviousRecovery();
    await classroomRefreshBackups();
  } catch (error) {
    classroomFolderState = "error";
    classroomFolderError = error.message || String(error);
  }
  renderStorageV2B1();
}
async function classroomConnectFolder() {
  if (!FOLDER_ACCESS_SUPPORTED) { showToast("Direct folder access requires desktop Chrome"); return; }
  try {
    const handle = await window.showDirectoryPicker({ id: "classroom-data-folder", mode: "readwrite", startIn: "documents" });
    const permission = await classroomPermission(handle, true);
    if (permission !== "granted") throw new Error("Folder permission was not granted.");
    classroomFolderHandle = handle;
    classroomFolderPermission = permission;
    await classroomStoreHandle(handle);
    await classroomInspectFolder();
  } catch (error) {
    if (error?.name === "AbortError") return;
    classroomFolderState = "error";
    classroomFolderError = error.message || String(error);
    renderStorageV2B1();
    showToast(classroomFolderError);
  }
}
async function classroomReconnectFolder() {
  if (!classroomFolderHandle) return classroomConnectFolder();
  try {
    classroomFolderPermission = await classroomPermission(classroomFolderHandle, true);
    if (classroomFolderPermission !== "granted") throw new Error("Folder permission was not granted.");
    await classroomInspectFolder();
  } catch (error) {
    classroomFolderState = "error";
    classroomFolderError = error.message || String(error);
    renderStorageV2B1();
  }
}
async function classroomDisconnectFolder() {
  if (!classroomFolderHandle) return;
  if (!confirm("Forget this folder connection? Files already saved in the folder will not be deleted.")) return;
  await classroomForgetStoredHandle();
  classroomFolderHandle = null;
  classroomFolderPermission = "none";
  classroomKnownFolderHash = "";
  classroomFolderSavedAt = 0;
  classroomFolderConflict = null;
  classroomBackups = [];
  classroomPreviousRecovery = null;
  classroomFolderState = FOLDER_ACCESS_SUPPORTED ? "browser-only" : "unsupported";
  renderStorageV2B1();
  showToast("Folder connection forgotten");
}

async function classroomSaveWorkspace({ force = false, preservePrevious = true, message = "Saved to folder" } = {}) {
  if (!classroomFolderHandle || classroomFolderPermission !== "granted") { showToast("Reconnect the Classroom Data folder first"); return false; }
  if (classroomFolderConflict && !force) { classroomFolderState = "conflict"; renderStorageV2B1(); return false; }
  classroomFolderState = "saving";
  renderStorageV2B1();
  try {
    await classroomEnsureFolders();
    const browserPayload = classroomDataPayload();
    const browserHash = await classroomHash(browserPayload);
    const current = await classroomReadWorkspace();
    if (!force && current && classroomKnownFolderHash && current.hash !== classroomKnownFolderHash && current.hash !== browserHash) {
      classroomFolderConflict = { folder: current, browserHash, browserTime: classroomLocalUpdatedAt(), reason: "folder-changed" };
      classroomFolderState = "conflict";
      renderStorageV2B1();
      showToast("Folder copy changed outside Classroom. Choose which copy to keep.");
      return false;
    }
    if (current && current.hash === browserHash) {
      classroomKnownFolderHash = current.hash;
      classroomFolderSavedAt = current.savedAt;
      classroomFolderConflict = null;
      classroomFolderState = "synced";
      renderStorageV2B1();
      return true;
    }
    if (preservePrevious && current) await classroomPreservePrevious(current);
    const workspace = await classroomWorkspaceText(browserPayload);
    await classroomWriteFile(classroomFolderHandle, WORKSPACE_FILE, workspace.text);
    classroomKnownFolderHash = workspace.dataHash;
    classroomFolderSavedAt = workspace.savedAt;
    classroomFolderConflict = null;
    classroomFolderState = "synced";
    renderStorageV2B1();
    if (message) showToast(message);
    return true;
  } catch (error) {
    classroomFolderState = "error";
    classroomFolderError = error.message || String(error);
    renderStorageV2B1();
    showToast(classroomFolderError);
    return false;
  }
}
function classroomScheduleAutoSave() {
  if (classroomAutoSaveSuspended) return;
  const enabled = localStorage.getItem(AUTO_SAVE_KEY) !== "false";
  if (!enabled || !classroomFolderHandle || classroomFolderPermission !== "granted" || classroomFolderConflict) return;
  clearTimeout(classroomAutoSaveTimer);
  classroomFolderState = "browser-newer";
  renderStorageV2B1();
  classroomAutoSaveTimer = setTimeout(() => classroomSaveWorkspace({ message: "Auto-saved to folder" }), 1400);
}
function classroomInstallStoragePatch() {
  if (classroomStoragePatchInstalled || window.__classroomStoragePatchV2B1) return;
  window.__classroomStoragePatchV2B1 = true;
  classroomStoragePatchInstalled = true;
  Storage.prototype.setItem = function(key, value) {
    nativeStorageSetItemV2B1.call(this, key, value);
    if (this === localStorage && key === STORAGE_KEY) {
      nativeStorageSetItemV2B1.call(localStorage, LOCAL_UPDATED_KEY, String(Date.now()));
      classroomScheduleAutoSave();
      renderStorageV2B1();
    }
  };
}

async function classroomLoadPayload(payload, label, folderSavedAt = 0) {
  if (!payload || !Array.isArray(payload.lessons) || !Array.isArray(payload.materials)) throw new Error("This file is not a valid Classroom workspace.");
  const current = classroomDataPayload();
  nativeStorageSetItemV2B1.call(localStorage, UNDO_IMPORT_KEY, JSON.stringify({ snapshot: current, label }));
  classroomAutoSaveSuspended = true;
  const clean = structuredClone(payload);
  delete clean._classroomMeta;
  data = normalizeData(clean);
  if (typeof migrateLibraryData === "function") migrateLibraryData(false);
  nativeStorageSetItemV2B1.call(localStorage, STORAGE_KEY, JSON.stringify(data));
  nativeStorageSetItemV2B1.call(localStorage, LOCAL_UPDATED_KEY, String(folderSavedAt || Date.now()));
  classroomAutoSaveSuspended = false;
  renderAll();
}
async function classroomUseFolderCopy() {
  if (!classroomFolderConflict?.folder) {
    const folder = await classroomReadWorkspace();
    if (!folder) { showToast("No folder workspace was found"); return; }
    classroomFolderConflict = { folder };
  }
  if (classroomMeaningfulData() && !confirm("Replace the current browser workspace with the folder copy? The current browser copy will be saved as a manual backup first.")) return;
  try {
    if (classroomMeaningfulData()) await classroomCreateManualBackup("Classroom-Before-Folder-Restore", false);
    const folder = classroomFolderConflict.folder;
    await classroomLoadPayload(folder.payload, "folder workspace restore", folder.savedAt);
    classroomKnownFolderHash = folder.hash;
    classroomFolderSavedAt = folder.savedAt;
    classroomFolderConflict = null;
    classroomFolderState = "synced";
    renderStorageV2B1();
    showToast("Folder workspace loaded", "Undo", undoLastImport);
  } catch (error) { classroomFolderError = error.message || String(error); classroomFolderState = "error"; renderStorageV2B1(); showToast(classroomFolderError); }
}
async function classroomUseBrowserCopy() {
  if (!confirm("Keep the browser copy and replace the connected folder workspace? The existing folder copy will be preserved in Recovery first.")) return;
  const ok = await classroomSaveWorkspace({ force: true, preservePrevious: true, message: "Browser workspace saved to folder" });
  if (ok) { classroomFolderConflict = null; classroomFolderState = "synced"; renderStorageV2B1(); }
}
async function classroomLoadFolderWorkspace() {
  if (!classroomFolderHandle) return;
  try {
    const folder = await classroomReadWorkspace();
    if (!folder) { showToast("No folder workspace was found"); return; }
    const browserHash = await classroomHash(classroomDataPayload());
    if (browserHash === folder.hash) { showToast("Browser and folder are already synchronized"); return; }
    classroomFolderConflict = { folder, browserHash, browserTime: classroomLocalUpdatedAt(), reason: "manual-load" };
    classroomFolderState = "conflict";
    renderStorageV2B1();
    switchView("storage");
  } catch (error) { classroomFolderError = error.message || String(error); classroomFolderState = "error"; renderStorageV2B1(); showToast(classroomFolderError); }
}

async function classroomCreateManualBackup(prefix = "Classroom-Backup", announce = true) {
  if (!classroomFolderHandle || classroomFolderPermission !== "granted") { showToast("Reconnect the Classroom Data folder first"); return false; }
  try {
    await classroomEnsureFolders();
    const backups = await classroomFolderHandle.getDirectoryHandle("Backups", { create: true });
    const workspace = await classroomWorkspaceText(classroomDataPayload());
    const filename = classroomTimestampName(prefix);
    await classroomWriteFile(backups, filename, workspace.text);
    classroomLastManualBackup = Date.now();
    classroomSetMeta(LAST_MANUAL_BACKUP_KEY, classroomLastManualBackup);
    await classroomRefreshBackups();
    renderStorageV2B1();
    if (announce) showToast("Manual backup created");
    return true;
  } catch (error) { classroomFolderError = error.message || String(error); classroomFolderState = "error"; renderStorageV2B1(); showToast(classroomFolderError); return false; }
}
async function classroomRefreshBackups() {
  classroomBackups = [];
  if (!classroomFolderHandle || classroomFolderPermission !== "granted") { renderStorageV2B1(); return; }
  try {
    const backups = await classroomFolderHandle.getDirectoryHandle("Backups", { create: true });
    for await (const [name, handle] of backups.entries()) {
      if (handle.kind !== "file" || !name.endsWith(".classroom.json")) continue;
      const file = await handle.getFile();
      classroomBackups.push({ name, size: file.size, modified: file.lastModified });
    }
    classroomBackups.sort((a,b) => b.modified - a.modified);
    await classroomInspectPreviousRecovery();
  } catch (error) { classroomFolderError = error.message || String(error); }
  renderStorageV2B1();
}
async function classroomRestoreBackup(filename, fromRecovery = false) {
  if (!classroomFolderHandle || classroomFolderPermission !== "granted") return;
  if (!confirm(`Restore ${filename}? The current workspace will be backed up first.`)) return;
  try {
    await classroomCreateManualBackup("Classroom-Before-Backup-Restore", false);
    let directory;
    if (fromRecovery) directory = await classroomRecoveryDirectory();
    else directory = await classroomFolderHandle.getDirectoryHandle("Backups", { create: true });
    const result = await classroomReadFile(directory, filename);
    if (!result) throw new Error("The selected backup file could not be found.");
    const object = JSON.parse(result.text);
    const payload = structuredClone(object); delete payload._classroomMeta;
    await classroomLoadPayload(payload, `restore ${filename}`, object._classroomMeta?.savedAt || result.file.lastModified);
    await classroomSaveWorkspace({ force: true, preservePrevious: true, message: "Backup restored and synchronized" });
    await classroomRefreshBackups();
    showToast("Backup restored", "Undo", undoLastImport);
  } catch (error) { classroomFolderError = error.message || String(error); classroomFolderState = "error"; renderStorageV2B1(); showToast(classroomFolderError); }
}

function classroomSyncPresentation() {
  if (!FOLDER_ACCESS_SUPPORTED) return { heading: "Direct folder saving unavailable", text: "Use Download backup in this browser, or open Classroom in desktop Chrome.", tone: "error" };
  if (!classroomFolderHandle) return { heading: "Browser only", text: "Your working copy is stored in this browser. Connect Classroom Data for durable folder backups.", tone: "neutral" };
  if (classroomFolderPermission !== "granted") return { heading: "Reconnect required", text: "Chrome needs your permission again before Classroom can read or write the folder.", tone: "warning" };
  if (classroomFolderState === "saving" || classroomFolderState === "checking") return { heading: classroomFolderState === "saving" ? "Saving…" : "Checking folder…", text: "Please keep this page open while Classroom finishes.", tone: "saving" };
  if (classroomFolderState === "conflict") return { heading: "Choose which copy to keep", text: classroomFolderConflict?.reason === "folder-changed" ? "The folder workspace changed outside Classroom. Auto-save is paused." : "The browser and folder contain different data. Nothing will be overwritten until you choose.", tone: "warning" };
  if (classroomFolderState === "browser-newer") return { heading: "Browser changes pending", text: "Your latest changes are waiting to be written to the connected folder.", tone: "warning" };
  if (classroomFolderState === "error") return { heading: "Folder error", text: classroomFolderError || "Classroom could not access the connected folder.", tone: "error" };
  return { heading: "Browser and folder synchronized", text: "The connected folder contains the latest Classroom workspace.", tone: "synced" };
}
function renderStorageV2B1() {
  const view = document.querySelector("#storageView");
  if (!view) return;
  const supported = FOLDER_ACCESS_SUPPORTED;
  const connected = Boolean(classroomFolderHandle);
  const granted = classroomFolderPermission === "granted";
  const sync = classroomSyncPresentation();
  const supportBanner = $("#storageSupportBanner");
  supportBanner.classList.toggle("supported", supported);
  supportBanner.classList.toggle("unsupported", !supported);
  $("#storageSupportTitle").textContent = supported ? "Desktop Chrome folder access is available" : "Direct folder access is not available in this browser";
  $("#storageSupportText").textContent = supported ? "Choose only your dedicated Classroom Data folder. Chrome will ask before granting access." : "You can still use the browser copy and Download backup.";
  $("#connectedFolderName").textContent = connected ? classroomFolderHandle.name : "No folder selected";
  $("#folderPermissionText").textContent = classroomFolderPermission === "granted" ? "Read and write allowed" : classroomFolderPermission === "prompt" ? "Permission required" : classroomFolderPermission === "denied" ? "Permission denied" : "Not granted";
  $("#folderSaveTime").textContent = classroomFolderSavedAt ? classroomFormatDateTime(classroomFolderSavedAt) : "No saved workspace";
  $("#browserSaveTime").textContent = classroomLocalUpdatedAt() ? classroomFormatDateTime(classroomLocalUpdatedAt()) : "No changes recorded yet";
  $("#lastFolderSave").textContent = classroomFolderSavedAt ? classroomFormatDateTime(classroomFolderSavedAt) : "—";
  $("#lastManualBackup").textContent = classroomLastManualBackup ? classroomFormatDateTime(classroomLastManualBackup) : "—";
  $("#syncStatusHeading").textContent = sync.heading;
  $("#syncStatusText").textContent = sync.text;
  const dot = $("#syncStateDot"); dot.className = `sync-state-dot ${sync.tone}`;
  const badge = $("#folderConnectionBadge");
  badge.textContent = granted ? "Connected" : connected ? "Permission needed" : "Not connected";
  badge.className = `storage-badge ${granted ? "connected" : connected ? "warning" : ""}`;
  $("#connectFolderButton").textContent = connected ? "Change connected folder" : "Connect Classroom Data folder";
  $("#connectFolderButton").disabled = !supported;
  $("#changeFolderButton").disabled = !supported;
  $("#reconnectFolderButton").disabled = !connected || granted;
  $("#disconnectFolderButton").disabled = !connected;
  $("#saveFolderNowButton").disabled = !granted;
  $("#loadFolderButton").disabled = !granted || !classroomFolderSavedAt;
  $("#backupNowButton").disabled = !granted;
  $("#refreshBackupsButton").disabled = !granted;
  $("#restorePreviousButton").disabled = !granted || !classroomPreviousRecovery;
  $("#previousRecoveryText").textContent = classroomPreviousRecovery ? `Previous copy saved ${classroomFormatDateTime(classroomPreviousRecovery.savedAt)} · ${classroomFileSize(classroomPreviousRecovery.size)}` : "No recovery copy found.";
  $("#autoSaveFolderToggle").checked = localStorage.getItem(AUTO_SAVE_KEY) !== "false";
  $("#autoSaveFolderToggle").disabled = !supported;
  const conflict = $("#folderConflictPanel");
  conflict.classList.toggle("hidden", !classroomFolderConflict);
  if (classroomFolderConflict) {
    $("#folderConflictTitle").textContent = classroomFolderConflict.reason === "folder-changed" ? "The folder copy changed outside Classroom" : "Browser and folder copies differ";
    const ftime = classroomFolderConflict.folder?.savedAt ? classroomFormatDateTime(classroomFolderConflict.folder.savedAt) : "unknown";
    const btime = classroomFolderConflict.browserTime ? classroomFormatDateTime(classroomFolderConflict.browserTime) : "unknown";
    $("#folderConflictText").textContent = `Folder save: ${ftime}. Browser save: ${btime}. Choose one copy before auto-save continues.`;
  }
  const list = $("#folderBackupList");
  list.innerHTML = classroomBackups.length ? classroomBackups.map(item => `<div class="folder-backup-row"><div class="folder-backup-name"><strong>${escapeHTML(item.name)}</strong><span>${classroomFormatDateTime(item.modified)}</span></div><span class="folder-backup-size">${classroomFileSize(item.size)}</span><button class="button button-secondary button-small" data-restore-folder-backup="${escapeHTML(item.name)}">Restore</button></div>`).join("") : `<div class="empty-state compact">${granted ? "No manual backups yet. Click Backup now." : "Connect your Classroom Data folder to view backups."}</div>`;
  const pill = $("#folderStatusPill");
  pill.className = `folder-status-pill ${granted && classroomFolderState === "synced" ? "connected" : classroomFolderConflict || (connected && !granted) || classroomFolderState === "browser-newer" ? "action-needed" : classroomFolderState === "error" ? "error" : ""}`;
  $("#folderStatusPillText").textContent = granted && classroomFolderState === "synced" ? "Folder synced" : classroomFolderConflict ? "Choose a copy" : connected && !granted ? "Reconnect folder" : classroomFolderState === "error" ? "Folder error" : "Browser only";
}

const renderAllBeforeStorageV2B1 = renderAll;
renderAll = function() { renderAllBeforeStorageV2B1(); renderStorageV2B1(); };

$("#connectFolderButton").addEventListener("click", classroomConnectFolder);
$("#changeFolderButton").addEventListener("click", classroomConnectFolder);
$("#reconnectFolderButton").addEventListener("click", classroomReconnectFolder);
$("#disconnectFolderButton").addEventListener("click", classroomDisconnectFolder);
$("#saveFolderNowButton").addEventListener("click", async () => {
  if (classroomFolderConflict) return classroomUseBrowserCopy();
  await classroomSaveWorkspace({ force: true, preservePrevious: true, message: "Saved to folder" });
});
$("#loadFolderButton").addEventListener("click", classroomLoadFolderWorkspace);
$("#backupNowButton").addEventListener("click", () => classroomCreateManualBackup());
$("#fallbackExportButton").addEventListener("click", exportData);
$("#refreshBackupsButton").addEventListener("click", classroomRefreshBackups);
$("#restorePreviousButton").addEventListener("click", () => classroomRestoreBackup(PREVIOUS_FILE, true));
$("#useFolderCopyButton").addEventListener("click", classroomUseFolderCopy);
$("#useBrowserCopyButton").addEventListener("click", classroomUseBrowserCopy);
$("#autoSaveFolderToggle").addEventListener("change", e => {
  classroomSetMeta(AUTO_SAVE_KEY, e.target.checked ? "true" : "false");
  if (e.target.checked) classroomScheduleAutoSave();
  showToast(e.target.checked ? "Folder auto-save enabled" : "Folder auto-save paused");
  renderStorageV2B1();
});
$("#folderBackupList").addEventListener("click", e => {
  const button = e.target.closest("[data-restore-folder-backup]");
  if (button) classroomRestoreBackup(button.dataset.restoreFolderBackup, false);
});

classroomInstallStoragePatch();
(async function classroomInitializeFolderStorage() {
  renderStorageV2B1();
  if (!FOLDER_ACCESS_SUPPORTED) return;
  try {
    classroomFolderHandle = await classroomLoadStoredHandle();
    if (!classroomFolderHandle) return renderStorageV2B1();
    classroomFolderPermission = await classroomPermission(classroomFolderHandle, false);
    if (classroomFolderPermission === "granted") await classroomInspectFolder();
    else { classroomFolderState = "permission-needed"; renderStorageV2B1(); }
  } catch (error) {
    classroomFolderState = "error";
    classroomFolderError = error.message || String(error);
    renderStorageV2B1();
  }
})();
