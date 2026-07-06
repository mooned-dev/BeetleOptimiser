// Just the scan circle - outer ring + inner purple gradient button.
// Clean spacing, no wedges or orbital buttons around it.

import React from 'react';

export default function ScanCircle({ c, onClick }) {
  return (
    <div style={{
      width: 160, height: 160, borderRadius: '50%',
      background: c.scanOuter,
      boxShadow: `0 0 0 4px ${c.bg}, 0 0 0 5px ${c.borderLight}, 0 8px 24px ${c.scanOuterShadow}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <button
        onClick={onClick}
        className="scan-circle-inner"
        style={{
          width: 128, height: 128, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, #8E5BD8 0%, #6B3FBF 100%)`,
          color: 'white', border: 'none', cursor: 'pointer',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit',
          boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.3)',
          gap: 2,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 'bold', lineHeight: 1 }}>Scan</span>
        <span style={{ fontSize: 11, opacity: 0.9, lineHeight: 1, fontWeight: 500 }}>All Areas</span>
      </button>
    </div>
  );
}
