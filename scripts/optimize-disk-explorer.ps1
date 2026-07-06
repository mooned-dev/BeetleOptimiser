# optimize-disk-explorer.ps1 - Disk Explorer. Walks user-profile folders to
# compute per-top-level-folder sizes, then sorts largest-first. The renderer
# uses this to draw a folder-size breakdown for "Big files on your drive".
#
# READ-ONLY. Pure directory enumeration - never deletes.
#
# Safety: only walks the user's own profile folders (same scoped roots as
# optimize-empty-folders.ps1). Dev artifact dirs (node_modules/.git/bin/obj)
# are pruned from the walk.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

Emit-Line @{ event = 'started' }

# Scoped roots - same as empty-folders + duplicates
$roots = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('MyDocuments'),
  (Join-Path $env:USERPROFILE 'Downloads'),
  [Environment]::GetFolderPath('MyPictures'),
  [Environment]::GetFolderPath('MyVideos'),
  [Environment]::GetFolderPath('MyMusic')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

# Per-root: enumerate top-level entries (depth 1), aggregate per-child sizes.
# We DO NOT recurse into bin/obj/node_modules/.git (dev-artifact exclusion) -
# otherwise a single project can dominate the report.
$excludedNames = @('.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', 'target', '.cache', 'bin', 'obj')

function Get-DirSize($path) {
  $size = 0L
  $files = 0L
  $stack = New-Object System.Collections.Generic.Stack[string]
  $stack.Push($path)
  while ($stack.Count -gt 0) {
    $current = $stack.Pop()
    try {
      $dirFiles = Get-ChildItem -LiteralPath $current -Force -File -ErrorAction SilentlyContinue
      foreach ($f in $dirFiles) { $size += $f.Length; $files++ }
      $dirs = Get-ChildItem -LiteralPath $current -Force -Directory -ErrorAction SilentlyContinue |
        Where-Object { $excludedNames -notcontains $_.Name }
      foreach ($d in $dirs) { $stack.Push($d.FullName) }
    } catch {}
  }
  return @{ bytes = $size; files = $files }
}

$results = @()
foreach ($root in $roots) {
  $topLevelDirs = Get-ChildItem -LiteralPath $root -Force -Directory -ErrorAction SilentlyContinue |
    Where-Object { $excludedNames -notcontains $_.Name }
  foreach ($d in $topLevelDirs) {
    $stats = Get-DirSize $d.FullName
    Emit-Line @{
      event = 'folder'
      item = @{
        path = $d.FullName
        parent = $root
        bytes = $stats.bytes
        files = $stats.files
        name = $d.Name
      }
    }
  }
}

Emit-Line @{ event = 'finished'; roots = $roots.Count }
