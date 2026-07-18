<h1>Security Policy</h1>

<p>This document covers security practices for the project and how to
report vulnerabilities.</p>

<h2>Supported Versions</h2>

Only the latest release on the <code>main</code> branch receives security
updates. There is no LTS model; only the most recent tag matters.

<table>
  <thead>
    <tr>
      <th>Branch</th>
      <th>Supported</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>main</code> (latest release)</td>
      <td>:white_check_mark:</td>
    </tr>
    <tr>
      <td>Older releases</td>
      <td>:x:</td>
    </tr>
  </tbody>
</table>

<h2>Defense model for destructive operations</h2>

<p>Every action that changes the operating system - deletes files, uninstalls
software, modifies the registry, changes startup items, applies Windows
tweaks - goes through a <strong>confirmation-token gate</strong>:</p>

<ol>
<li>The renderer scans first (read-only) via a list-mode IPC call. The
results are shown to the user in a <code>ConfirmModal</code> with the real
counts (files, MB, registry keys).</li>
<li>Only after the user explicitly clicks the destructive action does the
renderer call <code>optimizer.requestConfirm(action)</code>, which gets a
short-lived, <strong>single-use</strong> token from the main process.</li>
<li>The actual destructive IPC handler in <code>main.js</code> calls
<code>consumeConfirmation(token, action)</code> <em>before</em> spawning any
PowerShell. Bare calls without a valid token throw immediately.</li>
</ol>

<p>This exists because an earlier version fired destructive operations
unconditionally from button clicks and a test run deleted real user files
(~5.8 GB of temp/prefetch/Windows-Update-cache). Don't add a new destructive
action that bypasses this gate. See <code>src/components/shared/ConfirmModal.jsx</code>
and the <code>consumeConfirmation</code> helper in <code>main.js</code>.</p>

<h2>PowerShell scripts</h2>

<p>Every optimizer script under <code>scripts/</code>:</p>

<ul>
<li>Defaults to dry-run / list mode, requires an explicit <code>--yes</code> flag
for any destructive operation.</li>
<li>Refuses to delete or modify files outside the user-owned profile
folders <em>or</em> explicitly-verified system locations (Recycle Bin, Windows
staging folders, registry orphan keys).</li>
<li>Validates any explicit input path before using it (e.g. <code>Test-Path -LiteralPath</code>
followed by a type check).</li>
<li>Does not shell to any third-party program. Only built-in Windows
cmdlets (<code>Get-Volume</code>, <code>Get-MpComputerStatus</code>,
<code>Register-ScheduledTask</code>, etc.) are used.</li>
</ul>

<p>If you want to harden a specific script, see <code>scripts/optimize-duplicates.ps1</code>
for the canonical "scan + per-confirmed-delete" pattern.</p>

<h2>Reporting a Vulnerability</h2>

<p><strong>Please email</strong> <a href="mailto:crm@orchords.com">crm@orchords.com</a>
<strong>rather than opening a public issue</strong> if you have:</p>

<ul>
<li>A confirmation-token bypass (e.g. a renderer-side call that skips the
modal).</li>
<li>A privilege escalation (the app opens the renderer sandbox from an
elevated state without going through UAC).</li>
<li>An arbitrary PowerShell execution path that doesn't gate on <code>--yes</code>.</li>
<li>Any other issue affecting a Windows user's data or system.</li>
</ul>

<p>We aim to:</p>

<ul>
<li>Acknowledge within 72 hours.</li>
<li>Investigate + ship a fix within 7 days for high-severity (data loss,
privilege escalation).</li>
<li>Credit you in the release notes if you want, unless you prefer to stay
anonymous.</li>
</ul>

<h2>Hardened-by-default settings</h2>

<ul>
<li>The app uses <code>contextIsolation: true</code> and <code>sandbox: true</code>
in its <code>BrowserWindow</code> config. <code>nodeIntegration</code> is disabled.</li>
<li>The renderer cannot reach Node or <code>ipcRenderer</code> directly; the
<strong>only</strong> exposed surface is <code>window.beetleAPI</code>, defined by
<code>src/preload.js</code>'s <code>contextBridge.exposeInMainWorld</code> call.
Every method on that surface is hand-written.</li>
<li>The renderer cannot reach PowerShell directly. Every PowerShell spawn
goes through <code>main.js</code>'s <code>spawnOptimizer</code> helper, which
always prepends <code>-NoProfile</code> and <code>-ExecutionPolicy Bypass</code> and
explicitly passes the script path. No concatenation with user input.</li>
<li>The custom protocol handler (<code>beetleoptimiser://</code>) accepts ONLY
URLs whose host is empty and whose path is one of the pre-registered
verbs (<code>beetleDefrag</code>, <code>beetleScanJunk</code>). Unknown verbs
are dropped at the IPC boundary.</li>
</ul>
