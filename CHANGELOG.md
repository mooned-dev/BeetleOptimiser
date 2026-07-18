# Changelog

All notable changes to this project will be documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project follows [SemVer](https://semver.org/) for stable releases.

## [Unreleased]

Adds since v1.0.0 tag, currently still pointing at the same release
on github.com/ORCHORDS/BeetleOptimiser/releases/tag/release-2026-07-18-v1.

### Added
- Persist the last active tab + right-sidebar nav item across app
  restarts (`useActiveTab` / `useActiveNav` hooks read + write
  `localStorage('beetle-last-tab')` / `localStorage('beetle-last-nav')`
  with validation against the TABS and NAV_ITEMS source-of-truth so
  a renamed tab in a newer release gracefully falls back)
- spawnOptimizer hang-watcher: 5-minute default `setTimeout` per
  PowerShell subprocess that fires `SIGTERM` then `SIGKILL` if the
  script never closes, so the renderer UI never gets stuck on
  "Working...". Overridden to 15-60 minutes for the legit
  long-running scripts (Repair-Volume, free-space wipe, defrag,
  file-recovery restore, defrag-on-boot apply)
- 12 new tests for the localStorage-persistence hooks + 6 new tests
  for the spawnOptimizer timeout (settle-once, fast-script-doesn't-fire-kill,
  late-close-is-ignored, QuotaExceededError swallows silently)
- Persisted active-tab + nav across app restarts
  (`useActiveTab` / `useActiveNav` read + write `localStorage`)
- CustomEvent-based 'beetle:prefill-article' bus replaces the
  sessionStorage-poll hack for the Ctrl+K palette -> Ask a Question
  handoff (6 new tests)
- Telemetry auto-respawn with 1s -> 30s exponential backoff
  (3 new tests)

Test count: 46 -> 95 passing.

### Fixed
- system:open-external URL-scheme allowlist (http / https / mailto only)
- system:shell command allowlist (`start ms-settings:` + `powershell
  -NoProfile -Command Remove-Item on rescue/` only)
- Confirmation-token store memory leak (periodic sweep + explicit
  `optimizer:cancel-confirm` IPC handler)

Test count: 46 -> 86 passing.

## [1.0.0] - 2026-07-18

The first production-ready public release. Built on Electron 33 + React 19 + Vite 6 + electron-builder 25 + 38 PowerShell scripts and 82 IPC handlers.

### Added
- 12 tabs: Dashboard, Scanner, Advisor, Clean Up, Optimize, Protect, Maintain, My Tasks, Reports, Win10 Protector, Care Center, Ask a Question
- 22 dashboard tiles (7 primary + 15 system), every one wired to a real PowerShell backend
- 36 token-gated destructive IPC handlers (require both a 30-second confirmation token + an input-validation regex pass before any PowerShell subprocess spawns)
- 38 PowerShell scripts under `scripts/optimize-*.ps1`, all read-only-by-default with `--yes` opt-in for destructive ops
- 51 hand-written RAG articles under `content/rag-articles.js` powering the Ask a Question tab + the Ctrl+K palette
- Ctrl+K (Cmd+K) global search palette — searches every tab + tile + the RAG corpus + a static help list
- Single-instance lock via Electron `app.requestSingleInstanceLock()`
- Confirmation-token gate: `optimizer.request-confirm` mints a 30-second, single-use UUID; `consumeConfirmation(token, expectedAction)` validates and deletes the entry before any handler runs
- Periodic confirmation-token sweeper (`setInterval(60s)`) evicts expired + abandoned tokens so the Map doesn't grow unbounded across long-running Electron sessions
- Explicit cancel path (`optimizer:cancel-confirm`) so the renderer can clear a token when a ConfirmModal is dismissed without clicking Confirm
- Input validation regexes for every destructive handler: `validateDriveLetter` (A-Z), `validateProgramName` (rejects `;|\\*$#"`), `validateRegistryPath` (HKLM/HKCU/HKCR/HKU only)
- Live telemetry: persistent `scripts/telemetry.ps1` child process streams one JSON line every ~2 seconds (CPU, RAM, GPU, NET, per-drive disk) via `main.js`'s `createMainWindow` + `event.sender('telemetry')`
- Per-tweak Windows registry backups under `%LOCALAPPDATA%\BeetleOptimiser\rescue\*.json` with Restore + Forget buttons in the Care Center tab
- Distributed chunks via `vite.config.js`'s `manualChunks` (phosphor vendor split, lazy-loaded)
- **URL-scheme allowlist** on `system:open-external` (http + https + mailto only) — anything else (file://, smb:, javascript:, custom OS protocols) is rejected before the call reaches `shell.openExternal`
- **Command allowlist** on `system:shell` (start ms-settings: + powershell -NoProfile -Command Remove-Item on rescue/ only) — chained `;`/`&&` and arbitrary commands (cmd, bash, sh, wscript, mshta, rundll32) are explicitly rejected
- 68 unit tests via `node:test` (zero dependencies): validators, confirmation-token contract, NDJSON parser, RAG ranking algorithm, tab + tile inventory cross-checks, PowerShell script-quality linting, URL-scheme allowlist, system:shell command allowlist — `npm test` / `npm run test:watch`
- `examples/run-cleanup-scan.js` showing how to drive the same PowerShell engine from any Node script
- `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `ROADMAP.md`, `CHANGELOG.md`
- `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.md` + `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/tests.yml` — GitHub Actions CI on Node 20 + 22 LTS matrix + a fresh-clone verify job that only runs on master
- `engines: { "node": ">=20.0.0" }` + `.nvmrc` (=20) for `nvm` / `fnm` / `volta` users
- `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.md` + `.github/PULL_REQUEST_TEMPLATE.md`
- `engines: { "node": ">=20.0.0" }` + `.nvmrc` (=20) for `nvm` / `fnm` / `volta` users
- GitHub Action (`tests.yml`): `npm test` + `npm run build` on every push + PR (Node 20 + Node 22 matrix)

### Changed
- Migrated from WPF/.NET 8 (the pre-open-source binary-only release) to Electron + React + Vite
- Migrated from the proprietary machine-readable licence to MIT
- Re-branded from MOONED DEV STUDIO to ORCHORDS.COM (all rights belong to ORCHORDS.COM)
- Optimizer tab: 3 sub-tabs that previously read "IN PROGRESS" now wire to real backends (Hardware Monitor via sysinfo, Disk Priority Manager via multimedia profile Tasks\\Priority, Desktop Protection via shell-extension list)
- 28 PowerShell scripts in earlier drafts → 38 in v1.0 (added Backup Cleaner, File Recovery, Browser BHO, Optimizer-on-Boot, Free Space Wiper, Disk Explorer, Disk Priority, Registry Defrag, Action Center, Debug Log, more)
- Token TTL clarified from "30 seconds in the README" to "30 second, single-use" everywhere

### Removed
- All Firebase Auth code (`src/lib/firebase.js`, `src/hooks/useAuth.js`, `src/components/shared/AccountMenu.jsx`)
- All account / sign-in / paid-tier scaffolding (Stripe, AdMob, token economy, chat-LLM integration)
- The "All Tools" tab + "Store" tab (per maintainer's strict workflow rules)
- The legacy `optimize-chat` / `chat:ask` model + the `node-llama-cpp` and `firebase` npm dependencies
- `llm-training/` dev folder kept locally for development only, fully `.gitignore`'d
- All in-source secrets from older commits (Google OAuth client secret, GitHub OAuth client secret + client ID) via `git-filter-repo --replace-text`

### Security
- Renderer runs in a strict context: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- The only renderer-facing API is `window.beetleAPI` defined via `contextBridge.exposeInMainWorld` in `src/preload.js`
- Single-instance lock prevents a second copy from spawning a duplicate tray
- All destructive operations require: a) user clicking Confirm in a modal, b) a unique single-use confirmation token matching the action name, c) input args passing a regex

## [0.2.0] - 2026-07-03

First public-but-proprietary release on the prior `mooned-dev/BeetleOptimiser` repo: binary-only Windows PC maintenance suite in .NET 8 + WPF. This release predates the MIT relicense; it exists as a historical artifact but has no source-code surface in this repository.

[1.0.0]: https://github.com/ORCHORDS/BeetleOptimiser/releases/tag/release-2026-07-18-v1
[0.2.0]: https://github.com/ORCHORDS/BeetleOptimiser/releases (archive; binary-only)
