# optimize-disk-priority.ps1 - Disk Priority Manager. Per Auslogics this
# tunes Windows' IO priority categorization via the multimedia system
# profile's Task subgroup disk IO priority values + Game/Pro Audio
# "Priority" DWord. Reads current values across all 3 PowerCfg schedule
# profiles + sets a recommended low-latency variant. Honestly just a
# tuning tool - it doesn't apply antivirus IS / GL style priority changes.
#
# Per Microsoft Learn on NtfsDisableLastAccessUpdate + Schedule.Tasks:
#   - HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\HighPerformance
#   - HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games
#   - HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Pro Audio
# each contain:
#   "Priority"   (1 = low, 2 = normal, 3 = high - Win32 priority per thread pool)
#   "GPU Priority"  (0-7)
#   "SFIO Priority" (system file IO priority)
# The "applied_value" set shifts every "Priority" to 2 (normal) and GPU
# priority to 7 so CPU spends more of its time on the foreground app
# instead of background services.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$PROFILES = @(
  @{ name = 'HighPerformance'; path = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\HighPerformance' }
  @{ name = 'Games';           path = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games' }
  @{ name = 'Pro Audio';       path = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Pro Audio' }
)

$mode = 'list'
$doFire = $false

$i = 0
while ($i -lt $args.Count) {
  $a = $args[$i]
  if ($a -eq 'list')   { $mode = 'list' }
  elseif ($a -eq 'apply') { $mode = 'apply'; $doFire = $true }
  elseif ($a -eq 'reset') { $mode = 'reset'; $doFire = $true }
  elseif ($a -eq '--yes')  { $doFire = $true }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode }

# --- LIST ---
if ($mode -eq 'list') {
  foreach ($p in $PROFILES) {
    if (-not (Test-Path -LiteralPath $p.path)) {
      Emit-Line @{ event = 'profile'; item = @{ name = $p.name; path = $p.path; installed = $false } }
      continue
    }
    $priority = (Get-ItemProperty -LiteralPath $p.path -Name 'Priority' -ErrorAction SilentlyContinue).Priority
    $gpu      = (Get-ItemProperty -LiteralPath $p.path -Name 'GPU Priority' -ErrorAction SilentlyContinue).'GPU Priority'
    $sfio     = (Get-ItemProperty -LiteralPath $p.path -Name 'SFIO Priority' -ErrorAction SilentlyContinue).'SFIO Priority'
    Emit-Line @{
      event = 'profile'
      item = @{
        name = $p.name
        path = $p.path
        priority = if ($null -ne $priority) { [int]$priority } else { '(not set)' }
        gpu_priority = if ($null -ne $gpu) { [int]$gpu } else { '(not set)' }
        sfio_priority = if ($null -ne $sfio) { [int]$sfio } else { '(not set)' }
      }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

# --- APPLY ---
if ($mode -eq 'apply') {
  if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  foreach ($p in $PROFILES) {
    if (-not (Test-Path -LiteralPath $p.path)) { continue }
    try {
      Set-ItemProperty -LiteralPath $p.path -Name 'Priority' -Value 2 -Type DWord -Force -ErrorAction Stop
      Set-ItemProperty -LiteralPath $p.path -Name 'GPU Priority' -Value 7 -Type DWord -Force -ErrorAction Stop
      Set-ItemProperty -LiteralPath $p.path -Name 'SFIO Priority' -Value 1 -Type DWord -Force -ErrorAction Stop
      Emit-Line @{ event = 'applied'; profile = $p.name }
    } catch {
      Emit-Line @{ event = 'error'; profile = $p.name; reason = $_.Exception.Message }
    }
  }
  Emit-Line @{ event = 'note'; reason = 'Re-sign in to apply - the multimedia system profile is read at sign-in.' }
  & "$PSScriptRoot\optimize-report.ps1" --tool 'Disk Priority' --action 'apply'
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

if ($mode -eq 'reset') {
  if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  foreach ($p in $PROFILES) {
    if (-not (Test-Path -LiteralPath $p.path)) { continue }
    try {
      Remove-ItemProperty -LiteralPath $p.path -Name 'Priority' -Force -ErrorAction SilentlyContinue
      Remove-ItemProperty -LiteralPath $p.path -Name 'GPU Priority' -Force -ErrorAction SilentlyContinue
      Remove-ItemProperty -LiteralPath $p.path -Name 'SFIO Priority' -Force -ErrorAction SilentlyContinue
      Emit-Line @{ event = 'reset'; profile = $p.name }
    } catch {}
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}
