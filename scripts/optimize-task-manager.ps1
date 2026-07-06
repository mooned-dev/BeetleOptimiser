# optimize-task-manager.ps1 - Task Manager equivalent. Lists running processes
# sorted by working-set (RAM) descending, plus list/kill modes.
#
# Per-user spec: read-only by default; 'kill' requires --yes + the target PID.
# Killing SYSTEM / critical PIDs (csrss.exe, lsass.exe, winlogon.exe, smss.exe
# and the session's own PID or its ancestor tree) is REFUSED in the script.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'list'
$doFire = $false
$targetPid = $null

$i = 0
while ($i -lt $args.Count) {
  switch ($args[$i]) {
    'list'  { $mode = 'list' }
    'kill'  { $mode = 'kill' }
    '--yes' { $doFire = $true }
    '--pid' { $targetPid = [int]($args[++$i]) }
    default { }
  }
  $i++
}

# PIDs we refuse to ever kill (would bluescreen Windows or our own session).
$protected = @(
  'csrss.exe', 'lsass.exe', 'winlogon.exe', 'smss.exe', 'services.exe',
  'svchost.exe', 'audiodg.exe', 'dwm.exe'
)

# PID of our own process (we don't want to kill PowerShell or ourselves mid-run)
$own = $PID

Emit-Line @{ event = 'started'; mode = $mode; own_pid = $own }

if ($mode -eq 'list') {
  Get-Process | Sort-Object WorkingSet64 -Descending -ErrorAction SilentlyContinue | Select-Object -First 200 | ForEach-Object {
    Emit-Line @{
      event = 'process'
      item = @{
        pid = $_.Id
        name = $_.ProcessName
        cpu = if ($_.CPU) { [math]::Round($_.CPU, 2) } else { 0 }
        ram_bytes = $_.WorkingSet64
        handles = $_.HandleCount
        threads = $_.Threads.Count
        path = $_.Path
      }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

if ($mode -eq 'kill') {
  if (-not $doFire) {
    Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }
    Emit-Line @{ event = 'finished'; mode = $mode; killed = 0 }
    return
  }
  if (-not $targetPid) {
    Emit-Line @{ event = 'error'; reason = 'needs --pid <n>' }
    Emit-Line @{ event = 'finished'; mode = $mode; killed = 0 }
    return
  }
  try {
    $proc = Get-Process -Id $targetPid -ErrorAction Stop
    if ($proc.Id -eq $own) { throw 'refusing to kill own process' }
    if ($protected -contains $proc.ProcessName + '.exe') {
      throw ('refusing to kill protected process {0}.exe' -f $proc.ProcessName)
    }
    Stop-Process -Id $proc.Id -Force -ErrorAction Stop
    Emit-Line @{ event = 'killed'; pid = $proc.Id; name = $proc.ProcessName }
    Emit-Line @{ event = 'finished'; mode = $mode; killed = 1 }
  } catch {
    Emit-Line @{ event = 'error'; pid = $targetPid; reason = $_.Exception.Message }
    Emit-Line @{ event = 'finished'; mode = $mode; killed = 0 }
  }
  return
}
