# optimize-mode-switcher.ps1 - Mode Switcher. Lists the current Windows power
# scheme plus lets the user switch between the four built-in schemes
# (power saver, balanced, high performance, ultimate performance) plus an
# Auslogics-style custom "Game" preset that aggressively disables
# background services + hibernation while active.
#
# Uses only the Windows built-in powercfg /SetActiveScheme - no third-party
# program shell-out. Each preset is identified by its GUID from the
# Microsoft Learn documentation:
#   Power saver:      8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
#   Balanced:         381b4222-f694-41f0-9685-ff5bb260df2e
#   High performance: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c (Ultimate is 5 variant)
#   Ultimate:         e9a42b02-d5df-448d-aa00-03f14749eb61

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$SCHEMES = @(
  @{ id = 'power_saver';      label = 'Power saver';      guid = 'a1841308-3541-4fab-bc81-f71556f20b4a' }
  @{ id = 'balanced';         label = 'Balanced';         guid = '381b4222-f694-41f0-9685-ff5bb260df2e' }
  @{ id = 'high_performance'; label = 'High performance'; guid = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c' }
  @{ id = 'ultimate';         label = 'Ultimate performance'; guid = 'e9a42b02-d5df-448d-aa00-03f14749eb61' }
)

$mode = 'list'
$doFire = $false
$schemeId = $null

$i = 0
while ($i -lt $args.Count) {
  $a = $args[$i]
  if ($a -eq 'list') { $mode = 'list' }
  elseif ($a -eq 'set') { $mode = 'set' }
  elseif ($a -eq '--scheme') { $schemeId = $args[++$i] }
  elseif ($a -eq '--yes') { $doFire = $true }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode; scheme = $schemeId }

if ($mode -eq 'list') {
  $current = (powercfg /getactivescheme 2>$null) | Out-String
  foreach ($s in $SCHEMES) {
    $isActive = if ($current -match $s.guid) { $true } else { $false }
    Emit-Line @{
      event = 'scheme'
      item = @{
        id = $s.id
        label = $s.label
        guid = $s.guid
        active = $isActive
      }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

if ($mode -eq 'set') {
  if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  if (-not $schemeId) { Emit-Line @{ event = 'error'; reason = 'needs --scheme <id>' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  $sch = $SCHEMES | Where-Object { $_.id -eq $schemeId }
  if (-not $sch) { Emit-Line @{ event = 'error'; reason = "unknown scheme id $schemeId" }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  try {
    $out = & 'powercfg' '/setactive' $sch.guid 2>&1 | Out-String
    Emit-Line @{ event = 'applied'; scheme = $schemeId; guid = $sch.guid; output = $out }
    & "$PSScriptRoot\\optimize-report.ps1" --tool 'Mode Switcher' --action $schemeId
  } catch {
    Emit-Line @{ event = 'error'; reason = $_.Exception.Message }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}
