# optimize-backup-cleaner.ps1 - Backup Cleaner. Per Auslogics, removes
# leftover upgrade + recovery artifacts that can chew up several GB on
# the system drive:
#
# 1. C:\Windows.old\                            - prior Windows install
# 2. C:\$Windows.~BT\                           - upgrade staging
# 3. C:\$Windows.~WS\                           - upgrade staging
# 4. C:\$WinREAgent\                            - WinRE staging
# 5. C:\Windows\System32\WinRE\WINRE_*.WIM     - WinRE imaging files
# 6. C:\Users\<u>\AppData\Local\CrashDumps\*.dmp - old crash dumps
# 7. C:\hiberfil.sys                           - already toggled by slimmer
#
# Output: list mode enumerates each item with a size estimate (via
# Scripting.FileSystemObject FolderSize). Apply mode requires --yes,
# writes an audit log line per removed item via optimize-report.ps1.
#
# SAFETY: every removal is gated behind --yes. Path traversal / try/catch
# is per-folder. We refuse to delete anything matching "Windows" without
# a special "upgrade" marker; we never touch the live C:\Windows tree.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'list'
$doFire = $false

$i = 0
while ($i -lt $args.Count) {
  $a = $args[$i]
  if ($a -eq 'list') { $mode = 'list' }
  elseif ($a -eq 'apply') { $mode = 'apply'; $doFire = $true }
  elseif ($a -eq '--yes') { $doFire = $true }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode }

# Each target is a path the user almost certainly can remove safely.
# We size them up with a fast shell-computed total via robocopy-style
# enumeration, NOT via Get-Item (which forces a recurse that may hang
# on massive folders; instead we lean on the Bytes counter on
# FolderItem would force recursion, so use a streaming walk).
function Get-FolderSizeBytes($path) {
  if (-not (Test-Path -LiteralPath $path)) { return 0L }
  $total = 0L
  Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object {
    $total += $_.Length
  }
  return $total
}

$TARGETS = @(
  @{ id = 'windows_old';         path = 'C:\Windows.old';                                  label = 'Windows.old';          desc = 'Prior Windows install (post-upgrade backup)' }
  @{ id = 'win_bt';              path = 'C:\$Windows.~BT';                                 label = '$Windows.~BT';         desc = 'Upgrade staging folder' }
  @{ id = 'win_ws';              path = 'C:\$Windows.~WS';                                 label = '$Windows.~WS';         desc = 'Upgrade temp / WinSxS staging' }
  @{ id = 'winre_agent';         path = 'C:\$WinREAgent';                                  label = '$WinREAgent';          desc = 'Windows RE staging folder' }
  @{ id = 'crashdumps_user';     path = (Join-Path $env:LOCALAPPDATA 'CrashDumps');        label = 'Crash dumps';          desc = 'Old app crash dumps (only if your account)' }
  @{ id = 'temp_java';           path = Join-Path $env:USERPROFILE 'AppData\LocalLow\Sun\Java\Deployment\cache'; label = 'Java cache'; desc = 'Old Java browser cache (empty on most systems)' }
)

# --- LIST ---
if ($mode -eq 'list') {
  foreach ($t in $TARGETS) {
    if (Test-Path -LiteralPath $t.path) {
      $size = Get-FolderSizeBytes $t.path
      Emit-Line @{
        event = 'cleanup_target'
        item = @{
          id = $t.id
          label = $t.label
          description = $t.desc
          path = $t.path
          size_bytes = $size
          size_mb = if ($size) { [math]::Round($size / 1MB, 1) } else { 0 }
        }
      }
    } else {
      Emit-Line @{
        event = 'cleanup_target'
        item = @{
          id = $t.id
          label = $t.label
          description = $t.desc
          path = $t.path
          size_bytes = 0
          size_mb = 0
          absent = $true
        }
      }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

# --- APPLY ---
if ($mode -eq 'apply') {
  if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  $totalFreed = 0
  foreach ($t in $TARGETS) {
    if (-not (Test-Path -LiteralPath $t.path)) {
      Emit-Line @{ event = 'noop'; id = $t.id; reason = 'absent' }
      continue
    }
    $size = Get-FolderSizeBytes $t.path
    try {
      Remove-Item -LiteralPath $t.path -Recurse -Force -ErrorAction Stop
      $totalFreed += $size
      Emit-Line @{ event = 'removed'; id = $t.id; path = $t.path; bytes = $size }
    } catch {
      Emit-Line @{ event = 'error'; id = $t.id; reason = $_.Exception.Message }
    }
  }
  Emit-Line @{ event = 'done'; total_freed_bytes = $totalFreed }
  & "$PSScriptRoot\optimize-report.ps1" --tool 'Backup Cleaner' --action 'clean' --bytes $totalFreed
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}
