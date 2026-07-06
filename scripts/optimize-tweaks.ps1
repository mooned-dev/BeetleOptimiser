# optimize-tweaks.ps1 - real, reversible system tweaks behind MaintainView's
# Performance / Stability / Internet categories (Security stays a Pro-gated
# placeholder - no backend needed there, matches the existing UI).
#
# Each tweak is a single well-documented, reversible setting - deliberately
# NOT the long bullet list shown in the category "Show details" modal (that
# describes the aspirational full feature; this wires one concrete,
# low-risk representative tweak per category rather than half-implementing
# four different subsystems).
#
#   performance : Visual effects preset (HKCU Explorer\VisualEffects\VisualFXSetting)
#                 0 = Let Windows choose, 2 = Adjust for best performance.
#                 This is literally the registry value System Properties >
#                 Performance Options writes when you pick a preset there.
#   stability   : Automatically restart on system failure
#                 (HKLM SYSTEM\CurrentControlSet\Control\CrashControl AutoReboot)
#                 Same switch as System Properties > Startup and Recovery.
#                 Needs admin (HKLM) - reported honestly if missing.
#   internet    : TCP auto-tuning level (netsh interface tcp set global
#                 autotuninglevel). "normal" (default/on) vs "disabled" -
#                 same switch `netsh int tcp show global` reports. Admin
#                 required.
#
# Modes: status (read current state, no token needed) | apply --yes | revert --yes

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'status'
$doFire = $false
$tweakId = $null

$i = 0
while ($i -lt $args.Count) {
  switch ($args[$i]) {
    'status' { $mode = 'status' }
    'apply'  { $mode = 'apply' }
    'revert' { $mode = 'revert' }
    '--yes'  { $doFire = $true }
    '--id'   { $tweakId = $args[++$i] }
    default  { $tweakId = $args[$i] }
  }
  $i++
}

$vfxPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects'
$crashPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\CrashControl'

function Get-PerformanceState {
  $v = (Get-ItemProperty -LiteralPath $vfxPath -Name VisualFXSetting -ErrorAction SilentlyContinue).VisualFXSetting
  @{ id = 'performance'; applied = ($v -eq 2); current_value = $v }
}
function Get-StabilityState {
  $v = (Get-ItemProperty -LiteralPath $crashPath -Name AutoReboot -ErrorAction SilentlyContinue).AutoReboot
  @{ id = 'stability'; applied = ($v -eq 0); current_value = $v }  # "applied" = auto-restart disabled (diagnose crashes instead of silently rebooting)
}
function Get-InternetState {
  $out = netsh interface tcp show global 2>&1 | Out-String
  $isNormal = $out -match 'Receive-Side Scaling State\s*:\s*enabled' -and $out -match 'Add-On Congestion Control Provider\s*:\s*ctcp'
  $tuningLine = ($out -split "`n") | Where-Object { $_ -match 'Receive Window Auto-Tuning Level' }
  @{ id = 'internet'; applied = ($tuningLine -match 'normal'); current_value = ($tuningLine -replace '.*:\s*', '').Trim() }
}

if ($mode -eq 'status') {
  Emit-Line @{ event = 'item'; item = (Get-PerformanceState) }
  Emit-Line @{ event = 'item'; item = (Get-StabilityState) }
  Emit-Line @{ event = 'item'; item = (Get-InternetState) }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

if (-not $doFire) {
  Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

if (-not $tweakId) {
  Emit-Line @{ event = 'error'; reason = 'needs --id <performance|stability|internet>' }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

$applying = ($mode -eq 'apply')

try {
  switch ($tweakId) {
    'performance' {
      if (-not (Test-Path $vfxPath)) { New-Item -Path $vfxPath -Force | Out-Null }
      $vfxValue = if ($applying) { 2 } else { 0 }
      Set-ItemProperty -LiteralPath $vfxPath -Name VisualFXSetting -Value $vfxValue -Type DWord -Force -ErrorAction Stop
      Emit-Line @{ event = $mode + 'd'; id = $tweakId }
    }
    'stability' {
      $autoRebootValue = if ($applying) { 0 } else { 1 }
      Set-ItemProperty -LiteralPath $crashPath -Name AutoReboot -Value $autoRebootValue -Type DWord -Force -ErrorAction Stop
      Emit-Line @{ event = $mode + 'd'; id = $tweakId }
    }
    'internet' {
      $level = if ($applying) { 'normal' } else { 'disabled' }
      $out = netsh interface tcp set global autotuninglevel=$level 2>&1 | Out-String
      if ($out -match 'Ok') {
        Emit-Line @{ event = $mode + 'd'; id = $tweakId }
      } else {
        Emit-Line @{ event = 'error'; id = $tweakId; reason = $out.Trim() }
      }
    }
    default {
      Emit-Line @{ event = 'error'; reason = 'unknown tweak id'; id = $tweakId }
    }
  }
} catch {
  Emit-Line @{ event = 'error'; id = $tweakId; reason = $_.Exception.Message }
}

Emit-Line @{ event = 'finished'; mode = $mode }
