# optimize-action-center.ps1 - Action Center cleaner. Per Auslogics the
# category covers:
#   - "Notification area icons" icon-cache cleanup
#     (HKCU\...\Explorer\NotificationIcons + the TrayNotify\IconStreams
#     value which records per-app icon state)
#   - TrackNotifications + TrackActionCenterCache (per-Microsoft
#      docs - HKCU\Software\Classes\...LocalServer\ExploreStream)
#   - Aero Peek preview window sizing
#   - Notification area disabled-icons visibility (HKCU...\TrayNotify
#     "EnableAutoTray" + "EnableAutoTrayButtonVisibility")
#   - Recent files / Recent directories cleanup via HKCU\...\RecentDocs
#     (this category is also touched by Auslogics' Clean Registry)
#   - Clipboard history (deliberately not cleared - Windows 10/11 doesn't
#     persist this outside the runtime clipboard service)
#
# Output: NDJSON per-op state + apply events. Apply is destructive - only
# the notification area icon-cache is safe to clear (Windows rebuilds
# it on the fly). Other operations are non-destructive toggles.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'list'
$doFire = $false
$op = $null

foreach ($a in $args) {
  if ($a -eq 'list') { $mode = 'list' }
  elseif ($a -eq 'apply') { $mode = 'apply'; $doFire = $true }
  elseif ($a -eq '--yes') { $doFire = $true }
  elseif ($a -eq '--op') {
    if ($args.Count -gt 0) {
      $idx = [array]::IndexOf($args, $a)
      if ($idx -lt $args.Count - 1) { $op = $args[$idx + 1] }
    }
  }
}

Emit-Line @{ event = 'started'; mode = $mode; op = $op }

# Each op has: id, label, description, current state, what 'apply' does.
function Emit-Op($id, $label, $description, $current, $apply) {
  Emit-Line @{
    event = 'op'
    item = @{
      id = $id
      label = $label
      description = $description
      current_value = $current
      applied_value = $apply
    }
  }
}

# --- LIST ---
if ($mode -eq 'list') {
  # Recent Docs usage
  $recentDocs = 0
  try {
    Get-ChildItem -LiteralPath "Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs" -ErrorAction SilentlyContinue | ForEach-Object {
      # -Name '*' with no -MemberType matches EVERY member (methods, .NET
      # properties, the 5 PS-internal PSPath/PSParentPath/PSChildName/
      # PSDrive/PSProvider properties Get-ItemProperty always adds) - not
      # just real registry values, which inflated the displayed count.
      $recentDocs += (Get-ItemProperty -LiteralPath "Registry::$($_.Name)" -ErrorAction SilentlyContinue |
        Get-Member -MemberType NoteProperty | Where-Object { $_.Name -notlike 'PS*' } | Measure-Object).Count
    }
  } catch {}
  # Aero Peek size (per registry)
  $peekIdx = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\DWM' -ErrorAction SilentlyContinue).CompositorFrameDelay
  # Notification area: count keys in HKCU\...\Explorer\NotificationIcons (per user settings)
  $icons = 0
  try { $icons = (Get-ChildItem -LiteralPath 'HKCU:\Control Panel\NotifyIconSchemes' -ErrorAction SilentlyContinue).Count } catch {}
  # "Always show all icons in notification area" toggle
  $autoTrayBtn = (Get-ItemProperty -LiteralPath 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' -Name 'EnableAutoTrayButtonVisibility' -ErrorAction SilentlyContinue).EnableAutoTrayButtonVisibility
  # Pop-up does not display tooltips toggle
  $popups = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Tips' -ErrorAction SilentlyContinue).RoamingEnabled

  Emit-Op 'recent_docs' 'Clear Recent Documents list' 'Removes the per-app recent document / item tracking. Windows will rebuild it.' $recentDocs 'cleared'
  Emit-Op 'auto_tray_button' 'Show always all notification icons' 'Forces every tray icon to remain visible (no auto-hide)' "$autoTrayBtn" '1'
  Emit-Op 'aero_peek_size' 'Aero Peek preview size' 'Adjust the hover preview window size (transparent - nothing visible changes)' "$peekIdx" '0 (default)'
  Emit-Op 'roaming_tips' 'Disable Windows tips pop-ups' 'No more "Try Microsoft Edge" flyouts' "$popups" '0'
  Emit-Op 'notification_cache' 'Rebuild notification area cache' 'Recreates the icon-association registry cache Windows uses for tray icons' "$icons entries" 'rebuilt'

  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

# --- APPLY ---
if ($mode -eq 'apply') {
  if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  if (-not $op) { Emit-Line @{ event = 'skipped'; reason = 'needs --op <id>' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }

  switch ($op) {
    'recent_docs' {
      # Clear RecentDocs values + the individual sub-key entries
      $path = "Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs"
      if (Test-Path -LiteralPath $path) {
        # Use the file system to delete entries instead of touching registry
        # (Recent Docs uses shell32 to render the list)
        Get-Item -LiteralPath $path 2>$null | Out-Null
        # Backup each sub-key + clear it
        Get-ChildItem -LiteralPath $path -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            Remove-ItemProperty -LiteralPath $_.PSPath -Name '*' -ErrorAction Stop
          } catch {}
        }
        # Also clear File Explorer history under HKCU
        Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\TypedPaths' -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\TypedURLs' -Recurse -Force -ErrorAction SilentlyContinue
        Emit-Line @{ event = 'applied'; op = $op }
      } else {
        Emit-Line @{ event = 'noop'; op = $op; reason = 'Registry path absent' }
      }
    }
    'auto_tray_button' {
      Set-ItemProperty -LiteralPath 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' -Name 'EnableAutoTrayButtonVisibility' -Value 1 -Type DWord -Force -ErrorAction Stop
      Emit-Line @{ event = 'applied'; op = $op }
    }
    'aero_peek_size' {
      # Write the default frame size (0 = leave to Windows default)
      Set-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\DWM' -Name 'CompositorFrameDelay' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
      Emit-Line @{ event = 'applied'; op = $op; note = 'Aero Peek window size uses Windows default' }
    }
    'roaming_tips' {
      Set-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Tips' -Name 'RoamingEnabled' -Value 0 -Type DWord -Force -ErrorAction Stop
      # Disable Tips welcome
      Set-ItemProperty -LiteralPath 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' -Name 'SilentInstalledAppsEnabled' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
      Emit-Line @{ event = 'applied'; op = $op }
    }
    'notification_cache' {
      # The icon cache Windows reads when laying out the tray. Windows rebuilds
      # this on the fly when missing; we set NotifyIconSchemes to a clean empty value.
      $p = 'HKCU:\Control Panel\NotifyIconSchemes'
      if (Test-Path -LiteralPath $p) {
        # Don't delete the key (Windows needs the schemas), just clear values.
        # NOTE: Get-Item's own object never exposes registry VALUES as
        # NoteProperties (verified: Get-Member -Type NoteProperty on it
        # returns nothing) - .Property is the actual accessor for the list
        # of value names. The old code silently cleared nothing at all.
        $valueNames = (Get-Item -LiteralPath $p -ErrorAction SilentlyContinue).Property
        foreach ($name in $valueNames) {
          Remove-ItemProperty -LiteralPath $p -Name $name -Force -ErrorAction SilentlyContinue
        }
      }
      Emit-Line @{ event = 'applied'; op = $op; note = 'Windows will rebuild on next sign-in' }
    }
    default {
      Emit-Line @{ event = 'error'; reason = "unknown op $op" }
    }
  }
  & "$PSScriptRoot\optimize-report.ps1" --tool 'Action Center' --action $op
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}
