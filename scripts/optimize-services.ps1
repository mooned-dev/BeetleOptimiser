# optimize-services.ps1 - list / disable / enable Windows services. Same
# list-disable-enable shape as optimize-startup.ps1, but services have
# native PowerShell support (Set-Service -StartupType) so no registry
# renaming trick is needed.
#
# SAFETY:
#   - 'list' is read-only.
#   - 'disable' sets StartupType to Disabled (does NOT stop a currently
#     running instance - takes effect on next boot/service restart, so an
#     accidental disable of something important doesn't immediately kill
#     a live system function).
#   - 'enable' sets StartupType back to Automatic. This is a reasonable
#     default for "undo a disable", but won't perfectly restore a service
#     that was originally Manual rather than Automatic - the renderer
#     should show the ORIGINAL startup type from the list call so the user
#     can pick the right one back if it matters.
#   - is_core flags services whose binary lives under
#     %SystemRoot%\System32 (i.e. ships with Windows itself) so the UI can
#     warn before disabling one, same spirit as the startup list flagging
#     high-impact items.
#   - disable/enable require --yes (mutate state) and an elevated process
#     (Set-Service throws access-denied otherwise, reported as an error
#     event rather than crashing).

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'list'
$doFire = $false
$targetName = $null

$i = 0
while ($i -lt $args.Count) {
  switch ($args[$i]) {
    'list'    { $mode = 'list' }
    'disable' { $mode = 'disable' }
    'enable'  { $mode = 'enable' }
    '--yes'   { $doFire = $true }
    '--name'  { $targetName = $args[++$i] }
    default   { $targetName = $args[$i] }
  }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode }

if ($mode -eq 'list') {
  $winDir = $env:SystemRoot
  Get-CimInstance Win32_Service | ForEach-Object {
    $isCore = $_.PathName -and ($_.PathName -match [regex]::Escape($winDir))
    Emit-Line @{
      event = 'item'
      item = @{
        name = $_.Name
        display_name = $_.DisplayName
        status = $_.State
        start_mode = $_.StartMode
        path = $_.PathName
        is_core = [bool]$isCore
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

if (-not $targetName) {
  Emit-Line @{ event = 'error'; reason = 'needs --name <service>' }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

try {
  if ($mode -eq 'disable') {
    Set-Service -Name $targetName -StartupType Disabled -ErrorAction Stop
    Emit-Line @{ event = 'disabled'; name = $targetName }
  } elseif ($mode -eq 'enable') {
    Set-Service -Name $targetName -StartupType Automatic -ErrorAction Stop
    Emit-Line @{ event = 'enabled'; name = $targetName }
  } else {
    Emit-Line @{ event = 'error'; reason = 'unknown mode'; mode = $mode }
  }
} catch {
  Emit-Line @{ event = 'error'; reason = $_.Exception.Message; name = $targetName }
}

Emit-Line @{ event = 'finished'; mode = $mode }
