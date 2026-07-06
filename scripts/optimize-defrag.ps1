# optimize-defrag.ps1 - analyze + defragment (or TRIM) per connected fixed
# disk. Companion to the `optimizer:defrag-drive` IPC handler in main.js.
#
# Uses the Windows BUILT-IN cmdlet Optimize-Volume (Storage module, ships with
# Windows 8 / Server 2012 and later). This is NOT a 3rd-party program - it
# IS the Windows API. Other 3rd-party defrag tools (Auslogics Disk Defrag,
# Defraggler, O&O Defrag) are NOT used here.
#
# SAFETY:
#   - Default mode is 'analyze' (read-only; reports fragmentation %).
#   - Pass --defrag to actually rewrite file layout on the drive.
#   - Pass --trim   to send TRIM commands to SSDs (lightweight - frees
#     free-space pages for the SSD controller; no user files touched).
#
# Optimize-Volume -Verbose writes per-volume stats to stdout (well, the
# verbose stream, which we route via 4>&1), which we capture and parse
# to emit per-drive NDJSON.
#
# REFERENCE: optimize-volume cmdlet docs (in-box Storage module):
# https://learn.microsoft.com/en-us/powershell/module/storage/optimize-volume
#
# On SSD with TRIM support the cmdlet does nothing (defrag is pointless on
# SSDs); it TRIMs free-space blocks for the SSD controller. On HDD it runs
# the standard Windows defragmenter.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

# Pick the Optimize-Volume switch based on the chosen mode.
$doDefrag = $args -contains '--defrag'
$doTrim   = $args -contains '--trim'
$mode     = if ($doDefrag) { 'defrag' } elseif ($doTrim) { 'trim' } else { 'analyze' }

# If a single drive letter was passed, target that one; otherwise all
# fixed disks. The args check accepts both "C" and "C:".
$diskLetter = $args | Where-Object { $_ -match '^[A-Z]:?$' } | Select-Object -First 1

if (-not $diskLetter) {
  # No specific drive given: enumerate every fixed volume on the system.
  # Get-Volume -DriveLetter does NOT accept wildcards ("*" is treated as a
  # literal that finds no volumes), so we omit the parameter here and
  # filter after.
  $drives = Get-Volume -ErrorAction SilentlyContinue | Where-Object {
    $_.DriveType -eq 'Fixed' -and $_.DriveLetter -match '^[A-Z]$'
  }
} else {
  $diskLetter = $diskLetter.TrimEnd(':')
  $drives = Get-Volume -DriveLetter $diskLetter -ErrorAction SilentlyContinue | Where-Object {
    $_.DriveType -eq 'Fixed' -and $_.DriveLetter -match '^[A-Z]$'
  }
}

$emitLetter = if ($diskLetter) { $diskLetter } else { ($drives | ForEach-Object { $_.DriveLetter }) -join ',' }
Emit-Line @{event='started'; drive_letter=$emitLetter; mode=$mode; time=(Get-Date)}

foreach ($vol in $drives) {
  $letter = $vol.DriveLetter

  # Detect SSD vs HDD so we can pick the right Optimize-Volume switch.
  # SSDs get ReTrim; HDDs get Defrag. BusType 17 (NVMe) is also SSD.
  #
  # The path-matching shortcut in earlier revisions ($disk.Path -match
  # "\\b$letter\\b") does not work - the drive letter does not appear in
  # the disk's device path. The correct lookup is volume -> partition ->
  # DiskNumber -> disk. (A volume with a drive letter always has a backing
  # partition, so Get-Partition is reliable here.)
  try {
    $partition = Get-Partition -DriveLetter $letter -ErrorAction SilentlyContinue | Select-Object -First 1
    $disk = if ($partition) { Get-Disk -Number $partition.DiskNumber -ErrorAction SilentlyContinue } else { $null }
    $isSsd = $disk -and ($disk.MediaType -eq 'SSD' -or $disk.BusType -eq 'NVMe' -or $disk.BusType -eq 17)
  } catch { $isSsd = $false }

  Emit-Line @{
    event='drive_start'; drive=$letter
    is_ssd=$isSsd; size_mb=[math]::Round($vol.Size / 1MB); free_mb=[math]::Round($vol.SizeRemaining / 1MB)
  }

  # Pick the right Optimize-Volume switch for this drive's media type.
  $optVerb = switch ($mode) {
    'analyze' { '-Analyze' }
    'trim'    { if ($isSsd) { '-ReTrim' } else { '-Analyze' } }   # SSD-only
    'defrag'  { if ($isSsd) { '-SlabConsolidate' } else { '-Defrag' } }
  }

  # Invoke Optimize-Volume and capture the verbose stream (Write-Verbose
  # output). We use & + scriptblock so $VerbosePreference is in scope and
  # -Verbose is honored. 4>&1 routes the verbose stream to stdout.
  $fragPct = $null
  $defragNeeded = $null
  try {
    $VerbosePreference = 'Continue'
    $cmd = "Optimize-Volume -DriveLetter $letter -Verbose $optVerb"
    $output = & ([scriptblock]::Create($cmd)) 4>&1

    foreach ($line in $output) {
      $txt = "$line".Trim()
      # Analyze output ends with: "You do not need to defragment this volume."
      # OR a recommendation to do so for HDDs.
      if ($txt -match 'do not need to defragment') {
        $defragNeeded = $false
      }
      if ($txt -match '^Fragmented size\s*:.*?\((\d+(?:\.\d+)?)%\)') {
        $fragPct = [double]$Matches[1]
      }
    }
    # If mode=analyze and the script didn't print a defrag-needed line,
    # fall back to "true if frag pct > 5%".
    if ($mode -eq 'analyze' -and $null -eq $defragNeeded -and $null -ne $fragPct) {
      $defragNeeded = ($fragPct -gt 5)
    }

    Emit-Line @{
      event='drive_done'; drive=$letter; is_ssd=$isSsd; mode=$mode; action=$optVerb
      fragmented_pct = if ($null -ne $fragPct) { [double]$fragPct.ToString('0.0') } else { $null }
      needs_defrag   = $defragNeeded
      size_mb = [math]::Round($vol.Size / 1MB)
      free_mb = [math]::Round($vol.SizeRemaining / 1MB)
    }
  } catch {
    Emit-Line @{event='drive_error'; drive=$letter; mode=$mode; message="$($_.Exception.Message)"}
  }
}

Emit-Line @{event='finished'; mode=$mode}

& "$PSScriptRoot\optimize-report.ps1" --tool 'Optimize' --action 'defrag'