// FlyoutApp - renders inside the SEPARATE small BrowserWindow that main.js
// pops up anchored above the system tray icon on hover (see main.js's
// createFlyoutWindow). This replaces the old bottom-right corner overlay
// that used to sit inside the Dashboard tab - the real Auslogics BoostSpeed
// widget lives as a tray popup, not embedded in the app's own window.
//
// Loaded via the same index.html/dist bundle as the main window, routed by
// the "#flyout" URL hash (see main.jsx) so there's no second Vite entry
// point to maintain.

import React, { useEffect } from 'react';
import StatusOverlay from './components/dashboard/StatusOverlay.jsx';
import { getColors } from './lib/colors.js';

const RESOLVED_COUNT_KEY = 'beetle-resolved-count';

function readResolvedCount() {
  try {
    const v = localStorage.getItem(RESOLVED_COUNT_KEY);
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

export default function FlyoutApp() {
  const c = getColors(false); // flyout always renders in the dark theme - matches the tray icon's own styling, independent of the main window's toggle
  const [resolvedCount, setResolvedCount] = React.useState(readResolvedCount);
  const wrapperRef = React.useRef(null);

  // The main window is a different renderer (separate BrowserWindow) but
  // shares this same origin, so a 'storage' event fires here whenever IT
  // writes beetle-resolved-count - no IPC channel needed for this.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === RESOLVED_COUNT_KEY) setResolvedCount(readResolvedCount());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Transparent window background (set in main.js) needs the WHOLE chain -
  // html, body, AND #root - transparent too, or the app's own opaque
  // --bg-primary (global.css's grouped "html, body, #root" rule, which
  // applies the same background to each of the three individually) paints
  // an opaque rectangle behind the card. #root also gets height: 100vh from
  // that same rule, which is exactly why the window looked "too large" -
  // the actual card is much shorter than a full viewport, so the leftover
  // #root height showed as a big solid-color block below it. Setting
  // height: auto here lets the ResizeObserver below measure the card's real
  // height instead of the forced 100vh.
  useEffect(() => {
    const root = document.getElementById('root');
    for (const el of [document.documentElement, document.body, root]) {
      if (!el) continue;
      el.style.background = 'transparent';
      el.style.height = 'auto';
    }
  }, []);

  // The window is created at a rough guessed size (main.js's
  // FLYOUT_WIDTH/HEIGHT) and only actually shown once this first reports
  // real content size - see main.js's `flyoutPendingShow`. A ResizeObserver
  // (not a one-shot measurement) keeps it accurate if content height ever
  // changes later (e.g. telemetry rows appearing/disappearing).
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !window?.beetleAPI?.flyout?.resize) return;
    const report = () => {
      const rect = el.getBoundingClientRect();
      window.beetleAPI.flyout.resize({ width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tells main.js whether the cursor is over the flyout's own content, so
  // it doesn't hide the window out from under a click just because the
  // mouse briefly left the tray icon on its way down into the popup.
  const notifyHover = (hovered) => window?.beetleAPI?.flyout?.hover(hovered);

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={() => notifyHover(true)}
      onMouseLeave={() => notifyHover(false)}
      style={{ display: 'inline-block', padding: 14 }}
    >
      <StatusOverlay
        c={c}
        standalone
        resolvedCount={resolvedCount}
        onAskQuestion={() => window?.beetleAPI?.flyout?.navigate('Ask a Question')}
        onNavigate={(tab) => window?.beetleAPI?.flyout?.navigate(tab)}
      />
    </div>
  );
}
