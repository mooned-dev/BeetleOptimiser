// preload.js - Safe context-isolated bridge for Beetle Optimiser.
//
// Design rule (per Electron docs at https://www.electronjs.org/docs/latest/
// tutorial/context-isolation): "The correct way to expose IPC-based APIs would
// instead be to provide one method per IPC message." So renderer-facing names
// are *verbs that describe the intent* (e.g. scanJunkFiles), not raw ipcRenderer
// channels. ipcRenderer is NEVER re-exposed. contextIsolation + sandbox are both
// on in main.js, so anything missing here is unreachable from the renderer.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('beetleAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  // WINDOW: min/max/close IPC bridges. Maximize stays wired even though the
  // title bar UI doesn't expose a button - keyboard shortcut or window-double-
  // click may still hit it. If main.js doesn't yet ship the matching IPC, the
  // promise will reject and the caller should no-op.
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },

  // SYSTEM: live telemetry push from main.js's spawned telemetry.ps1 child
  // process. The subscription returns an unsubscribe function so React can
  // clean up on unmount via useEffect's return value.
  //
  // openExternal(url) and shell(command, ...args) are utility IPCs that
  // hand off to Electron's built-in shell.openExternal / child_process
  // spawn. Used by tab-side handlers to launch Windows settings URIs
  // (e.g. ms-settings:defaultapps) and to run one-off PowerShell scripts
  // that don't justify a full named IPC channel. Both reject if no
  // handler is registered in main.js yet.
  system: {
    onTelemetry: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('system:telemetry', listener);
      return () => ipcRenderer.removeListener('system:telemetry', listener);
    },
    // Fired when the tray flyout window (or anything else in main.js) asks
    // the main window to switch tabs - see FlyoutApp.jsx's onNavigate/
    // onAskQuestion, which can't touch this window's React state directly
    // since they run in a separate BrowserWindow.
    onNavigate: (callback) => {
      const listener = (_event, tab) => callback(tab);
      ipcRenderer.on('app:navigate', listener);
      return () => ipcRenderer.removeListener('app:navigate', listener);
    },
    openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
    shell: (command, ...args) =>
      ipcRenderer.invoke('system:shell', { command, args }),
  },

  // CHAT: local LLM inference for the Ask a Question tab. Resolves
  // { ok: false, reason: 'model-not-ready' } (not a rejection) while the
  // fine-tuned model hasn't been shipped yet - callers should fall back to
  // the client-side RAG search in that case, not treat it as an error.
  chat: {
    ask: (question) => ipcRenderer.invoke('chat:ask', question),
  },

  // FLYOUT: only meaningful from inside the tray flyout's own small
  // BrowserWindow (see main.js's createFlyoutWindow + FlyoutApp.jsx).
  // hover() lets main.js know the cursor is over the popup's own content,
  // so it doesn't hide the window just because the cursor left the tray
  // icon on the way down into the popup. navigate() asks main.js to focus
  // the main window and switch it to the given tab, then closes the popup.
  flyout: {
    hover: (isHovered) => ipcRenderer.send('flyout:hover', isHovered),
    navigate: (tab) => ipcRenderer.invoke('flyout:navigate', tab),
    // Reports the flyout's real rendered content size so main.js can size
    // the popup window to fit instead of guessing a fixed height.
    resize: (size) => ipcRenderer.send('flyout:resize', size),
  },

  // OPTIMIZER: one method per native op. All `invoke` (request/response);
  // long-running scans stream progress back via the `optimizer:progress`
  // event channel, subscribed via system.onProgress (below). Returns the
  // promise - main.js owns the actual Win32 + PowerShell work.
  //
  // Method names chosen to describe the user-facing intent, not the IPC
  // channel name. Adding a new op: add a new named method here AND a
  // matching ipcMain.handle('optimizer:<verb>') in main.js.
  optimizer: {
    // Confirmation gate: main.js requires a short-lived, single-use token
    // for every destructive action below. Call this only once the
    // renderer's ConfirmModal has actually been accepted by the user -
    // it's what stands between a click and real deletion.
    requestConfirm: (action) => ipcRenderer.invoke('optimizer:request-confirm', action),
    cancelConfirm: (token) => ipcRenderer.invoke('optimizer:cancel-confirm', token),

    // System Information (read-only)
    getSystemInfo: () => ipcRenderer.invoke('optimizer:get-sysinfo'),
    // Disk Doctor
    diskDoctorScan: (driveLetter) => ipcRenderer.invoke('optimizer:diskdoctor-scan', driveLetter),
    diskDoctorRepair: (driveLetter, token) => ipcRenderer.invoke('optimizer:diskdoctor-repair', driveLetter, token),
    // Service Manager
    listServices: () => ipcRenderer.invoke('optimizer:list-services'),
    disableService: (name, token) => ipcRenderer.invoke('optimizer:disable-service', name, token),
    enableService: (name, token) => ipcRenderer.invoke('optimizer:enable-service', name, token),
    // Task Scheduler manager
    listScheduledTasks: () => ipcRenderer.invoke('optimizer:list-scheduled-tasks'),
    listScheduledTasksAll: () => ipcRenderer.invoke('optimizer:list-scheduled-tasks-all'),
    disableScheduledTask: (taskPath, taskName, token) => ipcRenderer.invoke('optimizer:disable-scheduled-task', taskPath, taskName, token),
    enableScheduledTask: (taskPath, taskName, token) => ipcRenderer.invoke('optimizer:enable-scheduled-task', taskPath, taskName, token),
    createScheduledTask: (name, trigger, command, args, token) => ipcRenderer.invoke('optimizer:create-scheduled-task', name, trigger, command, args, token),
    deleteScheduledTask: (taskPath, taskName, token) => ipcRenderer.invoke('optimizer:delete-scheduled-task', taskPath, taskName, token),
    // Tweak Manager
    tweaksStatus: () => ipcRenderer.invoke('optimizer:tweaks-status'),
    tweaksApply: (id, token) => ipcRenderer.invoke('optimizer:tweaks-apply', id, token),
    tweaksRevert: (id, token) => ipcRenderer.invoke('optimizer:tweaks-revert', id, token),
    // Driver check (read-only)
    listDrivers: () => ipcRenderer.invoke('optimizer:list-drivers'),
    // Internet optimization (TCP/DNS/MTU tuning)
    internetList: () => ipcRenderer.invoke('optimizer:internet-list'),
    internetOptimize: (token) => ipcRenderer.invoke('optimizer:internet-optimize', token),
    internetReset: (token) => ipcRenderer.invoke('optimizer:internet-reset', token),
    // File Shredder
    pickFilesForShred: () => ipcRenderer.invoke('optimizer:pick-files-for-shred'),
    shredFiles: (paths, token) => ipcRenderer.invoke('optimizer:shred-files', paths, token),
    // Browser Protection check (read-only)
    browserCheck: () => ipcRenderer.invoke('optimizer:browser-check'),
    diskExplorer: () => ipcRenderer.invoke('optimizer:disk-explorer'),
    fileRecoveryList: () => ipcRenderer.invoke('optimizer:file-recovery-list'),
    fileRecoveryRestore: (paths, destDir, token) => ipcRenderer.invoke('optimizer:file-recovery-restore', paths, destDir, token),
    pickFolder: () => ipcRenderer.invoke('optimizer:pick-folder'),
    listAddons: () => ipcRenderer.invoke('optimizer:list-addons'),
    win10List: () => ipcRenderer.invoke('optimizer:win10-list'),
    wiperList: () => ipcRenderer.invoke('optimizer:wiper-list'),
    wiperWipe: (driveLetter, token) => ipcRenderer.invoke('optimizer:wiper-wipe', driveLetter, token),
    slimmerList: () => ipcRenderer.invoke('optimizer:slimmer-list'),
    slimmerApply: (op, token) => ipcRenderer.invoke('optimizer:slimmer-apply', op, token),
    modeList: () => ipcRenderer.invoke('optimizer:mode-list'),
    modeSet: (schemeId, token) => ipcRenderer.invoke('optimizer:mode-set', schemeId, token),
    contextMenuList: () => ipcRenderer.invoke('optimizer:context-menu-list'),
    contextMenuDisable: (id, token) => ipcRenderer.invoke('optimizer:context-menu-disable', id, token),
    contextMenuEnable: (id, token) => ipcRenderer.invoke('optimizer:context-menu-enable', id, token),
    integratorList: () => ipcRenderer.invoke('optimizer:integrator-list'),
    integratorAdd: (id, token) => ipcRenderer.invoke('optimizer:integrator-add', id, token),
    integratorRemove: (id, token) => ipcRenderer.invoke('optimizer:integrator-remove', id, token),
    rescueList: () => ipcRenderer.invoke('optimizer:rescue-list'),
    registryDefrag: () => ipcRenderer.invoke('optimizer:registry-defrag'),
    registryDefragCompact: (token) => ipcRenderer.invoke('optimizer:registry-defrag-compact', token),
    actionCenterList: () => ipcRenderer.invoke('optimizer:action-center'),
    actionCenterApply: (op, token) => ipcRenderer.invoke('optimizer:action-center-apply', op, token),
    debugLog: () => ipcRenderer.invoke('optimizer:debug-log'),
    diskPriority: () => ipcRenderer.invoke('optimizer:disk-priority'),
    diskPriorityApply: (token) => ipcRenderer.invoke('optimizer:disk-priority-apply', token),
    backupCleaner: () => ipcRenderer.invoke('optimizer:backup-cleaner'),
    backupCleanerApply: (token) => ipcRenderer.invoke('optimizer:backup-cleaner-apply', token),
    defragOnBoot: () => ipcRenderer.invoke('optimizer:defrag-on-boot'),
    defragOnBootApply: (token) => ipcRenderer.invoke('optimizer:defrag-on-boot-apply', token),
    defragOnBootReset: (token) => ipcRenderer.invoke('optimizer:defrag-on-boot-reset', token),
    browserHelperObjects: () => ipcRenderer.invoke('optimizer:browser-helper-objects'),
    bhoApply: (token) => ipcRenderer.invoke('optimizer:bho-apply', token),
    win10Apply: (id, token) => ipcRenderer.invoke('optimizer:win10-apply', id, token),
    win10Revert: (id, token) => ipcRenderer.invoke('optimizer:win10-revert', id, token),
    listTaskManager: () => ipcRenderer.invoke('optimizer:list-task-manager'),
    killProcess: (pid, token) => ipcRenderer.invoke('optimizer:kill-process', pid, token),
    // Duplicates Finder
    scanDuplicates: () => ipcRenderer.invoke('optimizer:scan-duplicates'),
    deleteDuplicates: (paths, token) => ipcRenderer.invoke('optimizer:delete-duplicates', paths, token),
    // Cleanup
    scanJunkFiles:  () => ipcRenderer.invoke('optimizer:scan-junk'),
    cleanJunkFiles: (token) => ipcRenderer.invoke('optimizer:clean-junk', token),
    // Empty Folder Cleaner
    scanEmptyFolders:  () => ipcRenderer.invoke('optimizer:scan-empty-folders'),
    cleanEmptyFolders: (token) => ipcRenderer.invoke('optimizer:clean-empty-folders', token),
    // Memory
    trimWorkingSets: () => ipcRenderer.invoke('optimizer:trim-working-sets'),
    // Disk. mode: 'analyze' (default, read-only) | 'trim' | 'defrag'.
    // trim/defrag both require a confirmation token.
    defragmentDrive: (mode, token) =>
      ipcRenderer.invoke('optimizer:defrag-drive', mode, token),
    // Apps
    uninstallProgram: (programName) =>
      ipcRenderer.invoke('optimizer:uninstall-program', programName),
    uninstallProgramDo: (programId, token) =>
      ipcRenderer.invoke('optimizer:uninstall-program-do', programId, token),
    disableStartupItem: (entryName, token) =>
      ipcRenderer.invoke('optimizer:disable-startup-item', entryName, token),
    enableStartupItem: (entryId, token) =>
      ipcRenderer.invoke('optimizer:enable-startup-item', entryId, token),
    listStartupItems: () =>
      ipcRenderer.invoke('optimizer:list-startup'),
    // Registry
    scanRegistryIssues: () =>
      ipcRenderer.invoke('optimizer:scan-registry'),
    repairRegistryIssues: (issues, token) =>
      ipcRenderer.invoke('optimizer:repair-registry', issues, token),
  },

  // REPORTS: the Reports tab's audit-log reader. Reads+parses
  // reports.jsonl directly in main.js - ReportsView.jsx used to fetch this
  // via system.shell() (expecting a parsed {items:[...]} shape that IPC
  // never actually returns), which meant the tab could never show a row.
  reports: {
    list: () => ipcRenderer.invoke('reports:list'),
  },

  // STORE: thin wrapper around electron-store (a small JSON-on-disk key/value
  // store for app prefs). Each call is an invoke so renderer can await. Not
  // implemented in main.js yet (Phase 1 item #3) - calling these before main
  // is wired will reject the promise.
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', { key, value }),
  },

  // UPDATER: wired to electron-updater. checkForUpdates is an invoke
  // (returns the update-check result); quitAndInstall is a fire-and-forget
  // send (the app will restart). Available/downloaded events are push.
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
    quitAndInstall:  () => ipcRenderer.send('updater:install'),
    onUpdateAvailable: (callback) => {
      const listener = (_event, info) => callback(info);
      ipcRenderer.on('updater:available', listener);
      return () => ipcRenderer.removeListener('updater:available', listener);
    },
    onUpdateDownloaded: (callback) => {
      const listener = (_event, info) => callback(info);
      ipcRenderer.on('updater:downloaded', listener);
      return () => ipcRenderer.removeListener('updater:downloaded', listener);
    },
  },
});
