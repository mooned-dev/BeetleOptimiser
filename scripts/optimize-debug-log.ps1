# optimize-debug-log.ps1 - Export a diagnostic bundle. Reads:
#   - our last reports.jsonl (audit log)
#   - our last rescue/*.json (registry value backups)
#   - a Windows-side snapshot: SystemInfo, EventLog Errors in last 24h,
#     Get-Process top-10 by WS, Get-ComputerInfo, current policy summary
#   - the live values of well-known tweaks (so the support team can see
#     which tweaks the user has applied)
# ...and writes them all to one zipped bundle in
# %TEMP%/BeetleOptimiser-debug-<timestamp>.zip
#
# Output: NDJSON. {event:'file', zip_path, size_bytes, item_count}.
#
# AUDIT: per user instruction 'no third-party programs', we use the
# built-in PowerShell System.IO.Compression.ZipFile - available since
# .NET Framework 4.5 on PowerShell 5.1 (Add-Type -AssemblyName
# System.IO.Compression.FileSystem). 100% Windows built-ins.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

try { Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop } catch {}

$reportDir = Join-Path $env:LOCALAPPDATA 'BeetleOptimiser\reports'
$rescueDir = Join-Path $env:LOCALAPPDATA 'BeetleOptimiser\rescue'

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$bundleName = "BeetleOptimiser-debug-$stamp.zip"
$bundlePath = Join-Path $env:TEMP $bundleName

# Collect files into a staging folder, then zip
$stage = Join-Path $env:TEMP "beetle-debug-stage-$stamp"
New-Item -Path $stage -ItemType Directory -Force | Out-Null
$added = 0

# 1. Reports audit log
if (Test-Path -LiteralPath (Join-Path $reportDir 'reports.jsonl')) {
  Copy-Item -LiteralPath (Join-Path $reportDir 'reports.jsonl') -Destination (Join-Path $stage 'reports.jsonl') -Force
  $added++
}
# 2. Rescue backups
if (Test-Path -LiteralPath $rescueDir) {
  New-Item -Path (Join-Path $stage 'rescue') -ItemType Directory -Force | Out-Null
  Get-ChildItem -LiteralPath $rescueDir -Filter '*.json' -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path (Join-Path $stage 'rescue') $_.Name) -Force
    $added++
  }
}
# 3. Windows-side snapshot
$snapshot = @(
  '=== System Info ==='
  (Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsHardwareAbstractionLayer, CsProcessorFamily, CsName, OsTotalVisibleMemorySize, OsFreePhysicalMemory, CsModel  | Format-List | Out-String)
  ''
  '=== Top 10 processes by Working Set ==='
  (Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 | Select-Object ProcessName, Id, @{n='WS_MB';e={[math]::Round($_.WorkingSet64/1MB,1)}}, CPU | Format-Table -AutoSize | Out-String)
  ''
  '=== Event Log Errors in last 24h (top 30) ==='
  try {
    $errs = Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2,3} -MaxEvents 30 -ErrorAction SilentlyContinue
    if ($errs) { $errs | Select-Object TimeCreated, ProviderName, Id, Message | Format-List | Out-String }
  } catch {}
  ''
  '=== Network adapters ==='
  Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object Name, Status, LinkSpeed, MediaType | Format-List | Out-String
  ''
  '=== Volumes ==='
  Get-Volume | Where-Object { $_.DriveLetter } | Select-Object DriveLetter, DriveType, @{n='Size_GB';e={[math]::Round($_.Size/1GB,1)}}, @{n='Free_GB';e={[math]::Round($_.SizeRemaining/1GB,1)}} | Format-Table | Out-String
  ''
  '=== Top 50 registry keys by subkey count (sample of HKLM) ==='
  Get-ChildItem -LiteralPath 'Registry::HKEY_LOCAL_MACHINE\Software' -ErrorAction SilentlyContinue | Select-Object -First 50 | ForEach-Object {
    $subcnt = (Get-ChildItem -LiteralPath $_.PSPath -ErrorAction SilentlyContinue | Measure-Object).Count
    [PSCustomObject]@{ Name = $_.PSChildName; Subkeys = $subcnt }
  } | Format-Table | Out-String
) -join "`n"
Out-File -LiteralPath (Join-Path $stage 'system-snapshot.txt') -InputObject $snapshot -Encoding UTF8

# 4. Currently applied Win10 tweaks snapshot (so support sees which registry values are on)
$tweaks = ''
$tweakKeys = @(
  @{ id = 'cortana_disable'; path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search'; name = 'CortanaEnabled' }
  @{ id = 'action_center_disable'; path = 'HKCU:\Software\Policies\Microsoft\Windows\Explorer'; name = 'DisableNotificationCenter' }
  @{ id = 'lock_screen_ads'; path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; name = 'SilentInstalledAppsEnabled' }
  @{ id = 'advertising_id'; path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo'; name = 'Enabled' }
)
foreach ($k in $tweakKeys) {
  $val = $null
  try {
    # .($k.name), not .$k.name - the latter parses as (.$k).name and always
    # returns $null (see the identical bug fixed in optimize-win10.ps1).
    $val = (Get-ItemProperty -LiteralPath $k.path -Name $k.name -ErrorAction Stop).($k.name)
  } catch {}
  $display = if ($null -ne $val) { $val } else { '(not set)' }
  $line = '{0} :: {1} :: {2}' -f $k.id, $k.path, $display
  $tweaks += ($line + "`n")
}
Out-File -LiteralPath (Join-Path $stage 'win10-tweaks.txt') -InputObject $tweaks -Encoding UTF8

# Zip the stage
$added += 4 # snapshot + tweaks + 2 directories counted above
if (Test-Path -LiteralPath $bundlePath) { Remove-Item -LiteralPath $bundlePath -Force }

try {
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $bundlePath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  $size = (Get-Item -LiteralPath $bundlePath).Length
  Emit-Line @{ event = 'file'; zip_path = $bundlePath; size_bytes = $size; items = $added }
} catch {
  Emit-Line @{ event = 'error'; reason = $_.Exception.Message }
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
Emit-Line @{ event = 'finished' }
