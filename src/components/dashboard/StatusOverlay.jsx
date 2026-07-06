// BOTTOM-RIGHT corner overlay: live status panel mirroring the Auslogics
// BoostSpeed tray widget. Shows Memory/CPU/Network/Battery with sparkline
// mini-charts (last 30 samples), a "PC for N days" uptime footer computed
// from the first time we ever saw this user, and an "Ask a question" link
// that switches to the Ask a Question tab.
//
// DATA SOURCES - all from existing infrastructure, no new IPC:
//   - cpu / ram / net / gpu : useTelemetry() pushes live values from
//     main.js's spawned telemetry.ps1 child process.
//   - battery              : telemetry.ps1 doesn't expose battery on this
//                            host (it's a desktop), so we render "—" using
//                            the same null-handling pattern StatusBar uses.
//   - pc-days              : persisted in localStorage as the install-date
//                            timestamp; computed at mount.
//   - ask-question         : props.onAskQuestion() switches the active tab
//                            to "Ask a Question" via the parent (App.jsx).

import React, { useEffect, useRef, useState } from 'react';
import { useTelemetry } from '../../hooks/useTelemetry.js';
import { ChatCircleDots, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { NAV_ITEMS } from '../../data/navItems.js';

const HISTORY_LEN = 30;
const INSTALL_KEY = 'beetle-install-at';

function getOrInitInstallAt() {
  try {
    let v = localStorage.getItem(INSTALL_KEY);
    if (!v) {
      v = String(Date.now());
      localStorage.setItem(INSTALL_KEY, v);
    }
    return Number(v);
  } catch {
    return Date.now();
  }
}

function daysSince(ts) {
  const ms = Date.now() - ts;
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function fmt(v, suffix) {
  if (v == null || Number.isNaN(v)) return '—';
  if (typeof v === 'number' && v % 1 !== 0) return v.toFixed(1) + suffix;
  return v + suffix;
}

// Sparkline: SVG polyline from a circular buffer of last HISTORY_LEN values.
// All values are normalized to [0..100] in the renderer (the % metrics already
// are; Kbps and MB are normalized to the max seen).
function Sparkline({ value, color, max = 100, samples }) {
  const len = samples.length;
  if (len < 2) {
    return <svg width="60" height="20" style={{ marginLeft: 8 }} />;
  }
  const W = 60;
  const H = 20;
  const stepX = W / (HISTORY_LEN - 1);
  const points = samples.map((s, i) => {
    const pct = Math.min(1, Math.max(0, s / max));
    const x = i * stepX;
    const y = H - pct * (H - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={W} height={H} style={{ marginLeft: 8, flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

function StatusRow({ c, label, value, suffix, color, samples, max }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 11, color: c.textSecondary, lineHeight: 1.6, padding: '2px 0',
    }}>
      <span style={{ display: 'flex', alignItems: 'center' }}>
        {label}:
        <b style={{ color: c.textPrimary, marginLeft: 4 }}>{fmt(value, suffix)}</b>
      </span>
      <Sparkline value={value} color={color || c.accent} max={max} samples={samples} />
    </div>
  );
}

// One "Security Status / Drive Status / Free Disk Space" line, matching the
// Auslogics widget: an icon (OK/warning/unknown), the label + value, and an
// optional "Run Scan" link that jumps to the tab that can actually fix it.
function StatusLine({ c, label, value, ok, onRunScan }) {
  const Icon = ok === null ? null : ok ? CheckCircle : WarningCircle;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 11, color: c.textSecondary, padding: '3px 0',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {Icon && <Icon size={13} weight="fill" color={ok ? '#3AA65C' : '#E0566B'} />}
        {label}: <b style={{ color: c.textPrimary, marginLeft: 2 }}>{value}</b>
      </span>
      {onRunScan && (
        <button
          onClick={onRunScan}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: c.accent, fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
          }}
        >
          Run Scan
        </button>
      )}
    </div>
  );
}

export default function StatusOverlay({ c, resolvedCount, onAskQuestion, onNavigate }) {
  const telemetry = useTelemetry();
  const [installAt] = useState(getOrInitInstallAt);

  // Maintain rolling history buffers per metric. We re-init on mount and
  // sample once per second (matching telemetry.ps1's emit cadence).
  const cpuHist = useRef([]);
  const ramHist = useRef([]);
  const netHist = useRef([]);
  const [, force] = useState(0);

  useEffect(() => {
    const push = (h, v) => {
      h.current = [...h.current, v].slice(-HISTORY_LEN);
    };
    push(cpuHist, telemetry.cpu);
    push(ramHist, telemetry.ram);
    push(netHist, telemetry.net);
    force((n) => (n + 1) % 1000);
    const id = setInterval(() => {
      push(cpuHist, telemetry.cpu);
      push(ramHist, telemetry.ram);
      push(netHist, telemetry.net);
      force((n) => (n + 1) % 1000);
    }, 1000);
    return () => clearInterval(id);
  }, [telemetry.cpu, telemetry.ram, telemetry.net]);

  // Normalize NET to the largest sample seen so far (so a spike fills the chart).
  const netMax = Math.max(1, ...netHist.current);

  return (
    <div style={{
      position: 'absolute', bottom: 100, right: 24,
      width: 320,
      background: c.bgSecondary,
      border: `1px solid ${c.border}`,
      borderRadius: 8,
      padding: '12px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      fontSize: 11,
      zIndex: 5,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#3AA65C', display: 'inline-block',
          }} />
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            color: c.textMuted,
          }}>STATUS</span>
        </div>
        <div style={{ fontSize: 11, color: c.textPrimary, fontWeight: 500 }}>
          {resolvedCount != null
            ? <><b style={{ color: c.accent }}>{resolvedCount.toLocaleString()}</b> items resolved</>
            : <span style={{ color: c.textMuted }}>—</span>}
        </div>
      </div>

      {/* Status summary rows - Security/Drive/Disk, matching the Auslogics
          widget's top block. "Run Scan" jumps to the tab that can act on it. */}
      <StatusLine c={c} label="Security Status"
                  value={telemetry.securityStatus ?? '—'}
                  ok={telemetry.securityStatus == null ? null : telemetry.securityStatus === 'Good'} />
      <StatusLine c={c} label="Drive Status"
                  value={telemetry.driveHealth === 'OK' ? 'All drives are OK' : telemetry.driveHealth ?? '—'}
                  ok={telemetry.driveHealth == null ? null : telemetry.driveHealth === 'OK'}
                  onRunScan={() => onNavigate?.('Scanner')} />
      <StatusLine c={c} label="Free Disk Space"
                  value={telemetry.freeGB != null ? `${telemetry.freeGB} GB` : '—'}
                  ok={telemetry.freeGB == null ? null : true}
                  onRunScan={() => onNavigate?.('Scanner')} />

      {/* Icon row - same 6 quick-nav destinations as the right sidebar. */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        margin: '10px 0', paddingBottom: 10, borderBottom: `1px solid ${c.border}`,
      }}>
        {NAV_ITEMS.map(({ id, label, Icon, action }) => (
          <button
            key={id}
            title={label}
            onClick={() => {
              if (action?.startsWith('tab:')) onNavigate?.(action.slice(4));
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: c.textSecondary, padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon size={17} />
          </button>
        ))}
      </div>

      {/* Live rows */}
      <StatusRow c={c} label="Memory Used" value={telemetry.ram} suffix="%"
                 samples={ramHist.current} color="#3AA65C" />
      <StatusRow c={c} label="CPU Load" value={telemetry.cpu} suffix="%"
                 samples={cpuHist.current} color="#3AA65C" />
      <StatusRow c={c}
                 label="Top Process"
                 value={telemetry.topProcessName ? `${telemetry.topProcessName} (${telemetry.topProcessPct}%)` : '—'}
                 suffix=""
                 samples={[]} color="#3AA65C" />
      <StatusRow c={c} label="Network Traffic" value={telemetry.net} suffix=" Kbps"
                 samples={netHist.current} max={netMax} color={c.accent} />
      <StatusRow c={c} label="Battery" value={telemetry.battery} suffix="%"
                 samples={[]} color="#E6B43C" />

      {/* Ask a question banner */}
      <button
        onClick={onAskQuestion}
        className="theme-pill-btn"
        style={{
          marginTop: 10,
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px',
          background: c.accent,
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <ChatCircleDots size={20} weight="regular" />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>Ask a question</div>
          <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>Get help with fixing PC glitches</div>
        </div>
      </button>

      {/* Footer */}
      <div style={{
        marginTop: 10,
        paddingTop: 8,
        borderTop: `1px solid ${c.border}`,
        fontSize: 10,
        color: c.textMuted,
        textAlign: 'center',
      }}>
        Beetle Optimiser has been taking care of your PC for {daysSince(installAt)} day{daysSince(installAt) === 1 ? '' : 's'}
      </div>
    </div>
  );
}