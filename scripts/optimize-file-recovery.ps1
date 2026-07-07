# optimize-file-recovery.ps1 - File Recovery. Reads $Recycle.Bin (the per-volume
# hidden folder Windows moves deleted files into) and emits per-file metadata
# for each recoverable item, plus an --yes-driven 'restore' mode that copies
# them back to the user's chosen destination via the native SaveFile dialog
# (the renderer asks for the folder via system:open-external -> open-path).
#
# READ-ONLY by default. Restore is restore *copy* (never moves out of the
# bin), so the original entry stays in the bin for the normal empty flow.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'list'
$doFire = $false
$restoreTargets = @()
$restoreDest = $null

$i = 0
while ($i -lt $args.Count) {
  switch ($args[$i]) {
    'list'   { $mode = 'list' }
    'restore' { $mode = 'restore' }
    '--yes'  { $doFire = $true }
    '--dest' { $restoreDest = $args[++$i] }
    default {
      # Anything else is a path to restore
      if ($args[$i] -and $args[$i] -ne '') { $restoreTargets += $args[$i] }
    }
  }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode }

# --- LIST ---
if ($mode -eq 'list') {
  # Enumerate every fixed drive's own $Recycle.Bin (not just the system
  # drive) - this used to be gated behind "if the system drive's bin was
  # already found", which meant other drives were skipped entirely
  # whenever that first lookup came back empty. Unconditional now.
  $bins = Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue |
    ForEach-Object {
      $root = $_.Root
      if ($root) { Get-ChildItem -LiteralPath $root -Force -Filter '$Recycle.Bin' -ErrorAction SilentlyContinue }
    }
  $bins = $bins | Select-Object -Unique | Where-Object { $_ -and (Test-Path -LiteralPath $_.FullName) }
  $count = 0
  foreach ($bin in $bins) {
    Get-ChildItem -LiteralPath $bin.FullName -Force -ErrorAction SilentlyContinue | ForEach-Object {
      $p = $_.FullName
      # The actual files inside the per-SID folder are named $I<random> and $R<random>
      # The $R<...> files are the renamed restored-content files.
      $items = Get-ChildItem -LiteralPath $p -Force -File -ErrorAction SilentlyContinue
      foreach ($it in $items) {
        if ($it.Name -match '^\$R') {
          Emit-Line @{
            event = 'recoverable'
            item = @{
              bin = $bin.FullName
              path = $it.FullName
              bytes = $it.Length
              deleted_at = $it.LastWriteTime.ToString('o')
              # Original filename is in the per-bin Info2/I index file; users
              # most often just want the bytes back, which is enough.
            }
          }
          $count++
        }
      }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode; count = $count }
  return
}

# --- RESTORE: copy each --path to --dest ---
if ($mode -eq 'restore') {
  if (-not $doFire) {
    Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }
    Emit-Line @{ event = 'finished'; mode = $mode; restored = 0 }
    return
  }
  if (-not $restoreDest) {
    Emit-Line @{ event = 'error'; reason = 'needs --dest <folder>' }
    Emit-Line @{ event = 'finished'; mode = $mode; restored = 0 }
    return
  }
  if (-not (Test-Path -LiteralPath $restoreDest -PathType Container)) {
    New-Item -Path $restoreDest -ItemType Directory -Force | Out-Null
  }
  $restored = 0
  foreach ($src in $restoreTargets) {
    if (-not (Test-Path -LiteralPath $src -PathType Leaf)) {
      Emit-Line @{ event = 'error'; path = $src; reason = 'not a file or does not exist' }
      continue
    }
    try {
      $name = Split-Path -Leaf $src
      # Strip leading $Rxxxxxxxx... to a friendlier name
      if ($name -match '^\$R[A-Za-z0-9_-]+') {
        # Real recycle-bin filenames are short ($R + 6 chars + extension,
        # e.g. "$R8NITB6.ico" - 12 characters, verified on a live system) -
        # a hardcoded Substring(19) assumed a fixed length nothing like
        # that and threw ArgumentOutOfRangeException on every real file,
        # aborting the restore before Copy-Item ever ran. There's no
        # original filename available without parsing the bin's metadata
        # index, so we keep the file's own (Windows-preserved) extension
        # and tag it with a short hash instead of guessing a length.
        $tag = (Get-FileHash -LiteralPath $src -Algorithm SHA1).Hash.Substring(0, 8)
        $ext = [System.IO.Path]::GetExtension($name)
        $name = "recovered_${tag}${ext}"
      }
      $destPath = Join-Path $restoreDest $name
      if (Test-Path -LiteralPath $destPath) {
        $base = [System.IO.Path]::GetFileNameWithoutExtension($name)
        $ext = [System.IO.Path]::GetExtension($name)
        $destPath = Join-Path $restoreDest ($base + '_' + (Get-Random) + $ext)
      }
      Copy-Item -LiteralPath $src -Destination $destPath -Force -ErrorAction Stop
      Emit-Line @{ event = 'restored'; from = $src; to = $destPath }
      $restored++
    } catch {
      Emit-Line @{ event = 'error'; path = $src; reason = $_.Exception.Message }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode; restored = $restored }
  return
}
