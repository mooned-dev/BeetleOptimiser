# optimize-report.ps1 - Report writer. Appends a structured JSONL line to a
# JSONL reports file under %LOCALAPPDATA%\BeetleOptimiser\reports\reports.jsonl.
# All destructive tool scripts in this project can call this after their
# 'finished' event to leave an audit trail the ReportsView renders.
#
# Usage:
#   powershell -File optimize-report.ps1 --tool "Clean Up" --action "clean" \
#     --files 1234 --bytes 1234567 --note "user confirmed"
#
# JSONL output (per call):
#   {"ts":"2026-07-06T...","tool":"Clean Up","action":"clean","files":1234,
#    "bytes":1234567,"note":"user confirmed"}

param(
  [string]$Tool = '',
  [string]$Action = '',
  [int]$Files = 0,
  [long]$Bytes = 0,
  [string]$Note = ''
)

$ErrorActionPreference = 'SilentlyContinue'

$dir = Join-Path $env:LOCALAPPDATA 'BeetleOptimiser\reports'
if (-not (Test-Path -LiteralPath $dir)) { New-Item -Path $dir -ItemType Directory -Force | Out-Null }
$log = Join-Path $dir 'reports.jsonl'

$entry = @{
  ts = (Get-Date).ToString('o')
  tool = $Tool
  action = $Action
  files = $Files
  bytes = $Bytes
  note = $Note
}

[Console]::Out.WriteLine(($entry | ConvertTo-Json -Compress))
[Console]::Out.Flush()

Add-Content -LiteralPath $log -Value (($entry | ConvertTo-Json -Compress)) -Encoding UTF8 -ErrorAction SilentlyContinue
