# Project Roadmap

This document tracks what's done and what's next. It's intentionally
shorter than the original `PLAN.md` (which described a now-cancelled
SaaS direction). The current product is **fully local** — no server, no
auth, no paid tier, no telemetry sent anywhere.

## Done

- [x] 36 PowerShell optimizer scripts under `scripts/optimize-*.ps1`
- [x] ~93 IPC handlers in `main.js`
- [x] 12 tabs + 22 dashboard tiles, every one wired to a real backend
- [x] Confirmation-token gate for destructive actions
- [x] MIT license + LICENSE file + CONTRIBUTING + SECURITY + CODE_OF_CONDUCT + .github templates
- [x] Single-instance lock + frameless window with custom Min / Close
- [x] Live telemetry via persistent `telemetry.ps1` (CPU / RAM / GPU / NET / per-drive)
- [x] Client-side RAG over 51 hand-written PC-performance articles

## In-progress / looking for help with

- [ ] **More RAG articles** (the corpus is 51 hand-written pieces, mostly
  windowed on Windows 10/11; more articles on PowerShell performance,
  Office cleanup, Edge-specific tweaks would fill in gaps)
- [ ] **More disk priority profiles** (currently just Games / High Perf /
  Pro Audio; PowerCfg has more)
- [ ] **Localization** — UI strings hard-coded in English
- [ ] **Lower-privilege testing** — most IPC handlers are tested on an
  Admin account; we haven't fully verified that a non-admin user gets
  sensible behavior (graceful elevation prompts vs silent failures)

## Considered + deliberately out of scope

| Idea | Why we didn't add it |
|---|---|
| Account / sign-in | The product is fully local; no SaaS, no server-side state. |
| Paid tier / Stripe / Cloud Functions | The product is fully local + MIT-licensed; no paid features. |
| Telemetry call-home | User explicitly mandated local-only; no events leave the machine. |
| All-Tools launchpad tab | The dashboard already lists every tool as a tile; an All-Tools tab is redundant. |
| Store / shopping tab | n/a |
| Theme toggle UI | Per user spec, theme is set via the bottom-bar pill only (no in-tab controls). |

## Future: Auslogics features we could add

| Feature | Status |
|---|---|
| Browser Protection runtime guard (process-level hijack blocker) | Not built — would need a long-running watcher |
| WindowsSlimmer — Window Compact OS integration | Script exists (`optimize-windows-slimmer.ps1`); not surfaced as a tile yet |
| Integrator right-click hooks | Script exists; the user-facing UI not surfaced (uses `apply` to write shell verbs) |
| StyleManager (theme files) | Optional; the in-app dark/light is sufficient |
| SendDebugLog automatic upload | Strictly local per MIT; no upload |

## Outcomes we do NOT want

The PR set should not introduce any of the following:

- Any HTTP/HTTPS call from the renderer process to a server the user
  did not explicitly configure (e.g. telemetry, Stripe, Firebase). The
  only network requests the app should be making are to localhost (the
  Vite dev server) or to user-configured endpoints.
- Any registry write to `HKLM\...\Windows Run` that runs an arbitrary
  executable on the user's behalf. Auto-defrag-on-boot writes a fixed
  `defrag.exe` call — that's the only acceptable WinLogon entry.
- Any token that lasts longer than a single user action. Single-use +
  expiry is the design.
