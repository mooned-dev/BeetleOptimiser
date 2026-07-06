# optimize-context-menu.ps1 - Context Menu Manager. Reads the per-type shell
# context-menu entries from HKCR (HKEY_CLASSES_ROOT) + the Directory\Background
# shell extension list. Lets the user see + disable/enable extras they don't
# use, like "Open with VS Code", "Include in library", graphics-card-injected
# context items.
#
# Per Microsoft Learn on shell extensions (the canonical doc):
#   - Static items live in: HKCR\<ext>\shell\<verb>\command
#   - Dynamic/context-handlers live in:
#       HKCR\Directory\shellex\ContextMenuHandlers\<Name>
#       HKCR\*\shellex\ContextMenuHandlers\<Name>
#       HKCR\Drive\shellex\ContextMenuHandlers\<Name>
#   Each handler is a CLSID with its COM object living under HKLM\...\CLSID\{...}
#
# SAFETY: 'list' is read-only. 'disable' / 'enable' rename the handler's
# value to "v_disabled_{guid}" as a soft-disable (Windows convention from
# every major context-menu tool). Restorable by the same script using the
# 'enable' mode. No permanent delete.

$ErrorActionPreference = 'SilentlyContinue'

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$ROOTS = @(
  @{ name = 'Folder background'; registry = 'HKCR:Directory\Background\shellex\ContextMenuHandlers' },
  @{ name = 'Drive';              registry = 'HKCR:Drive\shellex\ContextMenuHandlers' },
  @{ name = 'All files';          registry = 'HKCR:*\shellex\ContextMenuHandlers' },
  @{ name = 'Directory';          registry = 'HKCR:Directory\shellex\ContextMenuHandlers' }
)

$mode = 'list'
$doFire = $false
$id = $null

$i = 0
while ($i -lt $args.Count) {
  $a = $args[$i]
  if ($a -eq 'list') { $mode = 'list' }
  elseif ($a -eq 'disable') { $mode = 'disable'; $doFire = $true }
  elseif ($a -eq 'enable')  { $mode = 'enable';  $doFire = $true }
  elseif ($a -eq '--id') { $id = $args[++$i] }
  elseif ($a -eq '--yes') { $doFire = $true }
  $i++
}

Emit-Line @{ event = 'started'; mode = $mode; id = $id }

# --- LIST ---
if ($mode -eq 'list') {
  foreach ($r in $ROOTS) {
    $keyRoot = $r.registry
    if (-not (Test-Path -LiteralPath $keyRoot)) { continue }
    Get-ChildItem -LiteralPath $keyRoot -ErrorAction SilentlyContinue | ForEach-Object {
      $name = $_.PSChildName
      $value = $null
      try { $value = (Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue).'(default)' } catch {}
      Emit-Line @{
        event = 'handler'
        item = @{
          id = ($r.name + ':' + $name)
          location = $r.name
          name = $name
          value = if ($value) { $value } else { '(empty)' }
          disabled = ($name -like 'v_*')
        }
      }
    }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

# --- DISABLE ---
if ($mode -eq 'disable') {
  if (-not $doFire -or -not $id) { Emit-Line @{ event = 'skipped'; reason = 'needs --id <location:name> --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  $parts = $id -split ':', 2
  if ($parts.Count -ne 2) { Emit-Line @{ event = 'error'; reason = 'bad id format, use Location:Name' }; return }
  $locName = $parts[0]
  $name = $parts[1]
  $r = $ROOTS | Where-Object { $_.name -eq $locName }
  if (-not $r) { Emit-Line @{ event = 'error'; reason = 'unknown location' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  $src = Join-Path $r.registry $name
  if (-not (Test-Path -LiteralPath $src)) { Emit-Line @{ event = 'error'; reason = 'not found' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  $disabledName = 'v_disabled_' + ([Guid]::NewGuid().ToString('N'))
  $dst = Join-Path $r.registry $disabledName
  try {
    # We can't easily rename via PowerShell on a registry subkey without a
    # psdrive workaround; instead grab the value data, write to new key, then
    # delete the old one.
    $v = (Get-ItemProperty -LiteralPath $src -ErrorAction Stop).'(default)'
    if (-not (Test-Path -LiteralPath $dst)) { New-Item -Path $dst -Force | Out-Null }
    Set-ItemProperty -LiteralPath $dst -Name '(default)' -Value "$v" -ErrorAction Stop
    Remove-Item -LiteralPath $src -Recurse -Force -ErrorAction Stop
    Emit-Line @{ event = 'disabled'; id = $id; new_id = ($locName + ':' + $disabledName) }
    & "$PSScriptRoot\\optimize-report.ps1" --tool 'Context Menu' --action 'disable'
  } catch {
    Emit-Line @{ event = 'error'; reason = $_.Exception.Message }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}

if ($mode -eq 'enable') {
  if (-not $doFire -or -not $id) { Emit-Line @{ event = 'skipped'; reason = 'needs --id <location:name> --yes' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  if ($id -notlike '*:v_*') { Emit-Line @{ event = 'error'; reason = 'only v_* entries can be re-enabled' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  $parts = $id -split ':', 2
  if ($parts.Count -ne 2) { Emit-Line @{ event = 'error'; reason = 'bad id format' }; return }
  $locName = $parts[0]
  $name = $parts[1]
  $r = $ROOTS | Where-Object { $_.name -eq $locName }
  if (-not $r) { Emit-Line @{ event = 'error'; reason = 'unknown location' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  $src = Join-Path $r.registry $name
  if (-not (Test-Path -LiteralPath $src)) { Emit-Line @{ event = 'error'; reason = 'not found' }; Emit-Line @{ event = 'finished'; mode = $mode }; return }
  # Recover original name by removing the v_disabled_<guid> prefix
  $original = ($name -replace '^v_disabled_[a-f0-9]+', '')
  $dst = Join-Path $r.registry $original
  try {
    $v = (Get-ItemProperty -LiteralPath $src -ErrorAction Stop).'(default)'
    if (-not (Test-Path -LiteralPath $dst)) { New-Item -Path $dst -Force | Out-Null }
    Set-ItemProperty -LiteralPath $dst -Name '(default)' -Value "$v" -ErrorAction Stop
    Remove-Item -LiteralPath $src -Recurse -Force -ErrorAction Stop
    Emit-Line @{ event = 'enabled'; id = $id; restored_as = ($locName + ':' + $original) }
    & "$PSScriptRoot\\optimize-report.ps1" --tool 'Context Menu' --action 'enable'
  } catch {
    Emit-Line @{ event = 'error'; reason = $_.Exception.Message }
  }
  Emit-Line @{ event = 'finished'; mode = $mode }
  return
}
