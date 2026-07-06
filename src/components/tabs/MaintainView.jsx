// "Maintain" tab. Tweak category rows (compact - no description, just a
// "Show details" link) + Cat Mode card + useful tools + BoostSpeed Portable
// promo, "Scan now" footer.
//
// All clickable elements are wired to a single onAction prop with a
// stable verb the parent (App.jsx) can dispatch:
//   - "scan"          -> start Deep Disk Cleaner (same flow as Dashboard tile)
//   - "details:perf"  -> open info modal explaining the category
//   - "details:stab"  -> ...
//   - "details:sec"
//   - "details:inet"
//   - "catmode:help"  -> open Cat Mode info modal
//   - "settings"      -> open settings info modal (real Settings tab is
//                        not yet a thing; this is a placeholder that shows
//                        what settings would be available)
//   - "promo"         -> click on the Create BoostSpeed Portable promo card

import React, { useEffect, useState } from 'react';
import {
  Gauge, GearSix, ShieldCheck, GlobeHemisphereWest, CaretDown, Cat,
  DownloadSimple, LockOpen, MagnifyingGlass, Cpu, CalendarBlank,
} from '@phosphor-icons/react';
import InfoBanner from '../shared/InfoBanner.jsx';
import UsefulTools from '../shared/UsefulTools.jsx';
import Toggle from '../shared/Toggle.jsx';
import ConfirmModal from '../shared/ConfirmModal.jsx';
import ItemListModal from '../shared/ItemListModal.jsx';

const CATEGORIES = [
  {
    id: 'performance', title: 'Performance', Icon: Gauge, included: true,
    details: [
      'Disables Windows visual effects that are not on the critical path',
      'Sets Windows visual effects to "Best Performance" preset',
      'Cleans up the Windows prefetch directory (old boot traces)',
      'Adjusts NTFS file-system last-access timestamp behavior',
    ],
  },
  {
    id: 'stability', title: 'Stability', Icon: GearSix, included: true,
    details: [
      'Disables unnecessary Windows services that can crash',
      'Detects conflicting software installations',
      'Reports mismatched DLL versions in system folders',
      'Records the last 10 application crashes for diagnostics',
    ],
  },
  {
    id: 'security', title: 'Security', Icon: ShieldCheck, pro: true, included: false,
    details: [
      'Enables Windows Defender real-time scanning (if disabled)',
      'Checks installed browser plugins against known-vulnerable list',
      'Reports open SMB file shares',
      'Audits auto-run entries against antivirus database',
    ],
  },
  {
    id: 'internet', title: 'Internet', Icon: GlobeHemisphereWest, included: true,
    details: [
      'Tunes TCP/IP auto-tuning level for current network type',
      'Configures DNS client cache TTL for faster lookups',
      'Disables unnecessary network services (NetBIOS over TCP/IP)',
      'Reports broken network adapter power management settings',
    ],
  },
];

const USEFUL_TOOLS = [
  { id: 'internet',  label: 'Optimize Internet connection',    Icon: GlobeHemisphereWest },
  { id: 'sysinfo',   label: 'Retrieve system information',     Icon: Cpu },
  { id: 'services',  label: 'Manage running services',         Icon: GearSix },
  { id: 'scheduler', label: 'Manage scheduled tasks',           Icon: CalendarBlank },
  { id: 'unlock',    label: 'Unlock and manage locked files',  Icon: LockOpen },
  { id: 'registry',  label: 'Search Windows registry keys',    Icon: MagnifyingGlass },
];

const TOOL_INFO = {
  internet: {
    title: 'Optimize Internet connection',
    items: [
      'Tunes TCP/IP auto-tuning level for your network type',
      'Configures DNS client cache TTL for faster lookups',
      'Disables unused network services (NetBIOS over TCP/IP)',
      'Reports broken network adapter power-management settings',
      'Sets the MTU to 1500 for most broadband connections',
    ],
  },
  sysinfo: {
    title: 'Retrieve system information',
    items: [
      'Full hardware inventory (CPU, RAM, motherboard, disks, NICs)',
      'Installed Windows version + build number + activation status',
      'Driver list with version + date stamps',
      'Windows Update history (last 30 patches)',
      'Event log errors from the last 24 hours',
    ],
  },
  services: {
    title: 'Manage running services',
    items: [
      'List every Windows service with status + startup type',
      'Bulk enable / disable + start / stop',
      'Restore a service to its default startup type',
      'Highlights services known to slow boot time',
      'Optional: show non-Microsoft services only',
    ],
  },
  unlock: {
    title: 'Unlock and manage locked files',
    items: [
      'Find which process is holding a file or folder open',
      'Unlock the file without killing the holding process',
      'Schedule a deferred unlock for when the process exits',
      'Useful when "this file is in use by another program" blocks cleanup',
    ],
  },
  registry: {
    title: 'Search Windows registry keys',
    items: [
      'Full-text search across all registry hives',
      'Filter by value name, value data, or key path',
      'Jump to the matching key in the registry',
      'Backup before delete + restore from Rescue Center',
    ],
  },
};

const CATMODE_HELP = [
  'Cat Mode locks the keyboard after a short idle period',
  'Useful if your pet walks across the keyboard',
  'You can configure the idle threshold in Settings',
  'Toggle the Activate switch below to turn it on',
];

const SETTINGS_DETAILS = [
  'Configure scan schedule (daily, weekly, manual)',
  'Tune exclusion list for the Deep Disk Cleaner',
  'Pick default browser for Browser Protection',
  'Set the Cat Mode idle threshold',
  'Manage the auto-update check frequency',
];

// Which categories have a real, wired tweak behind them (see
// scripts/optimize-tweaks.ps1). "security" stays a Pro-gated static
// placeholder - no backend, matches its existing locked/disabled styling.
const REAL_TWEAK_IDS = ['performance', 'stability', 'internet'];

export default function MaintainView({ c, isLight, onAction }) {
  const [includes, setIncludes] = useState(() => Object.fromEntries(CATEGORIES.map(cat => [cat.id, cat.included])));
  const [catMode, setCatMode] = useState(false);
  const [detailsCat, setDetailsCat] = useState(null);
  const [catmodeOpen, setCatmodeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolInfoOpen, setToolInfoOpen] = useState(null);
  const [sysInfo, setSysInfo] = useState(null);
  const [sysInfoLoading, setSysInfoLoading] = useState(false);

  // The onAction callback takes a stable verb. The parent (App.jsx)
  // dispatches: 'scan' -> Deep Disk Cleaner flow. Unknown verbs are
  // no-ops so adding new ones is safe.
  const fire = (action) => { if (onAction) onAction(action); };

  // --- Tweak Manager: load real current state on mount, apply/revert on
  // checkbox toggle (behind a confirm - these do mutate real settings,
  // even though they're low-risk/fully reversible ones). ---
  const [tweakAction, setTweakAction] = useState(null); // { id, title, apply: bool }
  const [tweakBusyId, setTweakBusyId] = useState(null);
  const [tweaksResult, setTweaksResult] = useState(null);

  useEffect(() => {
    if (!window.beetleAPI) return;
    window.beetleAPI.optimizer.tweaksStatus().then(({ items }) => {
      const states = Object.fromEntries(
        items.filter((i) => i.event === 'item').map((i) => [i.item.id, i.item.applied])
      );
      setIncludes((prev) => ({ ...prev, ...states }));
    }).catch(() => {});
  }, []);

  function handleToggleCategory(cat) {
    if (!REAL_TWEAK_IDS.includes(cat.id)) {
      setIncludes((v) => ({ ...v, [cat.id]: !v[cat.id] }));
      return;
    }
    setTweakAction({ id: cat.id, title: cat.title, apply: !includes[cat.id] });
  }

  async function handleConfirmTweak() {
    const { id, apply } = tweakAction;
    setTweakBusyId(id);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm(apply ? 'tweaks-apply' : 'tweaks-revert');
      if (apply) {
        await window.beetleAPI.optimizer.tweaksApply(id, token);
      } else {
        await window.beetleAPI.optimizer.tweaksRevert(id, token);
      }
      setIncludes((v) => ({ ...v, [id]: apply }));
    } catch (e) {
      setTweaksResult(`Tweak failed: ${e.message || e}`);
    } finally {
      setTweakBusyId(null);
      setTweakAction(null);
    }
  }

  function openDetails(cat) {
    setDetailsCat(cat);
  }

  async function openToolInfo(id) {
    if (id === 'services') {
      handleOpenServices();
      return;
    }
    if (id === 'scheduler') {
      handleOpenScheduledTasks();
      return;
    }
    setToolInfoOpen(id);
    if (id === 'sysinfo' && window.beetleAPI) {
      setSysInfoLoading(true);
      try {
        const { items } = await window.beetleAPI.optimizer.getSystemInfo();
        const info = items.find((i) => i.event === 'sysinfo');
        setSysInfo(info || null);
      } catch (e) {
        setSysInfo(null);
      } finally {
        setSysInfoLoading(false);
      }
    }
  }

  // --- Service Manager: list -> confirm -> disable/enable (per item) ---
  const [servicesOpen, setServicesOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [servicesBusyId, setServicesBusyId] = useState(null);
  const [serviceAction, setServiceAction] = useState(null); // { name, displayName, disable: bool }
  const [servicesResult, setServicesResult] = useState(null);

  function serviceRowFromItem(item) {
    const startMode = item.start_mode || 'Unknown';
    const kind = item.is_core ? 'Windows core service' : '3rd-party service';
    return {
      id: item.name,
      primary: item.display_name || item.name,
      secondary: `${startMode} · ${item.status} · ${kind}`,
      actionLabelOverride: startMode === 'Disabled' ? 'Enable' : 'Disable',
      _raw: item,
    };
  }

  async function handleOpenServices() {
    if (!window.beetleAPI) { setServicesResult('Not available outside the packaged app.'); return; }
    setServicesResult(null);
    try {
      const { items } = await window.beetleAPI.optimizer.listServices();
      const rows = items.filter((i) => i.event === 'item').map((i) => serviceRowFromItem(i.item));
      setServices(rows);
      setServicesOpen(true);
    } catch (e) {
      setServicesResult(`Listing services failed: ${e.message || e}`);
    }
  }

  function handleRequestServiceAction(row) {
    setServiceAction({ name: row.id, displayName: row.primary, disable: row.actionLabelOverride === 'Disable', isCore: row._raw.is_core });
  }

  async function handleConfirmServiceAction() {
    const { name, disable } = serviceAction;
    setServicesBusyId(name);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm(disable ? 'disable-service' : 'enable-service');
      if (disable) {
        await window.beetleAPI.optimizer.disableService(name, token);
      } else {
        await window.beetleAPI.optimizer.enableService(name, token);
      }
      setServices((prev) => prev.map((s) => s.id === name
        ? serviceRowFromItem({ ...s._raw, start_mode: disable ? 'Disabled' : 'Automatic' })
        : s));
    } catch (e) {
      setServicesResult(`Action failed: ${e.message || e}`);
    } finally {
      setServicesBusyId(null);
      setServiceAction(null);
    }
  }

  // --- Task Scheduler manager: list -> confirm -> disable/enable (per item) ---
  const [tasksOpen, setTasksOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [tasksBusyId, setTasksBusyId] = useState(null);
  const [taskAction, setTaskAction] = useState(null); // { path, name, displayName, disable }
  const [tasksResult, setTasksResult] = useState(null);

  function taskRowFromItem(item) {
    const id = `${item.path}${item.name}`;
    return {
      id,
      primary: item.name,
      secondary: `${item.state} · ${item.path === '\\' ? 'root' : item.path}`,
      actionLabelOverride: item.state === 'Disabled' ? 'Enable' : 'Disable',
      _raw: item,
    };
  }

  async function handleOpenScheduledTasks() {
    if (!window.beetleAPI) { setTasksResult('Not available outside the packaged app.'); return; }
    setTasksResult(null);
    try {
      const { items } = await window.beetleAPI.optimizer.listScheduledTasks();
      const rows = items.filter((i) => i.event === 'item').map((i) => taskRowFromItem(i.item));
      setTasks(rows);
      setTasksOpen(true);
    } catch (e) {
      setTasksResult(`Listing scheduled tasks failed: ${e.message || e}`);
    }
  }

  function handleRequestTaskAction(row) {
    setTaskAction({
      path: row._raw.path, name: row._raw.name, displayName: row.primary,
      disable: row.actionLabelOverride === 'Disable', rowId: row.id,
    });
  }

  async function handleConfirmTaskAction() {
    const { path, name, disable, rowId } = taskAction;
    setTasksBusyId(rowId);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm(disable ? 'disable-scheduled-task' : 'enable-scheduled-task');
      if (disable) {
        await window.beetleAPI.optimizer.disableScheduledTask(path, name, token);
      } else {
        await window.beetleAPI.optimizer.enableScheduledTask(path, name, token);
      }
      setTasks((prev) => prev.map((t) => t.id === rowId
        ? taskRowFromItem({ ...t._raw, state: disable ? 'Disabled' : 'Ready' })
        : t));
    } catch (e) {
      setTasksResult(`Action failed: ${e.message || e}`);
    } finally {
      setTasksBusyId(null);
      setTaskAction(null);
    }
  }

  // Real hardware info replaces the static description once loaded (falls
  // back to the static "what this would show" list outside the packaged
  // app, or while the query is in flight).
  const sysInfoItems = sysInfo ? [
    { id: 'computer', primary: `Computer: ${sysInfo.computer_name}` },
    { id: 'os', primary: `OS: ${sysInfo.os_name} (build ${sysInfo.os_build})` },
    { id: 'cpu', primary: `CPU: ${sysInfo.cpu_name} - ${sysInfo.cpu_cores} cores / ${sysInfo.cpu_logical_processors} threads` },
    { id: 'ram', primary: `RAM: ${sysInfo.ram_total_gb} GB` },
    { id: 'motherboard', primary: `Motherboard: ${sysInfo.motherboard}` },
    { id: 'gpu', primary: `GPU: ${sysInfo.gpus.join(', ') || 'Not detected'}` },
    ...sysInfo.disks.map((d, i) => ({ id: `disk-${i}`, primary: `Disk: ${d.model} (${d.size_gb} GB)` })),
  ] : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <InfoBanner c={c}>
        Here you will find recommendations to help improve Windows components' stability, security and speed
      </InfoBanner>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: tweak categories */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {CATEGORIES.map(cat => (
            <div key={cat.id} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 8,
              padding: '14px 20px',
            }}>
              <cat.Icon size={24} color={c.accent} weight="regular" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>{cat.title}</span>
                {cat.pro && (
                  <span style={{
                    background: '#E6B43C', color: '#3A2A00', fontSize: 9, fontWeight: 700,
                    padding: '2px 6px', borderRadius: 3, letterSpacing: '0.05em',
                  }}>PRO</span>
                )}
              </div>
              <button
                onClick={() => openDetails(cat)}
                className="theme-pill-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'transparent', color: c.accent, border: 'none',
                  fontSize: 11, textDecoration: 'underline', cursor: 'pointer',
                  fontFamily: 'inherit', flexShrink: 0,
                }}
              >
                Show details <CaretDown size={10} />
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: c.textMuted, cursor: cat.pro ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: cat.pro ? 0.5 : 1 }}>
                Include category
                <input
                  type="checkbox"
                  disabled={!!cat.pro || tweakBusyId === cat.id}
                  checked={!!includes[cat.id]}
                  onChange={() => handleToggleCategory(cat)}
                />
              </label>
            </div>
          ))}
        </div>

        {/* RIGHT: Cat Mode + useful tools + promo */}
        <div style={{ width: 280, flexShrink: 0, borderLeft: `1px solid ${c.border}`, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <Cat size={56} color={c.accent} weight="duotone" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary }}>Cat Mode</span>
              <span style={{ fontSize: 9, color: c.textMuted, border: `1px solid ${c.border}`, borderRadius: 3, padding: '1px 5px' }}>
                {catMode ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: c.textSecondary, lineHeight: 1.4, marginBottom: 8 }}>
              If you have a cat or another curious pet, you can protect your keyboard against its paws
            </div>
            <button
              onClick={() => setCatmodeOpen(true)}
              className="theme-pill-btn"
              style={{
                display: 'block', fontSize: 11, color: c.accent, background: 'transparent',
                border: 'none', textDecoration: 'underline', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left', padding: 0, marginBottom: 10,
              }}
            >What is Cat Mode? (video demo)</button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Toggle c={c} on={catMode} onChange={setCatMode} label="Activate" />
              <button
                onClick={() => setSettingsOpen(true)}
                className="theme-pill-btn"
                style={{
                  background: 'transparent', border: 'none',
                  fontSize: 11, color: c.accent, textDecoration: 'underline',
                  cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                }}
              >Settings</button>
            </div>
          </div>

          <UsefulTools
            c={c}
            items={USEFUL_TOOLS}
            columns={3}
            onItemClick={(item) => openToolInfo(item.id)}
          />

          <button
            onClick={() => fire('promo')}
            className="theme-pill-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: c.accent, border: 'none', borderRadius: 8, padding: 14,
              color: 'white', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            }}
          >
            <DownloadSimple size={26} color="white" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Create BoostSpeed Portable</div>
              <div style={{ fontSize: 10, opacity: 0.85 }}>A powerful toolkit that's always at hand</div>
            </div>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderTop: `1px solid ${c.border}`, background: c.bgSecondary, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: c.textMuted }}>
          You need to scan the system to get an updated list of tweak suggestions. Categories you may have turned off will not be included in the scan.
        </span>
        <button
          onClick={() => fire('scan')}
          className="theme-pill-btn"
          style={{
            background: c.accent, color: 'white', border: 'none', borderRadius: 6,
            padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', flexShrink: 0, marginLeft: 20,
          }}
        >Scan now</button>
      </div>

      <ConfirmModal
        c={c}
        open={!!tweakAction}
        busy={!!tweakBusyId}
        title={tweakAction ? `${tweakAction.apply ? 'Apply' : 'Revert'} the ${tweakAction.title} tweak?` : ''}
        message={
          tweakAction?.id === 'performance'
            ? (tweakAction.apply ? 'Sets Windows visual effects to "Adjust for best performance" (disables animations/shadows).' : 'Sets visual effects back to "Let Windows choose what\'s best".')
            : tweakAction?.id === 'stability'
              ? (tweakAction.apply ? 'Turns off automatic restart after a system failure, so you can actually read the stop-code screen instead of it flashing by. Requires admin.' : 'Turns automatic restart on failure back on. Requires admin.')
              : tweakAction?.id === 'internet'
                ? (tweakAction.apply ? 'Sets TCP auto-tuning to "normal" (Windows default). Requires admin.' : 'Sets TCP auto-tuning to "disabled". Requires admin.')
                : ''
        }
        confirmLabel={tweakAction?.apply ? 'Apply' : 'Revert'}
        onConfirm={handleConfirmTweak}
        onCancel={() => setTweakAction(null)}
      />
      {tweaksResult && (
        <div style={{
          position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 6,
          padding: '8px 14px', fontSize: 12, color: c.textSecondary, zIndex: 1001,
        }}>{tweaksResult}</div>
      )}

      {/* Modals: details / cat-mode help / settings */}
      <ItemListModal
        c={c}
        open={!!detailsCat}
        title={detailsCat ? `${detailsCat.title} - what gets optimized` : ''}
        items={(detailsCat?.details || []).map((line, i) => ({ id: i, primary: line }))}
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setDetailsCat(null)}
      />
      <ItemListModal
        c={c}
        open={catmodeOpen}
        title="Cat Mode"
        items={CATMODE_HELP.map((line, i) => ({ id: i, primary: line }))}
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setCatmodeOpen(false)}
      />
      <ItemListModal
        c={c}
        open={settingsOpen}
        title="Settings (preview)"
        items={SETTINGS_DETAILS.map((line, i) => ({ id: i, primary: line }))}
        actionLabel="—"
        onAction={() => {}}
        onClose={() => setSettingsOpen(false)}
      />

      <ItemListModal
        c={c}
        open={servicesOpen}
        title="Manage Windows Services"
        items={services}
        actionLabel="Toggle"
        busyId={servicesBusyId}
        onAction={handleRequestServiceAction}
        onClose={() => setServicesOpen(false)}
      />
      <ConfirmModal
        c={c}
        open={!!serviceAction}
        busy={!!servicesBusyId}
        title={serviceAction?.disable ? 'Disable this service?' : 'Enable this service?'}
        message={
          serviceAction?.disable
            ? (serviceAction?.isCore
                ? 'This is a Windows core service - disabling it can affect system stability or break other features. Only disable it if you understand what it does.'
                : 'This sets the service to not start automatically. It does not stop it right now - takes effect on next restart.')
            : 'This sets the service back to start automatically.'
        }
        details={serviceAction ? serviceAction.displayName : null}
        confirmLabel={serviceAction?.disable ? 'Disable' : 'Enable'}
        onConfirm={handleConfirmServiceAction}
        onCancel={() => setServiceAction(null)}
      />
      {servicesResult && (
        <div style={{
          position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 6,
          padding: '8px 14px', fontSize: 12, color: c.textSecondary, zIndex: 1001,
        }}>{servicesResult}</div>
      )}

      <ItemListModal
        c={c}
        open={tasksOpen}
        title="Manage Scheduled Tasks"
        emptyText="No non-Microsoft scheduled tasks found."
        items={tasks}
        actionLabel="Toggle"
        busyId={tasksBusyId}
        onAction={handleRequestTaskAction}
        onClose={() => setTasksOpen(false)}
      />
      <ConfirmModal
        c={c}
        open={!!taskAction}
        busy={!!tasksBusyId}
        title={taskAction?.disable ? 'Disable this scheduled task?' : 'Enable this scheduled task?'}
        message={
          taskAction?.disable
            ? 'This stops the task from running on its schedule. You can re-enable it the same way later.'
            : 'This lets the task run on its schedule again.'
        }
        details={taskAction ? taskAction.displayName : null}
        confirmLabel={taskAction?.disable ? 'Disable' : 'Enable'}
        onConfirm={handleConfirmTaskAction}
        onCancel={() => setTaskAction(null)}
      />
      {tasksResult && (
        <div style={{
          position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 6,
          padding: '8px 14px', fontSize: 12, color: c.textSecondary, zIndex: 1001,
        }}>{tasksResult}</div>
      )}

      {/* UsefulTools grid -> per-tool info modal. "sysinfo" shows real live
          hardware data once loaded; every other tool still shows its
          static "what this would do" description. */}
      <ItemListModal
        c={c}
        open={!!toolInfoOpen}
        title={toolInfoOpen ? (TOOL_INFO[toolInfoOpen]?.title || '') : ''}
        items={
          toolInfoOpen === 'sysinfo'
            ? (sysInfoLoading
                ? [{ id: 'loading', primary: 'Loading system information…' }]
                : (sysInfoItems || TOOL_INFO.sysinfo.items.map((line, i) => ({ id: i, primary: line }))))
            : (TOOL_INFO[toolInfoOpen]?.items || []).map((line, i) => ({ id: i, primary: line }))
        }
        actionLabel="—"
        onAction={() => {}}
        onClose={() => { setToolInfoOpen(null); setSysInfo(null); }}
      />
    </div>
  );
}