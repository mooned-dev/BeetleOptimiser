// BOTTOM PANEL: 7 tool tiles full width. Each tile has its own distinct icon.
// Icons from Phosphor (weight="regular" = outline only, no filled background).
// The 𓆣 hieroglyph is reserved for the brand logo + tabs + sidebar nav only.

import React from 'react';
import { BOTTOM_TILES } from '../../data/bottomTiles.js';

export default function BottomTiles({ c, onTileClick }) {
  // Split into 2 rows: first 7 are the primary Auslogics-style quick-access
  // tiles; the second row of 4 is the expanded system tools (Internet,
  // Disk Explorer, Task Manager, Add-ons).
  const primary = BOTTOM_TILES.slice(0, 7);
  const system = BOTTOM_TILES.slice(7);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '16px',
      borderTop: `1px solid ${c.borderLight}`,
      flexShrink: 0,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {primary.map(t => (
          <Tile c={c} key={t.id} tile={t} onClick={() => onTileClick && onTileClick(t.id)} />
        ))}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: 8, justifyContent: 'start',
        paddingTop: 4,
      }}>
        {system.map(t => (
          <Tile c={c} key={t.id} tile={t} onClick={() => onTileClick && onTileClick(t.id)} />
        ))}
      </div>
    </div>
  );
}

function Tile({ c, tile, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bottom-tile-btn"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '14px 8px',
        background: 'transparent',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontFamily: 'inherit',
        minHeight: 84,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {tile.isNew && (
        <span style={{
          position: 'absolute', top: 2, left: 8,
          background: c.accent, color: 'white',
          padding: '2px 6px', fontSize: 8, fontWeight: 'bold',
          borderRadius: 2, letterSpacing: '0.05em',
        }}>NEW</span>
      )}
      <tile.Icon size={32} color={c.accent} weight="regular" style={{ flexShrink: 0 }} />
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        lineHeight: 1.25,
        textAlign: 'center',
        minWidth: 0,
        maxWidth: '100%',
      }}>
        <span style={{
          fontSize: 11, color: c.textPrimary, fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{tile.line1}</span>
        <span style={{
          fontSize: 11, color: c.textPrimary, fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{tile.line2}</span>
      </div>
    </button>
  );
}
