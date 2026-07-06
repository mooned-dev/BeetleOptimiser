// Hook that exposes window control actions. Backed by the IPC bridge
// defined in preload.js (window.minimize / window.maximize / window.close).
// Falls back to no-ops in dev mode (when window.beetleAPI is undefined).

export function useWindowControls() {
  const safe = (fn) => () => {
    try { fn && fn(); } catch (_) { /* no-op */ }
  };

  return {
    minimize: safe(() => window?.beetleAPI?.window?.minimize?.()),
    close:    safe(() => window?.beetleAPI?.window?.close?.()),
  };
}
