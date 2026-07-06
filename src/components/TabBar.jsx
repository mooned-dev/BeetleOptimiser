// Top tab bar. 8 tabs in Auslogics order. Active tab gets a purple
// underline and the icon switches to the accent color.

import React from 'react';
import { TABS } from '../data/tabs.js';

export default function TabBar({ c, activeTab, onTabChange }) {
  return (
    <div style={{
      height: 40, background: c.bgSecondary,
      borderBottom: `1px solid ${c.border}`,
      display: 'flex', alignItems: 'stretch', padding: '0 12px',
    }}>
      {TABS.map(t => {
        const TabIcon = t.Icon;
        const active = t.label === activeTab;
        return (
          <button
            key={t.label}
            onClick={() => onTabChange(t.label)}
            className="tab-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 18px',
              color: active ? c.textPrimary : c.textSecondary,
              background: 'transparent', border: 'none',
              borderBottom: active ? `3px solid ${c.accent}` : '3px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
              fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
            }}
          >
            <TabIcon size={16} weight="regular"
              color={active ? c.accent : c.textMuted} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
