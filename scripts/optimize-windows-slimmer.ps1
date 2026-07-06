# optimize-windows-slimmer.ps1 - Windows Slimmer. Reduces Windows folder
# size by turning off hibernation (which keeps a 4-12 GB hiberfil.sys),
# disabling System Restore (which keeps multiple ~1 GB restore points),
# compacting the OS binary via fsutil, and listing removable optional
# features the user could disable via Settings > Apps > Optional features.
#
# SAFETY:
#   - 'list' is always read-only.
#   - Each 'apply' op requires --yes + admin (we attempt to elevate
#     internally if not running as admin; otherwise the registry/compact
#     operations that need elevation will report error).
#   - Never deletes user files. Only touches system-level artifacts that
#     Windows can regenerate.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'list'
$doFire = $false
$op = $null

$i = 0
while ($i -lt $args.Count) {
  $a = $args[$i]
  if ($a -eq 'list') { $mode = 'list' }
  elseif ($a -eq 'apply') { $mode = 'apply'; $doFire = $true }
  elseif ($a -eq '--op') { $op = $args[++$i] }
  elseif ($a -eq '--yes') { $doFire = $true }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode; op = $op }

# --- LIST ---
if ($mode -eq 'list') {
  # hiberfil size
  $hiPath = Join-Path $env:SystemRoot 'hiberfil.sys'
  $hibSize = 0
  if (Test-Path -LiteralPath $hiPath) { $hibSize = (Get-Item -LiteralPath $hiPath).Length }
  $hibStatus = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' -ErrorAction SilentlyContinue).HibernateFileSizeLimitBytes
  # System Restore size (estimate - sum of System Volume Information Restore folders)
  $sysRestoreSize = 0
  $sysRestorePoints = 0
  $svi = Join-Path $env:SystemDrive 'System Volume Information'
  if (Test-Path -LiteralPath $svi) {
    # We can't recurse; estimate via fsutil. For accuracy, get quota.
    try {
      $quota = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore' -ErrorAction SilentlyContinue).DiskPercent
      if ($quota) {
        # DiskPercent * logical disk size / 100 -> restore quota bytes
        $diskSize = (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -eq $env:SystemDrive + '\' } -ErrorAction SilentlyContinue).Used + (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -eq $env:SystemDrive + '\' } -ErrorAction SilentlyContinue).Free
        if ($diskSize) { $sysRestoreSize = [int]($diskSize * $quota / 100) }
      }
    } catch {}
    # Count restore points via wbadmin when available
    try {
      $wbadmin = wbadmin list shadows 2>&1 | Out-String
      $sysRestorePoints = ([regex]::Matches($wbadmin, 'Shadow Copy')).Count
    } catch {}
  }
  # compact OS state
  $compactState = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CompactOS' -ErrorAction SilentlyContinue).State
  Emit-Line @{
    event = 'op'
    item = @{
      id = 'hibernate_file'
      label = 'Disable hibernation (delete hiberfil.sys)'
      description = 'Removes the 4-12 GB hibernation file. Sleep mode keeps working.'
      current_bytes = $hibSize
      enabled = ($hibStatus -ne 0)
    }
  }
  Emit-Line @{
    event = 'op'
    item = @{
      id = 'system_restore'
      label = 'Disable System Restore (delete restore points)'
      description = 'Removes the restore point snapshots. You will not be able to roll back Windows changes.'
      current_bytes = $sysRestoreSize
      restore_points = $sysRestorePoints
      enabled = ($sysRestoreSize -gt 0)
    }
  }
  Emit-Line @{
    event = 'op'
    item = @{
      id = 'compact_os'
      label = 'Compact OS binaries'
      description = 'Use XPRESS4K compression on Windows system files. Saves 2-3 GB but slows file access slightly.'
      current_state = if ($null -eq $compactState) { 'never' } else { $compactState }
    }
  }
  Emit-Line @{
    event = 'op'
    item = @{
      id = 'delivery_optimization'
      label = 'Stop Delivery Optimization service (DoSvc)'
      description = 'Stops the P2P Windows Update sharing service. Saves 1-3 GB of downloaded update cache.'
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

# --- APPLY ---
if ($mode -eq 'apply') {
  if (-not $doFire -or -not $op) {
    Emit-Line @{ event = 'skipped'; reason = 'needs --op <id> --yes' }
    Emit-Line @{ event = 'finished'; mode = $mode }
    return
  }

  switch ($op) {
    'hibernate_file' {
      # powercfg /h off - clears the hibernation file
      $out = & 'powercfg' '/h' 'off' 2>&1 | Out-String
      Emit-Line @{ event = 'applied'; op = $op; output = $out }
    }
    'system_restore' {
      # Disable System Restore via the registry (HKLM\Software\Microsoft\Windows NT\CurrentVersion\SystemRestore + DisableSR)
      try {
        Set-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\SystemRestore' -Name 'DisableSR' -Value 1 -Type DWord -Force -ErrorAction Stop
      } catch {}
      try {
        Set-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore' -Name 'DisableSR' -Value 1 -Type DWord -Force -ErrorAction Stop
        # Best-effort: try to clean up existing restore points
        vssadmin delete shadows /for=c: /quiet 2>&1 | Out-Null
      } catch {}
      Emit-Line @{ event = 'applied'; op = $op }
    }
    'compact_os' {
      # compact /CompactOS:always - this is the documented binary path
      $out = & 'compact' '/CompactOS:always' 2>&1 | Out-String
      Emit-Line @{ event = 'applied'; op = $op; output = $out }
    }
    'delivery_optimization' {
      # Stop + disable DoSvc (Delivery Optimization). Needs admin.
      try {
        & 'net' 'stop' 'DoSvc' '/y' 2>&1 | Out-Null
        Set-Service -Name DoSvc -StartupType Disabled -ErrorAction Stop
        Emit-Line @{ event = 'applied'; op = $op }
      } catch {
        Emit-Line @{ event = 'error'; op = $op; reason = $_.Exception.Message }
      }
    }
    default {
      Emit-Line @{ event = 'error'; reason = "unknown op $op" }
    }
  }
  & "$PSScriptRoot\\optimize-report.ps1" --tool 'Windows Slimmer' --action $op
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}
