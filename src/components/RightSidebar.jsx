// Right sidebar. 6 NAV items in Auslogics order.
// Foldable: expanded shows icon + label at 300px, collapsed shows icon-only
// at 64px. Toggle button lives in the header row.
//
// Each item has an `action` field (from NAV_ITEMS) that RightSidebar
// dispatches on click. Today every action is "tab:<Name>" - we route
// those to the parent via onNavigate. Unknown actions are no-ops so we
// can add new action verbs later without breaking the renderer.

import React from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { NAV_ITEMS } from '../data/navItems.js';

export default function RightSidebar({ c, isLight, activeNav, onNavChange, folded, onToggleFold, onNavigate }) {
  const width = folded ? 64 : 300;

  function handleItemClick(item) {
    onNavChange(item.id);
    if (onNavigate && typeof item.action === 'string' && item.action.startsWith('tab:')) {
      onNavigate(item.action.slice(4)); // strip the "tab:" prefix
    }
  }

  return (
    <div style={{
      width, background: c.bgSecondary,
      borderLeft: `1px solid ${c.border}`,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', flexShrink: 0,
      transition: 'width 0.18s ease',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: folded ? 'center' : 'space-between',
        padding: folded ? '16px 0 8px' : '16px 14px 8px 18px',
      }}>
        {!folded && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: c.textMuted,
            letterSpacing: '0.12em',
          }}>NAVIGATION</span>
        )}
        <button
          onClick={onToggleFold}
          title={folded ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={folded ? 'Expand sidebar' : 'Collapse sidebar'}
          className="sidebar-fold-btn"
          style={{
            width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: `1px solid ${c.border}`, cursor: 'pointer',
            color: c.textMuted, borderRadius: 4, flexShrink: 0,
          }}
        >
          {folded ? <CaretLeft size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
        </button>
      </div>

      <div style={{
        padding: folded ? '0 8px 12px' : '0 10px 12px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {NAV_ITEMS.map(item => {
          const active = item.id === activeNav;
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              className="nav-item-btn"
              title={folded ? item.label : undefined}
              style={{
                display: 'flex', alignItems: 'center',
                justifyContent: folded ? 'center' : 'flex-start',
                gap: folded ? 0 : 12,
                padding: folded ? '12px 0' : '12px 14px',
                background: active
                  ? (isLight ? 'rgba(74,46,138,0.10)' : 'rgba(166,120,224,0.20)')
                  : 'transparent',
                borderRadius: 8,
                border: 'none',
                borderLeft: active ? `3px solid ${c.accent}` : '3px solid transparent',
                cursor: 'pointer', width: '100%',
                fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <item.Icon size={22}
                color={active ? c.accent : c.textMuted}
                weight={active ? 'fill' : 'duotone'}
                style={{ flexShrink: 0 }} />
              {!folded && (
                <span style={{
                  fontSize: 13,
                  color: active ? c.accent : c.textSecondary,
                  fontWeight: active ? 600 : 400,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{item.label}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}