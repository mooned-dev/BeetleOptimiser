// Dashboard container. The 2-panel layout:
//   - Full-bleed canvas: scan circle true-centered, last-scan info pinned
//     top-left (corner overlay, not a column). The live-status widget that
//     used to be pinned bottom-right here now lives in its own flyout
//     window anchored to the tray icon (see FlyoutApp.jsx + main.js's
//     createFlyoutWindow) - matching the real Auslogics BoostSpeed, whose
//     tray widget is a popup from the clock tray, not part of the dashboard.
//   - BOTTOM ROW: BottomTiles full width (separated by a top border)

import React from 'react';
import ScanArea from './ScanArea.jsx';
import StatsPanel from './StatsPanel.jsx';
import BottomTiles from './BottomTiles.jsx';

export default function Dashboard({ c, isLight, onScan, onSeeReport, onTileClick }) {
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
      </div>

      {/* BOTTOM ROW: 7 tool tiles full width */}
      <BottomTiles c={c} onTileClick={onTileClick} />
    </div>
  );
}