# optimize-rescue.ps1 - Rescue Center. Lists every backup file the app has
# written to %LOCALAPPDATA%\BeetleOptimiser\rescue\, and lets the renderer
# pull their current + backup values, plus restore the registry value.
#
# Each backup file is a small JSON written by:
#   optimize-win10.ps1   - per-tweak pre-apply snapshot
#   optimize-registry.ps1 - per-key pre-repair snapshot (call writer if needed)
#
# Output protocol: NDJSON. {event:'backup', file, tool, id, current_value,
# backup_value, ts, type} for each backup file found.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'list'

$dir = Join-Path $env:LOCALAPPDATA 'BeetleOptimiser\rescue'
if (-not (Test-Path -LiteralPath $dir)) { New-Item -Path $dir -ItemType Directory -Force | Out-Null }
foreach ($a in $args) {
  if ($a -eq 'list') { $mode = 'list' }
}

Emit-Line @{ event = 'started'; mode = $mode }

$count = 0
Get-ChildItem -LiteralPath $dir -Filter '*.json' -ErrorAction SilentlyContinue | ForEach-Object {
  $raw = Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue
  if (-not $raw) { return }
  try {
    $j = $raw | ConvertFrom-Json -ErrorAction Stop
    # The file format from optimize-win10.ps1 is:
    # { id, ts, current_value, type, path, value }
    Emit-Line @{
      event = 'backup'
      item = @{
        file = $_.Name
        file_path = $_.FullName
        tool = $j.tool
        id = $j.id
        timestamp = $j.ts
        type = $j.type
        registry_path = $j.path
        value_name = $j.value
        backup_value = if ($j.current_value -ne $null) { "$($j.current_value)" } else { '(not set)' }
      }
    }
    $count++
  } catch {}
}
Emit-Line @{ event = 'finished'; mode = $mode; count = $count }
