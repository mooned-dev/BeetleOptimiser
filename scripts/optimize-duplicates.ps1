# optimize-duplicates.ps1 - Duplicates Finder. Companion to the
# optimizer:scan-duplicates / optimizer:delete-duplicates IPC handlers.
#
# APPROACH (kept fast on a real user folder tree):
#   1. Enumerate files under the user's own profile folders only (same
#      scope + same dev-artifact exclusions as optimize-empty-folders.ps1 -
#      node_modules/.git/bin/obj etc. pruned, otherwise a dev machine's
#      Desktop floods the results with meaningless "duplicate" files from
#      build output or vendored dependencies).
#   2. Group by file SIZE first - two files can only be byte-identical if
#      they're the same size, so this cheaply throws out the vast majority
#      of files (anything with a size no other file shares) before the
#      expensive part.
#   3. Only files that share a size with at least one sibling get SHA-256
#      hashed. Group by hash; any group with more than one file is a real
#      duplicate set.
#   4. Files smaller than 1 KB are skipped by default (empty/near-empty
#      files "duplicate" each other constantly and aren't worth reporting).
#
# NOTE: like any file scanner, this is a point-in-time snapshot, not a
# transactionally-consistent one - if a file is being actively written by
# another process between the size pass and the hash pass, it can drop out
# of a duplicate set it would otherwise have matched. This only matters on
# a system with heavy concurrent disk writes in the scanned folders.
#
# SAFETY:
#   - 'scan' only reports (read-only).
#   - 'delete' takes explicit file paths (from the renderer, which only
#     ever gets them from a scan result the user reviewed) - same
#     no-wildcards principle as the shredder script. Requires --yes.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = if ($args -contains '--delete') { 'delete' } else { 'scan' }
$doFire = $args -contains '--yes'
$deletePaths = @()
if ($mode -eq 'delete') {
  $deletePaths = $args | Where-Object { $_ -ne '--delete' -and $_ -ne '--yes' }
}

if ($mode -eq 'delete') {
  Emit-Line @{ event = 'started'; mode = $mode; count = $deletePaths.Count }
  if (-not $doFire) {
    Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }
    Emit-Line @{ event = 'finished'; mode = $mode; deleted = 0 }
    return
  }
  $deleted = 0
  foreach ($path in $deletePaths) {
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      try {
        Remove-Item -LiteralPath $path -Force -ErrorAction Stop
        Emit-Line @{ event = 'deleted'; path = $path }
        $deleted++
      } catch {
        Emit-Line @{ event = 'error'; path = $path; reason = $_.Exception.Message }
      }
    } else {
      Emit-Line @{ event = 'error'; path = $path; reason = 'not a file or does not exist' }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode; deleted = $deleted }
  return
}

# --- scan mode ---
Emit-Line @{ event = 'started'; mode = $mode }

$roots = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('MyDocuments'),
  (Join-Path $env:USERPROFILE 'Downloads'),
  [Environment]::GetFolderPath('MyPictures'),
  [Environment]::GetFolderPath('MyVideos'),
  [Environment]::GetFolderPath('MyMusic')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

$excludedNames = @('.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', 'target', '.cache', 'bin', 'obj')
$minSizeBytes = 1KB

function Get-FilesPruned($root) {
  $stack = New-Object System.Collections.Generic.Stack[string]
  $stack.Push($root)
  while ($stack.Count -gt 0) {
    $current = $stack.Pop()
    Get-ChildItem -LiteralPath $current -Force -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Length -ge $minSizeBytes } | ForEach-Object { $_ }
    Get-ChildItem -LiteralPath $current -Force -Directory -ErrorAction SilentlyContinue |
      Where-Object { $excludedNames -notcontains $_.Name } |
      ForEach-Object { $stack.Push($_.FullName) }
  }
}

$allFiles = New-Object System.Collections.Generic.List[object]
foreach ($root in $roots) {
  Get-FilesPruned $root | ForEach-Object { $allFiles.Add($_) }
}

$bySize = $allFiles | Group-Object Length | Where-Object { $_.Count -gt 1 }

$dupGroups = 0
$dupFiles = 0
$reclaimableBytes = 0L

foreach ($sizeGroup in $bySize) {
  $byHash = $sizeGroup.Group | ForEach-Object {
    [PSCustomObject]@{ Path = $_.FullName; Size = $_.Length; Hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash }
  } | Where-Object { $_.Hash } | Group-Object Hash | Where-Object { $_.Count -gt 1 }

  foreach ($hashGroup in $byHash) {
    $dupGroups++
    $files = $hashGroup.Group | ForEach-Object { @{ path = $_.Path; size = $_.Size } }
    $dupFiles += $files.Count
    $reclaimableBytes += ($hashGroup.Group[0].Size * ($hashGroup.Group.Count - 1))
    Emit-Line @{ event = 'group'; hash = $hashGroup.Name; files = $files }
  }
}

Emit-Line @{ event = 'finished'; mode = $mode; groups = $dupGroups; files = $dupFiles; reclaimable_bytes = $reclaimableBytes }

& "$PSScriptRoot\optimize-report.ps1" --tool 'Duplicates' --action 'delete'