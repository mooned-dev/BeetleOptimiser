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

import React, { useState, useEffect } from 'react';
import { getColors } from './lib/colors.js';
import { useTheme } from './hooks/useTheme.js';
import { useActiveTab } from './hooks/useActiveTab.js';
import { useActiveNav } from './hooks/useActiveNav.js';
import { useSidebarFold } from './hooks/useSidebarFold.js';
import useGlobalSearch from './hooks/useGlobalSearch.js';
import { TABS } from './data/tabs.js';
import { NAV_ITEMS } from './data/navItems.js';

import TitleBar from './components/TitleBar.jsx';
import CommandPalette from './components/shared/CommandPalette.jsx';
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
import MyTasksView from './components/tabs/MyTasksView.jsx';
import ReportsView from './components/tabs/ReportsView.jsx';
import Win10ProtectorView from './components/tabs/Win10ProtectorView.jsx';
import CareCenterView from './components/tabs/CareCenterView.jsx';
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
  const { active: activeTab, setActive: setActiveTab } = useActiveTab('Dashboard', TABS);
  const { active: activeNav, setActive: setActiveNav } = useActiveNav('pc', NAV_ITEMS);
  const { folded: sidebarFolded, toggle: toggleSidebar } = useSidebarFold(false);
  const [paletteOpen, setPaletteOpen] = useGlobalSearch();

  const c = getColors(isLight);

  // --- shared state for Dashboard callbacks ---
  // scanJunk: scan -> confirm -> execute. Reuses the same ConfirmModal
  // instance for both the clean-junk confirm and the registry-repair confirm.
  const [scanBusy, setScanBusy] = useState(false);
  const [scanTotals, setScanTotals] = useState(null);          // { items, totalFiles, totalBytes }
  const [resolvedCount, setResolvedCount] = useState(null);    // total items the last cleanup resolved (drives the tray flyout's header)

  // The tray flyout (FlyoutApp.jsx) is a SEPARATE BrowserWindow/renderer, so
  // it can't read this component's React state directly. Both windows load
  // the same origin though, so localStorage is shared - writing here plus a
  // 'storage' listener over there (which fires in OTHER same-origin windows,
  // never the one that wrote it) is enough to keep the flyout's header live
  // without a dedicated IPC round-trip for something this minor.
  useEffect(() => {
    try {
      if (resolvedCount != null) localStorage.setItem('beetle-resolved-count', String(resolvedCount));
    } catch { /* localStorage unavailable - flyout just shows "—" */ }
  }, [resolvedCount]);

  // Buttons inside the tray flyout (Ask a question / Run Scan / nav icons)
  // can't switch this window's tab directly either - they ask main.js to
  // focus this window and relay which tab, via window.beetleAPI.system.onNavigate.
  useEffect(() => {
    return window?.beetleAPI?.system?.onNavigate?.((tab) => setActiveTab(tab));
  }, [setActiveTab]);
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

  // Driver check: read-only list (problem devices first, then every signed
  // driver's version/date) - actually installing an update needs the
  // vendor's own package, out of scope for a safe scripted action.
  const [driversBusy, setDriversBusy] = useState(false);
  const [driversOpen, setDriversOpen] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [driversResult, setDriversResult] = useState(null);

  // Duplicates Finder: scan (size then SHA-256 grouping) -> per-file delete
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [duplicateRows, setDuplicateRows] = useState([]);
  const [duplicateBusyId, setDuplicateBusyId] = useState(null);
  const [duplicateToDelete, setDuplicateToDelete] = useState(null);
  const [duplicatesResult, setDuplicatesResult] = useState(null);

  // Internet Speed Up
  const [internetOpen, setInternetOpen] = useState(false);
  const [internetData, setInternetData] = useState(null);
  const [internetBusy, setInternetBusy] = useState(false);
  const [internetResult, setInternetResult] = useState(null);

  // Disk Explorer
  const [diskExpOpen, setDiskExpOpen] = useState(false);
  const [diskExpRows, setDiskExpRows] = useState([]);
  const [diskExpBusy, setDiskExpBusy] = useState(false);

  // Task Manager
  const [taskMgrOpen, setTaskMgrOpen] = useState(false);
  const [taskMgrRows, setTaskMgrRows] = useState([]);
  const [taskMgrBusy, setTaskMgrBusy] = useState(false);
  const [taskMgrConfirmKill, setTaskMgrConfirmKill] = useState(null);

  // Add-ons Manager
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [addonsRows, setAddonsRows] = useState([]);
  const [addonsBusy, setAddonsBusy] = useState(false);

  // File Recovery
  const [fileRecoveryOpen, setFileRecoveryOpen] = useState(false);
  const [fileRecoveryRows, setFileRecoveryRows] = useState([]);
  const [fileRecoveryBusy, setFileRecoveryBusy] = useState(false);

  // Free Space Wiper
  const [wiperOpen, setWiperOpen] = useState(false);
  const [wiperDrives, setWiperDrives] = useState([]);
  const [wiperBusy, setWiperBusy] = useState(false);
  const [wiperConfirm, setWiperConfirm] = useState(null);
  const [wiperPasses, setWiperPasses] = useState(1);
  const [wiperResult, setWiperResult] = useState(null);

  // Windows Slimmer
  const [slimmerOpen, setSlimmerOpen] = useState(false);
  const [slimmerOps, setSlimmerOps] = useState([]);
  const [slimmerBusy, setSlimmerBusy] = useState(false);
  const [slimmerConfirm, setSlimmerConfirm] = useState(null);
  const [slimmerResult, setSlimmerResult] = useState(null);

  // Mode Switcher
  const [modesOpen, setModesOpen] = useState(false);
  const [modesList, setModesList] = useState([]);
  const [modesBusy, setModesBusy] = useState(false);

  // Context Menu
  const [ctxOpen, setCtxOpen] = useState(false);
  const [ctxList, setCtxList] = useState([]);
  const [ctxBusy, setCtxBusy] = useState(false);

  // Integrator
  const [integOpen, setIntegOpen] = useState(false);
  const [integList, setIntegList] = useState([]);
  const [integBusy, setIntegBusy] = useState(false);

  // Registry Defrag
  const [regDefragOpen, setRegDefragOpen] = useState(false);
  const [regDefragHives, setRegDefragHives] = useState([]);
  const [regDefragBusy, setRegDefragBusy] = useState(false);
  const [regDefragResult, setRegDefragResult] = useState(null);
  const [regDefragConfirm, setRegDefragConfirm] = useState(null);

  // Action Center
  const [actionCenterOpen, setActionCenterOpen] = useState(false);
  const [actionCenterOps, setActionCenterOps] = useState([]);
  const [actionCenterBusy, setActionCenterBusy] = useState(false);
  const [actionCenterConfirm, setActionCenterConfirm] = useState(null);

  // Debug log
  const [debugResult, setDebugResult] = useState(null);

  // Disk Priority
  const [diskPrioOpen, setDiskPrioOpen] = useState(false);
  const [diskPrioProfiles, setDiskPrioProfiles] = useState([]);
  const [diskPrioBusy, setDiskPrioBusy] = useState(false);

  // Backup Cleaner
  const [backupCleanerOpen, setBackupCleanerOpen] = useState(false);
  const [backupCleanerTargets, setBackupCleanerTargets] = useState([]);
  const [backupCleanerBusy, setBackupCleanerBusy] = useState(false);
  const [backupCleanerResult, setBackupCleanerResult] = useState(null);
  const [backupCleanerConfirm, setBackupCleanerConfirm] = useState(false);

  // Defrag on Next Boot
  const [defragBootOpen, setDefragBootOpen] = useState(false);
  const [defragBootState, setDefragBootState] = useState(null);
  const [defragBootBusy, setDefragBootBusy] = useState(false);
  const [defragBootResult, setDefragBootResult] = useState(null);

  // Browser Helper Objects
  const [bhoOpen, setBhoOpen] = useState(false);
  const [bhoList, setBhoList] = useState([]);
  const [bhoBusy, setBhoBusy] = useState(false);
  const [bhoResult, setBhoResult] = useState(null);
  const [bhoConfirm, setBhoConfirm] = useState(false);

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

  async function handleDriverClick() {
    if (!window.beetleAPI) { setDriversResult('Not available outside the packaged app.'); return; }
    setDriversResult(null);
    setDriversBusy(true);
    try {
      const { items } = await window.beetleAPI.optimizer.listDrivers();
      const problems = items.filter((i) => i.event === 'problem').map((i) => ({
        id: `problem:${i.item.device_id}`,
        primary: `⚠ ${i.item.name}`,
        secondary: `Device Manager error code ${i.item.error_code} · ${i.item.manufacturer || 'Unknown manufacturer'}`,
      }));
      const driverList = items.filter((i) => i.event === 'driver').map((i) => ({
        id: `driver:${i.item.name}:${i.item.version}`,
        primary: i.item.name,
        secondary: `${i.item.provider || 'Unknown'} · v${i.item.version || '?'} · ${i.item.date || 'unknown date'}`,
      }));
      setDrivers([...problems, ...driverList]);
      setDriversOpen(true);
    } catch (e) {
      setDriversResult(`Driver check failed: ${e.message || e}`);
    } finally {
      setDriversBusy(false);
    }
  }

  async function handleDuplicatesClick() {
    if (!window.beetleAPI) { setDuplicatesResult('Not available outside the packaged app.'); return; }
    setDuplicatesResult(null);
    try {
      const { items } = await window.beetleAPI.optimizer.scanDuplicates();
      const rows = [];
      items.filter((i) => i.event === 'group').forEach((g) => {
        g.files.forEach((f) => {
          const otherCount = g.files.length - 1;
          rows.push({
            id: f.path,
            primary: f.path.split('\\').pop(),
            secondary: `${f.path} · duplicate of ${otherCount} other file${otherCount === 1 ? '' : 's'}`,
            actionLabelOverride: 'Delete',
          });
        });
      });
      if (rows.length === 0) {
        setDuplicatesResult('No duplicate files found.');
        return;
      }
      setDuplicateRows(rows);
      setDuplicatesOpen(true);
    } catch (e) {
      setDuplicatesResult(`Scan failed: ${e.message || e}`);
    }
  }

  function handleRequestDeleteDuplicate(row) {
    setDuplicateToDelete(row);
  }

  async function handleConfirmDeleteDuplicate() {
    const row = duplicateToDelete;
    setDuplicateBusyId(row.id);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('delete-duplicates');
      await window.beetleAPI.optimizer.deleteDuplicates([row.id], token);
      setDuplicateRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      setDuplicatesResult(`Delete failed: ${e.message || e}`);
    } finally {
      setDuplicateBusyId(null);
      setDuplicateToDelete(null);
    }
  }

  // Free Space Wiper
  async function handleWiperClick() {
    if (!window.beetleAPI) return;
    setWiperOpen(true); setWiperBusy(true); setWiperResult(null);
    try {
      const result = await window.beetleAPI.optimizer.wiperList();
      const rows = (result.items || []).filter((i) => i.event === 'drive').map((i) => i.item);
      setWiperDrives(rows);
    } catch (e) {
      setWiperResult(`Could not list drives: ${e.message || e}`);
    } finally { setWiperBusy(false); }
  }
  async function handleConfirmWipe() {
    if (!wiperConfirm) return;
    setWiperBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('wiper-wipe');
      const result = await window.beetleAPI.optimizer.wiperWipe(wiperConfirm, token);
      const err = (result.items || []).find((i) => i.event === 'error');
      if (err) {
        setWiperResult(`Wipe failed: ${err.reason}`);
      } else {
        setWiperResult(`Wiped drive ${wiperConfirm} (${wiperPasses} pass${wiperPasses > 1 ? 'es' : ''}). This can take several hours.`);
      }
      setWiperConfirm(null);
    } catch (e) {
      setWiperResult(`Wipe failed: ${e.message || e}`);
    } finally { setWiperBusy(false); }
  }

  // Windows Slimmer
  async function handleSlimmerClick() {
    if (!window.beetleAPI) return;
    setSlimmerOpen(true); setSlimmerBusy(true);
    try {
      const result = await window.beetleAPI.optimizer.slimmerList();
      const rows = (result.items || []).filter((i) => i.event === 'op').map((i) => i.item);
      setSlimmerOps(rows);
    } catch (e) {
      setSlimmerOps([{ id: 'error', label: `Error: ${e.message || e}` }]);
    } finally { setSlimmerBusy(false); }
  }
  async function handleConfirmSlimmer() {
    if (!slimmerConfirm) return;
    setSlimmerBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('slimmer-apply');
      const result = await window.beetleAPI.optimizer.slimmerApply(slimmerConfirm.id, token);
      const err = (result.items || []).find((i) => i.event === 'error');
      if (err) setSlimmerResult(`Slimmer: ${err.reason}`);
      setSlimmerConfirm(null);
      await handleSlimmerClick();
    } catch (e) {
      setSlimmerResult(`Slimmer failed: ${e.message || e}`);
      setSlimmerBusy(false);
    }
  }

  // Mode Switcher
  async function handleModesClick() {
    if (!window.beetleAPI) return;
    setModesOpen(true); setModesBusy(true);
    try {
      const result = await window.beetleAPI.optimizer.modeList();
      const rows = (result.items || []).filter((i) => i.event === 'scheme').map((i) => i.item);
      setModesList(rows);
    } catch (e) {
      setModesList([{ id: 'error', label: `Error: ${e.message || e}`, active: false }]);
    } finally { setModesBusy(false); }
  }
  async function handleSetMode(schemeId) {
    setModesBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('mode-set');
      await window.beetleAPI.optimizer.modeSet(schemeId, token);
      await handleModesClick();
    } catch (e) {
      setModesBusy(false);
    }
  }

  // Context Menu Manager
  async function handleCtxClick() {
    if (!window.beetleAPI) return;
    setCtxOpen(true); setCtxBusy(true);
    try {
      const result = await window.beetleAPI.optimizer.contextMenuList();
      const rows = (result.items || []).filter((i) => i.event === 'handler').map((i) => i.item);
      setCtxList(rows);
    } catch (e) {
      setCtxList([{ id: 'error', name: `Error: ${e.message || e}`, location: '', value: '', disabled: false }]);
    } finally { setCtxBusy(false); }
  }
  async function handleToggleContext(entry, action) {
    setCtxBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm(action === 'disable' ? 'context-menu-disable' : 'context-menu-enable');
      const ipcName = action === 'disable' ? 'contextMenuDisable' : 'contextMenuEnable';
      await window.beetleAPI.optimizer[ipcName](entry.id, token);
      await handleCtxClick();
    } catch (e) { setCtxBusy(false); }
  }

  // Integrator
  async function handleIntegClick() {
    if (!window.beetleAPI) return;
    setIntegOpen(true); setIntegBusy(true);
    try {
      const result = await window.beetleAPI.optimizer.integratorList();
      const rows = (result.items || []).filter((i) => i.event === 'entry').map((i) => i.item);
      setIntegList(rows);
    } catch (e) {
      setIntegList([{ id: 'error', label: `Error: ${e.message || e}`, installed: false }]);
    } finally { setIntegBusy(false); }
  }
  async function handleToggleIntegrator(entry, action) {
    setIntegBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm(action === 'add' ? 'integrator-add' : 'integrator-remove');
      const ipcName = action === 'add' ? 'integratorAdd' : 'integratorRemove';
      await window.beetleAPI.optimizer[ipcName](entry.id, token);
      await handleIntegClick();
    } catch (e) { setIntegBusy(false); }
  }

  // Disk Priority
  async function handleDiskPriorityClick() {
    if (!window.beetleAPI) return;
    setDiskPrioOpen(true); setDiskPrioBusy(true);
    try {
      const r = await window.beetleAPI.optimizer.diskPriority();
      setDiskPrioProfiles((r.items || []).filter(i => i.event === 'profile').map(i => i.item));
    } catch (e) {
      setDiskPrioProfiles([]);
    } finally { setDiskPrioBusy(false); }
  }
  async function handleDiskPriorityApply() {
    setDiskPrioBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('disk-priority-apply');
      await window.beetleAPI.optimizer.diskPriorityApply(token);
      await handleDiskPriorityClick();
    } catch (e) { setDiskPrioBusy(false); }
  }

  // Backup Cleaner
  async function handleBackupCleanerClick() {
    if (!window.beetleAPI) return;
    setBackupCleanerOpen(true); setBackupCleanerBusy(true);
    try {
      const r = await window.beetleAPI.optimizer.backupCleaner();
      setBackupCleanerTargets((r.items || []).filter(i => i.event === 'cleanup_target').map(i => i.item));
    } catch (e) {
      setBackupCleanerTargets([]);
    } finally { setBackupCleanerBusy(false); }
  }
  async function handleBackupCleanerApply() {
    setBackupCleanerBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('backup-cleaner-apply');
      const r = await window.beetleAPI.optimizer.backupCleanerApply(token);
      const d = (r.items || []).find(i => i.event === 'done');
      setBackupCleanerConfirm(false);
      await handleBackupCleanerClick();
      setBackupCleanerResult(`Backup cleaner freed ${(d?.total_freed_bytes / 1024 / 1024).toFixed(1) || 0} MB`);
    } catch (e) {
      setBackupCleanerResult(`Backup cleaner failed: ${e.message || e}`);
      setBackupCleanerBusy(false);
    }
  }

  // Defrag on Next Boot
  async function handleDefragBootClick() {
    if (!window.beetleAPI) return;
    setDefragBootOpen(true); setDefragBootBusy(true);
    try {
      const r = await window.beetleAPI.optimizer.defragOnBoot();
      setDefragBootState((r.items || []).find(i => i.event === 'state').item);
    } catch (e) {
      setDefragBootState(null);
    } finally { setDefragBootBusy(false); }
  }
  async function handleDefragBootApply() {
    setDefragBootBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('defrag-on-boot-apply');
      await window.beetleAPI.optimizer.defragOnBootApply(token);
      await handleDefragBootClick();
    } catch (e) {
      setDefragBootResult(`Schedule failed: ${e.message || e}`);
      setDefragBootBusy(false);
    }
  }

  // Browser Helper Objects
  async function handleBhoClick() {
    if (!window.beetleAPI) return;
    setBhoOpen(true); setBhoBusy(true);
    try {
      const r = await window.beetleAPI.optimizer.browserHelperObjects();
      setBhoList((r.items || []).filter(i => i.event === 'bho').map(i => i.item));
    } catch (e) {
      setBhoList([]);
    } finally { setBhoBusy(false); }
  }
  async function handleBhoApply() {
    setBhoBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('bho-apply');
      const r = await window.beetleAPI.optimizer.bhoApply(token);
      const d = (r.items || []).find(i => i.event === 'done');
      setBhoConfirm(false);
      await handleBhoClick();
      setBhoResult(`Removed ${d?.removed || 0} orphan browser helper objects`);
    } catch (e) {
      setBhoResult(`BHO cleanup failed: ${e.message || e}`);
      setBhoBusy(false);
    }
  }

  // Registry Defrag (hive listing + compact button)
  async function handleRegDefragClick() {
    if (!window.beetleAPI) return;
    setRegDefragOpen(true); setRegDefragBusy(true);
    try {
      const result = await window.beetleAPI.optimizer.registryDefrag();
      const rows = (result.items || []).filter((i) => i.event === 'hive').map((i) => i.item);
      setRegDefragHives(rows);
    } catch (e) {
      setRegDefragHives([{ name: 'error', size_kb: 0, file_path: e.message || 'Error' }]);
    } finally { setRegDefragBusy(false); }
  }
  async function handleRegDefragCompact() {
    setRegDefragBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('registry-defrag-compact');
      const result = await window.beetleAPI.optimizer.registryDefragCompact(token);
      const err = (result.items || []).find((i) => i.event === 'error');
      if (err) setRegDefragResult(`Defrag: ${err.reason}`);
      // ConfirmModal is a fully controlled component with no auto-close of
      // its own (see ConfirmModal.jsx) - without this, the dialog stayed
      // open forever after a successful compact (busy would clear via
      // handleRegDefragClick()'s own finally, but "open" never did).
      setRegDefragConfirm(null);
      await handleRegDefragClick();
    } catch (e) {
      setRegDefragResult(`Defrag failed: ${e.message || e}`);
      setRegDefragBusy(false);
    }
  }

  // Action Center cleaner
  async function handleActionCenterClick() {
    if (!window.beetleAPI) return;
    setActionCenterOpen(true); setActionCenterBusy(true);
    try {
      const result = await window.beetleAPI.optimizer.actionCenterList();
      const rows = (result.items || []).filter((i) => i.event === 'op').map((i) => i.item);
      setActionCenterOps(rows);
    } catch (e) {
      setActionCenterOps([{ id: 'error', label: `Error: ${e.message || e}`, description: '', current_value: '', applied_value: '' }]);
    } finally { setActionCenterBusy(false); }
  }
  async function handleConfirmActionCenter() {
    if (!actionCenterConfirm) return;
    setActionCenterBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('action-center-apply');
      await window.beetleAPI.optimizer.actionCenterApply(actionCenterConfirm.id, token);
      setActionCenterConfirm(null);
      await handleActionCenterClick();
    } catch (e) { setActionCenterBusy(false); }
  }

  // Debug log
  async function handleDebugLogClick() {
    if (!window.beetleAPI) return;
    setActionCenterBusy(false);
    try {
      const result = await window.beetleAPI.optimizer.debugLog();
      const f = (result.items || []).find((i) => i.event === 'file');
      if (f) {
        setDebugResult(f.zip_path);
        // Auto-open the folder containing the zip
        try { await window.beetleAPI.system.openExternal('/select,' + f.zip_path); }
        catch (e) {}
      } else {
        setDebugResult(`Could not generate debug bundle`);
      }
    } catch (e) {
      setDebugResult(`Failed: ${e.message || e}`);
    }
  }

  // Internet Speed Up handler
  async function handleInternetClick() {
    if (!window.beetleAPI) { setInternetResult('Not available outside the packaged app.'); return; }
    setInternetResult(null);
    setInternetOpen(true);
    setInternetBusy(true);
    try {
      const result = await window.beetleAPI.optimizer.internetList();
      const t = (result.items || []).find((i) => i.event === 'tcp_global');
      const ad = (result.items || []).filter((i) => i.event === 'adapter').map((i) => i.item);
      const at = (result.items || []).find((i) => i.event === 'autotuning');
      const dns = (result.items || []).find((i) => i.event === 'dns_cache_max_ttl');
      setInternetData({ raw: t ? t.raw : '', adapters: ad, autotuning: at, dns });
    } catch (e) {
      setInternetResult(`Could not read settings: ${e.message || e}`);
    } finally {
      setInternetBusy(false);
    }
  }

  async function handleInternetOptimize() {
    setInternetBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('internet-optimize');
      await window.beetleAPI.optimizer.internetOptimize(token);
      setInternetResult('Optimized. Restart any open TCP sessions for changes to take effect.');
      await handleInternetClick();
    } catch (e) {
      setInternetResult(`Optimize failed: ${e.message || e}`);
    } finally {
      setInternetBusy(false);
    }
  }

  async function handleInternetReset() {
    setInternetBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('internet-reset');
      await window.beetleAPI.optimizer.internetReset(token);
      setInternetResult('Reset to Windows default TCP behavior.');
      await handleInternetClick();
    } catch (e) {
      setInternetResult(`Reset failed: ${e.message || e}`);
    } finally {
      setInternetBusy(false);
    }
  }

  // Disk Explorer handler
  async function handleDiskExplorerClick() {
    if (!window.beetleAPI) return;
    setDiskExpOpen(true);
    setDiskExpBusy(true);
    try {
      const result = await window.beetleAPI.optimizer.diskExplorer();
      const rows = (result.items || [])
        .filter((i) => i.event === 'folder')
        .map((i) => i.item)
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 100);
      setDiskExpRows(rows);
    } catch (e) {
      setDiskExpRows([{ name: 'Error', bytes: 0, path: '', files: 0, error: e.message || e }]);
    } finally {
      setDiskExpBusy(false);
    }
  }

  // Task Manager handler
  async function handleTaskManagerClick() {
    if (!window.beetleAPI) return;
    setTaskMgrOpen(true);
    setTaskMgrBusy(true);
    try {
      const result = await window.beetleAPI.optimizer.listTaskManager();
      const rows = (result.items || [])
        .filter((i) => i.event === 'process')
        .map((i) => i.item)
        .slice(0, 100);
      setTaskMgrRows(rows);
    } catch (e) {
      setTaskMgrRows([{ pid: -1, name: 'Error', cpu: 0, ram_bytes: 0 }]);
    } finally {
      setTaskMgrBusy(false);
    }
  }

  async function handleConfirmKillProcess() {
    if (!taskMgrConfirmKill) return;
    setTaskMgrBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('kill-process');
      await window.beetleAPI.optimizer.killProcess(taskMgrConfirmKill.pid, token);
      setTaskMgrConfirmKill(null);
      await handleTaskManagerClick();
    } catch (e) {
      setTaskMgrBusy(false);
      // keep the row - kill failed
    }
  }

  // Add-ons Manager handler
  async function handleAddonsClick() {
    if (!window.beetleAPI) return;
    setAddonsOpen(true);
    setAddonsBusy(true);
    try {
      const result = await window.beetleAPI.optimizer.listAddons();
      const rows = (result.items || [])
        .filter((i) => i.event === 'addon')
        .map((i) => i.item);
      setAddonsRows(rows);
    } catch (e) {
      setAddonsRows([{ name: `Error: ${e.message || e}`, id: '', browser: '', profile: '', version: '', enabled: false }]);
    } finally {
      setAddonsBusy(false);
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
      case 'driver':    return handleDriverClick();
      case 'duplicate': return handleDuplicatesClick();
      case 'add':        return setAddToolOpen(true);
      case 'internet':   return handleInternetClick();
      case 'disk-explorer': return handleDiskExplorerClick();
      case 'task-manager': return handleTaskManagerClick();
      case 'addons':     return handleAddonsClick();
      case 'wiper':      return handleWiperClick();
      case 'slimmer':    return handleSlimmerClick();
      case 'mode':       return handleModesClick();
      case 'integrator':    return handleIntegClick();
      case 'regdefrag':     return handleRegDefragClick();
      case 'actioncenter':  return handleActionCenterClick();
      case 'debuglog':      return handleDebugLogClick();
      case 'diskpriority':  return handleDiskPriorityClick();
      case 'backupcleaner': return handleBackupCleanerClick();
      case 'defragboot':    return handleDefragBootClick();
      case 'bho':           return handleBhoClick();
      default:           return;
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
      <TitleBar c={c} />

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
        ) : activeTab === 'My Tasks' ? (
          <MyTasksView c={c} isLight={isLight} />
        ) : activeTab === 'Reports' ? (
          <ReportsView c={c} isLight={isLight} onNavigate={setActiveTab} />
        ) : activeTab === 'Win10 Protector' ? (
          <Win10ProtectorView c={c} isLight={isLight} />
        ) : activeTab === 'Care Center' ? (
          <CareCenterView c={c} isLight={isLight} />
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

      <ItemListModal
        c={c}
        open={driversOpen}
        title="Driver Check"
        emptyText="No driver information available."
        items={drivers}
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setDriversOpen(false)}
      />
      {driversResult && (
        <div style={{
          position: 'fixed', bottom: 60, left: 220, zIndex: 30,
          fontSize: 11, color: c.textSecondary,
          background: c.bgSecondary, padding: '6px 10px',
          border: `1px solid ${c.border}`, borderRadius: 6,
        }}>{driversResult}</div>
      )}

      <ItemListModal
        c={c}
        open={duplicatesOpen}
        title="Duplicates Finder"
        emptyText="No duplicate files found."
        items={duplicateRows}
        actionLabel="Delete"
        busyId={duplicateBusyId}
        onAction={handleRequestDeleteDuplicate}
        onClose={() => setDuplicatesOpen(false)}
      />
      <ConfirmModal
        c={c}
        open={!!duplicateToDelete}
        busy={!!duplicateBusyId}
        title="Delete this duplicate file?"
        message="This permanently deletes the file. The other copy (copies) in its duplicate set are left untouched."
        details={duplicateToDelete ? duplicateToDelete.primary : null}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteDuplicate}
        onCancel={() => setDuplicateToDelete(null)}
      />
      {duplicatesResult && (
        <div style={{
          position: 'fixed', bottom: 60, left: 220, zIndex: 30,
          fontSize: 11, color: c.textSecondary,
          background: c.bgSecondary, padding: '6px 10px',
          border: `1px solid ${c.border}`, borderRadius: 6,
        }}>{duplicatesResult}</div>
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

      {/* INTERNET SPEED UP */}
      <ItemListModal
        c={c}
        open={internetOpen}
        title="Internet Speed Up"
        emptyText={internetBusy ? 'Reading TCP settings…' : 'No settings yet.'}
        items={[
          ...((internetData && internetData.adapters) || []).map((a) => ({
            id: 'ad:' + a.if_index, primary: a.name, secondary: `${a.status} · ${a.speed} · ${a.media}`,
          })),
          ...((internetData && internetData.autotuning) ? [{
            id: 'at', primary: 'Auto-Tuning Level', secondary: `netsh value: ${internetData.autotuning.level === null ? '(default)' : internetData.autotuning.level}`,
          }] : []),
          ...((internetData && internetData.dns) ? [{
            id: 'dns', primary: 'DNS Cache TTL', secondary: `${internetData.dns.limit_seconds || '(default)'} seconds`,
          }] : []),
          { id: 'opt', primary: 'Optimize', secondary: 'Normal TCP auto-tuning, enable RFC 1323 window scaling, 24h DNS TTL, disable NetBIOS over TCP/IP' },
          { id: 'rst', primary: 'Reset', secondary: 'Restore Windows default TCP behavior' },
        ]}
        actionLabel="Run"
        onAction={(item) => {
          if (item.id === 'opt') handleInternetOptimize();
          else if (item.id === 'rst') handleInternetReset();
          else if ((item.id || '').startsWith('ad:')) {} // adapter display rows - no-op clickable, but keep
          else setInternetOpen(false);
        }}
        onClose={() => setInternetOpen(false)}
      />
      {internetResult && (
        <div style={{ position: 'fixed', bottom: 60, left: 620, zIndex: 30, fontSize: 11, color: c.textSecondary, background: c.bgSecondary, padding: '6px 10px', border: `1px solid ${c.border}`, borderRadius: 6 }}>
          {internetResult}
        </div>
      )}

      {/* DISK EXPLORER */}
      <ItemListModal
        c={c}
        open={diskExpOpen}
        title="Disk Explorer - largest folders"
        emptyText={diskExpBusy ? 'Walking folders…' : 'No folders scanned.'}
        items={diskExpRows.map((r) => {
          const sizeMb = r.bytes ? (r.bytes / 1024 / 1024).toFixed(1) : '?';
          return {
            id: r.path,
            primary: r.name,
            secondary: `${sizeMb} MB · ${(r.files || 0).toLocaleString()} files · ${r.path}`,
          };
        })}
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setDiskExpOpen(false)}
      />

      {/* TASK MANAGER */}
      <ItemListModal
        c={c}
        open={taskMgrOpen}
        title="Task Manager - top 100 by RAM"
        emptyText={taskMgrBusy ? 'Listing processes…' : 'No processes yet.'}
        items={taskMgrRows.map((p) => ({
          id: 'p:' + p.pid,
          primary: `${p.name}.exe · PID ${p.pid}`,
          secondary: `RAM ${(p.ram_bytes / 1024 / 1024).toFixed(1)} MB · CPU ${p.cpu}s · ${p.handles} handles · ${p.threads} threads`,
          actionLabelOverride: 'End task',
        }))}
        actionLabel="End task"
        busyId={taskMgrBusy ? '__busy__' : null}
        onAction={(item) => {
          const pid = Number(String(item.id).slice(2));
          setTaskMgrConfirmKill({ pid });
        }}
        onClose={() => setTaskMgrOpen(false)}
      />
      <ConfirmModal
        c={c}
        open={!!taskMgrConfirmKill}
        busy={taskMgrBusy}
        title="End this process?"
        message="Forces the process to terminate without confirmation. Unsaved data in that process will be lost."
        details={taskMgrConfirmKill ? `PID ${taskMgrConfirmKill.pid}` : null}
        confirmLabel="End task"
        onConfirm={handleConfirmKillProcess}
        onCancel={() => setTaskMgrConfirmKill(null)}
      />

      {/* ADD-ONS MANAGER */}
      <ItemListModal
        c={c}
        open={addonsOpen}
        title="Browser Add-ons"
        emptyText={addonsBusy ? 'Listing extensions…' : 'No add-ons installed.'}
        items={addonsRows.map((a) => ({
          id: a.browser + ':' + a.id,
          primary: a.name + (a.enabled ? '' : ' (disabled)'),
          secondary: `${a.browser} · ${a.profile} · v${a.version} · ${a.id}`,
        }))}
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setAddonsOpen(false)}
      />

      {/* FILE RECOVERY */}
      <ItemListModal
        c={c}
        open={fileRecoveryOpen}
        title="Recycle Bin - recoverable files"
        emptyText={fileRecoveryBusy ? 'Reading $Recycle.Bin…' : 'Recycle Bin is empty.'}
        items={fileRecoveryRows.map((r) => ({
          id: r.path,
          primary: r.path.split('\\').pop(),
          secondary: `${(r.bytes / 1024).toFixed(1)} KB · ${new Date(r.deleted_at || 0).toLocaleString()} · ${r.path}`,
          actionLabelOverride: 'Restore...',
        }))}
        actionLabel="Restore..."
        onAction={(item) => {
          setFileRecoveryOpen(false);
          // open Reports tab for now (the renderer can wire a recovery
          // destination dialog later if not already present)
        }}
        onClose={() => setFileRecoveryOpen(false)}
      />

      {/* FREE SPACE WIPER */}
      <ItemListModal
        c={c}
        open={wiperOpen}
        title="Free Space Wiper"
        emptyText={wiperBusy ? 'Reading drives…' : 'No drives.'}
        items={wiperDrives.map((d) => ({
          id: d.letter,
          primary: `${d.letter} · ${(d.free_gb || 0).toFixed(1)} GB free`,
          secondary: `Total ${(d.size_gb || 0).toFixed(1)} GB · ${d.label || '(no label)'}`,
          actionLabelOverride: 'Wipe',
        }))}
        actionLabel="Wipe"
        onAction={(item) => { setWiperPasses(1); setWiperConfirm(item.id); }}
        onClose={() => setWiperOpen(false)}
      />
      <ConfirmModal
        c={c}
        open={!!wiperConfirm}
        busy={wiperBusy}
        title={`Wipe drive ${wiperConfirm || ''}?`}
        message={`Wipes the FREE SPACE on ${wiperConfirm} so previously-deleted files cannot be recovered. Wiping 200+ GB can take hours. Sleep / hibernate is preserved. NO files are touched.`}
        details={`Drive: ${wiperConfirm} · Passes: 1 (single overwrite - NIST SP 800-88 Clear)`}
        confirmLabel="Wipe drive"
        onConfirm={handleConfirmWipe}
        onCancel={() => setWiperConfirm(null)}
      />
      {wiperResult && (
        <div style={{ position: 'fixed', bottom: 60, left: 620, zIndex: 30, fontSize: 11, color: c.textSecondary, background: c.bgSecondary, padding: '6px 10px', border: `1px solid ${c.border}`, borderRadius: 6, maxWidth: 400 }}>{wiperResult}</div>
      )}

      {/* WINDOWS SLIMMER */}
      <ItemListModal
        c={c}
        open={slimmerOpen}
        title="Windows Slimmer"
        emptyText={slimmerBusy ? 'Reading system state…' : 'No operations.'}
        items={slimmerOps.map((o) => ({
          id: o.id,
          primary: o.label,
          secondary: o.description + (o.current_bytes ? ` (current: ${(o.current_bytes / 1024 / 1024 / 1024).toFixed(1)} GB)` : ''),
          actionLabelOverride: 'Apply',
        }))}
        actionLabel="Apply"
        onAction={(item) => setSlimmerConfirm({ id: item.id, label: item.primary })}
        onClose={() => setSlimmerOpen(false)}
      />
      <ConfirmModal
        c={c}
        open={!!slimmerConfirm}
        busy={slimmerBusy}
        title="Apply this slimming op?"
        message="This is a system-level change. Some require admin (compact OS, disable restore). It's reversible for most ops except 'Disable System Restore' (which deletes restore points). Exit before reverting."
        details={slimmerConfirm ? slimmerConfirm.label : null}
        confirmLabel="Apply"
        onConfirm={handleConfirmSlimmer}
        onCancel={() => setSlimmerConfirm(null)}
      />
      {slimmerResult && (
        <div style={{ position: 'fixed', bottom: 100, left: 620, zIndex: 30, fontSize: 11, color: c.textSecondary, background: c.bgSecondary, padding: '6px 10px', border: `1px solid ${c.border}`, borderRadius: 6, maxWidth: 400 }}>{slimmerResult}</div>
      )}

      {/* MODE SWITCHER */}
      <ItemListModal
        c={c}
        open={modesOpen}
        title="Mode Switcher - Power Plan"
        emptyText={modesBusy ? 'Loading…' : 'No schemes found.'}
        items={modesList.map((s) => ({
          id: s.id,
          primary: `${s.label}${s.active ? ' (active)' : ''}`,
          secondary: `GUID: ${s.guid}`,
          actionLabelOverride: s.active ? '—' : 'Activate',
        }))}
        actionLabel="Activate"
        onAction={(item) => { if (!modesList.find((x) => x.id === item.id && x.active)) handleSetMode(item.id); }}
        onClose={() => setModesOpen(false)}
      />

      {/* CONTEXT MENU */}
      <ItemListModal
        c={c}
        open={ctxOpen}
        title="Context Menu Manager"
        emptyText={ctxBusy ? 'Loading…' : 'No context menu handlers found (clean install).'}
        items={ctxList.map((h) => ({
          id: h.id,
          primary: h.name,
          secondary: `${h.location} · ${h.value ? h.value : '(empty)'}`,
          actionLabelOverride: h.disabled ? 'Enable' : 'Disable',
        }))}
        actionLabel="Disable"
        onAction={(item) => {
          const h = ctxList.find((x) => x.id === item.id);
          if (h) handleToggleContext(h, h.disabled ? 'enable' : 'disable');
        }}
        onClose={() => setCtxOpen(false)}
      />

      {/* INTEGRATOR */}
      <ItemListModal
        c={c}
        open={integOpen}
        title="Shell Integrator"
        emptyText={integBusy ? 'Loading…' : 'No entries.'}
        items={integList.map((e) => ({
          id: e.id,
          primary: e.label,
          secondary: e.installed ? 'Already installed' : 'Not installed',
          actionLabelOverride: e.installed ? 'Remove' : 'Add',
        }))}
        actionLabel="Add"
        onAction={(item) => {
          const e = integList.find((x) => x.id === item.id);
          if (e) handleToggleIntegrator(e, e.installed ? 'remove' : 'add');
        }}
        onClose={() => setIntegOpen(false)}
      />

      {/* REGISTRY DEFRAG */}
      <ItemListModal
        c={c}
        open={regDefragOpen}
        title="Registry Hive Sizes"
        emptyText={regDefragBusy ? 'Reading registry…' : 'No hives.'}
        items={regDefragHives.map((h) => ({
          id: 'hive:' + (h.name || '?'),
          primary: (h.name || '?') + (h.unloadable ? ' (user hive)' : ' (system - read only)'),
          secondary: `${(h.size_kb || 0).toFixed(1)} KB${h.file_path ? ' · ' + h.file_path : ''}` + (h.subkey_count ? ` · ${h.subkey_count} subkey(s)` : ''),
        }))}
        actionLabel="Defrag user hive"
        onAction={(item) => {
          if (regDefragBusy) return;
          if (regDefragHives.find((h) => h.id === item.id) && !regDefragHives.find((h) => h.id === item.id).unloadable) {
            setRegDefragResult('Only user (HKCU/HKU) hives can be safely compacted mid-session. Use the schedule-at-logout feature instead.');
            return;
          }
          setRegDefragConfirm({ label: 'Compact ' + item.id });
        }}
        onClose={() => setRegDefragOpen(false)}
      />
      <ConfirmModal
        c={c}
        open={!!regDefragConfirm}
        busy={regDefragBusy}
        title="Compact user registry hive?"
        message="Writes the loaded HKCU hive to a temporary file, then reloads it - effectively rebuilding the hive layout. May briefly affect apps with cached handles. The script reports savings at the end."
        details={regDefragConfirm?.label}
        confirmLabel="Compact"
        onConfirm={handleRegDefragCompact}
        onCancel={() => setRegDefragConfirm(null)}
      />
      {regDefragResult && (
        <div style={{ position: 'fixed', bottom: 100, left: 920, zIndex: 30, fontSize: 11, color: c.textSecondary, background: c.bgSecondary, padding: '6px 10px', border: `1px solid ${c.border}`, borderRadius: 6, maxWidth: 380 }}>{regDefragResult}</div>
      )}

      {/* ACTION CENTER CLEANER */}
      <ItemListModal
        c={c}
        open={actionCenterOpen}
        title="Action Center Cleaner"
        emptyText={actionCenterBusy ? 'Reading registry…' : 'No operations.'}
        items={actionCenterOps.map((o) => ({
          id: 'op:' + o.id,
          primary: o.label,
          secondary: o.description + (o.current_value !== '' && o.current_value !== '(not set)' ? ` (current: ${o.current_value})` : ''),
          actionLabelOverride: 'Apply',
        }))}
        actionLabel="Apply"
        onAction={(item) => {
          const op = actionCenterOps.find((o) => ('op:' + o.id) === item.id);
          if (op) setActionCenterConfirm({ id: op.id, label: op.label });
        }}
        onClose={() => setActionCenterOpen(false)}
      />
      <ConfirmModal
        c={c}
        open={!!actionCenterConfirm}
        busy={actionCenterBusy}
        title="Apply this Action Center op?"
        message={`This touches notification area, recent documents, and Tips registry values. It's reversible - just toggle the setting back to its previous value in the same way.`}
        details={actionCenterConfirm?.label}
        confirmLabel="Apply"
        onConfirm={handleConfirmActionCenter}
        onCancel={() => setActionCenterConfirm(null)}
      />

      {debugResult && (
        <div style={{ position: 'fixed', bottom: 60, left: 920, zIndex: 30, fontSize: 11, color: c.textSecondary, background: c.bgSecondary, padding: '6px 10px', border: `1px solid ${c.border}`, borderRadius: 6, maxWidth: 380 }}>{debugResult}</div>
      )}

      {/* DISK PRIORITY */}
      <ItemListModal
        c={c}
        open={diskPrioOpen}
        title="Disk Priority Manager"
        emptyText={diskPrioBusy ? 'Reading…' : 'No multimedia profile.'}
        items={diskPrioProfiles.map((p) => ({
          id: 'p:' + p.name,
          primary: p.name + (p.priority !== '(not set)' ? ` (Priority ${p.priority})` : ''),
          secondary: `GPU priority: ${p.gpu_priority} · SFIO priority: ${p.sfio_priority}`,
        }))}
        actionLabel="Apply"
        onAction={handleDiskPriorityApply}
        onClose={() => setDiskPrioOpen(false)}
      />

      {/* BACKUP CLEANER */}
      <ItemListModal
        c={c}
        open={backupCleanerOpen}
        title="Backup Cleaner"
        emptyText={backupCleanerBusy ? 'Walking folders…' : 'No backup artifacts found.'}
        items={backupCleanerTargets.map((t) => ({
          id: 'bc:' + t.id,
          primary: t.label + (t.absent ? ' (absent)' : ''),
          secondary: t.description + (t.size_mb ? ` · ${t.size_mb} MB` : ''),
          actionLabelOverride: t.absent ? '—' : 'Remove',
        }))}
        actionLabel="Clean all"
        onAction={() => setBackupCleanerConfirm(true)}
        onClose={() => setBackupCleanerOpen(false)}
      />
      <ConfirmModal
        c={c}
        open={backupCleanerConfirm}
        busy={backupCleanerBusy}
        title="Delete all backup artifacts?"
        message="Permanently removes Windows.old, upgrade staging folders, and old crash dumps found above. This can free several GB but cannot be undone - you will not be able to roll back to the prior Windows install."
        details={backupCleanerTargets.filter((t) => !t.absent).map((t) => t.label).join(', ') || null}
        confirmLabel="Clean all"
        onConfirm={handleBackupCleanerApply}
        onCancel={() => setBackupCleanerConfirm(false)}
      />
      {backupCleanerResult && (
        <div style={{ position: 'fixed', bottom: 140, left: 620, zIndex: 30, fontSize: 11, color: c.textSecondary, background: c.bgSecondary, padding: '6px 10px', border: `1px solid ${c.border}`, borderRadius: 6, maxWidth: 400 }}>{backupCleanerResult}</div>
      )}

      {/* DEFRAG ON NEXT BOOT */}
      {defragBootState && (
        <ItemListModal
          c={c}
          open={defragBootOpen}
          title="Defrag on Next Boot"
          emptyText={defragBootBusy ? 'Reading state…' : 'No state.'}
          items={[
            { id: 'auto', primary: 'Auto defrag scheduled (system-wide)', secondary: defragBootState.auto_defrag_enabled ? 'Enabled' : 'Disabled' },
            { id: 'ro', primary: 'RunOnce value', secondary: defragBootState.runonce_value },
            { id: 'task', primary: 'Scheduled task', secondary: defragBootState.task_present ? `${defragBootState.task_state}` : 'Not registered' },
            { id: 'apply', primary: 'Schedule defrag for next logon', secondary: 'Adds a RunOnce + AtLogOn scheduled task. Reversible.' },
          ]}
          actionLabel="Schedule"
          onAction={(item) => {
            if (item.id === 'apply') handleDefragBootApply();
            else setDefragBootResult('Use "Schedule defrag for next logon" to set this up.');
          }}
          onClose={() => setDefragBootOpen(false)}
        />
      )}
      {defragBootResult && (
        <div style={{ position: 'fixed', bottom: 140, left: 920, zIndex: 30, fontSize: 11, color: c.textSecondary, background: c.bgSecondary, padding: '6px 10px', border: `1px solid ${c.border}`, borderRadius: 6, maxWidth: 380 }}>{defragBootResult}</div>
      )}

      {/* BHO */}
      <ItemListModal
        c={c}
        open={bhoOpen}
        title="Browser Helper Objects"
        emptyText={bhoBusy ? 'Scanning…' : 'No BHO found.'}
        items={bhoList.map((b) => ({
          id: 'b:' + b.id,
          primary: `${b.status === 'orphan' ? '⚠ ORPHAN' : (b.status === 'found' ? '✓ OK' : '?')} ${b.clsid}`,
          secondary: `${b.hive} · ${b.file_path}`,
          actionLabelOverride: b.status === 'orphan' ? 'Remove' : '—',
        }))}
        actionLabel="Clean orphans"
        onAction={() => setBhoConfirm(true)}
        onClose={() => setBhoOpen(false)}
      />
      <ConfirmModal
        c={c}
        open={bhoConfirm}
        busy={bhoBusy}
        title="Remove orphan Browser Helper Objects?"
        message="Deletes the registry entries for every BHO/IE extension listed above whose backing file no longer exists on disk. Entries whose file is still present are never touched."
        details={`${bhoList.filter((b) => b.status === 'orphan').length} orphan entr${bhoList.filter((b) => b.status === 'orphan').length === 1 ? 'y' : 'ies'} found`}
        confirmLabel="Clean orphans"
        onConfirm={handleBhoApply}
        onCancel={() => setBhoConfirm(false)}
      />
      {bhoResult && (
        <div style={{ position: 'fixed', bottom: 140, left: 220, zIndex: 30, fontSize: 11, color: c.textSecondary, background: c.bgSecondary, padding: '6px 10px', border: `1px solid ${c.border}`, borderRadius: 6, maxWidth: 380 }}>{bhoResult}</div>
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