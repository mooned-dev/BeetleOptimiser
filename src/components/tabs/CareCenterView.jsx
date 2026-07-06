// "Care Center" tab. Lists every backup entry the app has written to
// %LOCALAPPDATA%\BeetleOptimiser\rescue\ - currently only Win10 tweaks
// (other destructive ops either don't write registry values or remove
// things considered safe to delete, like App Paths orphans).
//
// Per-row "Restore" button calls the matching optimize-* script's revert
// mode (or just reverts the registry manually for Win10 tweaks). For
// Win10 tweaks, that means the same optimize-win10.ps1 revert:<id> flow.

import React, { useEffect, useState } from 'react';
import {
  Lifebuoy, ArrowCounterClockwise, Trash, CheckCircle,
} from '@phosphor-icons/react';
import InfoBanner from '../shared/InfoBanner.jsx';
import ConfirmModal from '../shared/ConfirmModal.jsx';

export default function CareCenterView({ c, isLight }) {
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);

  async function load() {
    if (!window.beetleAPI) { setError('Not available outside the packaged app.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await window.beetleAPI.optimizer.rescueList();
      const rows = (result.items || []).filter((i) => i.event === 'backup').map((i) => i.item);
      setBackups(rows);
    } catch (e) {
      setError(`Could not read rescue directory: ${e.message || e}`);
    } finally { setBusy(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function doRestore() {
    if (!confirm) return;
    setBusy(true);
    try {
      // Each backup is paired with a tool. For now, the only tool that
      // writes backups is optimize-win10, so we route to its revert mode.
      const token = await window.beetleAPI.optimizer.requestConfirm('win10-revert');
      const result = await window.beetleAPI.optimizer.win10Revert(confirm.id, token);
      const err = (result.items || []).find((i) => i.event === 'error');
      if (err) setError(`${confirm.id}: ${err.reason}`);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(`Restore failed: ${e.message || e}`);
    } finally { setBusy(false); }
  }

  async function doDeleteBackup(file) {
    // Just remove the JSON file via PowerShell so the renderer can also
    // keep going. We don't drop the registry value - we just forget
    // the ability to undo it (which is the typical Rescue Center action).
    await window.beetleAPI.system.shell(
      'powershell', '-NoProfile', '-Command',
      'Remove-Item -LiteralPath $env:LOCALAPPDATA\\BeetleOptimiser\\rescue\\' + file + ' -ErrorAction SilentlyContinue; exit 0',
    );
    await load();
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <InfoBanner c={c}>Restore or forget any backup created before a tool changed a setting</InfoBanner>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: c.bgSecondary, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Lifebuoy size={20} color={c.accent} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.textPrimary }}>Care Center</div>
            <div style={{ fontSize: 11, color: c.textMuted }}>
              {backups.length} backup{backups.length === 1 ? '' : 's'} available to restore
            </div>
          </div>
        </div>
        <button onClick={load} disabled={busy} className="theme-pill-btn" style={{
          background: 'transparent', border: `1px solid ${c.border}`,
          color: c.textSecondary, borderRadius: 6, padding: '6px 12px',
          fontSize: 11, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
          fontFamily: 'inherit', opacity: busy ? 0.5 : 1,
        }}>Rescan</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
        {error && (
          <div style={{ background: c.bgSecondary, border: `1px solid #E0566B`, borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 11, color: '#E0566B' }}>{error}</div>
        )}
        {!busy && backups.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: 60, color: c.textMuted, fontSize: 12 }}>
            <CheckCircle size={48} color="#3AA65C" style={{ display: 'block', margin: '0 auto 16px' }} />
            No backups pending restore. Every destructive operation automatically writes a backup here before it makes a change - restore later via Restore button.
          </div>
        )}
        {backups.map((b) => (
          <div key={b.file} style={{
            background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 8,
            padding: '14px 18px', marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>{b.tool} / {b.id}</span>
                  <span style={{ fontSize: 11, color: c.textMuted }}>{b.timestamp ? new Date(b.timestamp).toLocaleString() : ''}</span>
                </div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: c.textSecondary, lineHeight: 1.4 }}>
                  {b.registry_path} :: {b.value_name}<br />
                  <b>Backup value:</b> <span style={{ color: c.accent }}>{b.backup_value}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => setConfirm(b)}
                  disabled={busy}
                  className="theme-pill-btn"
                  style={{
                    background: c.accent, color: 'white', border: 'none', borderRadius: 5,
                    padding: '5px 12px', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <ArrowCounterClockwise size={11} /> Restore
                </button>
                <button
                  onClick={() => doDeleteBackup(b.file)}
                  disabled={busy}
                  className="theme-pill-btn"
                  style={{
                    background: 'transparent', border: `1px solid ${c.border}`,
                    color: '#E0566B', borderRadius: 5, padding: '4px 10px',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Trash size={11} /> Forget
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        c={c}
        open={!!confirm}
        busy={busy}
        title="Restore from backup?"
        message="This restores the registry value from the backup file. The current value will be overwritten."
        details={confirm ? `${confirm.tool} / ${confirm.id}\n${confirm.registry_path} :: ${confirm.value_name}\nWill set: ${confirm.backup_value}` : null}
        confirmLabel="Restore"
        onConfirm={doRestore}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
