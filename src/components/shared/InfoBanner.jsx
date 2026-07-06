// Shared info strip shown at the top of most tab views (Advisor, Clean Up,
// Optimize, Protect, Maintain all use this same treatment in the reference).

import React from 'react';
import { Info } from '@phosphor-icons/react';

export default function InfoBanner({ c, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 20px', background: c.bgSecondary,
      borderBottom: `1px solid ${c.border}`, flexShrink: 0,
    }}>
      <Info size={16} color={c.accent} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: c.textSecondary }}>{children}</span>
    </div>
  );
}
