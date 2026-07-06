// BOTTOM PANEL: 7 tool tiles full width. Each tile has its own distinct icon.
// Icons from Phosphor (weight="regular" = outline only, no filled background).
// The 𓆣 hieroglyph is reserved for the brand logo + tabs + sidebar nav only.

import React from 'react';
import { BOTTOM_TILES } from '../../data/bottomTiles.js';

export default function BottomTiles({ c, onTileClick }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: 8,
      padding: '16px',
      borderTop: `1px solid ${c.borderLight}`,
      flexShrink: 0,
    }}>
      {BOTTOM_TILES.map(t => (
        <button
          key={t.id}
          onClick={() => onTileClick && onTileClick(t.id)}
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
          {t.isNew && (
            <span style={{
              position: 'absolute', top: 2, left: 8,
              background: c.accent, color: 'white',
              padding: '2px 6px', fontSize: 8, fontWeight: 'bold',
              borderRadius: 2, letterSpacing: '0.05em',
            }}>NEW</span>
          )}
          {/* Each tile has its own distinct icon - NOT replaced with 𓆣 */}
          <t.Icon size={32} color={c.accent} weight="regular" style={{ flexShrink: 0 }} />
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
            }}>{t.line1}</span>
            <span style={{
              fontSize: 11, color: c.textPrimary, fontWeight: 500,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{t.line2}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
