// Shared on/off toggle switch (Browser Protection, Cat Mode, etc.).
// A real sliding track+thumb switch - the label stays static text, only
// the thumb position and track color change on click.

import React from 'react';

export default function Toggle({ c, on, onChange, label }) {
  return (
    <button
      onClick={() => onChange && onChange(!on)}
      className="toggle-switch-btn"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', padding: 0,
      }}
    >
      <span style={{
        position: 'relative', display: 'inline-block', flexShrink: 0,
        width: 34, height: 18, borderRadius: 9,
        background: on ? c.accent : c.border,
        transition: 'background 0.15s ease',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 18 : 2,
          width: 14, height: 14, borderRadius: '50%', background: 'white',
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          transition: 'left 0.15s ease',
        }} />
      </span>
      {label && <span style={{ fontSize: 12, color: c.textSecondary }}>{label}</span>}
    </button>
  );
}
