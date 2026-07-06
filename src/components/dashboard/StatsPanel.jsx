// TOP-LEFT corner overlay: last-scan info, pinned over the scan canvas.
// The theme toggle used to live here too - it now lives in the global
// StatusBar so it's reachable from every tab, not just Dashboard.

import React from 'react';

export default function StatsPanel({ c }) {
  return (
    <div style={{
      position: 'absolute', top: 20, left: 24,
      fontSize: 11, fontWeight: 500, color: c.textMuted,
      lineHeight: 1.6,
    }}>
      <div>Last scan performed: 7/5/2026</div>
      <div>Next scan recommended: 7/12/2026</div>
    </div>
  );
}
