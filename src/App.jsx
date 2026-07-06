// Top-level App component. Composes the layout pieces:
//   - TitleBar (drag region + native window controls overlay)
//   - TabBar   (8 top tabs)
//   - Dashboard (scan canvas with corner overlays + full-width bottom tiles)
//   - RightSidebar (foldable, 6 nav items)
//   - StatusBar (CPU/GPU/RAM/NET/SSD/HDD + version + theme toggle)
//
// Dashboard's three callbacks (onScan, onSeeReport, onTileClick) follow
// the same scan -> confirm -> execute pattern used by the dedicated
// Cleaner/Optimizer tabs. Every destructive action goes through
// requestConfirm() so a bare renderer call (e.g. from devtools) is
// rejected by main.js instead of running unchecked. Login/auth is
// owned by useAuth() in TitleBar and is intentionally NOT touched here.

import React, { useState } from 'react';
import { getColors } from './lib/colors.js';
import { useTheme } from './hooks/useTheme.js';
import { useActiveTab } from './hooks/useActiveTab.js';
import { useActiveNav } from './hooks/useActiveNav.js';
import { useSidebarFold } from './hooks/useSidebarFold.js';
import { useAuth } from './hooks/useAuth.js';

import TitleBar from './components/TitleBar.jsx';
import TabBar from './components/TabBar.jsx';
import RightSidebar from './components/RightSidebar.jsx';
import StatusBar from './components/StatusBar.jsx';
import Dashboard from './components/dashboard/Dashboard.jsx';
import ScannerView from './components/tabs/ScannerView.jsx';
import AdvisorView from './components/tabs/AdvisorView.jsx';
import CleanUpView from './components/tabs/CleanUpView.jsx';
import OptimizeView from './components/tabs/OptimizeView.jsx';
import ProtectView from './components/tabs/ProtectView.jsx';
import MaintainView from './components/tabs/MaintainView.jsx';
import AskQuestionView from './components/tabs/AskQuestionView.jsx';
import ConfirmModal from './components/shared/ConfirmModal.jsx';
import ItemListModal from './components/shared/ItemListModal.jsx';

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

// Inline fallback for an unrecognised tab name. Every tab in TABS has a
// real view, so this is normally unreachable; we keep a tiny stand-in
// here as a safety net (renders an empty canvas + the tab name).
function UnknownTabFallback({ c, tab }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: c.textMuted, fontSize: 12,
    }}>
      {tab}
    </div>
  );
}

function toStartupListItem(item) {
  return {
    id: item.id,
    primary: item.name,
    secondary: `${item.source === 'registry' ? item.scope.toUpperCase() : 'Startup folder'}${item.disabled ? ' - disabled' : ''}`,
    actionLabelOverride: item.disabled ? 'Enable' : 'Disable',
    _raw: item,
  };
}

export default function App() {
  const { isLight, toggle } = useTheme();
  const { active: activeTab, setActive: setActiveTab } = useActiveTab('Dashboard');
  const { active: activeNav, setActive: setActiveNav } = useActiveNav('pc');
  const { folded: sidebarFolded, toggle: toggleSidebar } = useSidebarFold(false);
  const auth = useAuth();

  const c = getColors(isLight);

  // --- shared state for Dashboard callbacks ---
  // scanJunk: scan -> confirm -> execute. Reuses the same ConfirmModal
  // instance for both the clean-junk confirm and the registry-repair confirm.
  const [scanBusy, setScanBusy] = useState(false);
  const [scanTotals, setScanTotals] = useState(null);          // { items, totalFiles, totalBytes }
  const [resolvedCount, setResolvedCount] = useState(null);    // total items the last cleanup resolved (drives the StatusOverlay header)
  const [scanResult, setScanResult] = useState(null);
  const [scanConfirmOpen, setScanConfirmOpen] = useState(false);

  // "See full report" modal (ItemListModal) for the last junk scan
  const [reportOpen, setReportOpen] = useState(false);

  // Disk: analyze -> confirm (only if work needed) -> trim/defrag per drive
  const [diskBusy, setDiskBusy] = useState(false);
  const [diskDrives, setDiskDrives] = useState(null);          // [{ drive, is_ssd, needs_defrag }]
  const [diskResult, setDiskResult] = useState(null);
  const [diskConfirmOpen, setDiskConfirmOpen] = useState(false);

  // Apps: list -> ItemListModal with per-row uninstall action
  const [appsOpen, setAppsOpen] = useState(false);
  const [apps, setApps] = useState([]);
  const [appsBusyId, setAppsBusyId] = useState(null);
  const [appToRemove, setAppToRemove] = useState(null);

  // "Add tool" tile: a real chooser modal that lists the rest of the
  // tabs and switches to whichever the user picks. The chooser modal is
  // built from the same ItemListModal component the other tab-side modals
  // use, so the "Add tool" click goes somewhere instead of being a dummy.
  const [addToolOpen, setAddToolOpen] = useState(false);
  const TOOL_LIST = [
    { id: 'Scanner',         label: 'Scanner',             secondary: 'Scan categories + see report' },
    { id: 'Advisor',         label: 'Advisor',             secondary: 'Recommendations for your PC' },
    { id: 'Clean Up',        label: 'Clean Up',            secondary: 'Disk + registry + apps' },
    { id: 'Optimize',        label: 'Optimize',            secondary: 'Memory, drives, modes' },
    { id: 'Protect',         label: 'Protect',             secondary: 'Privacy + browser protection' },
    { id: 'Maintain',        label: 'Maintain',            secondary: 'Tweak categories' },
    { id: 'Ask a Question',  label: 'Ask a Question',      secondary: 'Auslogics support portal' },
  ];

  // Startup: list -> ItemListModal with per-row disable/enable
  const [startupOpen, setStartupOpen] = useState(false);
  const [startupItems, setStartupItems] = useState([]);
  const [startupBusyId, setStartupBusyId] = useState(null);
  const [startupTarget, setStartupTarget] = useState(null);
  const [startupResult, setStartupResult] = useState(null);

  // Registry: scan -> confirm (only if issues found) -> repair
  const [registryBusy, setRegistryBusy] = useState(false);
  const [registryIssues, setRegistryIssues] = useState(null);
  const [registryResult, setRegistryResult] = useState(null);
  const [registryConfirmOpen, setRegistryConfirmOpen] = useState(false);

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------

  async function handleScanClick() {
    if (!window.beetleAPI) {
      setScanResult('Not available outside the packaged app.');
      return;
    }
    setScanResult(null);
    setScanBusy(true);
    try {
      const { items } = await window.beetleAPI.optimizer.scanJunkFiles();
      const cats = items.filter((i) => !i.event); // root items, not the script events
      const totalFiles = cats.reduce((s, i) => s + (i.files || 0), 0);
      const totalBytes = cats.reduce((s, i) => s + (i.bytes || 0), 0);
      if (cats.length === 0 || totalFiles === 0) {
        setScanResult('No junk files found.');
        return;
      }
      setScanTotals({ cats, totalFiles, totalBytes });
      setScanConfirmOpen(true);
    } catch (e) {
      setScanResult(`Scan failed: ${e.message || e}`);
    } finally {
      setScanBusy(false);
    }
  }

  async function handleConfirmClean() {
    setScanBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('clean-junk');
      const result = await window.beetleAPI.optimizer.cleanJunkFiles(token);
      const finished = (result.items || []).find((i) => i.event === 'finished');
      // Walk the per-category "category_cleaned" events to accumulate the
      // total items resolved - drives the StatusOverlay header.
      const perCat = (result.items || [])
        .filter((i) => i.event === 'category_cleaned')
        .reduce((s, i) => s + (i.files || 0), 0);
      const totalFreed = finished?.total_freed_bytes || 0;
      setResolvedCount((prev) => (prev || 0) + perCat);
      setScanResult(`Freed ${formatBytes(totalFreed)} (${perCat.toLocaleString()} files).`);
      setScanTotals(null);
    } catch (e) {
      setScanResult(`Clean failed: ${e.message || e}`);
    } finally {
      setScanBusy(false);
      setScanConfirmOpen(false);
    }
  }

  async function handleDiskClick() {
    if (!window.beetleAPI) {
      setDiskResult('Not available outside the packaged app.');
      return;
    }
    setDiskResult(null);
    setDiskBusy(true);
    try {
      const analyzed = await window.beetleAPI.optimizer.defragmentDrive('analyze');
      const drives = (analyzed.items || []).filter((i) => i.event === 'drive_done');
      // SSDs always get a lightweight TRIM; HDDs only get a real defrag if
      // analyze actually flagged fragmentation.
      const actionable = drives.filter((d) => d.is_ssd || d.needs_defrag);
      if (actionable.length === 0) {
        setDiskResult('No drives need optimization right now.');
        return;
      }
      setDiskDrives(actionable);
      setDiskConfirmOpen(true);
    } catch (e) {
      setDiskResult(`Analyze failed: ${e.message || e}`);
    } finally {
      setDiskBusy(false);
    }
  }

  async function handleConfirmDiskOptimize() {
    setDiskBusy(true);
    try {
      const results = [];
      for (const d of diskDrives) {
        const mode = d.is_ssd ? 'trim' : 'defrag';
        const token = await window.beetleAPI.optimizer.requestConfirm('defrag-drive');
        await window.beetleAPI.optimizer.defragmentDrive(mode, token);
        results.push(`${d.drive}: ${mode}`);
      }
      setDiskResult(`Optimized ${results.join(', ')}.`);
    } catch (e) {
      setDiskResult(`Optimize failed: ${e.message || e}`);
    } finally {
      setDiskBusy(false);
      setDiskConfirmOpen(false);
    }
  }

  async function handleAppsClick() {
    if (!window.beetleAPI) {
      setScanResult('Not available outside the packaged app.');
      return;
    }
    try {
      const { items } = await window.beetleAPI.optimizer.uninstallProgram();
      const products = items
        .filter((i) => i.event === 'product')
        .map((i) => ({ id: i.info.id, primary: i.info.name, secondary: i.info.publisher || '' }));
      setApps(products);
      setAppsOpen(true);
    } catch (e) {
      setScanResult(`Listing apps failed: ${e.message || e}`);
    }
  }

  async function handleConfirmUninstall() {
    const item = appToRemove;
    setAppsBusyId(item.id);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('uninstall-program-do');
      await window.beetleAPI.optimizer.uninstallProgramDo(item.id, token);
      setApps((prev) => prev.filter((a) => a.id !== item.id));
    } catch (e) {
      setScanResult(`Uninstall failed: ${e.message || e}`);
    } finally {
      setAppsBusyId(null);
      setAppToRemove(null);
    }
  }

  async function handleStartupClick() {
    if (!window.beetleAPI) {
      setStartupResult('Not available outside the packaged app.');
      return;
    }
    try {
      const { items } = await window.beetleAPI.optimizer.listStartupItems();
      const entries = items
        .filter((i) => i.event === 'item')
        .map((i) => toStartupListItem(i.item));
      setStartupItems(entries);
      setStartupOpen(true);
    } catch (e) {
      setStartupResult(`Listing startup items failed: ${e.message || e}`);
    }
  }

  function handleRequestToggleStartup(item) {
    setStartupTarget(item);
  }

  async function handleConfirmToggleStartup() {
    const item = startupTarget;
    const disabling = !item._raw.disabled;
    setStartupBusyId(item.id);
    try {
      const action = disabling ? 'disable-startup-item' : 'enable-startup-item';
      const token = await window.beetleAPI.optimizer.requestConfirm(action);
      if (disabling) {
        await window.beetleAPI.optimizer.disableStartupItem(item.id, token);
      } else {
        await window.beetleAPI.optimizer.enableStartupItem(item.id, token);
      }
      setStartupItems((prev) => prev.map((i) =>
        i.id === item.id ? toStartupListItem({ ...i._raw, disabled: disabling }) : i
      ));
    } catch (e) {
      setStartupResult(`Failed: ${e.message || e}`);
    } finally {
      setStartupBusyId(null);
      setStartupTarget(null);
    }
  }

  async function handleRegistryClick() {
    if (!window.beetleAPI) {
      setRegistryResult('Not available outside the packaged app.');
      return;
    }
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
      const fixed = (result.items || []).filter((i) => i.event === 'fixed').length;
      setRegistryResult(`Fixed ${fixed} registry ${fixed === 1 ? 'entry' : 'entries'}.`);
    } catch (e) {
      setRegistryResult(`Repair failed: ${e.message || e}`);
    } finally {
      setRegistryBusy(false);
      setRegistryConfirmOpen(false);
    }
  }

  // The big Scan circle triggers the full Deep Disk Cleaner flow
  // (scan-junk -> confirm -> clean-junk). The "See full report" link
  // opens an ItemListModal with the per-category breakdown.
  function handleTileClick(id) {
    switch (id) {
      case 'ssd':       return handleDiskClick();
      case 'uninstall': return handleAppsClick();
      case 'startup':   return handleStartupClick();
      case 'browser':   return handleScanClick();
      case 'driver':    return handleRegistryClick();
      case 'duplicate': return handleScanClick();
      case 'add':       return setAddToolOpen(true); // not wired
      default:         return;
    }
  }

  function handleSeeReport() {
    if (scanTotals) setReportOpen(true);
  }

  // For "See full report": turn each cleanup category into an ItemListModal row
  const reportItems = scanTotals
    ? scanTotals.cats.map((cat) => ({
        id: cat.id,
        primary: cat.label,
        secondary: `${cat.files.toLocaleString()} files · ${formatBytes(cat.bytes)}`,
      }))
    : [];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: c.bg, color: c.textPrimary,
      fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 13,
    }}>
      <TitleBar c={c} auth={auth} />

      <TabBar c={c} activeTab={activeTab} onTabChange={setActiveTab} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeTab === 'Dashboard' ? (
          <>
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <Dashboard
                c={c}
                isLight={isLight}
                onScan={handleScanClick}
                onSeeReport={handleSeeReport}
                onTileClick={handleTileClick}
                onAskQuestion={() => setActiveTab('Ask a Question')}
                resolvedCount={resolvedCount}
                onNavigate={setActiveTab}
              />
              {scanResult && (
                <div style={{
                  position: 'absolute', bottom: 32, left: 20, zIndex: 30,
                  fontSize: 11, color: c.textSecondary,
                  background: c.bgSecondary, padding: '6px 10px',
                  border: `1px solid ${c.border}`, borderRadius: 6,
                }}>{scanResult}</div>
              )}
            </div>
            <RightSidebar
              c={c}
              isLight={isLight}
              activeNav={activeNav}
              onNavChange={setActiveNav}
              onNavigate={setActiveTab}
              folded={sidebarFolded}
              onToggleFold={toggleSidebar}
            />
          </>
        ) : activeTab === 'Scanner' ? (
          <ScannerView c={c} isLight={isLight} />
        ) : activeTab === 'Advisor' ? (
          <AdvisorView c={c} isLight={isLight} onAction={(action) => {
            // Map advisor action verbs to the same handlers used by
            // Dashboard tiles + StatusOverlay — no duplicate flow logic.
            switch (action) {
              case 'scan':      return handleScanClick();
              case 'uninstall': return handleAppsClick();
              case 'disk':      return handleDiskClick();
              case 'registry':  return handleRegistryClick();
              default:          return null;
            }
          }} />
        ) : activeTab === 'Clean Up' ? (
          <CleanUpView c={c} isLight={isLight} />
        ) : activeTab === 'Optimize' ? (
          <OptimizeView c={c} isLight={isLight} />
        ) : activeTab === 'Protect' ? (
          <ProtectView c={c} isLight={isLight} onAction={(action) => {
            if (action === 'scan') return handleScanClick();
            return null;
          }} />
        ) : activeTab === 'Maintain' ? (
          <MaintainView c={c} isLight={isLight} onAction={(action) => {
            // The Maintain tab's scan button routes through the same Deep
            // Disk Cleaner flow as the Dashboard tile + AdvisorView.
            if (action === 'scan') return handleScanClick();
            if (action === 'promo') return setScanResult('BoostSpeed Portable - download from auslogics.com');
            return null;
          }} />
        ) : activeTab === 'Ask a Question' ? (
          <AskQuestionView c={c} isLight={isLight} />
        ) : (
          <UnknownTabFallback c={c} tab={activeTab} />
        )}
      </div>

      <StatusBar c={c} isLight={isLight} onToggleTheme={toggle} />

      {/* ---- Dashboard modals ---- */}
      <ConfirmModal
        c={c}
        open={scanConfirmOpen}
        busy={scanBusy}
        title="Delete these junk files?"
        message="This permanently deletes junk files from the categories below. This cannot be undone."
        details={scanTotals
          ? `${scanTotals.totalFiles.toLocaleString()} files, ${formatBytes(scanTotals.totalBytes)} total`
          : null}
        confirmLabel="Delete files"
        onConfirm={handleConfirmClean}
        onCancel={() => setScanConfirmOpen(false)}
      />

      <ItemListModal
        c={c}
        open={reportOpen}
        title="Last scan - full report"
        items={reportItems}
        emptyText="Run a scan to see results here."
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setReportOpen(false)}
      />

      <ConfirmModal
        c={c}
        open={diskConfirmOpen}
        busy={diskBusy}
        title="Optimize these drives?"
        message="SSDs get a lightweight TRIM; HDDs get a full defrag, which can take a while and rewrites file layout on disk."
        details={diskDrives
          ? diskDrives.map((d) => `${d.drive}: ${d.is_ssd ? 'TRIM' : 'defrag'}`).join(', ')
          : null}
        confirmLabel="Optimize"
        onConfirm={handleConfirmDiskOptimize}
        onCancel={() => setDiskConfirmOpen(false)}
      />
      {diskResult && (
        <div style={{
          position: 'fixed', bottom: 60, left: 20, zIndex: 30,
          fontSize: 11, color: c.textSecondary,
          background: c.bgSecondary, padding: '6px 10px',
          border: `1px solid ${c.border}`, borderRadius: 6,
        }}>{diskResult}</div>
      )}

      <ItemListModal
        c={c}
        open={appsOpen}
        title="Installed Programs"
        items={apps}
        actionLabel="Uninstall"
        busyId={appsBusyId}
        onAction={(item) => setAppToRemove(item)}
        onClose={() => setAppsOpen(false)}
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

      <ItemListModal
        c={c}
        open={startupOpen}
        title="Startup Apps"
        items={startupItems}
        actionLabel="Disable"
        busyId={startupBusyId}
        onAction={handleRequestToggleStartup}
        onClose={() => setStartupOpen(false)}
      />
      <ConfirmModal
        c={c}
        open={!!startupTarget}
        busy={!!startupBusyId}
        title={startupTarget && !startupTarget._raw.disabled
          ? 'Disable this startup item?'
          : 'Enable this startup item?'}
        message={startupTarget && !startupTarget._raw.disabled
          ? 'This stops the app from launching automatically at sign-in. You can re-enable it later.'
          : 'This lets the app launch automatically at sign-in again.'}
        details={startupTarget ? startupTarget.primary : null}
        confirmLabel={startupTarget && !startupTarget._raw.disabled ? 'Disable' : 'Enable'}
        onConfirm={handleConfirmToggleStartup}
        onCancel={() => setStartupTarget(null)}
      />
      {startupResult && (
        <div style={{
          position: 'fixed', bottom: 60, left: 220, zIndex: 30,
          fontSize: 11, color: c.textSecondary,
          background: c.bgSecondary, padding: '6px 10px',
          border: `1px solid ${c.border}`, borderRadius: 6,
        }}>{startupResult}</div>
      )}

      <ConfirmModal
        c={c}
        open={registryConfirmOpen}
        busy={registryBusy}
        title="Repair registry entries?"
        message="This deletes orphan App Paths registry keys whose target file no longer exists."
        details={registryIssues
          ? `${registryIssues.length} orphan ${registryIssues.length === 1 ? 'entry' : 'entries'}`
          : null}
        confirmLabel="Repair"
        onConfirm={handleConfirmRegistryRepair}
        onCancel={() => setRegistryConfirmOpen(false)}
      />
      {registryResult && (
        <div style={{
          position: 'fixed', bottom: 60, left: 420, zIndex: 30,
          fontSize: 11, color: c.textSecondary,
          background: c.bgSecondary, padding: '6px 10px',
          border: `1px solid ${c.border}`, borderRadius: 6,
        }}>{registryResult}</div>
      )}

      {/* "Add tool" chooser - lists every other tab and switches to it */}
      <ItemListModal
        c={c}
        open={addToolOpen}
        title="Add tool"
        items={TOOL_LIST}
        actionLabel="Open"
        onAction={(item) => {
          setAddToolOpen(false);
          setActiveTab(item.id);
        }}
        onClose={() => setAddToolOpen(false)}
      />
    </div>
  );
}