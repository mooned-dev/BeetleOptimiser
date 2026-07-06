// "Win10 Protector" tab. Auslogics-style layout: left category sidebar +
// per-tweak rows on the right. Each tweak has Apply / Revert buttons; both
// require a token-gated confirmation; Revert uses the per-tweak backup
// JSON written by the script's apply mode.
//
// Categories mirror the in-script TWEAKS array (re-shown on the right
// pane via the category name on each tweak).

import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, ArrowClockwise, CheckCircle, ArrowCounterClockwise,
  Warning, Power,
} from '@phosphor-icons/react';
import InfoBanner from '../shared/InfoBanner.jsx';
import ConfirmModal from '../shared/ConfirmModal.jsx';

export default function Win10ProtectorView({ c, isLight }) {
  const [tweaks, setTweaks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastScanAt, setLastScanAt] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [confirm, setConfirm] = useState(null);
  // confirm: { tweak, action: 'apply'|'revert' }

  async function load() {
    if (!window.beetleAPI) { setError('Not available outside the packaged app.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await window.beetleAPI.optimizer.win10List();
      const rows = (result.items || []).filter((i) => i.event === 'tweak').map((i) => i.item);
      if (rows.length && !activeCategory) setActiveCategory(rows[0].category);
      setTweaks(rows);
      setLastScanAt(new Date());
    } catch (e) {
      setError(`Could not read registry: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const categories = useMemo(() => {
    const set = new Set();
    for (const t of tweaks) set.add(t.category);
    return Array.from(set);
  }, [tweaks]);

  const filtered = activeCategory
    ? tweaks.filter((t) => t.category === activeCategory)
    : tweaks;

  function applyTo(setValue) {
    const t = confirm.tweak;
    const value = (t.type === 'DWord' ? t.applied_value : t.applied_value);
    return `Applied to ${t.registry_path} -> ${t.value_name} = ${value}`;
  }

  async function doApply() {
    if (!confirm) return;
    const t = confirm.tweak;
    setBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('win10-apply');
      const result = await window.beetleAPI.optimizer.win10Apply(t.id, token);
      const err = (result.items || []).find((i) => i.event === 'error');
      if (err) setError(err.reason);
      setConfirm(null);
      await load();
      // Report line is written by optimize-win10.ps1 itself
    } catch (e) {
      setError(`Apply failed: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function doRevert() {
    if (!confirm) return;
    const t = confirm.tweak;
    setBusy(true);
    try {
      const token = await window.beetleAPI.optimizer.requestConfirm('win10-revert');
      const result = await window.beetleAPI.optimizer.win10Revert(t.id, token);
      const err = (result.items || []).find((i) => i.event === 'error');
      if (err) setError(err.reason);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(`Revert failed: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <InfoBanner c={c}>Disable Windows 10/11 privacy, telemetry, and ad-tracked features</InfoBanner>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: c.bgSecondary, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={20} color={c.accent} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.textPrimary }}>Win10 Protector</div>
            <div style={{ fontSize: 11, color: c.textMuted }}>
              {tweaks.length} tweaks across {categories.length} categories · last scan {lastScanAt ? lastScanAt.toLocaleTimeString() : 'never'}
            </div>
          </div>
        </div>
        <button onClick={load} disabled={busy} className="theme-pill-btn" style={btnSecondary(c, busy)}>
          <ArrowClockwise size={12} /> {busy ? 'Loading…' : 'Rescan registry'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: category sidebar */}
        <div style={{ width: 200, flexShrink: 0, borderRight: `1px solid ${c.border}`, padding: 12, overflow: 'auto', background: c.bgPrimary }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="theme-pill-btn"
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 12px', marginBottom: 4,
                background: activeCategory === cat ? c.bgSecondary : 'transparent',
                color: activeCategory === cat ? c.accent : c.textSecondary,
                border: `1px solid ${activeCategory === cat ? c.accent : 'transparent'}`,
                borderRadius: 6, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* RIGHT: tweaks list */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {error && (
            <div style={{ background: c.bgSecondary, border: `1px solid #E0566B`, borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 11, color: '#E0566B' }}>
              {error}
            </div>
          )}
          {!busy && tweaks.length === 0 && !error && (
            <div style={{ textAlign: 'center', padding: 40, color: c.textMuted, fontSize: 12 }}>
              Reading Windows registry &hellip;
            </div>
          )}
          {filtered.map((t) => {
            const isOn = t.current_value !== '(not set)' && t.current_value === t.applied_value;
            return (
              <div key={t.id} style={{
                background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 8,
                padding: '14px 18px', marginBottom: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>{t.label}</span>
                      {isOn ? (
                        <span style={{
                          background: '#3AA65C', color: 'white', fontSize: 9, fontWeight: 700,
                          padding: '2px 6px', borderRadius: 3, letterSpacing: '0.05em',
                        }}>ON</span>
                      ) : (
                        <span style={{
                          background: c.textMuted, color: 'white', fontSize: 9, fontWeight: 700,
                          padding: '2px 6px', borderRadius: 3, letterSpacing: '0.05em',
                        }}>OFF</span>
                      )}
                      {t.requires_admin && (
                        <span style={{
                          background: '#E6B43C', color: '#3A2A00', fontSize: 9, fontWeight: 700,
                          padding: '2px 6px', borderRadius: 3, letterSpacing: '0.05em',
                        }} title="Requires running the app elevated">ADMIN</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.4, marginBottom: 6 }}>{t.description}</div>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: c.textMuted, lineHeight: 1.4 }}>
                      HK &rarr; <b style={{ color: c.textSecondary }}>{t.registry_path}</b> :: <b>{t.value_name}</b><br />
                      Current: <b style={{ color: c.textPrimary }}>{t.current_value}</b> &nbsp; Will set: <b style={{ color: c.accent }}>{t.applied_value}</b>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    <button
                      disabled={busy || isOn}
                      onClick={() => setConfirm({ tweak: t, action: 'apply' })}
                      className="theme-pill-btn"
                      style={btnPrimary(c, busy || isOn)}
                    >
                      <Power size={11} /> Apply
                    </button>
                    <button
                      disabled={busy || !isOn}
                      onClick={() => setConfirm({ tweak: t, action: 'revert' })}
                      className="theme-pill-btn"
                      style={btnSecondary(c, busy || !isOn)}
                    >
                      <ArrowCounterClockwise size={11} /> Revert
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ConfirmModal
        c={c}
        open={!!confirm}
        busy={busy}
        title={confirm?.action === 'apply' ? 'Apply this Win10 tweak?' : 'Revert this Win10 tweak?'}
        message={
          confirm?.action === 'apply'
            ? 'This writes a registry value. The previous value will be backed up to %LOCALAPPDATA%\\BeetleOptimiser\\rescue\\ so you can revert later. Some changes need a sign-out or restart to take effect.'
            : 'This restores the registry value to its previous state from the rescue backup. Safe to undo.'
        }
        details={confirm ? `${confirm.tweak.label}\n${confirm.tweak.registry_path} :: ${confirm.tweak.value_name}` : null}
        confirmLabel={confirm?.action === 'apply' ? 'Apply' : 'Revert'}
        onConfirm={confirm?.action === 'apply' ? doApply : doRevert}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function btnPrimary(c, disabled) {
  return {
    background: c.accent, color: 'white', border: 'none', borderRadius: 5,
    padding: '5px 12px', fontSize: 11, fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  };
}

function btnSecondary(c, disabled) {
  return {
    background: 'transparent', border: `1px solid ${c.border}`,
    color: c.textSecondary, borderRadius: 5,
    padding: '4px 10px', fontSize: 11, fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  };
}
