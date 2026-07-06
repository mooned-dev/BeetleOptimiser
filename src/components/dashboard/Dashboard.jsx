// Dashboard container. The 3-panel layout:
//   - Full-bleed canvas: scan circle true-centered, last-scan info pinned
//     top-left (corner overlay, not a column), live-status widget pinned
//     bottom-right (matches the Auslogics BoostSpeed tray widget layout)
//   - BOTTOM ROW: BottomTiles full width (separated by a top border)

import React from 'react';
import ScanArea from './ScanArea.jsx';
import StatsPanel from './StatsPanel.jsx';
import BottomTiles from './BottomTiles.jsx';
import StatusOverlay from './StatusOverlay.jsx';

export default function Dashboard({ c, isLight, onScan, onSeeReport, onTileClick, onAskQuestion, resolvedCount, onNavigate }) {
  return (
    <div style={{
      position: 'relative',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', height: '100%',
    }}>
      {/* CANVAS: relative wrapper - corner overlays + true-centered scan circle */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <StatsPanel c={c} />
        <ScanArea c={c} isLight={isLight} onScan={onScan} onSeeReport={onSeeReport} />
        <StatusOverlay
          c={c}
          resolvedCount={resolvedCount}
          onAskQuestion={onAskQuestion}
          onNavigate={onNavigate}
        />
      </div>

      {/* BOTTOM ROW: 7 tool tiles full width */}
      <BottomTiles c={c} onTileClick={onTileClick} />
    </div>
  );
}