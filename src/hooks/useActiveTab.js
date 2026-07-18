import { useState } from 'react';

// Persisted useState. Reads the initial value from localStorage so the
// user lands on the tab they had open when they last quit; falls back
// to `initial` if nothing has been saved yet or if localStorage is
// inaccessible (private-browsing-style Electron flags + the rare case
// where the saved id is no longer in tabs.js).
//
// We persist on setActive so the next launch picks up the new tab.
// On any unexpected save error (rare - quota exceeded, denied), we
// silently continue with the in-memory value.
export function useActiveTab(initial = 'Dashboard', tabsList) {
  const readInitial = () => {
    if (typeof localStorage === 'undefined') return initial;
    let saved = null;
    try { saved = localStorage.getItem('beetle-last-tab'); } catch (_) { return initial; }
    if (!saved) return initial;
    // If the saved id is no longer in the tabs list (renamed / removed
    // in a newer release), fall back rather than crashing the renderer
    // with an undefined render path.
    if (Array.isArray(tabsList) && !tabsList.some((t) => t?.id === saved)) {
      return initial;
    }
    return saved;
  };
  const [active, setActiveInner] = useState(readInitial);

  const setActive = (next) => {
    setActiveInner((prev) => {
      const id = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem('beetle-last-tab', String(id)); } catch (_) { /* ignore */ }
      return id;
    });
  };

  return { active, setActive };
}
