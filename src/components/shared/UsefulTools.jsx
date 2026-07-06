// Shared "Useful tools" icon grid used in the right sidebar of Clean Up,
// Protect, and Maintain tabs. Each tile carries a small info badge, matching
// the reference screenshots. Every tile fires the `onItemClick(item)`
// callback so the parent can route to a real action (e.g. open an info
// modal, run a tool, navigate to a tab). When no callback is provided,
// the tiles render disabled with an honest tooltip so they don't look
// like dead buttons.

import React from 'react';
import { Info } from '@phosphor-icons/react';

export default function UsefulTools({ c, items, columns = 3, title = 'USEFUL TOOLS', onItemClick }) {
  const interactive = typeof onItemClick === 'function';
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: c.textMuted,
        letterSpacing: '0.06em', marginBottom: 12,
      }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 10 }}>
        {items.map(t => {
          const info = t.info || t.details;
          const titleAttr = interactive
            ? (t.title || t.label)
            : `${t.label} - tool not yet wired, click to learn what it would do`;
          return (
            <button
              key={t.id}
              onClick={() => {
                if (interactive) onItemClick(t);
                else if (info) onItemClick && onItemClick(t);
              }}
              title={titleAttr}
              className="bottom-tile-btn"
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '12px 6px', background: 'transparent', border: 'none',
                borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', minHeight: 74,
                opacity: interactive || info ? 1 : 0.7,
              }}
            >
              <t.Icon size={26} color={c.accent} weight="regular" />
              <span style={{ fontSize: 10, color: c.textPrimary, lineHeight: 1.25, textAlign: 'center' }}>
                {t.label}
              </span>
              <Info size={11} color={c.textMuted} style={{ position: 'absolute', top: 4, right: 4 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
