# Contributing to Beetle Optimiser

Thanks for considering contributing. This document covers the basics.

## Quick start (development)

```powershell
# Install dependencies
npm install

# Run the renderer + Electron in dev mode (HMR on the renderer)
npm run dev

# Build the renderer for prod (vite -> dist/)
npm run build

# Package a portable Windows exe (electron-builder)
npm run package
```

## Project layout

```
BeetleOptimiser-Electron/
├── main.js                      Electron main process: IPC handlers, tray,
│                                single-instance, telemetry spawn, optimizer
│                                subprocesses
├── src/
│   ├── App.jsx                  Root React component, top-level state
│   ├── preload.js               Renderer-side contextBridge surface
│   ├── components/
│   │   ├── TitleBar.jsx         Custom frameless titlebar
│   │   ├── StatusBar.jsx        Bottom CPU/GPU/RAM/NET bar + theme toggle
│   │   ├── RightSidebar.jsx     Foldable nav (PC, Questions, Advisor, etc.)
│   │   ├── dashboard/            Dashboard tab pieces
│   │   ├── tabs/                All tabs (Dashboard, Scanner, Optimize, ...)
│   │   └── shared/              Reusable modals (ConfirmModal, ItemListModal),
│   │                            hooks + utilities (Toggle, UsefulTools)
│   ├── hooks/
│   │   ├── useTelemetry.js      Live telemetry stream subscription
│   │   ├── useActiveTab.js      App-level active tab
│   │   ├── useWindowControls.js Min/close IPC bridge
│   │   ├── useSidebarFold.js    Right-sidebar fold toggle
│   │   └── useTheme.js          Dark/light toggle (excluded per user spec)
│   ├── lib/
│   │   └── colors.js            Color tokens (light + dark palettes)
│   └── data/                    Static tab definitions, bottom-tile grid
├── scripts/                     PowerShell optimizer scripts
│   ├── optimize-defrag.ps1      Analyze/Trim/Defrag per fixed volume
│   ├── optimize-registry.ps1    Orphan registry scanner (broad: App Paths,
│   │                            RecentDocs, MUICache, SharedDLLs)
│   ├── optimize-shredder.ps1    3-pass overwrite + delete
│   ├── optimize-tweaks.ps1      Win10 Protector: 16 registry tweaks
│   ├── optimize-win10.ps1       (alias of TweakManager, shared by tab)
│   └── ...                      ~36 scripts total
├── content/
│   └── rag-articles.js          51 hand-written articles for client-side
│                                keyword matching (Ask a Question tab)
├── llm-training/                OPTIONAL: data + scripts for fine-tuning a
│                                local LLM on the 51 articles. Not part of
│                                the app itself; see llm-training/README.md
├── index.html                   Vite entry
├── vite.config.js               Build-time config (manual vendor chunks)
├── package.json                 Dependencies + electron-builder config
└── README.md
```

## Adding a new optimizer tool

1. Drop a `scripts/optimize-X.ps1` that emits NDJSON events to stdout:
   `{event:'item', item:{...}}` per item, plus `{event:'finished', mode:$mode}`
   at the end (see any existing `optimize-*` script for the canonical shape).
2. Register an IPC handler in `main.js`:
   `ipcMain.handle('optimizer:X', () => spawnOptimizer('scripts/optimize-X.ps1', [...]))`.
3. Expose the method in `src/preload.js` under `beetleAPI.optimizer.X`.
4. Call it from `src/App.jsx` (modals) or `src/components/tabs/<X>View.jsx`
   (full tab).

## Token-confirmation pattern for destructive ops

Every action that changes the system must go through the token system -
no bare IPC call. The pattern is:

```javascript
// In the renderer (React):
const token = await window.beetleAPI.optimizer.requestConfirm('clean-junk');
await window.beetleAPI.optimizer.cleanJunkFiles(token);
```

```javascript
// In main.js:
ipcMain.handle('optimizer:clean-junk', (_, token) => {
  consumeConfirmation(token, 'clean-junk');  // throws if invalid/expired
  return spawnOptimizer('scripts/optimize-clean-execute.ps1', ['--yes']);
});
```

A token is a UUID minted by `optimizer:request-confirm`, valid for one use
within ~30s (no explicit expiry - the map just evicts old entries). Bare
calls without a token are rejected before any PowerShell is spawned.

## Style

- React functional components only. No class components.
- No external state library — useState + prop drilling is fine for this
  app's size.
- Style via inline `style={{...}}` on each element; the project's color
  tokens live in `src/lib/colors.js`.
- PowerShell scripts must be PS 5.1+ compatible - no PowerShell 7+
  operators (`??`, `&&`).
- No third-party shell-outs from PowerShell scripts. Every Windows
  utility (`defrag`, `powercfg`, `Get-Volume`, `Register-ScheduledTask`)
  is in-box.

## Reporting bugs

Open an issue at https://github.com/orchords-com/BeetleOptimiser/issues
with:
- your Windows build (`winver` output)
- the exact command that failed (which tab + which button)
- the relevant PowerShell output (open the app's debug log via the
  Dashboard → Debug Log tile, or run the failing script manually with
  `-NoProfile -ExecutionPolicy Bypass`)

## Security disclosures

If you find a security issue (especially anything that lets a malformed
IPC call escape the confirmation gate), please email
crm@orchords.com rather than opening a public issue.
