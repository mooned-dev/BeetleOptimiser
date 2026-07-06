# optimize-clean-execute.ps1 - the "DELETE" half of cleanup. Companion to
# optimize-cleanup.ps1 (the scan-only half). Invoked by main.js via
# ipcMain.handle('optimizer:clean-junk') in response to the renderer's
# window.beetleAPI.optimizer.cleanJunkFiles() call.
#
# SAFETY DESIGN:
#   - DRY-RUN BY DEFAULT. Pass --yes to perform real deletions. This protects
#     against the 2026-07-05 incident where a verification run accidentally
#     wiped 5.8 GB of temp files instead of just emitting NDJSON.
#   - Per-category try/catch: one failed dir doesn't kill the rest.
#   - -recycle is opt-in (Recycle Bin emptying is destructive beyond the
#     usual "junk" surface area, so the default safe set excludes it).
#   - Never deletes from a path that's not on the hard-coded allowlist of
#     well-known safe roots enumerated below.
#
# Output protocol: NDJSON with 'started' / 'category' / 'finished' events
# (and 'skipped' for dry-run). main.js wraps this in spawnOptimizer and
# resolves a single promise when 'finished' is observed.

$ErrorActionPreference = 'SilentlyContinue'

$argsList = $args | ForEach-Object { $_ }

# --dry-run: emit status only, do not delete. This is the DEFAULT.
# --yes:     perform real deletions.
$doDelete = $argsList -contains '--yes'

# Default category set. 'recycle' is NOT in the default - opt in with -recycle.
$defaultCats = @('user-temp','system-temp','prefetch','thumbcache','windows-update','wer','edge-cache')
if ($argsList -contains '-recycle') { $defaultCats += 'recycle' }

$mode = if ($doDelete) { 'delete' } else { 'dry-run' }

[Console]::Out.WriteLine((([PSCustomObject]@{ event='started'; mode=$mode; categories=$defaultCats }) | ConvertTo-Json -Compress))
[Console]::Out.Flush()

function Get-PathFor($id) {
  switch ($id) {
    'user-temp'         { return $env:TEMP }
    'system-temp'       { return (Join-Path $env:SystemRoot 'Temp') }
    'prefetch'          { return (Join-Path $env:SystemRoot 'Prefetch') }
    'thumbcache'        { return (Join-Path $env:APPDATA 'Microsoft\Windows\Explorer') }
    'windows-update'    { return (Join-Path $env:SystemRoot 'SoftwareDistribution\Download') }
    'wer'               { return (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\WER') }
    'edge-cache'        { return (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data\Default\Cache') }
    'recycle'           { return '$RECYCLE.BIN' }
    default             { return $null }
  }
}

function Emit-Progress($id, $status, $files, $bytes, [long]$freedBytes = 0) {
  $obj = [PSCustomObject]@{
    event = 'category'; id = $id; status = $status; files = $files; bytes = $bytes
  }
  if ($freedBytes -gt 0) { $obj | Add-Member -NotePropertyName 'freed_bytes' -NotePropertyValue $freedBytes }
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$totalFreed = 0L

foreach ($id in $defaultCats) {
  $path = Get-PathFor $id
  if (-not $path) {
    Emit-Progress $id 'skipped' 0 0
    continue
  }

  # Recycle bin special case - COM API to empty. In dry-run mode, just count.
  if ($id -eq 'recycle') {
    try {
      $shell = New-Object -ComObject Shell.Application
      $recycleBin = $shell.NameSpace(0xA)
      $itemCount = ($recycleBin.Items() | Measure-Object).Count
      if ($doDelete) {
        $recycleBin.Items() | ForEach-Object { Remove-Item -LiteralPath $_.Path -Recurse -Force -ErrorAction SilentlyContinue }
        Emit-Progress $id 'cleaned' $itemCount 0 $itemCount
        $totalFreed += $itemCount
      } else {
        Emit-Progress $id 'skipped' $itemCount 0
      }
    } catch {
      Emit-Progress $id 'error' 0 0
    }
    continue
  }

  if (-not (Test-Path -LiteralPath $path)) {
    Emit-Progress $id 'missing' 0 0
    continue
  }

  # Pre-count files (always, even in dry-run, so the renderer can show
  # "if you confirm, X files / Y bytes would be deleted").
  $filesBefore = 0
  Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue |
    ForEach-Object { $filesBefore++ }
  $bytesBefore = 0L
  Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue |
    ForEach-Object { $bytesBefore += $_.Length }

  if ($doDelete) {
    Emit-Progress $id 'cleaning' $filesBefore $bytesBefore

    $remainingBytes = 0L
    $remainingFiles = 0
    try {
      Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue |
        Where-Object { -not $_.PSIsContainer } |
        ForEach-Object {
          try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }
          catch { $remainingFiles++; $remainingBytes += $_.Length }
        }
    } catch {}
    $freed = $bytesBefore - $remainingBytes
    Emit-Progress $id 'cleaned' ($filesBefore - $remainingFiles) ($bytesBefore - $remainingBytes) $freed
    $totalFreed += $freed
  } else {
    Emit-Progress $id 'skipped' $filesBefore $bytesBefore
  }
}

[Console]::Out.WriteLine((([PSCustomObject]@{ event='finished'; mode=$mode; total_freed_bytes=$totalFreed }) | ConvertTo-Json -Compress))
[Console]::Out.Flush()

# Audit log - written only after the main 'finished' so the renderer knows
# the operation completed before it reads the audit log.
& "$PSScriptRoot\optimize-report.ps1" --tool 'Clean Up' --action 'clean' --files 0 --bytes $totalFreed --note 'junk cleanup'
