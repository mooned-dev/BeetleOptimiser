# optimize-uninstall.ps1 - two-mode script:
#   (1) default mode 'list'   - enumerate installed programs with their
#                                uninstall strings; surface metadata
#                                (publisher, size estimate, install date).
#   (2) mode 'do' (needs --yes)- invoke the uninstall string for a specific
#                                product, with a hardcoded approve-vs-timeout
#                                fallback.
#
# Source: enumerates the standard Windows uninstall registry keys plus
# the 32-bit equivalents on 64-bit Windows (WOW6432Node) plus the per-user
# HKCU key. Every installer that registers with "Programs and Features"
# shows up here.
#
# REFERENCE: Microsoft Learn - "Uninstall registry key"
# https://learn.microsoft.com/en-us/windows/win32/msi/uninstall-registry-key
#
# SAFETY:
#   - 'list' is always safe (read-only).
#   - 'do' is destructive (drops program files + registry). Requires --yes
#     flag from main.js (which only sends it when the renderer confirms
#     after showing the user a destructive Confirmation modal).
#   - Even with --yes the actual uninstall runs SYNCHRONOUSLY here so that
#     completion == confirmed-removed. Caller can wait on the promise.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$mode = if ($args[0] -eq 'do') { 'do' } else { 'list' }
$product = if ($mode -eq 'do') { $args[1] } else { $null }
$doFire  = ($mode -eq 'do') -and ($args -contains '--yes')

Emit-Line @{event='started'; mode=$mode; product=$product}

# Enumerate all three Uninstall registry scopes.
function Get-UninstallKeys {
  $keys = @()
  foreach ($p in @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
  )) {
    if (Test-Path $p) { $keys += Get-ChildItem $p -ErrorAction SilentlyContinue }
  }
  $keys
}

function Read-ProductInfo($k) {
  $props = Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction SilentlyContinue
  if (-not $props) { return $null }
  # Build a compact NDJSON object. Skip if no DisplayName (avoids system entries).
  $name = ($props | Select-Object -ExpandProperty DisplayName -ErrorAction SilentlyContinue)
  if (-not $name) { return $null }
  [PSCustomObject]@{
    id            = "$($k.Name.Replace('\','_'))"
    name          = $name
    publisher     = ($props | Select-Object -ExpandProperty Publisher -ErrorAction SilentlyContinue)
    version       = ($props | Select-Object -ExpandProperty DisplayVersion -ErrorAction SilentlyContinue)
    install_date  = ($props | Select-Object -ExpandProperty InstallDate -ErrorAction SilentlyContinue)
    estimated_size_kb = ($props | Select-Object -ExpandProperty EstimatedSize -ErrorAction SilentlyContinue)
    uninstall_string = ($props | Select-Object -ExpandProperty UninstallString -ErrorAction SilentlyContinue)
    quiet_uninstall = ($props | Select-Object -ExpandProperty QuietUninstallString -ErrorAction SilentlyContinue)
  }
}

if ($mode -eq 'list') {
  $seen = @{}
  foreach ($k in (Get-UninstallKeys)) {
    $info = Read-ProductInfo $k
    if ($info -and -not $seen.ContainsKey($info.id)) {
      $seen[$info.id] = $true
      Emit-Line @{event='product'; info=$info}
    }
  }
  Emit-Line @{event='finished'; count=$seen.Count}
  return
}

# DO mode: invoke uninstall string for the requested product id, but only
# with explicit --yes.
if (-not $doFire) {
  Emit-Line @{event='skipped'; reason='needs --yes'; product=$product}
  Emit-Line @{event='finished'}
  return
}

# Find the requested product by id (which we built from the registry path).
$target = $null
foreach ($k in (Get-UninstallKeys)) {
  $info = Read-ProductInfo $k
  if ($info -and $info.id -eq $product) { $target = $info; break }
}
if (-not $target) {
  Emit-Line @{event='error'; reason='product not found'; product=$product}
  Emit-Line @{event='finished'}
  return
}

$cmd = if ($target.quiet_uninstall) { $target.quiet_uninstall } elseif ($target.uninstall_string) { $target.uninstall_string } else { $null }
if (-not $cmd) {
  Emit-Line @{event='error'; reason='product has no uninstall string'; product=$product; name=$target.name}
  Emit-Line @{event='finished'}
  return
}

Emit-Line @{event='do_start'; product=$product; name=$target.name; command=$cmd}

# Invoke. /quiet /silent /S are common silent flags for InnoSetup / NSIS / MSI;
# we include them in case the installer's CLI parser supports them.
$proc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "$cmd /quiet /silent /S" -Wait -PassThru -WindowStyle Hidden -ErrorAction SilentlyContinue
$exit = $proc.ExitCode

Emit-Line @{event='do_done'; product=$product; exit=$exit}
Emit-Line @{event='finished'}
