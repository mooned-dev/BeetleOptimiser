# Examples

Stand-alone, runnable examples that you can copy-paste to try out the
underlying PowerShell engine without going through the GUI. Every
script in `../scripts/` is also wired into the renderer through an IPC
handler in `../main.js`; the point of this folder is to give you a way
to verify the engine in isolation.

## Prerequisites

- Windows 10 or 11 (x64)
- PowerShell 5.1+ (in-box on Windows 10/11; nothing extra to install)
- About 5 MB of free disk space for the working temp files
  `optimize-cleanup.ps1` writes during a dry run.

No admin required for the `list` and `dry-run` examples below. The
destructive examples (`--yes`) need an elevated process.

## Example 1: scan-only cleanup survey

Lists every junk category the Beeltle clean-up engine knows about —
file counts, byte totals, the path on disk. Read-only, safe to run on
any user.

### Command

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\optimize-cleanup.ps1 list
```

### Expected output (anonymized - paths from a real Windows 11 box)

```json
{"id":"user-temp","label":"User Temp","path":"C:\\Users\\YOU\\AppData\\Local\\Temp","files":1062,"bytes":3616989863,"safe":true}
{"id":"system-temp","label":"Windows Temp","path":"C:\\Windows\\Temp","files":0,"bytes":0,"safe":true}
{"id":"prefetch","label":"Prefetch","path":"C:\\Windows\\Prefetch","files":0,"bytes":0,"safe":true}
{"id":"recycle","label":"Recycle Bin","path":"$RECYCLE.BIN","files":0,"bytes":0,"safe":true}
{"id":"thumbcache","label":"Thumbnail cache","path":"C:\\Users\\YOU\\AppData\\Roaming\\Microsoft\\Windows\\Explorer","files":0,"bytes":0,"safe":true}
{"id":"windows-update","label":"Windows Update downloads","path":"C:\\Windows\\SoftwareDistribution\\Download","files":566,"bytes":1140551400,"safe":true}
{"id":"wer","label":"Windows Error Reports","path":"C:\\Users\\YOU\\AppData\\Local\\Microsoft\\Windows\\WER","files":0,"bytes":0,"safe":true}
{"id":"edge-cache","label":"Microsoft Edge cache","path":"C:\\Users\\YOU\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache","files":162,"bytes":18983611,"safe":true}
{"event":"finished","mode":"list"}
```

Each `bytes` value is a raw integer count from the corresponding folder.
Multiply by `9.31e-10` for an approximate GB.

### What it does

It walks every subfolder of `C:\Users\<you>\AppData\Local\Temp` + the
other six locations, counts files (not directories), adds up the sizes
recursively, and emits one NDJSON line per category. The renderer
takes those lines and renders them into the Clean Up tab's per-
category cards.

There is no file deletion in `list` mode. To run the destructive
mode, pass `--yes`, but **only after the user has reviewed the
numbers** in the GUI. See `SECURITY.md` for the confirmation-token
system the renderer uses to gate that step.

## Example 2: defensive script with `--yes` guard

Every destructive script in `../scripts/` follows the same shape —
dry-run (or list) by default, `list` mode as a no-touch scan, and a
`--yes` opt-in token for the destructive path.

```powershell
# Dry run - shows what WOULD be deleted but touches nothing on disk.
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\optimize-cleanup.ps1 list

# Real deletion - requires --yes. PowerShell still asks for a confirmation
# prompt unless -Confirm:$false is passed.
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\optimize-clean-execute.ps1 --yes
```

## Example 3: connecting your own UI to a script

Every PowerShell script emits NDJSON (one JSON object per line). You
can pipe it into any UI in any language. The simplest example, JS
inside the renderer:

```js
// Renderer-side helper that already exists in src/App.jsx for the
// Clean Up tab. Reproduced here to show the contract.
window.beetleAPI.optimizer.scanJunkFiles()
//   ->
//   invokes main.js's optimizer:scan-junk-files IPC handler, which
//   spawns scripts/optimize-cleanup.ps1 list, collects NDJSON lines,
//   and resolves with { items: [...] }.
//
// Each item is what the script emitted. The renderer turns them into
// the per-category cards.
```

## Example 4: the confirmation-token IPC contract, in isolation

`examples/extension/minimal-token-gated-ipc/server.js` is a Node-only
demo of the same contract main.js uses for every destructive handler.
No Electron, no PowerShell, no DOM. Just `node examples/extension/minimal-token-gated-ipc/server.js`
prints a 5-step walkthrough that exercises:

- `mint(action)` returns a fresh 30-second single-use UUID token
- `fire(token, action)` succeeds only when the token matches the
  action AND has not been consumed AND has not expired
- `cancel(token)` drops an abandoned token (the renderer side calls
  this when the user dismisses a ConfirmModal without clicking Confirm)
- `sweep()` evicts tokens whose `expires` is in the past (called by
  `setInterval(60s)` in production main.js)
- A 200-ms wait past the token's TTL proves `fire` rejects the
  expired token

This is a useful template if you want to fork the project and add
your own custom destructive action. The contract - "mint, then fire
later, single-use, expires fast" - is the whole security guarantee.

## What next

- Read `../README.md` for the canonical install + dev workflow.
- Read `../CONTRIBUTING.md` before adding a new script or IPC handler.
- Read `../SECURITY.md` before extending any destructive script.
