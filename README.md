# Beetle Optimiser

A Windows system-optimizer desktop app built with Electron + React, styled as a purple-themed reimagining of Auslogics BoostSpeed. Native PowerShell/Win32 operations under the hood, Firebase for auth and (eventually) the token economy.

## Status

This is a working desktop app with real native functionality wired to a real UI - not a mockup. What's actually functional today:

- **Live system telemetry** - CPU, RAM, GPU, network, and per-drive disk usage in the status bar, refreshed every few seconds by a persistent PowerShell process (`scripts/telemetry.ps1`).
- **Real optimizer actions**, each gated behind a scan-first, confirm-then-execute flow:
  - Junk file scan + cleanup (temp files, Windows Update cache, thumbnail cache, Edge cache, Prefetch, Recycle Bin)
  - Disk analyze / TRIM (SSD) / defrag (HDD) via the built-in `Optimize-Volume` cmdlet
  - RAM working-set trim (`NtSetSystemInformation`)
  - Installed-program listing + uninstall
  - Startup item listing + disable/enable (registry Run keys and the Startup folder)
  - Orphan registry entry scan + repair (App Paths only, deliberately narrow scope)
- **Google + GitHub sign-in** via Firebase Auth, with the desktop-specific User-Agent workaround Google's OAuth flow requires inside Electron.
- **8 tabs** matching the reference app's structure (Dashboard, Scanner, Advisor, Clean Up, Optimize, Protect, Maintain, Ask a Question), theme toggle, foldable nav sidebar, frameless custom titlebar.

What's stubbed or not yet built - see [`PLAN.md`](./PLAN.md) for the full roadmap:

- Token balance is read-only from Firestore; there's no way to actually earn or spend tokens yet (blocked on a decision between a Firestore-rules-only approach vs. a proper Cloud Functions backend, which needs the Firebase project on a paid Blaze plan).
- Stripe payments, the "Ask a Question" LLM/RAG backend, and AdMob rewarded ads are all designed in `PLAN.md` but not implemented - each needs a real paid account (Stripe, a Blaze-plan Firebase project, AdMob) that only the project owner can set up.
- Code signing and auto-update are not configured (no code-signing certificate, no published releases yet).

## Safety model for destructive actions

Every action that deletes files, uninstalls software, or changes the registry/startup config goes through a **confirm-token** system, not a bare IPC call:

1. The renderer scans first (read-only) and shows the real numbers to the user in a `ConfirmModal`.
2. Only on explicit confirmation does the renderer call `optimizer.requestConfirm(action)`, which gets a short-lived (30s), single-use token from the main process.
3. The actual destructive IPC handler in `main.js` validates that token before running anything - a bare call with no valid token is rejected before any PowerShell process spawns.

This exists because an earlier version fired destructive operations unconditionally and a test run deleted real user files. Don't wire a new destructive action straight to a button without routing it through this - see `src/components/shared/ConfirmModal.jsx` and the `consumeConfirmation` helper in `main.js`.

## Getting started

```powershell
npm install
npm run dev        # Vite dev server for the renderer only (no Electron shell, no native IPC)
npm run start       # builds the renderer, then launches the full Electron app
npm run package     # builds + packages a portable .exe via electron-builder
```

The dev server (`npm run dev`) is useful for fast UI iteration, but `window.beetleAPI` doesn't exist there since there's no Electron main process - every native call is guarded to fail gracefully (shows "Not available outside the packaged app.") rather than crash. Use `npm run start` or a packaged build to exercise real telemetry, scans, or sign-in.

## Architecture

```
src/
  App.jsx                    top-level layout + tab routing
  components/
    TitleBar.jsx, TabBar.jsx, StatusBar.jsx, RightSidebar.jsx
    dashboard/                Dashboard tab (scan circle, stats, bottom tiles)
    tabs/                     the other 7 tab views, one file each
    shared/                   reusable widgets: ConfirmModal, ItemListModal,
                              InfoBanner, Toggle, UsefulTools, AccountMenu
  hooks/                      useAuth, useTelemetry, useTheme, useActiveTab, etc.
  lib/                        firebase.js (Firebase config), colors.js (theme)
scripts/                      PowerShell scripts main.js spawns (telemetry +
                              7 optimizer scripts) - unpacked from the asar
                              at build time (see build.asarUnpack) since an
                              external process can't read files inside one
content/
  rag-articles.js             ~50 short articles for the planned "Ask a
                              Question" knowledge base (not yet wired to a
                              backend - see PLAN.md Phase 5a)
main.js                       Electron main process: window creation, IPC
                              handlers, telemetry process management, OAuth
                              popup User-Agent patching
```

### Why PowerShell scripts instead of native Node/Win32 bindings

Every optimizer operation is a `.ps1` script under `scripts/`, spawned as a child process and communicating via newline-delimited JSON on stdout. This keeps native Windows API access (WMI/CIM queries, `NtSetSystemInformation`, registry manipulation, `Optimize-Volume`) out of the Node/Electron process entirely - `main.js` never touches the Win32 API directly, it just spawns a script and parses its output. That's a smaller trust boundary and much easier to audit than an equivalent amount of native addon code.

### Packaging gotcha worth knowing

Files inside an asar archive (`app.asar`) are only readable by Node's own `fs`/`require` - an external process like `powershell.exe` can't open a file "inside" one. `scripts/` is listed in `package.json`'s `build.asarUnpack`, and `main.js` resolves script paths with `.replace('app.asar', 'app.asar.unpacked')`, which is a no-op in dev (no asar exists) and correctly redirects to the unpacked copy in a packaged build.

## Known limitations

- No automated tests yet.
- No CI/release pipeline (no git repository has been initialized for this project as of this writing).
- SSD/HDD detection in telemetry and defrag falls back to treating the system drive as an SSD when `Get-PhysicalDisk` can't determine media type (common in VMs) - see the comments in `scripts/telemetry.ps1` and `scripts/optimize-defrag.ps1`.
- The startup-folder "disabled" heuristic in `scripts/optimize-startup.ps1` is best-effort, not a hard Windows API guarantee.
