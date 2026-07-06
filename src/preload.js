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
    openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
    shell: (command, ...args) =>
      ipcRenderer.invoke('system:shell', { command, args }),
  },

  // AUTH: loopback-redirect OAuth (RFC 8252). Each call opens the user's
  // system browser to the provider's real consent screen and resolves once
  // main.js has caught the redirect on a local port and exchanged the code
  // for tokens - no popup window, no embedded webview (Google blocks OAuth
  // from embedded webviews outright, see main.js's comment on this).
  auth: {
    loginGoogle: () => ipcRenderer.invoke('auth:login-google'),
    loginGithub: () => ipcRenderer.invoke('auth:login-github'),
    cancelLogin: () => ipcRenderer.invoke('auth:cancel-login'),
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
    disableScheduledTask: (taskPath, taskName, token) => ipcRenderer.invoke('optimizer:disable-scheduled-task', taskPath, taskName, token),
    enableScheduledTask: (taskPath, taskName, token) => ipcRenderer.invoke('optimizer:enable-scheduled-task', taskPath, taskName, token),
    // Tweak Manager
    tweaksStatus: () => ipcRenderer.invoke('optimizer:tweaks-status'),
    tweaksApply: (id, token) => ipcRenderer.invoke('optimizer:tweaks-apply', id, token),
    tweaksRevert: (id, token) => ipcRenderer.invoke('optimizer:tweaks-revert', id, token),
    // Driver check (read-only)
    listDrivers: () => ipcRenderer.invoke('optimizer:list-drivers'),
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
