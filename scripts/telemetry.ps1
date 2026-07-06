# telemetry.ps1 - long-running loop that prints one JSON line every ~2-3s:
# { cpu, ram, net, gpu, ssd, hdd }. Run as a single persistent process
# (not re-spawned per poll - PowerShell startup cost is too high for a 2s
# interval) and read by main.js via stdout.
#
# Tiered refresh: CPU/RAM are cheap CIM queries (~1.3s combined) and refresh
# every iteration. NET/GPU (Get-Counter, ~1.6s and ~1.1s each) and disk
# SSD/HDD detection (Get-PhysicalDisk, ~1.6s) are expensive enough that
# querying all five every cycle costs ~5.6s wall-clock - so those three
# only refresh every 3rd iteration and are cached in between.
#
# SSD/HDD split is best-effort: Get-PhysicalDisk's MediaType isn't reliable
# on VMs (often reports "Unspecified"), so when neither SSD nor HDD can be
# identified we fall back to reporting the system drive's usage in the SSD
# slot, matching what most real installs actually run on.

$ErrorActionPreference = 'SilentlyContinue'

function Get-VolumePercentForDisks($diskNumbers) {
  if (-not $diskNumbers) { return $null }
  $letters = foreach ($num in $diskNumbers) {
    (Get-Partition -DiskNumber $num -ErrorAction SilentlyContinue |
      Where-Object DriveLetter | Select-Object -ExpandProperty DriveLetter)
  }
  if (-not $letters) { return $null }
  $vols = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
    Where-Object { $letters -contains $_.DeviceID.TrimEnd(':') }
  if (-not $vols) { return $null }
  $totalSize = ($vols | Measure-Object -Property Size -Sum).Sum
  $totalFree = ($vols | Measure-Object -Property FreeSpace -Sum).Sum
  if (-not $totalSize) { return $null }
  return [math]::Round((($totalSize - $totalFree) / $totalSize) * 100)
}

function Get-ExpensiveMetrics {
  $net = $null; $gpu = $null; $ssd = 0; $hdd = 0
  $freeGB = $null; $driveHealth = $null; $securityStatus = $null
  $topProcessName = $null; $topProcessPct = $null

  try {
    # Wildcards over Network Interface(*) often match virtual adapters that
    # report 0 bytes, dragging the sum down. Prefer the UP physical NIC:
    # pick the highest-Speed non-virtual NetEnabled NIC and read ITS counter
    # by name (not wildcard).
    $physNic = Get-CimInstance Win32_NetworkAdapter -Filter 'NetEnabled=True' |
      Where-Object { $_.Name -notmatch 'Virtual|Loopback|Hyper-V|VMware|VPN|Bluetooth' } |
      Sort-Object -Property Speed -Descending |
      Select-Object -First 1 -ExpandProperty Name
    if ($physNic) {
      $safeName = $physNic -replace "[\`'\(\)\[\]{}]", '\\$&'
      $netSamples = Get-Counter "\Network Interface($safeName)\Bytes Total/sec" -ErrorAction SilentlyContinue
      if ($netSamples -and $netSamples.CounterSamples.Count -gt 0) {
        $bps = ($netSamples.CounterSamples | Measure-Object -Property CookedValue -Sum).Sum * 8
        $net = [math]::Round($bps / 1000, 1)
      }
    }
  } catch {}

  try {
    # Sum across ALL engine types (3D + VIDEO + COPY + COMPUTE). When the
    # host has no GPU engines, leave $gpu as $null (not 0) so the renderer
    # can show "-" instead of misleading "0%".
    $gpuSamples = (Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples
    if ($gpuSamples) {
      $gpu = [math]::Min(100, [math]::Round(($gpuSamples | Measure-Object -Property CookedValue -Sum).Sum))
    }
  } catch {}

  try {
    $physicalDisks = Get-PhysicalDisk
    $ssdIds = $physicalDisks | Where-Object { $_.MediaType -eq 'SSD' } | Select-Object -ExpandProperty DeviceId
    $hddIds = $physicalDisks | Where-Object { $_.MediaType -eq 'HDD' } | Select-Object -ExpandProperty DeviceId

    $ssdResult = Get-VolumePercentForDisks $ssdIds
    $hddResult = Get-VolumePercentForDisks $hddIds

    if ($null -eq $ssdResult -and $null -eq $hddResult) {
      $sysDrive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'"
      if ($sysDrive -and $sysDrive.Size) {
        $ssd = [math]::Round((($sysDrive.Size - $sysDrive.FreeSpace) / $sysDrive.Size) * 100)
      }
    } else {
      if ($null -ne $ssdResult) { $ssd = $ssdResult }
      if ($null -ne $hddResult) { $hdd = $hddResult }
    }
  } catch {}

  try {
    $vols = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
    $freeBytes = ($vols | Measure-Object -Property FreeSpace -Sum).Sum
    if ($freeBytes) { $freeGB = [math]::Round($freeBytes / 1GB, 1) }
  } catch {}

  try {
    $unhealthy = $physicalDisks | Where-Object { $_.HealthStatus -and $_.HealthStatus -ne 'Healthy' }
    $driveHealth = if ($unhealthy) { 'Warning' } else { 'OK' }
  } catch {}

  try {
    # Get-MpComputerStatus is Windows Defender's own cmdlet - returns nothing
    # (caught below) if Defender isn't the active AV, in which case we leave
    # securityStatus as $null and the UI shows "-" rather than a false "Good".
    $mp = Get-MpComputerStatus -ErrorAction SilentlyContinue
    if ($mp) {
      $securityStatus = if ($mp.AntivirusEnabled -and $mp.RealTimeProtectionEnabled) { 'Good' } else { 'At Risk' }
    }
  } catch {}

  try {
    # % Processor Time from Get-Counter is scaled 0-100 per core (so a
    # single-threaded process pegging one core reads ~100 on an 8-core
    # machine) - divide by core count to match Task Manager's normalized
    # display.
    $procSamples = (Get-Counter '\Process(*)\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples |
      Where-Object { $_.InstanceName -notin @('_total', 'idle') }
    if ($procSamples) {
      $top = $procSamples | Sort-Object CookedValue -Descending | Select-Object -First 1
      $cores = [Environment]::ProcessorCount
      $topProcessName = $top.InstanceName
      $topProcessPct = [math]::Min(100, [math]::Round($top.CookedValue / $cores))
    }
  } catch {}

  [PSCustomObject]@{
    net = $net; gpu = $gpu; ssd = $ssd; hdd = $hdd
    freeGB = $freeGB; driveHealth = $driveHealth; securityStatus = $securityStatus
    topProcessName = $topProcessName; topProcessPct = $topProcessPct
  }
}

$cycle = 0
$expensive = $null

while ($true) {
  $cpu = 0; $ram = 0

  try {
    $cpu = [math]::Round((Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average)
  } catch {}

  try {
    $os = Get-CimInstance Win32_OperatingSystem
    if ($os.TotalVisibleMemorySize) {
      $ram = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100)
    }
  } catch {}

  if ($cycle % 3 -eq 0) { $expensive = Get-ExpensiveMetrics }
  $cycle++

  $json = [PSCustomObject]@{
    cpu = $cpu
    ram = $ram
    net = $expensive.net
    gpu = $expensive.gpu
    ssd = $expensive.ssd
    hdd = $expensive.hdd
    freeGB = $expensive.freeGB
    driveHealth = $expensive.driveHealth
    securityStatus = $expensive.securityStatus
    topProcessName = $expensive.topProcessName
    topProcessPct = $expensive.topProcessPct
  } | ConvertTo-Json -Compress

  # Redirected stdout is buffered by default and won't reach the parent
  # process's pipe promptly - flush explicitly so Node sees each line as
  # soon as it's produced instead of in delayed bursts.
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()

  Start-Sleep -Milliseconds 2000
}
