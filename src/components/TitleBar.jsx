// Custom frameless title bar. Draggable region with logo + app name.
// Left side has the account menu (sign in / avatar dropdown). Right side
// has our own min/max/close buttons. The theme toggle lives in the global
// StatusBar - not duplicated here.
//
// Per Electron docs, when frame: false (frameless), setTitleBarOverlay()
// cannot render the OS controls on top. We render our own buttons via IPC.

import React from 'react';
import { Minus, X as CloseIcon } from '@phosphor-icons/react';
import HieroglyphIcon from './HieroglyphIcon.jsx';
import AccountMenu from './shared/AccountMenu.jsx';
import { useWindowControls } from '../hooks/useWindowControls.js';

export default function TitleBar({ c, auth }) {
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
      {/* LEFT: account menu */}
      <AccountMenu
        c={c}
        user={auth.user}
        authLoading={auth.authLoading}
        tokens={auth.tokens}
        plan={auth.plan}
        authError={auth.authError}
        onSignInGoogle={auth.signInWithGoogle}
        onSignInGitHub={auth.signInWithGitHub}
        onSignOut={auth.signOut}
      />

      {/* CENTER: logo + app name, centered in the full titlebar width */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <HieroglyphIcon size={20} color={c.accent} />
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.01em' }}>
          Beetle Optimiser
        </span>
      </div>

      {/* RIGHT: window controls (ADMIN badge removed per user spec) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' }}>
        {/* WINDOW CONTROL BUTTONS (frameless so we render our own) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
          {/* Only Minimize and Close (NO maximize button per user spec) */}
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
