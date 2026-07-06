# optimize-registry.ps1 - enumerate and fix orphan entries in well-known
# Windows registry locations. Companion to the scan-repair / repair IPC
# handlers.
#
# SCOPE - the only categories we touch (kept narrow on purpose):
#   1. App Paths (HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths)
#   2. App Paths (HKCU equivalent) - mirrors above for per-user
#
# Both are App Paths keys whose (Default) value points to a file that
# no longer exists. App Paths are the canonical "where is the EXE for
# this file extension / app" registry and breaking one of them only
# affects Process.Start() resolution for non-PATH apps. Deleting a
# dead App Path key is the documented recovery for "this file no
# longer exists" errors and is safe.
#
# Specifically DELETED from scope (too noisy / risky on modern Win10/11):
#   - HKCR\...\shell\Open\Command orphan checks (could break legit apps that
#     haven't been launched in years but still update their handler keys)
#   - HKCR\TypeLib orphan checks (deleting a typelib breaks COM apps)
#   - COM CLSID orphan checks (deleting the wrong CLSID breaks Explorer)
#   - SharedDLLs orphan checks (mostly empty on modern Windows, false positives)
#   - Help-file (.chm) orphan checks (UserAssist-style keys are legit empty)
#   - Any "Invalid file association" / .ext mapping fix (Windows Repair
#     defaults handle these and touching them causes more harm than good)
#
# SAFETY:
#   - 'list' is always safe (read-only)
#   - 'fix' is destructive (deletes orphan keys) and requires --yes
#
# REFERENCE: Microsoft Learn on App Paths at
# https://learn.microsoft.com/en-us/windows/win32/shell/app-registration

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'list'
$doFire = $false
$targetId = $null
foreach ($a in $args) {
  switch ($a) {
    'list'    { $mode = 'list' }
    'fix'     { $mode = 'fix' }
    '--yes'   { $doFire = $true }
    '--id'    { $targetId = $args[++$script:i] }  # set after scriptblock fix below
    default   { if (-not $targetId) { $targetId = $a } }
  }
}

# Simpler arg parser: re-think after $args[++$script:i] doesn't work in foreach.
$mode = 'list'; $doFire = $false; $targetId = $null
$argList = @($args)
for ($i = 0; $i -lt $argList.Count; $i++) {
  switch ($argList[$i]) {
    'list'  { $mode = 'list' }
    'fix'   { $mode = 'fix' }
    '--yes' { $doFire = $true }
    '--id'  { $i++; $targetId = $argList[$i] }
    default { if (-not $targetId) { $targetId = $argList[$i] } }
  }
}

Emit-Line @{event='started'; mode=$mode; will_fire=$doFire; target=$targetId}

# --- Scan App Paths for orphan (Default) values ---
function Get-AppPathIssues($hiveRoot, $scopeLabel) {
  $issues = @()
  if (-not (Test-Path $hiveRoot)) { return $issues }
  Get-ChildItem -LiteralPath $hiveRoot -ErrorAction SilentlyContinue | ForEach-Object {
    $key = $_
    $defaultVal = ($key | Get-ItemProperty -Name '(Default)' -ErrorAction SilentlyContinue).'(Default)'
    if (-not $defaultVal) { return }
    $targetPath = $defaultVal.Trim('"')
    try {
      if (-not (Test-Path -LiteralPath $targetPath -ErrorAction SilentlyContinue)) {
        $issues += [PSCustomObject]@{
          id           = "apppath:$($key.Name)"
          scope        = $scopeLabel
          category     = 'orphan-app-path'
          key_path     = $key.Name
          missing_file = $targetPath
          severity     = 'low'
        }
      }
    } catch {}
  }
  $issues
}

# Emit each issue as an `item` event in list mode.
if ($mode -eq 'list') {
  foreach ($scope in @(@{Path='HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths'; Label='hklm'},
                       @{Path='HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths'; Label='hkcu'})) {
    foreach ($issue in (Get-AppPathIssues $scope.Path $scope.Label)) {
      Emit-Line @{event='item'; item=$issue}
    }
  }
  Emit-Line @{event='finished'; mode=$mode}
  return
}

# Fix mode requires --yes. Without it, refuse.
if (-not $doFire) {
  Emit-Line @{event='skipped'; reason='needs --yes'}
  Emit-Line @{event='finished'; mode=$mode}
  return
}

# Either delete the specific id the renderer requested, or do all.
if (-not $targetId -or $targetId -eq 'all') {
  # Iterate again, delete matches.
  $deleted = 0
  foreach ($scope in @(@{Path='HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths'; Label='hklm'},
                       @{Path='HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths'; Label='hkcu'})) {
    foreach ($issue in (Get-AppPathIssues $scope.Path $scope.Label)) {
      if (Remove-Item -LiteralPath $issue.key_path -Recurse -Force -ErrorAction SilentlyContinue) {
        $deleted++
        Emit-Line @{event='fixed'; item=$issue}
      } else {
        Emit-Line @{event='error'; reason='cannot delete'; item=$issue}
      }
    }
  }
  Emit-Line @{event='finished'; fixed=$deleted}
  return
}

# Single-id mode.
if ($targetId.StartsWith('apppath:')) {
  # The id format is "apppath:HKLM:\Software\...\App Paths\<subkey>" - we have
  # to recover the key path by stripping the "apppath:" prefix.
  $keyPath = $targetId.Substring(8)  # skip "apppath:"
  # But because Windows sometimes normalizes HKCU\ vs HKEY_CURRENT_USER\, try
  # both forms.
  $candidates = @($keyPath)
  # Resolve the registry path in case the renderer sent a normalized form.
  $resolved = (Get-Item -LiteralPath $keyPath -ErrorAction SilentlyContinue).PSPath
  if ($resolved) { $candidates = @($resolved) }

  $removed = $false
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) {
      Remove-Item -LiteralPath $c -Recurse -Force -ErrorAction SilentlyContinue
      $removed = $true
      break
    }
  }
  Emit-Line @{event=if ($removed) {'fixed'} else {'error'}; id=$targetId}
  Emit-Line @{event='finished'; mode=$mode}
  return
}

Emit-Line @{event='error'; reason='unsupported id'; id=$targetId}
Emit-Line @{event='finished'; mode=$mode}
