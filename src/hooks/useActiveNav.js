import { useState } from 'react';

// Persistence pattern matching useActiveTab. Saves the active sidebar
// nav (PC / Questions / Advisor / Reports / Automatic Maintenance /
// Rescue Center) across app restarts. If the persisted value is no
// longer in the source-of-truth (renamed / removed), falls back to
// initial. Silent on quota / denied errors.
export function useActiveNav(initial = 'pc', navList) {
  const readInitial = () => {
    if (typeof localStorage === 'undefined') return initial;
    let saved = null;
    try { saved = localStorage.getItem('beetle-last-nav'); } catch (_) { return initial; }
    if (!saved) return initial;
    if (Array.isArray(navList) && !navList.some((n) => n?.id === saved)) {
      return initial;
    }
    return saved;
  };
  const [active, setActiveInner] = useState(readInitial);

  const setActive = (next) => {
    setActiveInner((prev) => {
      const id = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem('beetle-last-nav', String(id)); } catch (_) { /* ignore */ }
      return id;
    });
  };

  return { active, setActive };
}
