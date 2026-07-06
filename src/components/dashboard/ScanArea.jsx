// CENTER CANVAS: scan circle, true-centered in the full window width, with
// the cleaned-stats summary + "See full report" link centered directly below.

import React from 'react';
import ScanCircle from './ScanCircle.jsx';

export default function ScanArea({ c, isLight, onScan, onSeeReport }) {
  return (
    <div style={{
      position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', gap: 20,
      overflow: 'hidden',
      minWidth: 0,
    }}>
      <ScanCircle c={c} onClick={onScan} />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 12, color: c.textSecondary,
      }}>
        <span><b style={{ color: c.accent }}>2.82 GB</b> of junk files cleaned</span>
        <span style={{ opacity: 0.4 }}>|</span>
        <span><b style={{ color: c.accent }}>9,637</b> items resolved</span>
        <span style={{ opacity: 0.4 }}>|</span>
        <span><b style={{ color: c.accent }}>23</b> tweaks applied</span>
      </div>

      <a
        onClick={(e) => { e.preventDefault(); onSeeReport && onSeeReport(); }}
        href="#"
        style={{
          fontSize: 12, color: c.accent, fontWeight: 500,
          textDecoration: 'underline', cursor: 'pointer',
        }}
      >
        See full report
      </a>
    </div>
  );
}
