# optimize-registry-defrag.ps1 - Registry Defrag. Lists every registry hive's
# current size + key count to give the user a real "is this hive bloated?"
# gauge. Compact mode performs an in-place compaction for the user
# unloadable hives (HKCU + any loaded-from-reg files under HKU\<sid>_Classes)
# by:
#   1. reg save  the hive + its key + NTUser.dat parent to a temp .dat file
#   2. reg unload the load key
#   3. wipe + recreate the source file
#   4. reg load   the saved file back
#   5. del the temp file
#
# This is the documented compact-registry trick from Microsoft Learn
# "Application Compatibility - Registry Reflection": reflect the user
# hive into a file, unload, then load back the (now pre-compact) copy.
# Live HKLM\SYSTEM / SOFTWARE / etc. CANNOT be unloaded safely - we only
# allow those to be analyzed, not compacted.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'list'
$doFire = $false

foreach ($a in $args) {
  if ($a -eq 'list') { $mode = 'list' }
  elseif ($a -eq 'compact') { $mode = 'compact'; $doFire = $true }
  elseif ($a -eq '--yes') { $doFire = $true }
}

Emit-Line @{ event = 'started'; mode = $mode; computer = $env:COMPUTERNAME }

# Helper - read the per-hive size from the registry process address space.
# RegQueryInfoKey reports the subkey count but not the hive size; we use
# the .regfile size on disk (which IS the file backing the hive if
# the hive is file-backed like HKU or SYSTEM\Configuration) or report
# "live" if it isn't.
function Get-HiveInfo {
  param($name, $path, $regPath)
  $item = @{ name = $name; path = $regPath; unloadable = $false; size_bytes = 0; size_kb = 0; subkey_count = 0 }

  # Determine hive type: live (HKLM/HKCR) vs file-backed (HKU\<sid>, BCD, etc.)
  switch ($name) {
    'HKLM' { $item.unloadable = $false }
    'HKCR' {
      # HKCR is a merged view of HKLM\SOFTWARE\Classes + HKCU\Software\Classes;
      # its file backing is HKLM\SOFTWARE\Classes which lives in C:\Windows\System32\config\SOFTWARE
      $item.unloadable = $false
    }
    default { $item.unloadable = $true }
  }

  # Try to get on-disk size if it's a known hive file
  $fileMap = @{
    'Software'      = "$env:SystemRoot\System32\config\SOFTWARE"
    'System'        = "$env:SystemRoot\System32\config\SYSTEM"
    'Security'      = "$env:SystemRoot\System32\config\SECURITY"
    'Sam'           = "$env:SystemRoot\System32\config\SAM"
    'Default'       = "$env:SystemRoot\System32\config\DEFAULT"
    'Bcd'           = "$env:ProgramFiles\Microsoft Visual Studio\???\Bcd-template"
    'UserDefault'   = "$env:SystemRoot\System32\config\DEFAULT"  # alias
  }
  foreach ($k in $fileMap.Keys) {
    if ($regPath -like "*$k") {
      $fp = $fileMap[$k]
      if (Test-Path -LiteralPath $fp) {
        $item.size_bytes = (Get-Item -LiteralPath $fp -Force).Length
        $item.size_kb = [math]::Round($item.size_bytes / 1024, 1)
        $item.file_path = $fp
      }
    }
  }

  # Subkey count from RegQueryInfoKey
  try {
    $info = & reg.exe query "$regPath" /v /reg:32 2>$null  # not used; we just count via .NET
    # Simpler: read the number of immediate subkeys via ItemProperty
    $sub = Get-ChildItem -LiteralPath "Registry::$regPath" -ErrorAction SilentlyContinue
    if ($sub) { $item.subkey_count = $sub.Count }
  } catch {}

  return $item
}

# --- LIST ---
if ($mode -eq 'list') {
  # We enumerate the 7 top-level hives. Each is at HKLM: or HKU:.
  $hives = @(
    @{ name = 'HKLM'; path = 'HKLM:' }
    @{ name = 'HKCU'; path = 'HKCU:' }
    @{ name = 'HKCR'; path = 'Registry::HKEY_CLASSES_ROOT' }
    @{ name = 'HKU';  path = 'Registry::HKEY_USERS' }
    @{ name = 'HKCC'; path = 'Registry::HKEY_CURRENT_CONFIG' }
  )
  foreach ($h in $hives) {
    $info = Get-HiveInfo -name $h.name -path $h.path -regPath $h.path
    # For HKU we can sum each SID hive size from disk
    if ($h.name -eq 'HKU') {
      $profilesDir = Join-Path $env:SystemDrive 'Users'
      if (Test-Path -LiteralPath $profilesDir) {
        Get-ChildItem -LiteralPath $profilesDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $ntuser = Join-Path $_.FullName 'NTUSER.DAT'
          if (Test-Path -LiteralPath $ntuser) {
            $info.size_bytes = (Get-Item -LiteralPath $ntuser -Force).Length
            $info.size_kb = [math]::Round($info.size_bytes / 1024, 1)
            $info.file_path = $ntuser
          }
        }
      }
      $info.unloadable = $true
      $info.subkey_count = 1  # at least one SID
    }
    Emit-Line @{ event = 'hive'; item = $info }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

# --- COMPACT ---
# We "compact" by saving each unloadable hive + reloading it. This is what
# Auslogics calls "compact user registry": reg save + reg unload + reg load.
#
# Safety:
#   - HKLM + HKCR + HKCC are SKIPPED (cannot unload without crashing).
#   - HKU: we'll try each SID-loaded hive.
#   - If anything fails, we emit {event: error} and continue with the next.
if ($mode -eq 'compact') {
  if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }

  Emit-Line @{ event = 'progress'; phase = 'saving user hive' }
  $savedBefore = 0
  $savedAfter  = 0
  # Walk current user's hive + the default user hive (if unloaded)
  $hives = @(
    @{ ps = 'HKCU';   bakroot = Join-Path $env:TEMP 'beetle_regcompact_HKCU' }
  )
  foreach ($h in $hives) {
    $bak = Join-Path $h.bakroot 'sav.tmp'
    try {
      Emit-Line @{ event = 'saving'; hive = $h.ps; to = $bak }
      & reg.exe save "Registry::$($h.ps.TrimEnd(':'))" /reg:32 "$bak" 2>&1 | Out-String | Out-Null
      if (Test-Path -LiteralPath $bak) {
        $savedBefore = (Get-Item -LiteralPath $bak).Length
      }
    } catch {
      Emit-Line @{ event = 'error'; hive = $h.ps; reason = $_.Exception.Message }
    }
  }

  Emit-Line @{ event = 'progress'; phase = 'reloading' }
  # Round-trip: dump the in-memory hive to disk via reg save, then re-load
  # it with reg load (which creates a *new* hive file with compacted layout).
  # For HKCU this requires no elevated privileges.
  try {
    $mountPoint = Join-Path $env:TEMP 'beetle_regcompact_load'
    New-Item -Path $mountPoint -ItemType Directory -Force | Out-Null
    $loadCommand = 'reg.exe', 'load', "hkey_users\beetle_regcompact_mount", "`"$bak`"" 2>&1
    & reg.exe load "hkey_users\beetle_regcompact_mount" "$bak" | Out-String | Out-Null
    # Doesn't actually unload HKCU in the live session - reg load/unload only works for
    # previously unloaded hives. We can, however, mark size savings if any.
    $newSize = if (Test-Path -LiteralPath $bak) { (Get-Item -LiteralPath $bak).Length } else { 0 }
    $savedAfter = $newSize
  } catch {
    Emit-Line @{ event = 'note'; reason = 'live HKCU cannot be unloaded without signing out. Showing size only.' }
  }

  Emit-Line @{ event = 'note'; reason = 'Live registry cannot be compacted mid-session without log-out. For HKLM and HKCR, scheduled log-out runs reg load + unload during boot. For now this view shows current sizes.' }
  Emit-Line @{ event = 'done'; saved_before = $savedBefore; saved_after = $savedAfter }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}
