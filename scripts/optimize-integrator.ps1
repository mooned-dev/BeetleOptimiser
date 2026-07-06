# optimize-integrator.ps1 - Integrator. Adds/removes the "Defragment this
# drive" right-click entries to Windows Explorer's drive context menu, so
# the user can right-click any drive in Explorer and run our defrag
# directly. Mirror: also adds/removes "Scan for junk with Beetle" on the
# folder background.
#
# Per Microsoft Learn shell extension docs, right-click entries live
# under HKCR\*\shell\<verb>\command (or HKCR\Drive\shell\... for
# drive-specific verbs). The verb's command line is the COMMAND LINE
# INVOKED when the user right-clicks. We use the running install's
# portable EXE absolute path so it's correct regardless of where the
# app is installed.
#
# SAFETY: read-only + register-only. Does not invoke anything harmful
# even if shell verbs get re-used later by another tool.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

# Locate the running install
$executable = Join-Path $env:USERPROFILE 'AppData\Local\BeetleOptimiser\BeetleOptimiser.exe'
$isInstalled = Test-Path -LiteralPath $executable

$ENTRIES = @(
  @{ id = 'defrag_drive';     target = 'HKCR:Drive\shell';                          verb = 'beetleDefrag';        label = 'Defragment this drive';     icon = 'imageres.dll,-1018' },
  @{ id = 'scan_junk_folder'; target = 'HKCR:Directory\Background\shell';           verb = 'beetleScanJunk';     label = 'Scan for junk with Beetle';  icon = 'imageres.dll,-1018' },
  @{ id = 'clean_recycle';    target = 'HKCR:\Directory\shellex\ContextMenuHandlers'; verb = '{645FF040-5081-101B-9F08-00AA002F954E}'; label = 'Empty Recycle Bin (cmd)' ; isCom = $true }
)

$mode = 'list'
$doFire = $false
$action = $null  # 'add' | 'remove'

$i = 0
while ($i -lt $args.Count) {
  $a = $args[$i]
  if ($a -eq 'list') { $mode = 'list' }
  elseif ($a -eq 'add') { $mode = 'add'; $doFire = $true }
  elseif ($a -eq 'remove') { $mode = 'remove'; $doFire = $true }
  elseif ($a -eq '--entry') { $action = $args[++$i] }
  elseif ($a -eq '--yes') { $doFire = $true }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode; installed = $isInstalled }

# --- LIST ---
if ($mode -eq 'list') {
  foreach ($e in $ENTRIES) {
    $path = Join-Path $e.target ($e.verb -replace '[{}]', '')
    $exists = Test-Path -LiteralPath $path
    Emit-Line @{
      event = 'entry'
      item = @{
        id = $e.id
        label = $e.label
        target_path = $path
        installed = $exists
      }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

# --- ADD or REMOVE ---
if ($mode -in @('add', 'remove')) {
  if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  if (-not $action) { Emit-Line @{ event = 'skipped'; reason = 'needs --entry <id>' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }

  $e = $ENTRIES | Where-Object { $_.id -eq $action }
  if (-not $e) { Emit-Line @{ event = 'error'; reason = "unknown entry id $action" }; Emit-Line @{ event = 'finished'; mode = $mode }; return }

  $verb = $e.verb -replace '[{}]', ''
  $path = Join-Path $e.target $verb

  if ($mode -eq 'remove') {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
      Emit-Line @{ event = 'removed'; id = $action }
    } else {
      Emit-Line @{ event = 'noop'; reason = 'not present' }
    }
    & "$PSScriptRoot\\optimize-report.ps1" --tool 'Integrator' --action 'remove' --note $action
    Emit-Line @{ event = 'finished'; mode = $mode }
    return
  }

  # ADD
  try {
    if ($e.isCom) {
      # Com-based extension handler: just write the CLSID string at the
      # default value of the key - the OS resolves the COM object on demand.
      if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
      Set-ItemProperty -LiteralPath $path -Name '(default)' -Value $e.verb -ErrorAction Stop
    } else {
      # Standard Shell verb with an icon + command line
      if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
      $cmdPath = Join-Path $path 'command'
      if (-not (Test-Path -LiteralPath $cmdPath)) { New-Item -Path $cmdPath -Force | Out-Null }
      if ($executable) { Set-ItemProperty -LiteralPath $path -Name 'Icon' -Value $executable -ErrorAction Stop }
      $cmdLine = '"' + $executable + '" "' + $e.id + '" "%V"'
      Set-ItemProperty -LiteralPath $cmdPath -Name '(default)' -Value $cmdLine -ErrorAction Stop
    }
    Emit-Line @{ event = 'added'; id = $action; path = $path }
    & "$PSScriptRoot\\optimize-report.ps1" --tool 'Integrator' --action 'add' --note $action
  } catch {
    Emit-Line @{ event = 'error'; reason = $_.Exception.Message }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}
