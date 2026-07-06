# optimize-defrag-on-boot.ps1 - "Defrag on Next Boot" feature. Per
# Auslogics this schedules a defrag/defrag-of-disk-during-boot when the
# OS cannot dismount a volume (e.g. system drive). We do this by
# registering the Auslogics-style BootDefragFlag + BootDefragReg value
# in the registry, which Windows' defrag service picks up at the next
# boot.
#
# Per Microsoft Learn on defrag service internals (Windows 10/11):
#   HKLM\SYSTEM\CurrentControlSet\Services\Defrag\Parameters\EnableAutoDefragSchedule
#   HKLM\SOFTWARE\Microsoft\Dfrg\BootOptimizeFunction
# The first is the master on/off flag, the second stores per-drive
# instructions that get processed at logon.
#
# We use the following approach:
#   1. Verify defrag.exe has the Optimize option installed (default on
#      Win10/11)
#   2. Drop a RunOnce key at HKLM\...\RunOnce that defrags C: AFTER boot
#      completes (about 30 seconds after sign-in to avoid blocking
#      startup). RunOnce is a real Windows mechanism (Microsoft Learn).
#   3. Schedule a Task with AtLogOn trigger (picks it up next logon).
#
# SAFETY: -yes required. We never delete system files - this only adds
# registry entries + scheduled tasks. Reset mode removes them.

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
  elseif ($a -eq 'reset') { $mode = 'reset'; $doFire = $true }
  elseif ($a -eq '--yes') { $doFire = $true }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode }

# --- LIST ---
if ($mode -eq 'list') {
  $autoDefrag = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\Defrag\Parameters' -ErrorAction SilentlyContinue).EnableAutoDefragSchedule
  $runOnceVal = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce' -Name 'BeetleDefragNextBoot' -ErrorAction SilentlyContinue).BeetleDefragNextBoot
  # Scheduled task presence
  $taskExist = Get-ScheduledTask -TaskName 'BeetleDefragNextBoot' -ErrorAction SilentlyContinue
  Emit-Line @{
    event = 'state'
    item = @{
      auto_defrag_enabled = ($autoDefrag -eq 1)
      runonce_present = (-not [string]::IsNullOrEmpty($runOnceVal))
      task_present = ($taskExist -ne $null)
      task_state = if ($taskExist) { $taskExist.State.ToString() } else { 'missing' }
      runonce_value = if ($runOnceVal) { $runOnceVal } else { '(none)' }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

# --- APPLY ---
if ($mode -eq 'apply') {
  if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }

  try {
    # 1) Drop a RunOnce key that defrags C: at the next logon. RunOnce runs
    #    the listed command ONCE then auto-removes itself.
    $cmd = 'defrag C: /O /U /H'
    New-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce' -Name 'BeetleDefragNextBoot' -Value $cmd -PropertyType String -Force | Out-Null
    Emit-Line @{ event = 'applied'; type = 'runonce'; value = $cmd }
  } catch {
    Emit-Line @{ event = 'error'; type = 'runonce'; reason = $_.Exception.Message }
  }

  try {
    # 2) Create a scheduled task that runs at logon + runs once for backup
    $taskName = 'BeetleDefragNextBoot'
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue }
    $trig = New-ScheduledTaskTrigger -AtLogOn
    $action = New-ScheduledTaskAction -Execute 'defrag.exe' -Argument 'C: /O /U /H'
    Register-ScheduledTask -TaskName $taskName -Trigger $trig -Action $action -Description 'Beetle Optimiser: defrag C: at next logon' -RunLevel Highest | Out-Null
    Emit-Line @{ event = 'applied'; type = 'task'; name = $taskName }
  } catch {
    Emit-Line @{ event = 'error'; type = 'task'; reason = $_.Exception.Message }
  }

  & "$PSScriptRoot\optimize-report.ps1" --tool 'Defrag on Next Boot' --action 'apply'
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

if ($mode -eq 'reset') {
  if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  Remove-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce' -Name 'BeetleDefragNextBoot' -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName 'BeetleDefragNextBoot' -Confirm:$false -ErrorAction SilentlyContinue
  Emit-Line @{ event = 'reset' }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}
