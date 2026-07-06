// Bottom status bar with CPU/GPU/RAM/NET/SSD/HDD + version label + the
// theme toggle. Lives here (not on a single tab's canvas) so it's reachable
// from every tab.

import React from 'react';
import { useTelemetry } from '../hooks/useTelemetry.js';
import Toggle from './shared/Toggle.jsx';

export default function StatusBar({ c, isLight, onToggleTheme }) {
  const telemetry = useTelemetry();
  const fmt = (v, suffix) => (v == null || Number.isNaN(v) ? '—' : `${v}${suffix}`);

  return (
    <div style={{
      height: 26, background: c.bgTertiary,
      borderTop: `1px solid ${c.border}`,
      display: 'flex', alignItems: 'center',
      padding: '0 20px', fontSize: 11, color: c.textMuted, gap: 24,
      letterSpacing: '0.02em', fontWeight: 500,
      flexShrink: 0,
    }}>
      <span>CPU: {fmt(telemetry.cpu, '%')}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>GPU: {fmt(telemetry.gpu, '%')}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>RAM: {fmt(telemetry.ram, '%')}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>NET: {fmt(telemetry.net, ' Kbps')}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>SSD: {fmt(telemetry.ssd, '%')}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>HDD: {fmt(telemetry.hdd, '%')}</span>
      <span style={{ marginLeft: 'auto' }}>v0.2.0</span>
      <Toggle c={c} on={isLight} onChange={onToggleTheme} label={isLight ? 'Light mode' : 'Dark mode'} />
    </div>
  );
}
