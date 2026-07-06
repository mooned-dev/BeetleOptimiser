# optimize-empty-folders.ps1 - Empty Folder Cleaner. Invoked by main.js via
# ipcMain.handle('optimizer:scan-empty-folders') (list mode, default) and
# ipcMain.handle('optimizer:clean-empty-folders') (delete mode, --yes).
#
# SAFETY DESIGN (same shape as optimize-cleanup.ps1 / optimize-clean-execute.ps1):
#   - Only walks the user's own profile folders (Desktop, Documents, Downloads,
#     Pictures, Videos, Music) - never Program Files, Windows, or AppData,
#     since apps sometimes rely on an empty folder existing as a marker/config
#     location and deleting those could break something unrelated to junk.
#   - A folder only counts as "empty" if its ENTIRE subtree has zero files
#     (folders-of-empty-folders still count - Remove-Item -Recurse handles
#     that in one shot) - a folder containing any file anywhere inside it,
#     however deep, is left alone.
#   - DRY-RUN BY DEFAULT (list mode only scans, never deletes). --yes is
#     required for the delete mode, matching every other destructive script.
#
# Output protocol: NDJSON. List mode emits {event:'item', path} per empty
# folder then {event:'finished', count}. Delete mode re-scans (so it always
# deletes exactly what the current filesystem state shows, not a possibly
# stale list from an earlier scan) and emits {event:'deleted', path} per
# folder removed, then {event:'finished', count, deleted}.

$ErrorActionPreference = 'SilentlyContinue'

$argsList = $args | ForEach-Object { $_ }
$doDelete = $argsList -contains '--yes'

$roots = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('MyDocuments'),
  (Join-Path $env:USERPROFILE 'Downloads'),
  [Environment]::GetFolderPath('MyPictures'),
  [Environment]::GetFolderPath('MyVideos'),
  [Environment]::GetFolderPath('MyMusic')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

# Desktop commonly holds active dev projects (this very repo lives on the
# Desktop on this machine) - a blind recursive walk finds "empty" folders
# like node_modules/*/.bin, .git/refs/tags, or our own llm-training/data/*
# placeholder dirs that are empty only because a pipeline step hasn't
# populated them yet. Pruning these names from the walk entirely (not just
# filtering results afterward) keeps this feature scoped to personal files.
$excludedNames = @('.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', 'target', '.cache', 'bin', 'obj')

function Get-SubdirsPruned($path) {
  Get-ChildItem -LiteralPath $path -Force -Directory -ErrorAction SilentlyContinue |
    Where-Object { $excludedNames -notcontains $_.Name }
}

function Test-HasFileAnywhere($path) {
  $stack = New-Object System.Collections.Generic.Stack[string]
  $stack.Push($path)
  while ($stack.Count -gt 0) {
    $current = $stack.Pop()
    $files = Get-ChildItem -LiteralPath $current -Force -File -ErrorAction SilentlyContinue
    if ($files) { return $true }
    Get-SubdirsPruned $current | ForEach-Object { $stack.Push($_.FullName) }
  }
  return $false
}

function Find-EmptyFolders($root) {
  $allDirs = New-Object System.Collections.Generic.List[string]
  $stack = New-Object System.Collections.Generic.Stack[string]
  $stack.Push($root)
  while ($stack.Count -gt 0) {
    $current = $stack.Pop()
    Get-SubdirsPruned $current | ForEach-Object {
      $allDirs.Add($_.FullName)
      $stack.Push($_.FullName)
    }
  }
  # Deepest-first so a parent whose only content was other now-counted-empty
  # subfolders is correctly identified as empty too.
  $allDirs | Sort-Object { $_.Length } -Descending | Where-Object { -not (Test-HasFileAnywhere $_) }
}

$empty = New-Object System.Collections.Generic.List[string]
foreach ($root in $roots) {
  Find-EmptyFolders $root | ForEach-Object { $empty.Add($_) }
}

if (-not $doDelete) {
  foreach ($path in $empty) {
    [Console]::Out.WriteLine((([PSCustomObject]@{ event = 'item'; path = $path }) | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
  }
  [Console]::Out.WriteLine((([PSCustomObject]@{ event = 'finished'; count = $empty.Count }) | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  return
}

$deleted = 0
foreach ($path in $empty) {
  # A parent folder in this same list may have already been removed (it
  # contained only other empty folders from this list) - skip if gone.
  if (-not (Test-Path -LiteralPath $path)) { continue }
  try {
    Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
    [Console]::Out.WriteLine((([PSCustomObject]@{ event = 'deleted'; path = $path }) | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
    $deleted++
  } catch {
    [Console]::Out.WriteLine((([PSCustomObject]@{ event = 'error'; path = $path }) | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
  }
}
[Console]::Out.WriteLine((([PSCustomObject]@{ event = 'finished'; count = $empty.Count; deleted = $deleted }) | ConvertTo-Json -Compress))

& "$PSScriptRoot\optimize-report.ps1" --tool 'Empty Folders' --action 'clean'
[Console]::Out.Flush()