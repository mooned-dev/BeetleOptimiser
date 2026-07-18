// Custom frameless title bar. Draggable region with logo + app name on the
// left, our own min/close buttons on the right. The theme toggle lives
// in the global StatusBar - not duplicated here.
//
// Per Electron docs, when frame: false (frameless), setTitleBarOverlay()
// cannot render the OS controls on top. We render our own buttons via IPC.

import React from 'react';
import { Minus, X as CloseIcon } from '@phosphor-icons/react';
import HieroglyphIcon from './HieroglyphIcon.jsx';
import { useWindowControls } from '../hooks/useWindowControls.js';

export default function TitleBar({ c }) {
  const { minimize, close } = useWindowControls();

  return (
    <div
      className="titlebar-anim"
      style={{
        position: 'relative',
        height: 36, background: c.bgTertiary,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 4px 0 14px',
        borderBottom: `1px solid ${c.border}`,
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      }}
    >
      {/* LEFT: logo + app name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <HieroglyphIcon size={20} color={c.accent} />
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.01em' }}>
          Beetle Optimiser
        </span>
      </div>

      {/* RIGHT: window controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
          <button
            onClick={minimize}
            title="Minimize"
            className="title-btn title-btn-min"
            aria-label="Minimize"
            style={{
              width: 40, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: c.textSecondary, borderRadius: 4,
            }}
          >
            <Minus size={12} weight="bold" />
          </button>
          <button
            onClick={close}
            title="Close"
            className="title-btn title-btn-close"
            aria-label="Close"
            style={{
              width: 40, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: c.textSecondary, borderRadius: 4,
            }}
          >
            <CloseIcon size={14} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
