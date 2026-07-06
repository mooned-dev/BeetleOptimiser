# optimize-memory.ps1 - trim every process's working set (frees RAM back to
# the standby list, often quoted as "RAM defrag"). Companion to the
# `optimizer:trim-working-sets` IPC handler in main.js.
#
# WHAT IT DOES:
# Calls NtSetSystemInformation (info class 0x50 = SystemMemoryListInformation)
# with sub-command 2 = MemoryEmptyWorkingSets. This empties the working set
# of every process, returning the memory to the standby list where it can
# satisfy future zero-page faults without disk IO. On a system with low RAM
# this can free hundreds of MB with no observable cost (processes page back
# in as needed).
#
# OPTIONAL SECOND PASS:
# Sub-command 4 = MemoryPurgeStandbyList (drains standby, frees to free list).
# This is more aggressive and allocates more zero-pages later. We do not
# run it by default - the renderer can request it explicitly via a future
# "Aggressive free" toggle.
#
# REFERENCE: Geoff Chappell NTAPI docs (canonical, well-known clean URL):
# https://www.geoffchappell.com/studies/windows/km/ntoskrnl/api/ex/sysinfo/set.htm
# Class 0x50 = SystemMemoryListInformation
# Sub-commands: 0 (capture accessed bits), 2 (EmptyWorkingSets), 4 (PurgeStandbyList).
#
# PRIVILEGE: MemoryEmptyWorkingSets requires SeProfileSingleProcessPrivilege
# (admin). The IPC handler in main.js must be marked requireAdmin too -
# if the renderer calls it before elevation, this script will fail with
# STATUS_PRIVILEGE_NOT_HELD and the handler will surface that error.

$ErrorActionPreference = 'SilentlyContinue'

# --- P/Invoke setup. Done once at script load. ---
$signatures = @'
[DllImport("ntdll.dll", SetLastError=true)]
public static extern int NtSetSystemInformation(int InfoClass, IntPtr Info, uint InfoLength);
'@

try {
  $nt = Add-Type -Member $signatures -Name 'NtMemoryOps' -Namespace 'Win32' -PassThru
} catch {
  # Already loaded - retrieve
  $nt = [Win32.NtMemoryOps]
}

# SystemMemoryListInformation info class = 0x50 (80).
# Sub-command constants per Geoff Chappell.
$SystemMemoryListInformation = 0x50
$MemoryEmptyWorkingSets     = 2
$MemoryPurgeStandbyList     = 4

function Emit-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

function Get-AvailableMB {
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    [math]::Round($os.FreePhysicalMemory / 1024)
  } catch { 0 }
}

function Invoke-Trim {
  param([int]$SubCommand)
  # SYSTEM_MEMORY_LIST_INFORMATION struct layout (per Geoff Chappell NTAPI):
  #   ULONG Protocol (1 byte)
  #   ULONG Flags (1 byte, must be zero)
  #   ULONG Length (4 bytes, struct length including this header)
  #   data bytes follow
  # Total header is 16 bytes. We use the 1-byte command variant (Length=1,
  # embeds the sub-command in Protocol). Sub-commands 2 (EmptyWorkingSets)
  # and 4 (PurgeStandbyList) take NO additional data, so we pass a pointer
  # to this 16-byte struct.

  # Build the struct as a byte array of the well-known 1-byte-command shape.
  # This matches the pattern other admin tools (RAMMap, Process Lasso) use.
  $buf = New-Object byte[] 16
  # Protocol = sub-command as a byte
  $buf[0] = [byte]$SubCommand
  # Flags = 0
  $buf[1] = 0x00
  # Length = 1 (only the byte itself)
  [System.BitConverter]::GetBytes([uint32]1).CopyTo($buf, 4)
  # Remaining 10 bytes = 0 (already zero from New-Object).

  $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($buf.Length)
  try {
    [System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $ptr, $buf.Length)
    $before = Get-AvailableMB
    # InfoLength per NtSetSystemInformation is sizeof the buffer, in bytes.
    $rc = $nt::NtSetSystemInformation(
      $SystemMemoryListInformation,
      $ptr,
      [uint32]$buf.Length
    )
    $after = Get-AvailableMB
    $freed = [int]$after - [int]$before
    return @{ status='ok'; subcommand=$SubCommand; ntstatus=$rc; freed_mb=$freed; before_mb=$before; after_mb=$after }
  } finally {
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
  }
}

[Console]::Out.WriteLine(((Get-AvailableMB | ForEach-Object { @{event='available_mb'; value=$_} }) | ConvertTo-Json -Compress))
[Console]::Out.Flush()

# Sub-command 2 (MemoryEmptyWorkingSets) is the standard "trim working sets"
# operation. It walks every process and discards pages from the WS.
$res1 = Invoke-Trim -SubCommand $MemoryEmptyWorkingSets
Emit-Line $res1
if ($res1.status -eq 'ok' -and $res1.ntstatus -ne 0) {
  # STATUS_PRIVILEGE_NOT_HELD is 0xC0000061 (3221225569 decimal)
  Emit-Line @{event='warning'; reason='ntstatus_nonzero'; ntstatus=$res1.ntstatus; meaning='STATUS_PRIVILEGE_NOT_HELD if admin required and missing.'}
}

if ($args -contains '--aggressive') {
  $res2 = Invoke-Trim -SubCommand $MemoryPurgeStandbyList
  Emit-Line $res2
}

Emit-Line @{event='finished'}
