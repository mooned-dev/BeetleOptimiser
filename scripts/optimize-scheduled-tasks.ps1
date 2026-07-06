# optimize-scheduled-tasks.ps1 - list / disable / enable Windows scheduled
# tasks. Same list-disable-enable shape as optimize-services.ps1, using the
# built-in ScheduledTasks module (Get/Enable/Disable-ScheduledTask).
#
# SAFETY:
#   - 'list' is read-only.
#   - Only tasks OUTSIDE \Microsoft\Windows\ are listed by default (that
#     tree is enormous - typically 500+ entries - and almost entirely
#     Windows-internal maintenance tasks most users have no reason to
#     touch). Pass --all to include them anyway.
#   - disable/enable require --yes + an elevated process for tasks that
#     aren't owned by the current user.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'list'
$doFire = $false
$targetPath = $null
$targetName = $null
$includeAll = $args -contains '--all'
$createName = $null
$createTrigger = $null
$createCommand = $null
$createArgs = $null

$i = 0
while ($i -lt $args.Count) {
  switch ($args[$i]) {
    'list'    { $mode = 'list' }
    'disable' { $mode = 'disable' }
    'enable'  { $mode = 'enable' }
    'create'  { $mode = 'create' }
    'delete'  { $mode = 'delete' }
    '--yes'   { $doFire = $true }
    '--path'  { $targetPath = $args[++$i] }
    '--name'  { $targetName = $args[++$i] }
    '--all'   { }
    '--taskname' { $createName = $args[++$i] }
    '--trigger' { $createTrigger = $args[++$i] }
    '--command' { $createCommand = $args[++$i] }
    '--cargs' { $createArgs = $args[++$i] }
    default   { }
  }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode }

if ($mode -eq 'list') {
  Get-ScheduledTask | ForEach-Object {
    if (-not $includeAll -and $_.TaskPath -like '\Microsoft\Windows\*') { return }
    $info = $_ | Get-ScheduledTaskInfo -ErrorAction SilentlyContinue
    Emit-Line @{
      event = 'item'
      item = @{
        name = $_.TaskName
        path = $_.TaskPath
        state = "$($_.State)"
        author = $_.Principal.UserId
        last_run = if ($info -and $info.LastRunTime) { $info.LastRunTime.ToString('o') } else { $null }
        next_run = if ($info -and $info.NextRunTime) { $info.NextRunTime.ToString('o') } else { $null }
      }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

if (-not $doFire) {
  Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

try {
  if ($mode -eq 'disable') {
    if (-not $targetPath -or -not $targetName) { throw 'needs --path <taskpath> --name <taskname>' }
    Disable-ScheduledTask -TaskPath $targetPath -TaskName $targetName -ErrorAction Stop | Out-Null
    Emit-Line @{ event = 'disabled'; name = $targetName; path = $targetPath }
  } elseif ($mode -eq 'enable') {
    if (-not $targetPath -or -not $targetName) { throw 'needs --path <taskpath> --name <taskname>' }
    Enable-ScheduledTask -TaskPath $targetPath -TaskName $targetName -ErrorAction Stop | Out-Null
    Emit-Line @{ event = 'enabled'; name = $targetName; path = $targetPath }
  } elseif ($mode -eq 'create') {
    if (-not $createName -or -not $createCommand) { throw 'needs --taskname <name> --command <exe path> [--trigger daily|weekly|hourly|onlogon] [--cargs <args>]' }
    # Build trigger based on --trigger
    $trigObj = switch ($createTrigger) {
      'daily'   { New-ScheduledTaskTrigger -Daily -At '00:00' }
      'weekly'  { New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '00:00' }
      'hourly'  { New-ScheduledTaskTrigger -Once -At (Get-Date).AddHours(1) }
      'onlogon' { New-ScheduledTaskTrigger -AtLogOn }
      default   { New-ScheduledTaskTrigger -Daily -At '00:00' }
    }
    $action = New-ScheduledTaskAction -Execute $createCommand -Argument $createArgs
    Register-ScheduledTask -TaskName $createName -Trigger $trigObj -Action $action -Description 'Created by Beetle Optimiser' | Out-Null
    Emit-Line @{ event = 'created'; name = $createName; trigger = $createTrigger; command = $createCommand }
  } elseif ($mode -eq 'delete') {
    if (-not $targetPath -or -not $targetName) { throw 'needs --path <taskpath> --name <taskname>' }
    Unregister-ScheduledTask -TaskPath $targetPath -TaskName $targetName -Confirm:$false -ErrorAction Stop
    Emit-Line @{ event = 'deleted'; name = $targetName; path = $targetPath }
  } else {
    Emit-Line @{ event = 'error'; reason = 'unknown mode'; mode = $mode }
  }
} catch {
  Emit-Line @{ event = 'error'; reason = $_.Exception.Message; name = $targetName }
}

Emit-Line @{ event = 'finished'; mode = $mode }
