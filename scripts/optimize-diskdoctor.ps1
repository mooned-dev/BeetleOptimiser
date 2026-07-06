# optimize-diskdoctor.ps1 - Disk Doctor. Wraps Windows' own built-in
# Repair-Volume cmdlet (Storage module - this IS the chkdsk engine, not a
# 3rd-party tool). Companion to the optimizer:diskdoctor-scan /
# optimizer:diskdoctor-repair IPC handlers in main.js.
#
# SAFETY:
#   - Default mode is 'scan' (Repair-Volume -Scan: read-only, reports
#     corruption without fixing anything).
#   - Pass --yes to run the repair (Repair-Volume -SpotFix): fixes common
#     issues found by the scan. SpotFix (not -OfflineScanAndFix) is used
#     deliberately - it targets just the found problems without requiring
#     a full offline chkdsk/reboot cycle for most issues.
#   - Requires an elevated (Administrator) process - Repair-Volume throws
#     an access-denied error otherwise, reported back as an 'error' event.
#
# Output protocol: NDJSON. {event:'started', drive}, then {event:'result',
# drive, health_status, scan_ok, message} with the volume's HealthStatus
# (Healthy/Warning/Unhealthy per Get-Volume - the same signal telemetry.ps1
# already surfaces on the dashboard) plus whether the scan/repair itself
# completed without error, then {event:'finished'}.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$doRepair = $args -contains '--yes'
$mode = if ($doRepair) { 'repair' } else { 'scan' }

$diskLetter = ($args | Where-Object { $_ -match '^[A-Z]:?$' } | Select-Object -First 1)
$diskLetter = if ($diskLetter) { $diskLetter.TrimEnd(':') } else { $env:SystemDrive.TrimEnd(':') }

Emit-Line @{ event = 'started'; drive = $diskLetter; mode = $mode }

$scanOk = $true
$scanMessage = ''
try {
  if ($doRepair) {
    Repair-Volume -DriveLetter $diskLetter -SpotFix -ErrorAction Stop
  } else {
    Repair-Volume -DriveLetter $diskLetter -Scan -ErrorAction Stop
  }
} catch {
  $scanOk = $false
  $scanMessage = $_.Exception.Message
}

$vol = Get-Volume -DriveLetter $diskLetter -ErrorAction SilentlyContinue

Emit-Line @{
  event = 'result'
  drive = $diskLetter
  mode = $mode
  scan_ok = $scanOk
  message = $scanMessage
  health_status = if ($vol) { "$($vol.HealthStatus)" } else { $null }
}

Emit-Line @{ event = 'finished'; mode = $mode }
