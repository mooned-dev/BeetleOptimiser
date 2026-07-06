# optimize-browser-helper-objects.ps1 - Browser Helper Objects (BHO) + IE
# extensions scanner. Per Auslogics, BHOs are COM components IE/Edge
# load at launch (HKLM\...\Browser Helper Objects - CLSIDs). Many install
# silently with freeware; some are hijack tools. Plus IE extensions at
# HKLM\...\Microsoft\Internet Explorer\Extensions. We list both, classify
# each as Found (file path resolves) or Orphan (file does not).
#
# Per Microsoft Learn on BHOs (the canonical reference, still applies for
# IE-mode in Windows 11):
#   - HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Browser
#     Helper Objects is per-CLSID subkeys with a default value containing
#     the COM class GUID.
#   - HKLM\SOFTWARE\Classes\CLSID\<guid>\InprocServer32 holds the COM
#     server path; InprocServer32\(Default) is the DLL.
#   - Modern: HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients lives for Edge
#     extensions but those aren't "helper objects" in the IE sense.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$PATHS = @(
  @{ hive = 'HKLM'; path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Browser Helper Objects' }
  @{ hive = 'HKCU'; path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Browser Helper Objects' }
  @{ hive = 'HKLM'; path = 'HKLM:\SOFTWARE\Microsoft\Internet Explorer\Extensions' }
)

$mode = 'list'
$doFire = $false

$i = 0
while ($i -lt $args.Count) {
  $a = $args[$i]
  if ($a -eq 'list')   { $mode = 'list' }
  elseif ($a -eq 'apply') { $mode = 'apply'; $doFire = $true }
  elseif ($a -eq '--yes')  { $doFire = $true }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode }

# --- LIST ---
if ($mode -eq 'list') {
  foreach ($p in $PATHS) {
    if (-not (Test-Path -LiteralPath $p.path)) { continue }
    Get-ChildItem -LiteralPath $p.path -ErrorAction SilentlyContinue | ForEach-Object {
      $clsid = $_.PSChildName
      $clsidPath = $_.PSPath
      # Resolve the InprocServer32 path
      $comPath = "Registry::HKEY_CLASSES_ROOT\CLSID\$clsid\InprocServer32"
      $filePath = $null
      try {
        $filePath = (Get-ItemProperty -LiteralPath $comPath -ErrorAction Stop).'(default)'
      } catch {}
      $displayName = $null
      try {
        $displayName = (Get-ItemProperty -LiteralPath "Registry::HKEY_CLASSES_ROOT\CLSID\$clsid\InprocServer32" -ErrorAction SilentlyContinue).'(default)'
      } catch {}
      $status = 'unknown'
      if ($filePath) {
        if (Test-Path -LiteralPath $filePath -PathType Leaf) { $status = 'found' }
        else { $status = 'orphan' }
      }
      Emit-Line @{
        event = 'bho'
        item = @{
          id = ($p.hive + '::' + $clsid)
          hive = $p.hive
          location = $p.path
          clsid = $clsid
          file_path = if ($filePath) { $filePath } else { '(none)' }
          status = $status
        }
      }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

# --- APPLY ---
# Apply mode only deletes entries whose file path no longer exists
# (i.e. real orphans, not live BHOs that users intentionally loaded).
if ($mode -eq 'apply') {
  if (-not $doFire) { Emit-Line @{ event = 'skipped'; reason = 'needs --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  $deleted = 0
  foreach ($p in $PATHS) {
    if (-not (Test-Path -LiteralPath $p.path)) { continue }
    Get-ChildItem -LiteralPath $p.path -ErrorAction SilentlyContinue | ForEach-Object {
      $clsid = $_.PSChildName
      $comPath = "Registry::HKEY_CLASSES_ROOT\CLSID\$clsid\InprocServer32"
      $filePath = $null
      try {
        $filePath = (Get-ItemProperty -LiteralPath $comPath -ErrorAction Stop).'(default)'
      } catch {}
      if ($filePath -and -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        Remove-Item -LiteralPath $_.PSPath -Recurse -Force -ErrorAction SilentlyContinue
        $deleted++
        Emit-Line @{ event = 'removed'; id = ($p.hive + '::' + $clsid); file_path = $filePath }
      }
    }
  }
  Emit-Line @{ event = 'done'; removed = $deleted }
  & "$PSScriptRoot\optimize-report.ps1" --tool 'Browser Helper Objects' --action 'clean' --files $deleted
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}
