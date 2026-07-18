# Beetle Optimiser

Beetle Optimiser is an open-source Windows system-optimizer for desktop,
built with Electron + React and styled as a purple-themed reimagining of
Auslogics BoostSpeed's classic dashboard. Every action that touches the
operating system is a real PowerShell operation - no mocks, no placeholders.

![Status](https://img.shields.io/badge/status-alpha%20build-orange)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue)

## Features

Every tile / button below is a real PowerShell-driven operation. Click it,
the token gate accepts the click, a child PowerShell process runs and
streams NDJSON events back to the renderer.

| | | |
|--|--|--|
| 28 dashboard tiles | 12 tabs | 36 PowerShell scripts |
| ~93 IPC handlers | 51 RAG articles | Token-gated destructive actions |

### Tabs

1. **Dashboard** — Live status panel + 22-tile quick-access grid (system status rows: Security/Drive/Disk-space/top-process; charts: Memory/CPU/Network).
2. **Scanner** — 8 category scanner (privacy trace discovery + Auslogics-style report list).
3. **Advisor** — Recommendations tailored to current state ("This will speed up boot" / "Large files found in X" etc.).
4. **Clean Up** — Deep Disk Cleaner + Duplicate File Finder + Empty Folder Cleaner + Windows Slimmer + Backup Cleaner.
5. **Optimize** — Mode Switcher (5 power plans), Disk Defrag/Trim per fixed drive, RAM trim, Disk Priority Manager.
6. **Protect** — Browser Hijack check + File Shredder + BHO scan + Privacy-trace cleanup.
7. **Maintain** — Drivers, Services, Scheduled Tasks (per-task disable/enable + create-at-logon), Tweaks.
8. **My Tasks** — Scheduled-task manager (list/create/delete, daily/weekly/hourly/onlogon).
9. **Reports** — Audit log of every destructive action (file, bytes, tool/action timestamp).
10. **Win10 Protector** — 16 documented Win10/11 tweaks across 13 categories (Cortana/Action Center/Lock Screen/Mouse/Sync/Geo/Ad Control/Retail Demo/Metro/Reserved Storage/Defender/UAC/Cleanup).
11. **Care Center** — Restore or forget any registry backup. Lists per-tweak backup JSONs + Restore buttons (calls `win10Revert`).
12. **Ask a Question** — Client-side keyword-matched search over 51 hand-written articles.

### Dashboard tiles (22 total)

Row 1 (7 primary): SSD Optimizer · Uninstall Manager · Startup Manager · Browser Protection · Driver Updater · Duplicates Finder · Add tool

Row 2 (15 system): Internet Speed Up · Disk Explorer · Task Manager · Add-ons Manager · Free Space Wiper · Windows Slimmer · Mode Switcher · Shell Integrator · Registry Defrag · Action Center · Debug Log · Disk Priority · Backup Cleaner · Defrag on Boot · Browser BHO

## Safety model for destructive actions

Every action that deletes files, uninstalls software, or modifies the
registry/startup config goes through a **confirmation-token gate**, not a
bare IPC call:

1. The renderer scans first (read-only) and shows the real numbers in a
   `ConfirmModal`.
2. After the user explicitly confirms, the renderer calls
   `optimizer.requestConfirm(action)`, which gets a single-use token from
   the main process.
3. The destructive IPC handler validates the token via
   `consumeConfirmation(token, action)` *before* any PowerShell spawns.
   A bare call without a valid token is rejected immediately.

This exists because an earlier version fired destructive operations
unconditionally from button clicks and a test run deleted ~5.8 GB of real
user files. See [`SECURITY.md`](./SECURITY.md) for details.

## Getting started

### Prerequisites
- Windows 10 / 11 (x64)
- Node.js 18+ (for development only)
- Git (for development only)

### Install

```powershell
git clone https://github.com/orchords-com/BeetleOptimiser.git
cd BeetleOptimiser
npm install
```

### Develop (renderer + Electron with HMR on the renderer)

```powershell
npm run dev
```

This starts Vite on `:5173` and Electron in renderer-dev mode. Changes to
JSX/CSS hot-reload automatically.

### Build a portable Windows exe

```powershell
npm run package
```

The result is in `dist/BeetleOptimiser 0.2.0.exe` (~75 MB) - a single-file
portable build (no installer required).

### Daily-life run (just the exe)

Download the latest portable exe from the
[Releases page](https://github.com/orchords-com/BeetleOptimiser/releases),
double-click to run. No installer, no admin needed for most operations
(admin is only required for the operations that touch `HKLM\SOFTWARE`).

## Architecture

```
+--------------+       +-----------------------------+
|  Renderer    |<---->|  main.js (Electron main)     |
|  (React)     |  IPC  |  - IPC handlers            |
|              |       |  - Single-instance lock    |
|  - 12 tabs   |       |  - Spawns PowerShell       |
|  - 22 tiles  |       |  - Spawns telemetry.ps1    |
|  - Modals    |       |  - Tray                    |
+--------------+       +-------+---------------------+
                                     |
                                     | spawn
                                     v
                          +----------------------------+
                          |  PowerShell scripts        |
                          |  scripts/optimize-*.ps1   |
                          |  NDJSON events to stdout  |
                          +----------------------------+
```

### Token system

Every destructive call has the shape:

```js
// Renderer:
const token = await window.beetleAPI.optimizer.requestConfirm('clean-junk');
await window.beetleAPI.optimizer.cleanJunkFiles(token);
```

```js
// main.js:
ipcMain.handle('optimizer:clean-junk', (_, token) => {
  consumeConfirmation(token, 'clean-junk');   // throws if invalid
  return spawnOptimizer('scripts/optimize-clean-execute.ps1', ['--yes']);
});
```

Tokens are minted by `optimizer:request-confirm`, are single-use, and the
main process evicts old entries after ~5 minutes. Bare calls without a
valid token throw before any PowerShell is spawned.

## Contributing

Bug reports and PRs welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md)
for the workflow + code layout. By participating you agree to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Security

See [`SECURITY.md`](./SECURITY.md) for the defense model + how to report
vulnerabilities.

## License

[MIT © ORCHIDS.COM](./LICENSE)
