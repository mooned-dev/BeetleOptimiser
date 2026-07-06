# optimize-drivers.ps1 - Driver check. Companion to the
# optimizer:list-drivers IPC handler.
#
# READ-ONLY. Actually installing/updating a driver needs the vendor's own
# package (Windows Update's driver catalog isn't safely scriptable without
# real risk of installing the wrong driver for the hardware) - that's out
# of scope here. This lists devices with an active problem (Device
# Manager's "yellow bang" - ConfigManagerErrorCode != 0) plus every
# signed driver's version/date, so the user at least knows WHAT to go
# update instead of guessing.
#
# Output protocol: NDJSON. {event:'problem', ...} for each device with an
# active error code, then {event:'driver', ...} for every signed driver's
# version/date/provider, then {event:'finished', problem_count}.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

Emit-Line @{ event = 'started' }

$problemCount = 0
Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.ConfigManagerErrorCode -ne 0 } | ForEach-Object {
  $problemCount++
  Emit-Line @{
    event = 'problem'
    item = @{
      name = $_.Name
      device_id = $_.DeviceID
      error_code = $_.ConfigManagerErrorCode
      manufacturer = $_.Manufacturer
    }
  }
}

Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue |
  Where-Object { $_.DeviceName } |
  Sort-Object DriverDate -Descending |
  ForEach-Object {
    Emit-Line @{
      event = 'driver'
      item = @{
        name = $_.DeviceName
        provider = $_.DriverProviderName
        version = $_.DriverVersion
        date = if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { $null }
        is_microsoft = ($_.DriverProviderName -eq 'Microsoft')
      }
    }
  }

Emit-Line @{ event = 'finished'; problem_count = $problemCount }
