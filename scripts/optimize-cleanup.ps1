# optimize-cleanup.ps1 - one of two cleanup subcommands. Invoked by main.js
# via ipcMain.handle('optimizer:scan-junk') in response to the renderer's
# window.beetleAPI.optimizer.scanJunkFiles() call.
#
# SCAN ONLY. This script NEVER deletes anything. It enumerates the categories
# of well-known "junk" and reports per-category file count + total bytes, so
# the renderer can show "Clean: 12.4 GB across 18,432 files" and a per-row
# confirmation before the user clicks "Clean now" (which would run the
# cleanup subcommand separately - see ipcMain 'optimizer:clean-junk').
#
# Output protocol: one NDJSON object per category on stdout. The main.js
# child_process handler buffers these and sends the assembled array to the
# renderer. Lines that fail to parse are logged to stderr and skipped.
#
# Reference: MS Learn for the underlying env vars (Win32_GetTempPath2, etc.)
# https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-gettemppath2w

$ErrorActionPreference = 'SilentlyContinue'

$results = New-Object System.Collections.Generic.List[object]

function Scan-Path {
  param(
    [Parameter(Mandatory)] [string] $Id,
    [Parameter(Mandatory)] [string] $Label,
    [Parameter(Mandatory)] [string] $Path,
    [Parameter(Mandatory)] [bool]   $Safe
  )
  # If the root doesn't exist, return a zero-record entry so the UI can still
  # show the category row (greyed out / "0 files").
  if (-not (Test-Path -LiteralPath $Path)) {
    return [PSCustomObject]@{
      id = $Id; label = $Label; path = $Path; files = 0; bytes = 0; safe = $Safe
    }
  }
  $fileCount = 0
  $byteCount = 0L
  # Get-ChildItem -Recurse can be heavy; keep this fast by using -Force and
  # skipping directories (we just want leaf file sizes).
  Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object {
    $fileCount++
    $byteCount += $_.Length
  }
  return [PSCustomObject]@{
    id = $Id; label = $Label; path = $Path; files = $fileCount; bytes = $byteCount; safe = $Safe
  }
}

# ---- Category enumeration ----
# 1. User Temp (current user's %TEMP%). Always present.
$results.Add( (Scan-Path -Id 'user-temp' -Label 'User Temp' -Path $env:TEMP -Safe $true) )

# 2. Windows Temp (C:\Windows\Temp). System-wide, may need admin to clean
# (but read-only scan works as the current user).
$winTemp = Join-Path $env:SystemRoot 'Temp'
$results.Add( (Scan-Path -Id 'system-temp' -Label 'Windows Temp' -Path $winTemp -Safe $true) )

# 3. Prefetch (boot-trace files; safe to remove after 24+ hrs of boot data).
$prefetch = Join-Path $env:SystemRoot 'Prefetch'
$results.Add( (Scan-Path -Id 'prefetch' -Label 'Prefetch' -Path $prefetch -Safe $true) )

# 4. Recycle Bin - hard to enumerate from PowerShell without COM interop.
# Skip file enumeration here; the renderer can show "Recycle Bin: N items"
# via shell API later. For now return zero.
$results.Add( [PSCustomObject]@{
  id = 'recycle'; label = 'Recycle Bin'; path = '$RECYCLE.BIN';
  files = 0; bytes = 0; safe = $true
} )

# 5. Thumbnail cache (user's appdata).
$thumbCache = Join-Path $env:APPDATA 'Microsoft\Windows\Explorer'
$results.Add( (Scan-Path -Id 'thumbcache' -Label 'Thumbnail cache' -Path $thumbCache -Safe $true) )

# 6. Old Windows Update downloads (safe, can always be removed - Windows
# Update will re-download as needed, but only if user is still on the same
# feature update).
$wu = Join-Path $env:SystemRoot 'SoftwareDistribution\Download'
$results.Add( (Scan-Path -Id 'windows-update' -Label 'Windows Update downloads' -Path $wu -Safe $true) )

# 7. WER (Windows Error Reports) local archive.
$wer = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\WER'
$results.Add( (Scan-Path -Id 'wer' -Label 'Windows Error Reports' -Path $wer -Safe $true) )

# 8. Browser cache - Edge first, can add Firefox/Chrome/Brave later.
# $env:LOCALAPPDATA contains both Packages and Microsoft\Edge...
$edgeCache = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data\Default\Cache'
$results.Add( (Scan-Path -Id 'edge-cache' -Label 'Microsoft Edge cache' -Path $edgeCache -Safe $true) )

# ---- Emit ----
# Newline-delimited JSON. main.js collects these into an array.
foreach ($r in $results) {
  [Console]::Out.WriteLine(($r | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
