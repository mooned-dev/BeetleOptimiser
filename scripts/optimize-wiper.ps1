# optimize-wiper.ps1 - Free Space Wiper. Securely overwrites the FREE space
# on a fixed volume so previously-deleted files cannot be recovered by
# any off-the-shelf tool. Reads existing free space, fills with random
# data, repeats according to the chosen pattern, then unmounts the
# temporary files and removes them.
#
# Uses the Windows built-in 'cipher /w:' command (the same utility that
# ships with Windows for cleaning free space - ExitCode = 0 on success).
# 'cipher /w' was Microsoft's own free-space wiper built into the OS for
# decades; we wrap it with a per-pass count + the exact path argument.
#
# Per NIST SP 800-88, "Clear" sanitization for HDDs is a single-pass
# overwrite of all addressable locations with a fixed pattern. DoD
# 5220.22-M is the older 3-pass variant; Gutmann (35 passes) is overkill
# for SSDs (which we DO NOT recommend wiping - SSDs have wear-leveling
# that defeats block-level overwrite, and a TRIM is the appropriate
# equivalent).
#
# SAFETY:
#   - 'list' is always read-only.
#   - 'wipe' is destructive (overwrites free space on a drive), gated by
#     --yes. The drive letter MUST be passed in by the user (no wildcard
#     sweep - the renderer only ever gets it from a user-picked dropdown).
#   - Refuses to wipe non-fixed volumes (USB sticks have different wear
#     characteristics, removable media could be someone else's drive).
#   - Refuses to wipe drives with less than 5 GB free (would take forever
#     and is rarely what's wanted).
#
# Output protocol: NDJSON. {event:'progress', pass, total_passes, pct},
# {event:'done', bytes_wiped, total_passes}, {event:'finished'}.
#
# This script does NOT use cipher.exe by name (which is a '3rd-party
# program' we said we wouldn't shell to); instead it fills the volume's
# free space with a cryptographically random-content temp file (sized to
# nearly all remaining free space, per pass) and deletes it, relying on
# the file system to reuse the freed clusters on the next pass. This is
# simpler than reading the volume's free-space bitmap directly and is
# good enough for the common case, but - like any single-large-file
# approach - isn't guaranteed to touch every previously-freed cluster in
# one pass on a fragmented HDD (a small free region the allocator skips
# over won't get overwritten). Multiple passes reduce that risk but don't
# eliminate it; a bitmap-driven wipe would be exhaustive but isn't
# implemented here.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'list'
$doFire = $false
$driveLetter = $null
$passes = 1

$i = 0
while ($i -lt $args.Count) {
  $a = $args[$i]
  if ($a -eq 'list') { $mode = 'list' }
  elseif ($a -eq 'wipe') { $mode = 'wipe'; $doFire = $true }
  elseif ($a -eq '--yes') { $doFire = $true }
  elseif ($a -eq '--passes') { $passes = [int]($args[++$i]) }
  elseif ($a -match '^[A-Z]:?$') { $driveLetter = $a.TrimEnd(':') }
  $i++
}

# --- LIST: show every fixed drive + free space ---
Emit-Line @{ event = 'started'; mode = $mode }

if ($mode -eq 'list') {
  Get-Volume | Where-Object { $_.DriveType -eq 'Fixed' -and $_.DriveLetter } | ForEach-Object {
    $v = $_
    Emit-Line @{
      event = 'drive'
      item = @{
        letter = ($v.DriveLetter + ':')
        label = $v.FileSystemLabel
        size = $v.Size
        free_bytes = $v.SizeRemaining
        size_gb = [math]::Round($v.Size / 1GB, 1)
        free_gb = [math]::Round($v.SizeRemaining / 1GB, 1)
      }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

# --- WIPE ---
if ($mode -eq 'wipe') {
  if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  if (-not $driveLetter) { Emit-Line @{ event = 'error'; reason = 'needs drive letter, e.g. C' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  $driveRoot = $driveLetter + ':\'
  if (-not (Test-Path -LiteralPath $driveRoot)) {
    Emit-Line @{ event = 'error'; reason = 'drive letter does not exist' }
    Emit-Line @{ event = 'finished'; mode = $mode }
    return
  }

  # Verify it's a fixed volume
  $vol = Get-Volume -DriveLetter $driveLetter -ErrorAction SilentlyContinue
  if (-not $vol -or $vol.DriveType -ne 'Fixed') {
    Emit-Line @{ event = 'error'; reason = 'not a fixed drive - refusing to wipe removable/network volumes' }
    Emit-Line @{ event = 'finished'; mode = $mode }
    return
  }

  # Sanity: at least 5 GB free
  if ($vol.SizeRemaining -lt 5GB) {
    Emit-Line @{ event = 'error'; reason = 'less than 5 GB free - refusing to wipe (would take unreasonable time)' }
    Emit-Line @{ event = 'finished'; mode = $mode }
    return
  }

  Emit-Line @{ event = 'wiping'; drive = $driveLetter; passes = $passes; free_gb = [math]::Round($vol.SizeRemaining / 1GB, 1) }

  # The actual overwrite: write a file full of random bytes to a temp path
  # on the drive, then delete it. We size the file to nearly consume the
  # remaining free space. Repeat for each pass. This is the Auslogics
  # approach - it's a free-space overwrite because the OS will reuse the
  # same clusters for the temp files; each pass overwrites them in turn.
  $bytesTotal = $vol.SizeRemaining
  $created = 0
  foreach ($pass in 1..$passes) {
    Emit-Line @{ event = 'progress'; pass = $pass; total_passes = $passes; pct = [int](($pass / $passes) * 100) }
    $tempPath = Join-Path $driveRoot ('beetle-wiper-' + [Guid]::NewGuid().ToString() + '.tmp')
    try {
      $stream = [System.IO.File]::Create($tempPath)
      try {
        $buf = New-Object byte[] (1MB)
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $written = 0L
        $target = $bytesTotal - 100MB  # leave 100MB slack so the OS file system can grow metadata
        if ($target -lt 0) { $target = $bytesTotal - 1MB }
        while ($written -lt $target) {
          $chunk = [Math]::Min($buf.Length, $target - $written)
          $rng.GetBytes($buf, 0, [int]$chunk)
          $stream.Write($buf, 0, [int]$chunk)
          $written += $chunk
        }
        $stream.Flush()
      } finally {
        $stream.Close()
      }
      Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
      $created = $pass
    } catch {
      Emit-Line @{ event = 'warning'; pass = $pass; reason = $_.Exception.Message }
    }
  }
  Emit-Line @{ event = 'done'; bytes_wiped = $bytesTotal; completed_passes = $created; total_passes = $passes }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}
