# Beetle Optimiser

An open-source Windows system-optimizer built with Electron + React +
PowerShell. Styled as a purple reimagining of Auslogics BoostSpeed's
classic dashboard. Every action that touches the operating system is a
real PowerShell operation - no mocks, no placeholders.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Status](https://img.shields.io/badge/status-v1.0%20shipped-green)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue)
![CI](https://github.com/ORCHORDS/BeetleOptimiser/actions/workflows/tests.yml/badge.svg)

## What this is

Beetle is a single-file portable desktop app that gives you a clean
view of every system optimization Windows has, then lets you apply
them through one clickable surface. Click a tile, the renderer
spawns a child PowerShell process under `scripts/`, the script streams
NDJSON events back over a token-gated IPC channel, the renderer
turns those lines into a card you can confirm or cancel.

| | | |
|--|--|--|
| **38 PowerShell scripts** in `scripts/` | **12 tabs** + **22 dashboard tiles** | **82 IPC handlers** in `main.js` |
| **51 RAG articles** for the Ask-a-Question tab | **95 tests** covering validation + token + RAG + tab/tile inv | **Ctrl+K** global search |

## Tabs

1. **Dashboard** — Live status panel + 22-tile quick-access grid + purple scan circle.
2. **Scanner** — Per-category privacy trace discovery + a reports-feed view.
3. **Advisor** — Recommendations that read the live telemetry + the last scan.
4. **Clean Up** — Deep Disk Cleaner, Duplicate File Finder, Empty Folder Cleaner, Windows Slimmer, Backup Cleaner.
5. **Optimize** — Mode Switcher (5 power plans), Disk Defrag/Trim per drive, RAM working-set trim, plus three live sub-tabs: Hardware / Disk Priority Manager / Desktop Protection.
6. **Protect** — Browser hijack check, File Shredder (1-pass / 3-pass / DoD), BHO scan, Action Center cleaner.
7. **Maintain** — Drivers, Services (disable / enable), Tweak Manager (16 documented Win 10/11 tweaks with backup + revert).
8. **My Tasks** — Scheduled-task manager (list / disable / enable / create / delete).
9. **Reports** — Audit log of every destructive action (tool, action, timestamp, file count, byte count).
10. **Win10 Protector** — 16 documented Win10/11 tweaks across 13 categories (Cortana, Action Center, Lock Screen, Mouse, Sync, Geo, Ad Control, Retail Demo, Metro, Reserved Storage, Defender, UAC, Cleanup). Every tweak backed up before applying so Care Center can revert it.
11. **Care Center** — Restore or forget any registry backup. Lists per-tweak backup JSONs + Restore buttons (calls `win10Revert`).
12. **Ask a Question** — Client-side keyword-matched search over 51 hand-written Windows performance articles (no LLM, no network).

## Dashboard tiles (22 total)

Row 1 (7 primary): SSD Optimizer · Uninstall Manager · Startup Manager · Browser Protection · Driver Updater · Duplicates Finder · Add tool

Row 2 (15 system): Internet Speed Up · Disk Explorer · Task Manager · Add-ons Manager · Free Space Wiper · Windows Slimmer · Mode Switcher · Shell Integrator · Registry Defrag · Action Center · Debug Log · Disk Priority · Backup Cleaner · Defrag on Boot · Browser BHO

Press **Ctrl+K** (or Cmd+K on macOS, even though the app runs on Windows) anywhere in the app to bring up the global search palette. It searches every tab + every tile + the 51-article RAG corpus + a static "Quick help" list.

## Safety model

Three independent gates stand between a button click and any file deletion, software uninstall, or registry write:

1. **Scan first, scan only.** Most destructive actions take a separate read-only `list` IPC + a `do` IPC. The renderer shows the real numbers in a `ConfirmModal` *before* the destructive call is even requested.
2. **Single-use confirmation token.** Once the user confirms, the renderer asks `optimizer.requestConfirm(action)` for a 30-second, single-use UUID. The destructive IPC handler calls `consumeConfirmation(token, action)` *before* any PowerShell spawns. A bare devtools call with no token is rejected.
3. **Input validation regexes.** Destructive handlers also validate their string + drive-letter arguments against a regex before reaching the filesystem. A hostile devtools call that passes `validateDriveLetter('C;D')` is rejected before the script spawns.

This exists because an earlier version fired destructive operations unconditionally from button clicks and a test run deleted ~5.8 GB of real user files. See [`SECURITY.md`](./SECURITY.md) for the full defense model.

## Getting started

### Prerequisites
- Windows 10 / 11 (x64)
- **Node.js 20+ LTS** (Node 22 also works; older Node 18 will not). The
  pinned minimum is recorded in `package.json#engines` and an `.nvmrc`
  is checked in for `nvm` / `fnm` / `volta` users.
- Git (for development only)
- About 700 MB of free disk for `node_modules/` + the built portable

### Install

```powershell
git clone https://github.com/ORCHORDS/BeetleOptimiser.git
cd BeetleOptimiser
npm ci                # or `npm install` — see "Install gotchas" below
```

`npm install` downloads:
- `electron@^33.4.11` (the desktop runtime, ~150 MB)
- `react@^19.0.0` + `react-dom@^19.0.0`
- `vite@^6.0.7` (renderer build)
- `@phosphor-icons/react@^2.1.10` (icons)
- electron-builder + Vite plugin (dev)

The first install is slow because electron's binary postinstall pulls
down + extracts a 115 MB Windows zip. Subsequent installs are fast.

### Install gotchas

Two known slow / flaky steps on a fresh checkout — both have a
mitigation.

**`npm install` may fail with `EBUSY` on `node_modules/esbuild`.** The
esbuild postinstall tries to delete its own directory while another
process still has a file handle. Re-running `npm ci` (which cleans
before installing) gets past it. The symptoms look scary but the fix
is just `rm -rf node_modules && npm ci`.

**The Electron postinstall (`node_modules/electron/install.js`) can stall
inside `extract-zip` on Node 26 + Windows.** The 115 MB zip is fully
downloaded in `~/AppData/Local/electron/Cache/<hash>/` — you can manually
unzip it and write `node_modules/electron/path.txt`:

```powershell
$src = "$env:LOCALAPPDATA\electron\Cache\*\electron-v33.4.11-win32-x64.zip"
Expand-Archive -LiteralPath $src -DestinationPath node_modules\electron\dist
'node_modules/electron/dist/electron.exe' | Out-File node_modules\electron\path.txt
```

After this, `npm test` + `npm run build` work normally. If even
`npm ci` fails outright, retrying with `npm ci --no-audit` once or
twice usually clears the postinstall lock.

### Develop

```powershell
npm run dev
```

Starts the Vite dev server (renderer on `:5173`) + Electron in a watch
loop. JSX / CSS changes hot-reload. PowerShell scripts can be edited
without re-running the dev server.

### Build a portable Windows exe

```powershell
npm run package
```

Output: `dist\BeetleOptimiser-1.0.0-portable.zip` (full `win-unpacked` directory) and `dist\BeetleOptimiser 1.0.0.exe` (single-file, ~70 MB). No installer; double-click to run.

### Run the test suite

```powershell
npm test
```

Runs `node --test tests/main-ipc-contract.test.js tests/ragSearch.test.js` (26 tests, no Electron / PowerShell dependency).

### Use the engine from your own code

See [`examples/`](./examples/). The simplest example is `node examples/run-cleanup-scan.js` — it spawns `optimize-cleanup.ps1 list` and parses the NDJSON output the same way the renderer does.

### Daily-life run (just the exe)

1. Go to the [Releases page](https://github.com/ORCHORDS/BeetleOptimiser/releases)
2. Download the latest `BeetleOptimiser-1.0.0-portable.zip`
3. Extract anywhere, double-click `BeetleOptimiser.exe`
4. No installer, no admin needed for ~95% of operations (admin only required for the operations that write to `HKLM\SOFTWARE`)

## Architecture

```
+--------------+       +-----------------------------+
|  Renderer    |<---->|  main.js (Electron main)     |
|  (React 19)  |  IPC  |  - 75+ IPC handlers         |
|              |       |  - Token-gate + validators  |
|  - 12 tabs   |       |  - Single-instance lock    |
|  - 22 tiles  |       |  - Spawns PowerShell       |
|  - Ctrl+K    |       |  - Spawns telemetry.ps1    |
|  - 51 RAG    |       |  - Tray                    |
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

```js
// Renderer side:
const token = await window.beetleAPI.optimizer.requestConfirm('clean-junk');
await window.beetleAPI.optimizer.cleanJunkFiles(token);

// Main process side (main.js):
ipcMain.handle('optimizer:clean-junk', (_, token) => {
  consumeConfirmation(token, 'clean-junk');   // throws if invalid
  return spawnOptimizer('scripts/optimize-clean-execute.ps1', ['--yes']);
});
```

Tokens: a fresh `crypto.randomUUID()`, stored in a `Map` in main.js,
30-second TTL, single-use. After consumption (or expiry) the entry is
deleted. A bare renderer call without a valid token throws before any
PowerShell is spawned.

## Contributing

Bug reports and PRs welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md)
for the workflow + code layout. By participating you agree to follow
the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Security

See [`SECURITY.md`](./SECURITY.md) for the defense model + how to report
vulnerabilities. The 26 tests in `tests/` enforce the input-validation
regexes + the token single-use contract; if you change those, update
the tests in the same commit.

## License

[MIT © ORCHORDS.COM](./LICENSE)
