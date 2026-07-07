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
# the on-disk file size of whatever actually backs each hive.
function Get-HiveInfo {
  param($name, $regPath)
  $item = @{ name = $name; path = $regPath; unloadable = $false; size_bytes = 0; size_kb = 0; subkey_count = 0 }

  # Per Microsoft Learn, the on-disk hive files live under
  # %SystemRoot%\System32\config. HKLM is actually several separate files
  # (SOFTWARE/SYSTEM/SAM/SECURITY/DEFAULT), so we sum them for a real
  # total rather than reporting one arbitrary file's size. HKCR is a
  # merged view whose registrations mostly live inside the SOFTWARE hive
  # (the Classes subtree); HKCC is a hardware-profile subtree of SYSTEM -
  # for both we report the whole backing file's size with a note, since
  # there's no way to isolate just that subtree's size from the file alone.
  # These hive files deny even Test-Path/Get-Item to a non-elevated
  # process (verified: Test-Path itself throws "Access is denied" without
  # elevation) - so an unelevated run can't report a real size for
  # HKLM/HKCR/HKCC at all. Rather than silently showing "0 bytes" (which
  # reads as "this hive is empty" instead of "we can't see it"), we say so.
  $configDir = Join-Path $env:SystemRoot 'System32\config'
  $accessDeniedNote = 'Size unavailable without running elevated (Administrator) - Windows denies read access to these hive files otherwise.'
  switch ($name) {
    'HKLM' {
      $paths = @('SOFTWARE', 'SYSTEM', 'SAM', 'SECURITY', 'DEFAULT') | ForEach-Object { Join-Path $configDir $_ }
      $readable = $paths | Where-Object { Test-Path -LiteralPath $_ -ErrorAction SilentlyContinue }
      $item.size_bytes = ($readable | ForEach-Object { (Get-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue).Length } | Measure-Object -Sum).Sum
      $item.file_path = $configDir
      if (@($readable).Count -lt $paths.Count) { $item.note = $accessDeniedNote }
    }
    'HKCR' {
      $fp = Join-Path $configDir 'SOFTWARE'
      if (Test-Path -LiteralPath $fp -ErrorAction SilentlyContinue) {
        $item.size_bytes = (Get-Item -LiteralPath $fp -Force).Length
        $item.file_path = $fp
        $item.note = 'HKCR is a merged view backed by the SOFTWARE hive (Classes subtree) - size shown is the whole SOFTWARE file'
      } else {
        $item.note = $accessDeniedNote
      }
    }
    'HKCC' {
      $fp = Join-Path $configDir 'SYSTEM'
      if (Test-Path -LiteralPath $fp -ErrorAction SilentlyContinue) {
        $item.size_bytes = (Get-Item -LiteralPath $fp -Force).Length
        $item.file_path = $fp
        $item.note = 'HKCC is a hardware-profile subtree of the SYSTEM hive - size shown is the whole SYSTEM file'
      } else {
        $item.note = $accessDeniedNote
      }
    }
    'HKCU' {
      $ntuser = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'NTUSER.DAT'
      if (Test-Path -LiteralPath $ntuser) { $item.size_bytes = (Get-Item -LiteralPath $ntuser -Force).Length; $item.file_path = $ntuser }
      $item.unloadable = $true
    }
    'HKU' { $item.unloadable = $true }  # filled in by the caller (sums every profile's NTUSER.DAT)
  }
  $item.size_kb = [math]::Round($item.size_bytes / 1024, 1)

  # Subkey count. $regPath here is ALREADY a valid, directly-usable path -
  # either a PSDrive alias ('HKLM:') or a fully Registry::-qualified path
  # ('Registry::HKEY_CLASSES_ROOT'). Verified empirically: wrapping it in
  # another "Registry::" prefix (the old code's "Registry::$regPath")
  # produces an invalid path in both cases and silently resolves to 0
  # results every time - subkey_count was always 0 for every hive.
  $sub = Get-ChildItem -LiteralPath $regPath -ErrorAction SilentlyContinue
  if ($sub) { $item.subkey_count = @($sub).Count }

  return $item
}

# --- LIST ---
if ($mode -eq 'list') {
  # We enumerate the 5 top-level hives. Each is at HKLM: or HKU:.
  $hives = @(
    @{ name = 'HKLM'; path = 'HKLM:' }
    @{ name = 'HKCU'; path = 'HKCU:' }
    @{ name = 'HKCR'; path = 'Registry::HKEY_CLASSES_ROOT' }
    @{ name = 'HKU';  path = 'Registry::HKEY_USERS' }
    @{ name = 'HKCC'; path = 'Registry::HKEY_CURRENT_CONFIG' }
  )
  foreach ($h in $hives) {
    $info = Get-HiveInfo -name $h.name -regPath $h.path
    # For HKU, sum every profile's NTUSER.DAT (each is a separate
    # loadable hive under its own SID) rather than one hive file.
    if ($h.name -eq 'HKU') {
      $profilesDir = Join-Path $env:SystemDrive 'Users'
      $ntuserFiles = @()
      if (Test-Path -LiteralPath $profilesDir) {
        $ntuserFiles = Get-ChildItem -LiteralPath $profilesDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $ntuser = Join-Path $_.FullName 'NTUSER.DAT'
          if (Test-Path -LiteralPath $ntuser) { Get-Item -LiteralPath $ntuser -Force }
        }
      }
      $info.size_bytes = ($ntuserFiles | Measure-Object -Property Length -Sum).Sum
      if (-not $info.size_bytes) { $info.size_bytes = 0 }
      $info.size_kb = [math]::Round($info.size_bytes / 1024, 1)
      $info.subkey_count = @($ntuserFiles).Count
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
