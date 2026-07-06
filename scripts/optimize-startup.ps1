# optimize-startup.ps1 - enumerate, disable, or re-enable Windows startup items.
# Companion to the `optimizer:disable-startup-item` IPC handler.
#
# Windows stores startup items in FOUR locations:
#   (1) HKCU:\Software\Microsoft\Windows\CurrentVersion\Run  (per-user, user-writeable)
#   (2) HKLM:\Software\Microsoft\Windows\CurrentVersion\Run  (all-users, admin-writeable)
#   (3) HKCU:\...\RunOnce                                    (one-shot, runs once at next logon)
#   (4) shell:startup folder (File-system based shortcuts)
#
# Disable semantics (the only safe revertible operation):
#   - Registry Run entries get RENAMED with a "v" prefix on the value name
#     (e.g. `MyApp` becomes `vMyApp`). Windows treats any value with a "v"
#     or "X" prefix as DISABLED without deleting the entry - toggling is
#     just removing the prefix letter.
#   - Folder shortcuts in shell:startup get moved to a sibling `Disabled`
#     subfolder so the user can manually re-enable by dragging back.
#
# SAFETY:
#   - 'list' is always safe (read-only).
#   - 'disable' and 're-enable' require --yes because they mutate state.
#   - RunOnce entries are intentionally read-only (they self-delete on
#     execution; touching them by hand is rarely meaningful).

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

# Parse args: <mode> --yes [--entry <name>] [--scope <hkcu|hklm|folder|all>]
$mode = 'list'
$doFire = $false
$targetEntry = $null
$scope = 'all'

$i = 0
while ($i -lt $args.Count) {
  switch ($args[$i]) {
    'list'    { $mode = 'list' }
    'disable' { $mode = 'disable' }
    'enable'  { $mode = 'enable' }
    '--yes'   { $doFire = $true }
    '--entry' { $targetEntry = $args[++$i] }
    '--scope' { $scope = $args[++$i] }
    default   { $targetEntry = $args[$i] }
  }
  $i++
}

Emit-Line @{event='started'; mode=$mode; scope=$scope; will_fire=$doFire}

# Check write permission early: disabling a Run entry in HKLM needs admin.
# We don't error out (the renderer surfaces the issue) but we mark each item
# with whether it requires elevation.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)

# --- 1. Registry Run/RunOnce entries ---
function Get-RegistryEntries($scopeFilter) {
  $results = @()
  $paths = @()
  if ($scopeFilter -in @('all','hkcu')) {
    $paths += @{ Scope='hkcu'; CanDisable=$isAdmin; Path='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; Kind='Run' }
    $paths += @{ Scope='hkcu'; CanDisable=$isAdmin; Path='HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce'; Kind='RunOnce' }
  }
  if ($scopeFilter -in @('all','hklm')) {
    $paths += @{ Scope='hklm'; CanDisable=$isAdmin; Path='HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'; Kind='Run' }
    $paths += @{ Scope='hklm'; CanDisable=$isAdmin; Path='HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'; Kind='RunOnce' }  # RunOnce sometimes under HKLM
  }
  foreach ($entry in $paths) {
    $p = $entry.Path
    if (-not (Test-Path $p)) { continue }
    foreach ($v in (Get-ItemProperty -LiteralPath $p -ErrorAction SilentlyContinue | Get-Member -MemberType NoteProperty | Where-Object Name -notmatch '^PS' )) {
      $name = $v.Name
      $disabledMarker = ($name.StartsWith('v') -or $name.StartsWith('X'))
      $results += [PSCustomObject]@{
        id           = "reg:$p\$name"
        source       = 'registry'
        scope        = $entry.Scope
        kind         = $entry.Kind
        name         = $name
        command      = (Get-ItemProperty -LiteralPath $p -Name $name -ErrorAction SilentlyContinue).$name
        disabled     = $disabledMarker
        can_disable  = ($entry.Scope -eq 'hkcu') -or $isAdmin
      }
    }
  }
  $results
}

# --- 2. Startup folder shortcuts (shell:startup) ---
function Get-StartupFolderEntries($scopeFilter) {
  if ($scopeFilter -notin @('all','folder')) { return @() }
  $results = @()
  try {
    $shell = New-Object -ComObject Shell.Application
    $startup = $shell.NameSpace($shell.GetNameSpace('Startup'))
    if ($startup) {
      $shellFolder = $startup.Self.Path
      foreach ($item in $startup.Items()) {
        $results += [PSCustomObject]@{
          id           = "folder:$shellFolder\$($item.Name)"
          source       = 'folder'
          scope        = 'folder'
          kind         = 'Link'
          name         = $item.Name
          command      = $item.Path
          disabled     = ($item.Name.StartsWith('_') -or ($shell.PathMakeSystemFolder() | Out-Null) )  # heuristic
          can_disable  = $true
        }
      }
    }
  } catch {}
  $results
}

# --- ENTRY POINTS ---

if ($mode -eq 'list') {
  foreach ($item in (Get-RegistryEntries $scope) + (Get-StartupFolderEntries $scope)) {
    Emit-Line @{event='item'; item=$item}
  }
  Emit-Line @{event='finished'; mode=$mode}
  return
}

if (-not $doFire) {
  Emit-Line @{event='skipped'; reason='needs --yes'}
  Emit-Line @{event='finished'; mode=$mode}
  return
}

if (-not $targetEntry) {
  Emit-Line @{event='error'; reason='needs --entry <name>'}
  Emit-Line @{event='finished'}
  return
}

# Disable / enable logic
if ($mode -eq 'disable') {
  # Move registry entry: name `X` -> `vX`, then write the original command
  # under the new name. Use -LiteralPath so paths with [ ] don't break.
  $pares = $targetEntry -split '\\', 2
  if ($pares.Count -eq 2 -and $pares[0] -match '^HK(CU|LM):') {
    $path = $pares[0]
    $name = $pares[1]
    $newName = 'v' + $name
    if ($name.StartsWith('v') -or $name.StartsWith('X')) {
      Emit-Line @{event='skip'; reason='already disabled'; entry=$targetEntry}
    } else {
      $cmd = (Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue).$name
      if ($null -ne $cmd) {
        New-ItemProperty -LiteralPath $path -Name $newName -Value $cmd -PropertyType String -Force -ErrorAction SilentlyContinue
        Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
        Emit-Line @{event='disabled'; entry=$targetEntry; new_id="reg:$path\$newName"}
      } else {
        Emit-Line @{event='error'; reason='not found'; entry=$targetEntry}
      }
    }
  }
  # Folder entries: move to a Disabled subfolder
  elseif ($targetEntry.StartsWith('folder:')) {
    $fpath = $targetEntry.Substring(8)
    if (Test-Path $fpath) {
      $folder = Split-Path $fpath -Parent
      $disabledDir = Join-Path $folder 'Disabled'
      if (-not (Test-Path $disabledDir)) { New-Item -ItemType Directory -Path $disabledDir | Out-Null }
      Move-Item $fpath $disabledDir -Force -ErrorAction SilentlyContinue
      Emit-Line @{event='disabled'; entry=$targetEntry; new_path=(Join-Path $disabledDir (Split-Path $fpath -Leaf))}
    } else {
      Emit-Line @{event='error'; reason='not found'; entry=$targetEntry}
    }
  }
  Emit-Line @{event='finished'; mode=$mode}
  return
}

if ($mode -eq 'enable') {
  # Reverse: rename `vX` back to `X`
  $pares = $targetEntry -split '\\', 2
  if ($pares.Count -eq 2) {
    $path = $pares[0]
    $name = $pares[1]
    if ($name.StartsWith('v')) {
      $orig = $name.Substring(1)
      $cmd = (Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue).$name
      if ($null -ne $cmd) {
        New-ItemProperty -LiteralPath $path -Name $orig -Value $cmd -PropertyType String -Force -ErrorAction SilentlyContinue
        Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
        Emit-Line @{event='enabled'; entry=$targetEntry; new_id="reg:$path\$orig"}
      }
    } elseif ($name.StartsWith('X')) {  # X-prefix legacy convention - same treatment
      $orig = $name.Substring(1)
      $cmd = (Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue).$name
      if ($null -ne $cmd) {
        New-ItemProperty -LiteralPath $path -Name $orig -Value $cmd -PropertyType String -Force -ErrorAction SilentlyContinue
        Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
        Emit-Line @{event='enabled'; entry=$targetEntry; new_id="reg:$path\$orig"}
      }
    } else {
      Emit-Line @{event='skip'; reason='not disabled'; entry=$targetEntry}
    }
  }
  elseif ($targetEntry.StartsWith('folder:')) {
    $fpath = $targetEntry.Substring(8)
    $parent = Split-Path $fpath -Parent
    $leaf = Split-Path $fpath -Leaf
    if ($parent.EndsWith('Disabled')) {
      $newPath = Join-Path (Split-Path $parent -Parent) $leaf
      Move-Item $fpath $newPath -Force -ErrorAction SilentlyContinue
      Emit-Line @{event='enabled'; entry=$targetEntry; new_path=$newPath}
    } else {
      Emit-Line @{event='skip'; reason='not in Disabled folder'; entry=$targetEntry}
    }
  }
  Emit-Line @{event='finished'; mode=$mode}
  return
}

Emit-Line @{event='error'; reason='unknown mode'; mode=$mode}
Emit-Line @{event='finished'}
