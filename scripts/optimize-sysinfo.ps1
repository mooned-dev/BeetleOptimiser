# optimize-sysinfo.ps1 - System Information. Invoked by main.js via
# ipcMain.handle('optimizer:get-sysinfo') in response to the renderer's
# window.beetleAPI.optimizer.getSystemInfo() call.
#
# READ-ONLY. No confirmation token needed - this only queries CIM/WMI
# classes, it never writes anything.
#
# Output protocol: a single NDJSON line, {event:'sysinfo', ...fields}.

$ErrorActionPreference = 'SilentlyContinue'

$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$os = Get-CimInstance Win32_OperatingSystem
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$computer = Get-CimInstance Win32_ComputerSystem
$gpus = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name
$disks = Get-CimInstance Win32_DiskDrive | ForEach-Object {
  [PSCustomObject]@{
    model = $_.Model
    size_gb = [math]::Round($_.Size / 1GB, 1)
  }
}

$totalRamGb = if ($computer.TotalPhysicalMemory) { [math]::Round($computer.TotalPhysicalMemory / 1GB, 1) } else { $null }

$info = [PSCustomObject]@{
  event = 'sysinfo'
  computer_name = $env:COMPUTERNAME
  os_name = $os.Caption
  os_version = $os.Version
  os_build = $os.BuildNumber
  cpu_name = $cpu.Name
  cpu_cores = $cpu.NumberOfCores
  cpu_logical_processors = $cpu.NumberOfLogicalProcessors
  ram_total_gb = $totalRamGb
  motherboard = "$($board.Manufacturer) $($board.Product)".Trim()
  gpus = @($gpus)
  disks = @($disks)
}

[Console]::Out.WriteLine(($info | ConvertTo-Json -Compress -Depth 4))
[Console]::Out.Flush()
