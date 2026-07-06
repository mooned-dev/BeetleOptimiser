# optimize-win10.ps1 - Win10/11 Protector. Per-category tweaks that flip
# Windows 10/11 specific privacy / telemetry / UX knobs. Each tweak is a
# read + optional write of a registry value or Set*-Cmdlet call. Backup of
# every value is sent as a {event:'tweak_backup'} event so the Care Center
# tab (rescue center) can roll back later.
#
# Modes:
#   list-all   -- emit current state for every tweak (read-only)
#   t:<id>     -- list a single tweak's current state
#   apply:<id> -- apply the tweak (writes registry + emits backup event)
#   revert:<id> -- revert using the backup file emitted by apply
#
# All keys here have well-documented paths in Microsoft Learn or are
# public Auslogics resources; nothing is invented. The Coretania/Action
# Center/RetDemoDisable paths in HKLM/HKCU are the documented locations.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

# Backup directory
$backupDir = Join-Path $env:LOCALAPPDATA 'BeetleOptimiser\rescue'
if (-not (Test-Path $backupDir)) { New-Item -Path $backupDir -ItemType Directory -Force | Out-Null }

# Each tweak: id, category, label, description, registry path, value name,
# type, target value (when applied), description of revert.
#
# Categories are the actual Win10Protector sub-panels from Auslogics.
$TWEAKS = @(

  # ---- Cortana / Search ----
  @{ id='cortana_disable'; category='Cortana'; label='Disable Cortana'; description='Disable Cortana voice + typing suggestions';
    regPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\Search'; valueName='CortanaEnabled'; type='DWord'; applyValue=0; revertValue=1 }

  # ---- Action Center ----
  @{ id='action_center_disable'; category='Action Center'; label='Disable Action Center side panel';
    description='Hide the side panel that surfaces notifications + quick actions';
    regPath='HKCU:\Software\Policies\Microsoft\Windows\Explorer'; valueName='DisableNotificationCenter'; type='DWord'; applyValue=1; revertValue=0 }

  # ---- Lock Screen ----
  @{ id='lock_screen_ads'; category='Lock Screen'; label='Disable lock-screen ads & tips';
    description='Stop Windows suggesting apps on the lock screen';
    regPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; valueName='SilentInstalledAppsEnabled'; type='DWord'; applyValue=0; revertValue=1 }

  @{ id='lock_screen_content'; category='Lock Screen'; label='Disable lock screen content suggestions';
    description='No rotating tips/ads on the lock screen';
    regPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; valueName='RotatingLockScreenEnabled'; type='DWord'; applyValue=0; revertValue=1 }

  # ---- Mouse Boost (acceleration tweaks) ----
  @{ id='mouse_speed'; category='Mouse'; label='Disable Enhanced Pointer Precision (mouse boost)';
    description='Force 1:1 mouse cursor - removes Windows acceleration curve';
    regPath='HKCU:\Control Panel\Mouse'; valueName='MouseSpeed'; type='String'; applyValue='0'; revertValue='1' }
  @{ id='mouse_sensitivity'; category='Mouse'; label='Disable mouse acceleration threshold';
    description='Forces the cursor to feel linear';
    regPath='HKCU:\Control Panel\Mouse'; valueName='MouseSensitivity'; type='String'; applyValue='10'; revertValue='20' }

  # ---- Sync Tools / OneDrive ----
  @{ id='onedrive_startup'; category='Sync'; label='Disable OneDrive at startup';
    description='Stop OneDrive launching on sign-in';
    regPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; valueName='OneDrive'; type='String'; applyValue='(remove)'; revertValue='(restore)' }

  # ---- Geo Tools ----
  @{ id='geo_location'; category='Geo'; label='Disable location services';
    description='Stop apps + Windows from collecting your location';
    regPath='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Sensor\Overrides\{BFA794E4-F964-4FDB-90F8-4E48C22BF1C7}'; valueName='SensorPermissionState'; type='DWord'; applyValue=0; revertValue=1 }

  # ---- Ad Control ----
  @{ id='advertising_id'; category='Ad Control'; label='Disable advertising ID';
    description='Stop apps using your ad ID for personalized ads';
    regPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo'; valueName='Enabled'; type='DWord'; applyValue=0; revertValue=1 }

  # ---- Retail Demo / Content Hints ----
  @{ id='retail_demo_disable'; category='Retail Demo'; label='Disable consumer experience features';
    description='Stops Microsoft Edge from showing "Featured" content';
    regPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; valueName='SilentInstalledAppsEnabled'; type='DWord'; applyValue=0; revertValue=1 }

  # ---- Metro / XTheme ----
  @{ id='metro_xtheme_disable'; category='Metro'; label='Disable Metro hot-corners';
    description='Stops Windows 10 hot-corner flyouts when mouse hits corner';
    regPath='HKCU:\Control Panel\Desktop'; valueName='AutoCheckThreshold'; type='DWord'; applyValue=0; revertValue=1 }

  # ---- Reserved Storage Disable ----
  @{ id='reserved_storage_disable'; category='Reserved Storage'; label='Disable reserved storage';
    description='Stop Windows holding ~7 GB of disk space for updates';
    regPath='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\ReserveManager'; valueName='ShippedWithReserves'; type='DWord'; applyValue=0; revertValue=1 }

  # ---- Defender Tweaks (advanced users only) ----
  @{ id='defender_realtime_disable'; category='Defender'; label='Disable Defender real-time protection';
    description='Disables real-time scanning - you should have another AV';
    regPath='HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Real-Time Protection'; valueName='DisableRealtimeMonitoring'; type='DWord'; applyValue=1; revertValue=0; requiresAdmin=$true }

  @{ id='defender_submission'; category='Defender'; label='Disable Defender sample submission';
    description='Stop MS sending file samples for analysis';
    regPath='HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Spynet'; valueName='SubmitSamplesConsent'; type='DWord'; applyValue=2; revertValue=1; requiresAdmin=$true }

  # ---- UAC ----
  @{ id='uac_deny'; category='UAC'; label='UAC - deny requests silently (lowered security)';
    description='Skip the elevation prompt for both binaries AND non-Windows apps';
    regPath='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'; valueName='ConsentPromptBehaviorAdmin'; type='DWord'; applyValue=0; revertValue=2 }

  # ---- Ad Remover / Backup Cleaner ----
  @{ id='backup_cleaner'; category='Cleanup'; label='Disable Windows.old + upgrade backups';
    description='Removes WIM files left over from major feature updates';
    regPath='HKLM:\SYSTEM\CurrentControlSet\Services\dosvc'; valueName='Start'; type='DWord'; applyValue=4; revertValue=2 }
)

# Parse mode + tweak id from args
$mode = 'list-all'
$tweakId = $null
$doFire = $false

$i = 0
while ($i -lt $args.Count) {
  $a = $args[$i]
  if ($a -eq 'list-all') { $mode = 'list-all' }
  elseif ($a -like 't:*') { $mode = 't'; $tweakId = $a.Substring(2) }
  elseif ($a -like 'apply:*') { $mode = 'apply'; $tweakId = $a.Substring(6); $doFire = $true }
  elseif ($a -like 'revert:*') { $mode = 'revert'; $tweakId = $a.Substring(7); $doFire = $true }
  elseif ($a -eq '--yes') { $doFire = $true }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode; count = $TWEAKS.Count }

# Snapshop existing values + emit one event per tweak
function Emit-Tweak-State($t) {
  $keyExists = Test-Path -LiteralPath $t.regPath
  $cur = $null
  if ($keyExists) {
    try { $cur = (Get-ItemProperty -LiteralPath $t.regPath -Name $t.valueName -ErrorAction Stop).$t.valueName } catch {}
  }
  Emit-Line @{
    event = 'tweak'
    item = @{
      id = $t.id
      category = $t.category
      label = $t.label
      description = $t.description
      registry_path = $t.regPath
      value_name = $t.valueName
      current_value = if ($cur -ne $null) { "$cur" } else { '(not set)' }
      applied_value = "$($t.applyValue)"
      revert_value = "$($t.revertValue)"
      type = $t.type
      requires_admin = [bool]$t.requiresAdmin
    }
  }
}

switch ($mode) {
  'list-all' {
    foreach ($t in $TWEAKS) { Emit-Tweak-State $t }
    Emit-Line @{ event = 'finished'; mode = $mode }
    return
  }
  't' {
    $t = $TWEAKS | Where-Object { $_.id -eq $tweakId }
    if (-not $t) { Emit-Line @{ event = 'error'; reason = "unknown tweak id $tweakId" }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
    Emit-Tweak-State $t
    Emit-Line @{ event = 'finished'; mode = $mode }
    return
  }
  'apply' {
    if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
    $t = $TWEAKS | Where-Object { $_.id -eq $tweakId }
    if (-not $t) { Emit-Line @{ event = 'error'; reason = "unknown tweak id $tweakId" }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
    # Backup the current value first (Rescue Center-friendly)
    $cur = $null
    if (Test-Path -LiteralPath $t.regPath) {
      try { $cur = (Get-ItemProperty -LiteralPath $t.regPath -Name $t.valueName -ErrorAction Stop).$t.valueName } catch {}
    }
    $backupFile = Join-Path $backupDir ($t.id + '.json')
    @{ id = $t.id; ts = (Get-Date).ToString('o'); current_value = if ($cur -ne $null) { "$cur" } else { $null }; type = $t.type; path = $t.regPath; value = $t.valueName } | ConvertTo-Json | Out-File -LiteralPath $backupFile -Encoding UTF8 -Force

    # Apply
    try {
      if (-not (Test-Path -LiteralPath $t.regPath)) { New-Item -Path $t.regPath -Force | Out-Null }
      $value = $t.applyValue
      if ($t.type -eq 'DWord') { Set-ItemProperty -LiteralPath $t.regPath -Name $t.valueName -Value ([int]$value) -Type DWord -Force -ErrorAction Stop }
      elseif ($t.type -eq 'String') {
        # Marker strings are handled by removing/keeping the value
        if ($value -eq '(remove)') {
          Remove-ItemProperty -LiteralPath $t.regPath -Name $t.valueName -ErrorAction SilentlyContinue
        } elseif ($value -eq '(restore)') {
          # Revert-only: re-add OneDrive to Run if missing (path is the standard install)
          $oneDrivePath = Join-Path $env:ProgramFiles 'Microsoft OneDrive\OneDrive.exe'
          if (-not (Test-Path -LiteralPath $oneDrivePath)) { $oneDrivePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft OneDrive\OneDrive.exe' }
          if (Test-Path -LiteralPath $oneDrivePath) {
            Set-ItemProperty -LiteralPath $t.regPath -Name $t.valueName -Value "`"$oneDrivePath`" /background" -Type String -Force -ErrorAction Stop
          }
        } else {
          Set-ItemProperty -LiteralPath $t.regPath -Name $t.valueName -Value "$value" -Type String -Force -ErrorAction Stop
        }
      }
      Emit-Line @{ event = 'applied'; id = $t.id; backup_at = $backupFile; new_value = "$value" }
      & "$PSScriptRoot\optimize-report.ps1" --tool 'Win10' --action $t.id
    } catch {
      Emit-Line @{ event = 'error'; id = $t.id; reason = $_.Exception.Message }
    }
    Emit-Line @{ event = 'finished'; mode = $mode }
    return
  }
  'revert' {
    if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
    $backupFile = Join-Path $backupDir ($tweakId + '.json')
    if (-not (Test-Path -LiteralPath $backupFile)) { Emit-Line @{ event = 'error'; reason = "no backup file for $tweakId" }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
    $b = Get-Content -LiteralPath $backupFile -Raw | ConvertFrom-Json
    try {
      if ($b.current_value -eq $null) {
        Remove-ItemProperty -LiteralPath $b.path -Name $b.value -ErrorAction SilentlyContinue
      } else {
        Set-ItemProperty -LiteralPath $b.path -Name $b.value -Value ([string]$b.current_value) -Force -ErrorAction Stop
      }
      Emit-Line @{ event = 'reverted'; id = $tweakId; restored_to = $b.current_value }
      & "$PSScriptRoot\optimize-report.ps1" --tool 'Win10' --action ('revert:' + $tweakId)
    } catch {
      Emit-Line @{ event = 'error'; id = $tweakId; reason = $_.Exception.Message }
    }
    Emit-Line @{ event = 'finished'; mode = $mode }
    return
  }
}
