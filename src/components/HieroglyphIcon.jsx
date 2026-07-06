// HieroglyphIcon - renders the 𓆣 (U+131A3) Egyptian hieroglyph in purple.
// Uses Segoe UI Historic font which ships with Windows 10/11 and supports
// the Egyptian Hieroglyphs Unicode block (U+13000-U+133FF).
//
// Reference: https://learn.microsoft.com/en-us/typography/font-list/segoe-ui-historic

import React from 'react';

export default function HieroglyphIcon({ size = 16, color = '#A678E0', style, className }) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Segoe UI Historic", "Segoe UI Symbol", sans-serif',
        fontSize: size,
        lineHeight: 1,
        color: color,
        background: 'transparent',
        userSelect: 'none',
        ...style,
      }}
      aria-label="Beetle hieroglyph"
    >
      𓆣
    </span>
  );
}
