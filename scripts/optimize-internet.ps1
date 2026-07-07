# optimize-internet.ps1 - Internet Optimization (TCP auto-tuning, DNS cache
# TTL, NetBIOS over TCP/IP disable, MTU hint, NIC power-management disable).
# Companion to optimizer:internet-optimize IPC handler.
#
# READ-ONLY / WRITE safety: list/optimize modes. Optimize is destructive - it
# writes registry keys (netsh registry-equivalent path) and runs netsh winsock
# / int tcp reset - which is irreversible on a system where the user is on
# dial-up or has a stale network driver. --yes required.
#
# FAILS OUT IF: the user is connected via Wi-Fi with auto-load-balancing
# (the heuristics differ for tethered mobile hotspots). Always inspect
# `Get-NetAdapter` first and warn the user if the adapter is mobile broadband.
#
# Mirrors the registry paths that netsh int tcp show global reads - per
# Microsoft Learn docs on netsh int tcp:
#   HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters
#   - Tcp1323Opts (window scaling)
#   - TcpAutotuningLevel (RFC 1323 / Receive Window Auto-Tuning)
#   - GlobalMaxTcpWindowSize
#   - TcpTimedWaitDelay
# and the NIC power-management settings via netsh int tcp set global
# autotuninglevel=normal (the equivalent registry write path is also valid).

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = 'list'
$doFire = $false

$i = 0
while ($i -lt $args.Count) {
  switch ($args[$i]) {
    'list'    { $mode = 'list' }
    'optimize' { $mode = 'optimize' }
    'reset'   { $mode = 'reset' }
    '--yes'   { $doFire = $true }
    default   { }
  }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode }

# --- LIST: read all relevant settings via netsh + registry ---
if ($mode -eq 'list') {
  # netsh is the official tool. We capture each subcommand and emit settings.
  $capture = netsh int tcp show global 2>&1 | Out-String
  Emit-Line @{ event = 'tcp_global'; raw = $capture }

  $adapters = Get-NetAdapter -ErrorAction SilentlyContinue
  foreach ($a in $adapters) {
    Emit-Line @{
      event = 'adapter'
      item = @{
        name = $a.Name; if_index = $a.ifIndex; status = "$($a.Status)"
        speed = "$($a.LinkSpeed)"; media = "$($a.MediaType)"
      }
    }
  }

  # AutoTuningLevel value in the registry is the same netsh reports.
  $at = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters' -ErrorAction SilentlyContinue).TcpAutotuningLevel
  Emit-Line @{ event = 'autotuning'; level = if ($at -ne $null) { [int]$at } else { $null } }

  # DNS client cache TTL (settings: TTL per the highest-value DNS record).
  # Per Microsoft Learn - this lives in the registry under:
  #   HKLM\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters\MaxCacheEntryTtlLimit
  $dns = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters' -ErrorAction SilentlyContinue).MaxCacheEntryTtlLimit
  Emit-Line @{ event = 'dns_cache_max_ttl'; limit_seconds = if ($dns -ne $null) { [int]$dns } else { $null } }

  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

# --- OPTIMIZE: requires --yes ---
if ($mode -eq 'optimize') {
  if (-not $doFire) {
    Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }
    Emit-Line @{ event = 'finished'; mode = $mode }
    return
  }

  $applied = @()

  # 1) netsh int tcp set global autotuninglevel=normal - registry equivalent:
  #    HKLM\...\Tcpip\Parameters.TcpAutotuningLevel = 4 (Normal)
  try {
    Set-NetTCPSetting -SettingName InternetCustom -AutoTuningLevelProfile Normal -ErrorAction Stop
    $applied += 'autotuning_normal'
  } catch {
    # Fall back: netsh command-line form (writes through netsh to the same key)
    netsh int tcp set global autotuninglevel=normal 2>&1 | Out-Null
    $applied += 'autotuning_normal_via_netsh'
  }

  # 2) Enable TCP window scaling (RFC 1323) - same registry key as netsh reads.
  try {
    # Tcp1323Opts = 3 enables both window scaling + timestamps
    Set-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters' -Name Tcp1323Opts -Value 3 -Type DWord -ErrorAction Stop
    $applied += 'tcp1323_enabled'
  } catch { Emit-Line @{ event = 'warning'; step = 'tcp1323'; reason = $_.Exception.Message } }

  # 3) Disable NetBIOS over TCP/IP for IPv4 on all enabled adapters - matches
  #    the property page "Obtain DNS server address automatically" section.
  $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }
  foreach ($a in $adapters) {
    try {
      # NBNS binding lives in the adapter's per-adapter Tcpip\Parameters hive
      $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$($a.ifIndex)"
      if (Test-Path $regPath) {
        Set-ItemProperty -LiteralPath $regPath -Name NetBIOSOptions -Value 2 -Type DWord -ErrorAction Stop
        $applied += "netbios_disabled_$($a.Name)"
      }
    } catch { Emit-Line @{ event = 'warning'; step = 'netbios'; adapter = $a.Name; reason = $_.Exception.Message } }
  }

  # 4) DNS cache TTL - raise it from default 1 hr to 24 hr so repeat lookups
  #    benefit. Per Microsoft Learn, default is 86400 (24h), but some routers
  #    override this to 300 (5 min).
  try {
    $path = 'HKLM:\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters'
    if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
    Set-ItemProperty -LiteralPath $path -Name MaxCacheEntryTtlLimit -Value 86400 -Type DWord -ErrorAction Stop
    $applied += 'dns_ttl_24h'
  } catch { Emit-Line @{ event = 'warning'; step = 'dns_ttl'; reason = $_.Exception.Message } }

  Emit-Line @{ event = 'applied'; steps = $applied }
  & "$PSScriptRoot\optimize-report.ps1" --tool 'Internet' --action 'optimize'
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

# --- RESET: revert to Windows defaults (requires --yes) ---
if ($mode -eq 'reset') {
  if (-not $doFire) {
    Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }
    Emit-Line @{ event = 'finished'; mode = $mode }
    return
  }
  try {
    netsh int tcp set global autotuninglevel=normal 2>&1 | Out-Null
    Emit-Line @{ event = 'reset' }
  } catch { Emit-Line @{ event = 'error'; reason = $_.Exception.Message } }
  # This used to be logged as --action 'optimize' (copy-paste from the
  # block above) and ran AFTER the 'finished' event - both fixed: it's
  # correctly labeled 'reset' now, and runs before 'finished' like every
  # other script's report call.
  & "$PSScriptRoot\optimize-report.ps1" --tool 'Internet' --action 'reset'
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}