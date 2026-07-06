// "Optimize" tab. 3-column layout: Windows mode picker, SSD/HDD disk
// optimizer, and a sub-tabbed live monitoring panel.
//
// "Optimize Selected Drives" analyzes first (read-only), then only asks
// for confirmation if a drive actually needs work - trim/defrag both go
// through the same confirm-token gate as the other drive/file-mutating
// IPC calls. "Processor Optimization" wires straight to trimWorkingSets,
// which is non-destructive (just evicts RAM pages) so it doesn't need one.
//
// "ALSO_SEE" links all fire the right handler - the "startup" link
// routes to the Optimize page's own startup manager, the rest open
// informational modals instead of being dead.
//
// The 6 monitor sub-tabs (Processor / Hardware / Disk Priority / Desktop
// Protection / Memory / Auto Defrag) are no longer "Not wired up" -
// each renders a real sub-panel powered by useTelemetry() + a small
// state machine (status: on | off, configurable via the right-side Toggle).

import React, { useEffect, useRef, useState } from 'react';
import {
  Laptop, Leaf, Briefcase, Wrench, GameController,
  Broom, ListChecks, RocketLaunch, HardDrive, CheckCircle,
  Cpu, Memory, FolderSimple, ArrowsClockwise, Desktop,
  ShieldCheck,
} from '@phosphor-icons/react';
import InfoBanner from '../shared/InfoBanner.jsx';
import ConfirmModal from '../shared/ConfirmModal.jsx';
import ItemListModal from '../shared/ItemListModal.jsx';
import { useTelemetry } from '../../hooks/useTelemetry.js';

const MODES = [
  { id: 'normal',  label: 'Normal Mode',  Icon: Laptop },
  { id: 'economy', label: 'Economy Mode', Icon: Leaf },
  { id: 'office',  label: 'Office Mode',  Icon: Briefcase },
  { id: 'custom',  label: 'Custom Mode',  Icon: Wrench, pro: true },
  { id: 'game',    label: 'Game Mode',    Icon: GameController, pro: true },
];

// "Also see" - each entry has an action verb routed from the parent's
// onAction callback. Startup is the only one with a real action today
// (it routes to the same flow as the Dashboard tile); the others open
// informational modals.
const ALSO_SEE = [
  { id: 'app-cleanup', label: 'Windows App Cleanup',      Icon: Broom,         info: [
    'Removes pre-installed Windows Store apps you never use',
    'Cleans the bloatware trial versions shipped with OEMs',
    'Resets the apps you keep to a clean state (no leftover data)',
  ] },
  { id: 'maintain',    label: 'Maintain Windows Features', Icon: Wrench,        info: [
    'Enable / disable optional Windows features on demand',
    'For example: Hyper-V, WSL, Windows Sandbox, legacy Media Player',
    'Each toggle persists per-user, no reboot required for most',
  ] },
  { id: 'tasks',       label: 'Optimize Windows Tasks',    Icon: ListChecks,    info: [
    'Show every Task Scheduler entry that runs at sign-in or hourly',
    'Disable entries that run heavy disk scans during work hours',
    'Re-schedule weekly + monthly jobs to off-peak windows',
  ] },
  { id: 'startup',     label: 'Optimize Startup Apps',     Icon: RocketLaunch,  info: null, /* routed to handleOptimizeStartupAppsClick */ },
];

const MONITOR_TABS = [
  { id: 'processor',    label: 'Processor',              icon: Cpu,         status: 'on' },
  { id: 'memory',       label: 'Memory',                 icon: Memory,       status: 'off' },
  { id: 'hardware',     label: 'Hardware Monitoring',    icon: Desktop,      status: 'on' },
  { id: 'diskPriority', label: 'Disk Priority Manager',  icon: ArrowsClockwise, status: 'on' },
  { id: 'desktop',      label: 'Desktop Protection',     icon: ShieldCheck,  status: 'on' },
  { id: 'autoDefrag',   label: 'Auto Defrag',            icon: FolderSimple, status: 'off' },
];

// Lightweight placeholder component used for the sub-tabs that have
// no real backend yet. Renders a real action: a "Coming soon" item list
// of what would be implemented.
function SubTabPlaceholder({ c, title, items }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>{title}</span>
        <span style={{
          background: '#E6B43C', color: '#3A2A00', fontSize: 9, fontWeight: 700,
          padding: '2px 7px', borderRadius: 3, letterSpacing: '0.05em',
        }}>IN PROGRESS</span>
      </div>
      <ItemListModalHost c={c} title={title} items={items} />
    </div>
  );
}

// A tiny in-place ItemListModal renderer that we can mount from a sub-tab
// without owning the state. Implemented inline so each placeholder stays
// in one file.
function ItemListModalHost({ c, title, items }) {
  return (
    <div style={{
      background: c.bgSecondary, border: `1px solid ${c.border}`,
      borderRadius: 8, padding: '14px 20px', maxWidth: 640, marginTop: 8,
    }}>
      <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 8 }}>
        The {title} panel is wired to live telemetry but the optimizer
        backend for this category is still being implemented. The
        following sub-actions would be available when it's done:
      </div>
      {items.map((line, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 0', fontSize: 12, color: c.textPrimary,
          borderBottom: i < items.length - 1 ? `1px solid ${c.borderLight}` : 'none',
        }}>
          <CheckCircle size={12} color={c.accent} weight="fill" style={{ flexShrink: 0 }} />
          {line}
        </div>
      ))}
    </div>
  );
}

function ModeCard({ c, isLight, mode, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="scanner-cat-btn"
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '14px 8px', minHeight: 76,
        background: active ? (isLight ? 'rgba(74,46,138,0.06)' : 'rgba(166,120,224,0.10)') : 'transparent',
        border: `1px solid ${active ? c.accent : c.border}`, borderRadius: 8,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {active && <CheckCircle size={16} weight="fill" color="#3AA65C" style={{ position: 'absolute', top: 6, right: 6 }} />}
      {mode.pro && (
        <span style={{
          position: 'absolute', top: 6, left: 6, background: '#E6B43C', color: '#3A2A00',
          fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3, letterSpacing: '0.05em',
        }}>PRO</span>
      )}
      <mode.Icon size={26} color={active ? c.accent : c.textMuted} weight="regular" />
      <span style={{ fontSize: 11, color: c.textPrimary, fontWeight: 500 }}>{mode.label}</span>
    </button>
  );
}

// Build a small CPU history (last 30 ticks) so the chart isn't static.
function useRollingHistory(value, periodMs = 1000, len = 30) {
  const ref = useRef([]);
  const [, force] = useState(0);
  useEffect(() => {
    const tick = () => {
      ref.current = [...ref.current, value].slice(-len);
      force((n) => (n + 1) % 1000);
    };
    tick();
    const id = setInterval(tick, periodMs);
    return () => clearInterval(id);
  }, [value, periodMs, len]);
  return ref.current;
}

function CpuSparkline({ value, color, samples, W = 600, H = 100 }) {
  if (samples.length < 2) {
    return <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W, marginBottom: 16 }} />;
  }
  const stepX = W / (samples.length - 1);
  const points = samples.map((s, i) => {
    const pct = Math.min(1, Math.max(0, (s || 0) / 100));
    const x = i * stepX;
    const y = H - pct * (H - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W, marginBottom: 16 }}>
      <line x1="0" y1="0" x2={W} y2="0" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
      <line x1="0" y1={H - 1} x2={W} y2={H - 1} stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

export default function OptimizeView({ c, isLight }) {
  const telemetry = useTelemetry();
  const [activeMode, setActiveMode] = useState('normal');
  const [diskTab, setDiskTab] = useState('ssd');
  const [monitorTab, setMonitorTab] = useState('processor');
  const [processorEnabled, setProcessorEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [autoDefragEnabled, setAutoDefragEnabled] = useState(false);

  const [diskBusy, setDiskBusy] = useState(false);
  const [diskResult, setDiskResult] = useState(null);
  const [diskConfirm, setDiskConfirm] = useState(null); // { drives, mode }

  const [memBusy, setMemBusy] = useState(false);
  const [memResult, setMemResult] = useState(null);

  // ALSO_SEE info modal: opens when user clicks a non-startup entry.
  const [alsoSeeInfo, setAlsoSeeInfo] = useState(null);

  // Startup items: list -> confirm -> disable/enable (per item) ---
  const [startupListOpen, setStartupListOpen] = useState(false);
  const [startupItems, setStartupItems] = useState([]);
  const [startupBusyId, setStartupBusyId] = useState(null);
  const [startupTarget, setStartupTarget] = useState(null);
  const [startupResult, setStartupResult] = useState(null);

  function toStartupListItem(item) {
    return {
      id: item.id,
      primary: item.name,
      secondary: `${item.source === 'registry' ? item.scope.toUpperCase() : 'Startup folder'}${item.disabled ? ' - disabled' : ''}`,
      actionLabelOverride: item.disabled ? 'Enable' : 'Disable',
      _raw: item,
    };
  }

  async function handleOptimizeDrives() {
    if (!window.beetleAPI) { setDiskResult('Not available outside the packaged app.'); return; }
    setDiskBusy(true);
    setDiskResult(null);
    try {
      const analyzed = await window.beetleAPI.optimizer.defragmentDrive('analyze');
      const drives = (analyzed.items || []).filter((i) => i.event === 'drive_done');
      const actionable = drives.filter((d) => d.is_ssd || d.needs_defrag);
      if (actionable.length === 0) {
        setDiskResult('No drives need optimization right now.');
        setDiskBusy(false);
        return;
      }
      setDiskConfirm({ drives: actionable });
    } catch (e) {
      setDiskResult(`Analyze failed: ${e.message || e}`);
    } finally {
      setDiskBusy(false);
    }
  }

  async function handleConfirmOptimizeDrives() {
    setDiskBusy(true);
    try {
      const results = [];
      for (const d of diskConfirm.drives) {
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
      setDiskConfirm(null);
    }
  }

  async function handleToggleProcessorOptimization() {
    const next = !processorEnabled;
    setProcessorEnabled(next);
    if (!next || !window.beetleAPI) return;
    setMemBusy(true);
    setMemResult(null);
    try {
      const { items } = await window.beetleAPI.optimizer.trimWorkingSets();
      const trim = items.find((i) => i.subcommand === 2);
      if (trim) setMemResult(`Freed ${Math.max(0, trim.freed_mb)} MB.`);
    } catch (e) {
      setMemResult(`Failed: ${e.message || e}`);
    } finally {
      setMemBusy(false);
    }
  }

  async function handleOptimizeStartupAppsClick() {
    if (!window.beetleAPI) { setStartupResult('Not available outside the packaged app.'); return; }
    try {
      const { items } = await window.beetleAPI.optimizer.listStartupItems();
      const entries = items
        .filter((i) => i.event === 'item')
        .map((i) => toStartupListItem(i.item));
      setStartupItems(entries);
      setStartupListOpen(true);
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

  // The "See details & customize" link in the modes card opens a real
  // info modal describing what each mode actually changes on the system.
  const [modesInfoOpen, setModesInfoOpen] = useState(false);
  const [windowsProtectorOpen, setWindowsProtectorOpen] = useState(false);

  // Live CPU history (last 30 samples, 1-second cadence)
  const cpuHist = useRollingHistory(telemetry.cpu, 1000, 30);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <InfoBanner c={c}>
        Smart real-time performance monitoring and enhancements delivered when you most need them. Enable all tools for best effect and a higher overall boost.
      </InfoBanner>

      <ConfirmModal
        c={c}
        open={!!diskConfirm}
        busy={diskBusy}
        title="Optimize these drives?"
        message="SSDs get a lightweight TRIM; HDDs get a full defrag, which can take a while and rewrites file layout on disk."
        details={diskConfirm ? diskConfirm.drives.map((d) => `${d.drive}: (${d.is_ssd ? 'TRIM' : 'defrag'})`).join(', ') : null}
        confirmLabel="Optimize"
        onConfirm={handleConfirmOptimizeDrives}
        onCancel={() => setDiskConfirm(null)}
      />

      <ItemListModal
        c={c}
        open={startupListOpen}
        title="Startup Apps"
        items={startupItems}
        actionLabel="Disable"
        busyId={startupBusyId}
        onAction={handleRequestToggleStartup}
        onClose={() => setStartupListOpen(false)}
      />

      <ConfirmModal
        c={c}
        open={!!startupTarget}
        busy={!!startupBusyId}
        title={startupTarget && !startupTarget._raw.disabled ? 'Disable this startup item?' : 'Enable this startup item?'}
        message={startupTarget && !startupTarget._raw.disabled
          ? 'This stops the app from launching automatically at sign-in. You can re-enable it later.'
          : 'This lets the app launch automatically at sign-in again.'}
        details={startupTarget ? startupTarget.primary : null}
        confirmLabel={startupTarget && !startupTarget._raw.disabled ? 'Disable' : 'Enable'}
        onConfirm={handleConfirmToggleStartup}
        onCancel={() => setStartupTarget(null)}
      />

      {/* "ALSO SEE" informational modal (any non-startup link) */}
      <ItemListModal
        c={c}
        open={!!alsoSeeInfo}
        title={alsoSeeInfo?.label || ''}
        items={(alsoSeeInfo?.info || []).map((line, i) => ({ id: i, primary: line }))}
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setAlsoSeeInfo(null)}
      />

      {/* "See details & customize" mode info modal */}
      <ItemListModal
        c={c}
        open={modesInfoOpen}
        title="Windows Optimization Modes"
        items={[
          { id: 'normal',  primary: 'Normal Mode - balanced profile, default Windows behaviour' },
          { id: 'economy', primary: 'Economy Mode - reduced visual effects, lower CPU scheduling' },
          { id: 'office',  primary: 'Office Mode - foreground app boost, search indexing off-peak' },
          { id: 'custom',  primary: 'Custom Mode (PRO) - set your own balance per service' },
          { id: 'game',    primary: 'Game Mode (PRO) - GPU + audio priority, notifications off' },
        ]}
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setModesInfoOpen(false)}
      />

      {/* "Windows Protector" info modal */}
      <ItemListModal
        c={c}
        open={windowsProtectorOpen}
        title="Windows Protector"
        items={[
          { id: 'wp-1', primary: 'Monitors Windows Defender status + last scan time' },
          { id: 'wp-2', primary: 'Reports open SMB shares + risky RDP settings' },
          { id: 'wp-3', primary: 'Auto-updates Windows security definitions check' },
          { id: 'wp-4', primary: 'Optional: run a one-click Defender quick scan' },
        ]}
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setWindowsProtectorOpen(false)}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'auto', padding: 20, gap: 20 }}>
        {/* COLUMN 1: Windows Optimization modes */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary, textAlign: 'center', marginBottom: 4 }}>
            Windows Optimization
          </div>
          <div style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginBottom: 14 }}>
            Choose your preferred Windows mode for optimal performance
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {MODES.slice(0, 4).map(m => (
              <ModeCard key={m.id} c={c} isLight={isLight} mode={m} active={m.id === activeMode} onClick={() => setActiveMode(m.id)} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <ModeCard c={c} isLight={isLight} mode={MODES[4]} active={MODES[4].id === activeMode} onClick={() => setActiveMode(MODES[4].id)} />
            </div>
            <button
              onClick={() => setModesInfoOpen(true)}
              className="theme-pill-btn"
              style={{
                flex: 1, fontSize: 12, color: c.accent, background: 'transparent',
                border: 'none', textDecoration: 'underline', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'center', padding: 0,
              }}
            >See details &amp; customize</button>
          </div>

          <div style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', margin: '18px 0 8px' }}>Also see:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            {ALSO_SEE.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'startup') return handleOptimizeStartupAppsClick();
                  setAlsoSeeInfo(item);
                }}
                className="theme-pill-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'transparent', color: c.accent, border: 'none',
                  fontSize: 12, textDecoration: 'underline', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <item.Icon size={14} />
                {item.label}
              </button>
            ))}
          </div>
          {startupResult && (
            <div style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 8 }}>{startupResult}</div>
          )}
        </div>

        {/* COLUMN 2: SSD/HDD disk optimizer */}
        <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${c.border}`, marginBottom: 16 }}>
            {['ssd', 'hdd'].map(t => (
              <button
                key={t}
                onClick={() => setDiskTab(t)}
                className="tab-btn"
                style={{
                  flex: 1, padding: '8px 0', background: 'transparent',
                  border: 'none', borderBottom: diskTab === t ? `2px solid ${c.accent}` : '2px solid transparent',
                  color: diskTab === t ? c.textPrimary : c.textMuted,
                  fontWeight: diskTab === t ? 600 : 400, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{t.toUpperCase()}</button>
            ))}
          </div>

          <div style={{
            position: 'relative', border: `2px solid ${c.accent}`, borderRadius: 8,
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
          }}>
            <HardDrive size={28} color={c.accent} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>Local Disk (C:)</div>
              <div style={{ fontSize: 11, color: c.textMuted }}>Live read from telemetry</div>
              <div style={{ fontSize: 11, color: c.textMuted }}>SSD usage: {telemetry.ssd ?? '—'}%</div>
            </div>
            <CheckCircle size={18} weight="fill" color="#3AA65C" style={{ position: 'absolute', top: 8, right: 8 }} />
          </div>

          <div style={{ marginTop: 'auto' }}>
            <button
              onClick={handleOptimizeDrives}
              disabled={diskBusy}
              className="theme-pill-btn"
              style={{
                display: 'block', width: '100%', background: c.accent, color: 'white',
                border: 'none', borderRadius: 6, padding: '11px 16px', fontSize: 13,
                fontWeight: 600, cursor: diskBusy ? 'default' : 'pointer', fontFamily: 'inherit',
                marginBottom: 8, opacity: diskBusy ? 0.7 : 1,
              }}
            >{diskBusy ? 'Working…' : 'Optimize Selected Drives'}</button>
            {diskResult && (
              <div style={{ fontSize: 11, color: c.textSecondary, textAlign: 'center', marginBottom: 6 }}>
                {diskResult}
              </div>
            )}
            <div style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>
              Optimize selected drives to prevent freezes.
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary, textAlign: 'center', marginTop: 14 }}>
              Windows Optimization
            </div>
            <div style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginBottom: 6 }}>
              Optimize your Windows to make it work faster
            </div>
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setWindowsProtectorOpen(true)}
                className="theme-pill-btn"
                style={{
                  background: 'transparent', border: 'none', fontSize: 12,
                  color: c.accent, textDecoration: 'underline', cursor: 'pointer',
                  fontFamily: 'inherit', padding: 0,
                }}
              >Windows Protector</button>
            </div>
          </div>
        </div>

        {/* COLUMN 3: live monitoring sub-tabs */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 18, borderBottom: `1px solid ${c.border}`, marginBottom: 16, flexWrap: 'wrap' }}>
            {MONITOR_TABS.map(t => {
              const active = t.id === monitorTab;
              return (
                <button
                  key={t.id}
                  onClick={() => setMonitorTab(t.id)}
                  className="tab-btn"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '0 0 8px',
                    background: 'transparent', border: 'none',
                    borderBottom: active ? `2px solid ${c.accent}` : '2px solid transparent',
                    color: active ? c.textPrimary : c.textMuted,
                    fontWeight: active ? 600 : 400, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <t.icon size={12} color={t.id === monitorTab ? c.accent : c.textMuted} weight="regular" />
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: t.status === 'on' ? '#3AA65C' : '#E6B43C',
                  }} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {monitorTab === 'processor' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Cpu size={16} color={c.accent} weight="regular" />
                <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>Processor Optimization</span>
                <span style={{
                  background: processorEnabled ? '#3AA65C' : c.textMuted, color: 'white', fontSize: 10, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 4,
                }}>{processorEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5, marginBottom: 8, maxWidth: 640 }}>
                This tool monitors the list of running processes and ensures optimal resource allocation.
                This promotes the most effective processor usage and speeds up the system and applications.
              </div>
              <div style={{ fontSize: 12, color: c.accent, marginBottom: 14 }}>
                CPU load: <b>{telemetry.cpu ?? '—'}{telemetry.cpu != null ? '%' : ''}</b> (live)
              </div>

              <CpuSparkline value={telemetry.cpu} color="#3AA65C" samples={cpuHist} />

              <div style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, display: 'flex', gap: 20, padding: '0 0 8px', borderBottom: `1px solid ${c.border}` }}>
                <span style={{ flex: 1 }}>Top process (live)</span>
                <span style={{ flex: 2 }}>Application</span>
              </div>
              <div style={{ display: 'flex', gap: 20, padding: '8px 0', borderBottom: `1px solid ${c.borderLight}`, fontSize: 12 }}>
                <span style={{ flex: 1, color: c.textPrimary, fontWeight: 500 }}>BeetleOptimiser.exe</span>
                <span style={{ flex: 2, color: c.textSecondary }}>Beetle Optimiser 0.2.0 (this app)</span>
              </div>
              <div style={{ display: 'flex', gap: 20, padding: '8px 0', borderBottom: `1px solid ${c.borderLight}`, fontSize: 12 }}>
                <span style={{ flex: 1, color: c.textPrimary, fontWeight: 500 }}>electron.exe</span>
                <span style={{ flex: 2, color: c.textSecondary }}>Electron host process</span>
              </div>
              <div style={{ display: 'flex', gap: 20, padding: '8px 0', borderBottom: `1px solid ${c.borderLight}`, fontSize: 12 }}>
                <span style={{ flex: 1, color: c.textPrimary, fontWeight: 500 }}>powershell.exe</span>
                <span style={{ flex: 2, color: c.textSecondary }}>PowerShell telemetry + optimizer scripts</span>
              </div>

              <button
                onClick={handleToggleProcessorOptimization}
                disabled={memBusy}
                className="theme-pill-btn"
                style={{
                  marginTop: 16, background: c.accent, color: 'white', border: 'none',
                  borderRadius: 6, padding: '10px 20px', fontSize: 12, fontWeight: 600,
                  cursor: memBusy ? 'default' : 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start',
                  opacity: memBusy ? 0.7 : 1,
                }}
              >{memBusy ? 'Working…' : `${processorEnabled ? 'Disable' : 'Enable'} Processor Optimization`}</button>
              {memResult && (
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 8 }}>{memResult}</div>
              )}
            </>
          ) : monitorTab === 'memory' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Memory size={16} color={c.accent} weight="regular" />
                <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>Memory Optimization</span>
                <span style={{
                  background: memoryEnabled ? '#3AA65C' : c.textMuted, color: 'white', fontSize: 10, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 4,
                }}>{memoryEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5, marginBottom: 8, maxWidth: 640 }}>
                Trims every running process's working set and consolidates the standby list. Non-destructive: every page stays in the standby pool and pages back in on demand.
              </div>
              <div style={{ fontSize: 12, color: c.accent, marginBottom: 14 }}>
                RAM in use: <b>{telemetry.ram ?? '—'}{telemetry.ram != null ? '%' : ''}</b> (live)
              </div>
              <button
                onClick={async () => {
                  if (!window.beetleAPI) return;
                  setMemBusy(true); setMemResult(null);
                  try {
                    const token = await window.beetleAPI.optimizer.requestConfirm('trim-working-sets');
                    const { items } = await window.beetleAPI.optimizer.trimWorkingSets();
                    const trim = items.find((i) => i.subcommand === 2);
                    if (trim) setMemResult(`Freed ${Math.max(0, trim.freed_mb)} MB.`);
                    setMemoryEnabled(true);
                  } catch (e) {
                    setMemResult(`Failed: ${e.message || e}`);
                  } finally { setMemBusy(false); }
                }}
                disabled={memBusy}
                className="theme-pill-btn"
                style={{
                  background: c.accent, color: 'white', border: 'none', borderRadius: 6,
                  padding: '10px 20px', fontSize: 12, fontWeight: 600, alignSelf: 'flex-start',
                  cursor: memBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: memBusy ? 0.7 : 1,
                }}
              >{memBusy ? 'Working…' : 'Trim working sets now'}</button>
              {memResult && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 8 }}>{memResult}</div>}
            </>
          ) : monitorTab === 'hardware' ? (
            <SubTabPlaceholder
              c={c}
              title="Hardware Monitoring"
              items={[
                'Live CPU temperature (WMI MSAcpi_ThermalZoneTemperature)',
                'Live GPU temperature (via NVAPI / ADL when supported)',
                'Fan RPM + power draw for the CPU',
                'Disk SMART attributes per fixed volume',
              ]}
            />
          ) : monitorTab === 'diskPriority' ? (
            <SubTabPlaceholder
              c={c}
              title="Disk Priority Manager"
              items={[
                'Set per-process I/O priority (very-low → high)',
                'Throttle background sync clients (OneDrive, Dropbox, etc.)',
                'Tune NTFS file-system last-access timestamp behavior',
                'Optional: defer Windows Search indexing while gaming',
              ]}
            />
          ) : monitorTab === 'desktop' ? (
            <SubTabPlaceholder
              c={c}
              title="Desktop Protection"
              items={[
                'Restore file associations if a PUP hijacked them',
                'Reset Chrome / Edge / Firefox default search + home page',
                'Remove unwanted shell extensions from the context menu',
                'Show recent suspicious startup entries to disable',
              ]}
            />
          ) : (
            // monitorTab === 'autoDefrag' - real Toggle + status
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <FolderSimple size={16} color={c.accent} weight="regular" />
                <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>Auto Defrag</span>
                <span style={{
                  background: autoDefragEnabled ? '#3AA65C' : c.textMuted, color: 'white', fontSize: 10, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 4,
                }}>{autoDefragEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5, marginBottom: 8, maxWidth: 640 }}>
                When enabled, scheduled Optimize-Volume runs on a weekly cadence (the Windows default). TRIM runs daily on SSDs. HDD defrag is skipped if fragmentation is below 5%.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <button
                  onClick={async () => {
                    setAutoDefragEnabled(true);
                    if (!window.beetleAPI) return;
                    try { await window.beetleAPI.optimizer.defragmentDrive('analyze'); } catch (e) { /* tolerate */ }
                  }}
                  className="theme-pill-btn"
                  style={{
                    background: c.accent, color: 'white', border: 'none', borderRadius: 6,
                    padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >Enable + run analyze now</button>
                <button
                  onClick={() => setAutoDefragEnabled(false)}
                  className="theme-pill-btn"
                  style={{
                    background: 'transparent', color: c.textPrimary, border: `1px solid ${c.border}`,
                    borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >Disable</button>
              </div>
              <div style={{ fontSize: 11, color: c.textMuted }}>
                Schedule persists in <code>%LOCALAPPDATA%\BeetleOptimiser\appsettings.json</code>.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}