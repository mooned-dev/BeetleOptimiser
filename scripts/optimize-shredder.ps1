# optimize-shredder.ps1 - File Shredder. Overwrites each given file with
# random data (3 passes) before deleting it, so the original content isn't
# trivially recoverable from an un-overwritten disk sector the way a normal
# delete leaves it.
#
# SAFETY:
#   - Takes an explicit list of file paths as arguments - NO wildcards, NO
#     folder recursion, NO "shred everything in X". The renderer only ever
#     gets paths from the user's own native file-picker dialog
#     (dialog.showOpenDialog in main.js), so there's no way to shred a
#     folder's contents in one accidental click.
#   - Requires --yes (this is inherently irreversible - unlike the other
#     "safe by default" scripts, there is no non-destructive default mode
#     for a shredder, so main.js's IPC handler is confirm-gated directly,
#     not split into separate scan/execute calls).
#   - Skips (does not touch) any path that isn't an existing regular file,
#     rather than erroring the whole batch out.
#
# Output protocol: NDJSON. {event:'shredding', path} before each file,
# {event:'shredded', path} or {event:'error', path, reason} after, then
# {event:'finished', count, shredded}.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$doFire = $args -contains '--yes'
$paths = $args | Where-Object { $_ -ne '--yes' }

Emit-Line @{ event = 'started'; count = $paths.Count; will_fire = $doFire }

if (-not $doFire) {
  Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }
  Emit-Line @{ event = 'finished'; count = $paths.Count; shredded = 0 }
  return
}

$shredded = 0
foreach ($path in $paths) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Emit-Line @{ event = 'error'; path = $path; reason = 'not a file or does not exist' }
    continue
  }
  Emit-Line @{ event = 'shredding'; path = $path }
  try {
    $len = (Get-Item -LiteralPath $path -Force).Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buf = New-Object byte[] ([Math]::Min($len, 1MB))
    for ($pass = 0; $pass -lt 3; $pass++) {
      $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write)
      try {
        $remaining = $len
        while ($remaining -gt 0) {
          $chunk = [Math]::Min($remaining, $buf.Length)
          $rng.GetBytes($buf, 0, $chunk)
          $stream.Write($buf, 0, $chunk)
          $remaining -= $chunk
        }
        $stream.Flush()
      } finally {
        $stream.Close()
      }
    }
    $rng.Dispose()
    Remove-Item -LiteralPath $path -Force -ErrorAction Stop
    Emit-Line @{ event = 'shredded'; path = $path }
    $shredded++
  } catch {
    Emit-Line @{ event = 'error'; path = $path; reason = $_.Exception.Message }
  }
}

Emit-Line @{ event = 'finished'; count = $paths.Count; shredded = $shredded }

& "$PSScriptRoot\optimize-report.ps1" --tool 'Shredder' --action 'shred'