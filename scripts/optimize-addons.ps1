# optimize-addons.ps1 - Browser Add-ons Manager. Lists installed extensions
# for Chrome, Edge, Firefox from each browser's own storage. Read-only.
#
# LOCATIONS (per Microsoft Learn + Chrome/Edge/Mozilla docs):
#   Chrome extensions: %LOCALAPPDATA%\Google\Chrome\User Data\<Profile>\Extensions\<ID>
#   Edge extensions:   %LOCALAPPDATA%\Microsoft\Edge\User Data\<Profile>\Extensions\<ID>
#   Firefox extensions: %APPDATA%\Mozilla\Firefox\Profiles\<profile>\extensions\<id>.xpi
# Each extension has a manifest.json (or install.rdf + manifest.json). We
# parse name/version from the manifest and emit one event per extension.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

function Get-ChromiumExtensions($browserName, $userDataPath) {
  if (-not (Test-Path -LiteralPath $userDataPath)) { return }
  $profiles = Get-ChildItem -LiteralPath $userDataPath -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' }
  foreach ($profile in $profiles) {
    $extDir = Join-Path $profile.FullName 'Extensions'
    if (-not (Test-Path -LiteralPath $extDir)) { continue }
    Get-ChildItem -LiteralPath $extDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $versionDirs = Get-ChildItem -LiteralPath $_.FullName -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending
      if ($versionDirs.Count -eq 0) { return }
      $manifestPath = Join-Path $versionDirs[0].FullName 'manifest.json'
      if (-not (Test-Path -LiteralPath $manifestPath)) { return }
      try {
        $m = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -ErrorAction Stop
        Emit-Line @{
          event = 'addon'
          item = @{
            browser = $browserName
            profile = $profile.Name
            id = $_.Name
            name = if ($m.name) { $m.name } else { '(unnamed)' }
            version = $m.version
            enabled = if ($null -ne $m.disabled) { -not $m.disabled } else { $true }
          }
        }
      } catch {}
    }
  }
}

Emit-Line @{ event = 'started' }

$localApp = $env:LOCALAPPDATA
$appData = $env:APPDATA

Get-ChromiumExtensions 'Google Chrome' (Join-Path $localApp 'Google\Chrome\User Data')
Get-ChromiumExtensions 'Microsoft Edge' (Join-Path $localApp 'Microsoft\Edge\User Data')

# Firefox profiles + .xpi files
$ffRoot = Join-Path $appData 'Mozilla\Firefox\Profiles'
if (Test-Path -LiteralPath $ffRoot) {
  Get-ChildItem -LiteralPath $ffRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $extDir = Join-Path $_.FullName 'extensions'
    if (Test-Path -LiteralPath $extDir) {
      Get-ChildItem -LiteralPath $extDir -Filter '*.xpi' -ErrorAction SilentlyContinue | ForEach-Object {
        $addonId = $_.BaseName
        $name = $addonId
        Emit-Line @{
          event = 'addon'
          item = @{
            browser = 'Mozilla Firefox'
            profile = $_.Name
            id = $addonId
            name = $name
            version = 'unknown'
            enabled = $true
          }
        }
      }
    }
  }
}

Emit-Line @{ event = 'finished' }
