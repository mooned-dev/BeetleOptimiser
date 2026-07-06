// "Clean Up" tab. 4-column layout: disk selector + cleaner buttons,
// Registry Cleanup card, Unused Programs card, and a "Useful tools" icon
// grid sidebar on the right.
//
// "Deep Disk Cleaner" is the reference implementation of the safe
// scan -> confirm -> execute flow: it scans for real numbers first, shows
// them in a ConfirmModal, and only calls the destructive cleanJunkFiles IPC
// after the user accepts AND main.js has minted a matching confirm token.

import React, { useState } from 'react';
import {
  HardDrive, CheckCircle, Database, AppWindow,
  MagnifyingGlass, FolderSimpleMinus, PuzzlePiece,
} from '@phosphor-icons/react';
import InfoBanner from '../shared/InfoBanner.jsx';
import UsefulTools from '../shared/UsefulTools.jsx';
import ConfirmModal from '../shared/ConfirmModal.jsx';
import ItemListModal from '../shared/ItemListModal.jsx';

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

const USEFUL_TOOLS = [
  { id: 'explore',   label: 'Explore drive contents',                Icon: MagnifyingGlass },
  { id: 'manage',    label: 'Manage installed applications',         Icon: AppWindow },
  { id: 'compact',   label: 'Compact Windows folder',                Icon: FolderSimpleMinus },
  { id: 'addons',    label: 'Manage browser add-ons and plugins',    Icon: PuzzlePiece },
  { id: 'registry',  label: 'Clean Windows registry',                Icon: Database },
  { id: 'compactreg', label: 'Compact Windows registry',             Icon: Database },
];

function ActionButton({ c, onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="theme-pill-btn"
      style={{
        display: 'block', width: '100%', background: c.accent, color: 'white',
        border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 12,
        fontWeight: 600, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
        marginBottom: 8, opacity: disabled ? 0.6 : 1,
      }}
    >{children}</button>
  );
}

function ColumnLink({ c, onClick, children }) {
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); onClick && onClick(); }} style={{
      display: 'block', fontSize: 12, color: c.accent, textDecoration: 'underline',
      cursor: 'pointer', marginTop: 6,
    }}>{children}</a>
  );
}

export default function CleanUpView({ c, isLight }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scanTotals, setScanTotals] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resultText, setResultText] = useState(null);

  async function handleDeepDiskCleanerClick() {
    if (!window.beetleAPI) {
      setResultText('Not available outside the packaged app.');
      return;
    }
    setResultText(null);
    setBusy(true);
    try {
      const { items } = await window.beetleAPI.optimizer.scanJunkFiles();
      const totalFiles = items.reduce((s, i) => s + (i.files || 0), 0);
      const totalBytes = items.reduce((s, i) => s + (i.bytes || 0), 0);
      setScanTotals({ items, totalFiles, totalBytes });
      setConfirmOpen(true);
    } catch (e) {
      setResultText(`Scan failed: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmClean() {
    setBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('clean-junk');
      const result = await window.beetleAPI.optimizer.cleanJunkFiles(token);
      const finished = result.items.find((i) => i.event === 'finished');
      setResultText(`Freed ${formatBytes(finished?.total_freed_bytes || 0)}.`);
    } catch (e) {
      setResultText(`Clean failed: ${e.message || e}`);
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  // --- Registry cleanup: scan -> confirm -> repair ---
  const [registryBusy, setRegistryBusy] = useState(false);
  const [registryConfirmOpen, setRegistryConfirmOpen] = useState(false);
  const [registryIssues, setRegistryIssues] = useState(null);
  const [registryResult, setRegistryResult] = useState(null);

  async function handleCleanRegistryClick() {
    if (!window.beetleAPI) { setRegistryResult('Not available outside the packaged app.'); return; }
    setRegistryResult(null);
    setRegistryBusy(true);
    try {
      const { items } = await window.beetleAPI.optimizer.scanRegistryIssues();
      const issues = items.filter((i) => i.event === 'item');
      if (issues.length === 0) {
        setRegistryResult('No orphan registry entries found.');
        return;
      }
      setRegistryIssues(issues);
      setRegistryConfirmOpen(true);
    } catch (e) {
      setRegistryResult(`Scan failed: ${e.message || e}`);
    } finally {
      setRegistryBusy(false);
    }
  }

  async function handleConfirmRegistryRepair() {
    setRegistryBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('repair-registry');
      const result = await window.beetleAPI.optimizer.repairRegistryIssues('all', token);
      const fixed = result.items.filter((i) => i.event === 'fixed').length;
      setRegistryResult(`Fixed ${fixed} registry ${fixed === 1 ? 'entry' : 'entries'}.`);
    } catch (e) {
      setRegistryResult(`Repair failed: ${e.message || e}`);
    } finally {
      setRegistryBusy(false);
      setRegistryConfirmOpen(false);
    }
  }

  // --- Empty Folder Cleaner: scan -> confirm -> delete ---
  const [emptyFoldersBusy, setEmptyFoldersBusy] = useState(false);
  const [emptyFoldersConfirmOpen, setEmptyFoldersConfirmOpen] = useState(false);
  const [emptyFolders, setEmptyFolders] = useState(null);
  const [emptyFoldersResult, setEmptyFoldersResult] = useState(null);

  async function handleEmptyFolderClick() {
    if (!window.beetleAPI) { setEmptyFoldersResult('Not available outside the packaged app.'); return; }
    setEmptyFoldersResult(null);
    setEmptyFoldersBusy(true);
    try {
      const { items } = await window.beetleAPI.optimizer.scanEmptyFolders();
      const folders = items.filter((i) => i.event === 'item');
      if (folders.length === 0) {
        setEmptyFoldersResult('No empty folders found.');
        return;
      }
      setEmptyFolders(folders);
      setEmptyFoldersConfirmOpen(true);
    } catch (e) {
      setEmptyFoldersResult(`Scan failed: ${e.message || e}`);
    } finally {
      setEmptyFoldersBusy(false);
    }
  }

  async function handleConfirmEmptyFolders() {
    setEmptyFoldersBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('clean-empty-folders');
      const result = await window.beetleAPI.optimizer.cleanEmptyFolders(token);
      const finished = result.items.find((i) => i.event === 'finished');
      setEmptyFoldersResult(`Removed ${finished?.deleted ?? 0} empty folder${finished?.deleted === 1 ? '' : 's'}.`);
    } catch (e) {
      setEmptyFoldersResult(`Delete failed: ${e.message || e}`);
    } finally {
      setEmptyFoldersBusy(false);
      setEmptyFoldersConfirmOpen(false);
    }
  }

  // --- Disk Doctor: scan (Repair-Volume -Scan) -> confirm -> repair (-SpotFix) ---
  const [diskDoctorBusy, setDiskDoctorBusy] = useState(false);
  const [diskDoctorResult, setDiskDoctorResult] = useState(null);

  async function handleDiskDoctorClick() {
    if (!window.beetleAPI) { setDiskDoctorResult('Not available outside the packaged app.'); return; }
    setDiskDoctorResult(null);
    setDiskDoctorBusy(true);
    try {
      const { items } = await window.beetleAPI.optimizer.diskDoctorScan('C');
      const result = items.find((i) => i.event === 'result');
      if (!result) {
        setDiskDoctorResult('Scan did not return a result.');
      } else if (!result.scan_ok) {
        // Repair-Volume needs an elevated process even for a read-only scan -
        // this app doesn't currently request elevation, so report that
        // honestly instead of pretending the scan ran.
        setDiskDoctorResult(`Health: ${result.health_status || 'unknown'} - full scan needs Administrator (${result.message.split('\n')[0]})`);
      } else {
        setDiskDoctorResult(`Health: ${result.health_status}. Scan completed with no errors reported.`);
      }
    } catch (e) {
      setDiskDoctorResult(`Scan failed: ${e.message || e}`);
    } finally {
      setDiskDoctorBusy(false);
    }
  }

  // --- Unused programs: list -> confirm -> uninstall (per item) ---
  const [appsListOpen, setAppsListOpen] = useState(false);
  const [apps, setApps] = useState([]);
  const [appCount, setAppCount] = useState(27);
  const [appsBusyId, setAppsBusyId] = useState(null);
  const [appToRemove, setAppToRemove] = useState(null);

  // --- Informational modals for tools that don't have a real backend yet
  // (Duplicate File Finder, Empty Folder Cleaner, Reduce Windows folder
  // size, Delete broken apps). Each shows what the tool would do + a
  // "coming soon" hint instead of being a dead button.
  const [dupFinderOpen, setDupFinderOpen] = useState(false);
  const [winSlimmerOpen, setWinSlimmerOpen] = useState(false);
  const [forceUninstallOpen, setForceUninstallOpen] = useState(false);

  // Right-sidebar USEFUL TOOLS grid (explore, manage, compact, addons,
  // registry, compactreg). Each entry points to a static description
  // modal so the icons are real actions (not dead buttons).
  const [toolInfoOpen, setToolInfoOpen] = useState(null);
  const toolInfo = {
    explore: {
      title: 'Explore drive contents',
      items: [
        'Walks every folder on the selected drive and groups by size',
        'Treemap visualization of which folders take the most space',
        'Drill-down to file-level with sort by name / size / date',
        'Identify the largest files in seconds without a full scan',
      ],
    },
    manage: {
      title: 'Manage installed applications',
      items: [
        'List every app installed via Windows + Store + portable',
        'Filter by publisher, install date, or estimated size',
        'See which apps are pinned to Start / Taskbar',
        'Quick-link to the Apps & Features control panel',
      ],
    },
    compact: {
      title: 'Compact Windows folder',
      items: [
        'Run Windows built-in compact.exe on the Windows directory',
        'Compresses system files (saves 2-4 GB on Win10/11)',
        'Fully reversible: re-running without /CompactOS:always restores',
        'Requires admin + a one-time reboot to apply',
      ],
    },
    addons: {
      title: 'Manage browser add-ons and plugins',
      items: [
        'Lists every Chrome / Edge / Firefox extension installed',
        'Flags addons with permissions overreach (camera, all-sites, etc.)',
        'Disable / enable in bulk from a single table',
        'Optional: remove addons bundled by OEMs (trial antivirus, etc.)',
      ],
    },
    registry: {
      title: 'Clean Windows registry',
      items: [
        'Same as the Registry Cleanup card - uses our registry backend',
        'Walks App Paths, MUICache, Recent Docs, UserAssist',
        'Optional safe-mode: backup the keys before deletion',
        'Reversible for 7 days via Rescue Center',
      ],
    },
    compactreg: {
      title: 'Compact Windows registry',
      items: [
        'Uses Windows built-in compact.exe on the registry hive',
        'Frees 50-200 MB of registry hive space (rare, but real)',
        'Requires admin + a reboot to apply',
        'Reversible: re-running restores the original hive',
      ],
    },
  };

  const DUP_FINDER_DETAILS = [
    'Walks every user folder and reports files with identical SHA-256 hashes',
    'Filters out files smaller than 1 MB by default (configurable)',
    'Keeps one copy in each duplicate set, marks the rest for deletion',
    'Sends the duplicate list to the main ConfirmModal for batch removal',
  ];
  const WIN_SLIMMER_DETAILS = [
    'Removes Windows optional features you don\'t use (Tablet PC, XPS Viewer, etc.)',
    'Disables hibernation + clears the hiberfil.sys file',
    'Optional: strip bloatware Windows Store apps (Candy Crush, etc.)',
    'Persists a list of removed items so they can be re-enabled',
  ];
  const FORCE_UNINSTALL_DETAILS = [
    'Reads the registry Uninstall key to find leftover entries',
    'Deletes the registry key + the app\'s install folder',
    'Removes Start menu + taskbar shortcuts',
    'Reports what was removed; reversible for 7 days via Rescue Center',
  ];

  async function handleManageUnusedAppsClick() {
    if (!window.beetleAPI) { setResultText('Not available outside the packaged app.'); return; }
    try {
      const { items } = await window.beetleAPI.optimizer.uninstallProgram();
      const products = items
        .filter((i) => i.event === 'product')
        .map((i) => ({ id: i.info.id, primary: i.info.name, secondary: i.info.publisher || '' }));
      setApps(products);
      setAppCount(products.length);
      setAppsListOpen(true);
    } catch (e) {
      setResultText(`Listing apps failed: ${e.message || e}`);
    }
  }

  function handleRequestUninstall(item) {
    setAppToRemove(item);
  }

  async function handleConfirmUninstall() {
    const item = appToRemove;
    setAppsBusyId(item.id);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('uninstall-program-do');
      await window.beetleAPI.optimizer.uninstallProgramDo(item.id, token);
      setApps((prev) => prev.filter((a) => a.id !== item.id));
      setAppCount((n) => Math.max(0, n - 1));
    } catch (e) {
      setResultText(`Uninstall failed: ${e.message || e}`);
    } finally {
      setAppsBusyId(null);
      setAppToRemove(null);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <InfoBanner c={c}>
        This is where you find the options that let you clean your PC and your operating system
      </InfoBanner>

      <ConfirmModal
        c={c}
        open={confirmOpen}
        busy={busy}
        title="Delete these files?"
        message="This permanently deletes junk files from the categories below. This cannot be undone."
        details={scanTotals ? `${scanTotals.totalFiles.toLocaleString()} files, ${formatBytes(scanTotals.totalBytes)} total` : null}
        confirmLabel="Delete files"
        onConfirm={handleConfirmClean}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmModal
        c={c}
        open={registryConfirmOpen}
        busy={registryBusy}
        title="Repair registry entries?"
        message="This deletes orphan App Paths registry keys whose target file no longer exists."
        details={registryIssues ? `${registryIssues.length} orphan ${registryIssues.length === 1 ? 'entry' : 'entries'}` : null}
        confirmLabel="Repair"
        onConfirm={handleConfirmRegistryRepair}
        onCancel={() => setRegistryConfirmOpen(false)}
      />

      <ItemListModal
        c={c}
        open={appsListOpen}
        title="Unused Programs"
        items={apps}
        actionLabel="Uninstall"
        busyId={appsBusyId}
        onAction={handleRequestUninstall}
        onClose={() => setAppsListOpen(false)}
      />

      <ConfirmModal
        c={c}
        open={!!appToRemove}
        busy={!!appsBusyId}
        title="Uninstall this program?"
        message="This runs the program's own uninstaller. Depending on the app, some files or settings may be left behind."
        details={appToRemove ? appToRemove.primary : null}
        confirmLabel="Uninstall"
        onConfirm={handleConfirmUninstall}
        onCancel={() => setAppToRemove(null)}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'auto', padding: 20, gap: 20 }}>
        {/* COLUMN 1: disk + cleaners */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            position: 'relative', border: `2px solid ${c.accent}`, borderRadius: 8,
            padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <HardDrive size={28} color={c.accent} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>Local Disk (C:)</div>
              <div style={{ fontSize: 11, color: c.textMuted }}>301 GB free</div>
              <div style={{ fontSize: 11, color: c.textMuted }}>465 GB total capacity</div>
            </div>
            <CheckCircle size={18} weight="fill" color="#3AA65C" style={{ position: 'absolute', top: 8, right: 8 }} />
          </div>

          <ColumnLink c={c} onClick={handleDiskDoctorClick}>
            {diskDoctorBusy ? 'Checking disk health…' : 'Check disk health (Disk Doctor)'}
          </ColumnLink>
          {diskDoctorResult && (
            <div style={{ fontSize: 11, color: c.textSecondary, marginTop: 4, marginBottom: 8 }}>
              {diskDoctorResult}
            </div>
          )}

          <ActionButton c={c} onClick={handleDeepDiskCleanerClick} disabled={busy}>
            {busy ? 'Scanning…' : 'Deep Disk Cleaner'}
          </ActionButton>
          <ActionButton c={c} onClick={() => setDupFinderOpen(true)}>Duplicate File Finder</ActionButton>
          <ActionButton c={c} onClick={handleEmptyFolderClick} disabled={emptyFoldersBusy}>
            {emptyFoldersBusy ? 'Scanning…' : 'Empty Folder Cleaner'}
          </ActionButton>

          {resultText && (
            <div style={{ fontSize: 11, color: c.textSecondary, marginTop: 4, marginBottom: 8 }}>
              {resultText}
            </div>
          )}
          {emptyFoldersResult && (
            <div style={{ fontSize: 11, color: c.textSecondary, marginTop: 4, marginBottom: 8 }}>
              {emptyFoldersResult}
            </div>
          )}

          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 12 }}>you can also</div>
          <ColumnLink c={c} onClick={() => setDupFinderOpen(true)}>Remove unneeded large files</ColumnLink>
        </div>

        {/* COLUMN 2: registry cleanup */}
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <Database size={48} color={c.accent} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary, marginBottom: 6 }}>Registry Cleanup</div>
          <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.4, marginBottom: 10 }}>
            Clean out unused entries and maintain your Windows registry.
          </div>
          <ColumnLink c={c} onClick={handleCleanRegistryClick}>
            {registryBusy ? 'Scanning…' : 'Clean registry entries'}
          </ColumnLink>
          {registryResult && (
            <div style={{ fontSize: 11, color: c.textSecondary, marginTop: 6 }}>{registryResult}</div>
          )}
          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 10 }}>you can also</div>
          <ColumnLink c={c} onClick={() => setWinSlimmerOpen(true)}>Reduce Windows folder size</ColumnLink>
        </div>

        {/* COLUMN 3: unused programs */}
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
            border: `1px solid ${c.border}`, borderRadius: 8, padding: '10px 24px', marginBottom: 10,
          }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: c.accent }}>{appCount}</span>
            <span style={{ fontSize: 11, color: c.textMuted }}>applications installed</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary, marginBottom: 6 }}>Unused Programs</div>
          <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.4, marginBottom: 10 }}>
            Uninstall applications that you don't use anymore
          </div>
          <ActionButton c={c} onClick={handleManageUnusedAppsClick}>Manage Unused Apps</ActionButton>

          <div style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary, marginTop: 14, marginBottom: 6 }}>Force Uninstall</div>
          <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.4, marginBottom: 4 }}>
            Remove applications that cannot be uninstalled the regular way
          </div>
          <ColumnLink c={c} onClick={() => setForceUninstallOpen(true)}>Delete broken apps</ColumnLink>
        </div>

        {/* COLUMN 4: useful tools sidebar */}
        <div style={{ width: 240, flexShrink: 0 }}>
          <UsefulTools
            c={c}
            items={USEFUL_TOOLS.map(t => ({ ...t, info: toolInfo[t.id] }))}
            columns={3}
            onItemClick={(item) => setToolInfoOpen(item.id)}
          />
        </div>
      </div>

      {/* Informational modals for the 4 unimplemented tools - each opens
          a real modal explaining what the tool would do. The icons in
          the right sidebar are also clickable via UsefulTools.onItemClick
          and route to the same info modal (so the grid + the link in
          column 1 share a single source of truth). */}
      <ItemListModal
        c={c}
        open={!!toolInfoOpen}
        title={toolInfoOpen ? toolInfo[toolInfoOpen]?.title || '' : ''}
        items={(toolInfo[toolInfoOpen]?.items || []).map((line, i) => ({ id: i, primary: line }))}
        actionLabel="Close"
        onAction={() => setToolInfoOpen(null)}
        onClose={() => setToolInfoOpen(null)}
      />

      <ItemListModal
        c={c}
        open={dupFinderOpen}
        title="Duplicate File Finder"
        items={DUP_FINDER_DETAILS.map((line, i) => ({ id: i, primary: line }))}
        actionLabel="Close"
        onAction={() => setDupFinderOpen(false)}
        onClose={() => setDupFinderOpen(false)}
      />

      <ConfirmModal
        c={c}
        open={emptyFoldersConfirmOpen}
        busy={emptyFoldersBusy}
        title="Delete these empty folders?"
        message="This permanently removes folders that contain no files anywhere inside them. This cannot be undone."
        details={emptyFolders ? `${emptyFolders.length} empty ${emptyFolders.length === 1 ? 'folder' : 'folders'}` : null}
        confirmLabel="Delete folders"
        onConfirm={handleConfirmEmptyFolders}
        onCancel={() => setEmptyFoldersConfirmOpen(false)}
      />

      <ItemListModal
        c={c}
        open={winSlimmerOpen}
        title="Reduce Windows folder size"
        items={WIN_SLIMMER_DETAILS.map((line, i) => ({ id: i, primary: line }))}
        actionLabel="Close"
        onAction={() => setWinSlimmerOpen(false)}
        onClose={() => setWinSlimmerOpen(false)}
      />

      <ItemListModal
        c={c}
        open={forceUninstallOpen}
        title="Force uninstall (delete broken apps)"
        items={FORCE_UNINSTALL_DETAILS.map((line, i) => ({ id: i, primary: line }))}
        actionLabel="Close"
        onAction={() => setForceUninstallOpen(false)}
        onClose={() => setForceUninstallOpen(false)}
      />
    </div>
  );
}
