// Tests for the localStorage-persistence logic in
// src/hooks/useActiveTab.js + src/hooks/useActiveNav.js. The hook files
// themselves depend on React, but the data-flow inside them is just
// "read X from localStorage on initial mount; validate X against an
// allowlist; default on missing or invalid; write on setActive".
// This test file mirrors that logic and exercises every branch.

const { test } = require('node:test');
const assert = require('node:assert/strict');

// In-memory localStorage mock. Real Electron's localStorage is a
// browser-API surface backed by disk; this in-process mock is good
// enough for the persistence contract.
function mockStorage(initial = {}) {
  let s = { ...initial };
  return {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => { s[k] = String(v); },
    removeItem: (k) => { delete s[k]; },
    clear: () => { s = {}; },
    _dump: () => s,
  };
}

// Mirror of useActiveTab's readInitial. The hook file is React-bound,
// but the persistence logic itself is plain - we'll exercise it here
// without spinning up jsdom.
function readInitial(storage, key, fallback, allowlist) {
  if (!storage) return fallback;
  let saved = null;
  try { saved = storage.getItem(key); } catch (_) { return fallback; }
  if (!saved) return fallback;
  if (Array.isArray(allowlist) && !allowlist.some((x) => x === saved)) {
    return fallback;
  }
  return saved;
}

const TABS = [
  'Dashboard', 'Scanner', 'Advisor', 'Clean Up', 'Optimize', 'Protect',
  'Maintain', 'My Tasks', 'Reports', 'Win10 Protector', 'Care Center', 'Ask a Question',
];

test('useActiveTab: returns fallback when localStorage is empty', () => {
  const s = mockStorage();
  const initial = readInitial(s, 'beetle-last-tab', 'Dashboard', TABS);
  assert.equal(initial, 'Dashboard');
});

test('useActiveTab: returns persisted value if it is in the allowlist', () => {
  const s = mockStorage({ 'beetle-last-tab': 'Optimize' });
  const initial = readInitial(s, 'beetle-last-tab', 'Dashboard', TABS);
  assert.equal(initial, 'Optimize');
});

test('useActiveTab: returns fallback if persisted value is no longer in the allowlist', () => {
  // simulates a tab being renamed in a newer release
  const s = mockStorage({ 'beetle-last-tab': 'OldDeletedTab' });
  const initial = readInitial(s, 'beetle-last-tab', 'Dashboard', TABS);
  assert.equal(initial, 'Dashboard');
});

test('useActiveTab: returns fallback if localStorage throws (private mode)', () => {
  const failingStorage = { getItem: () => { throw new Error('denied'); } };
  const initial = readInitial(failingStorage, 'beetle-last-tab', 'Dashboard', TABS);
  assert.equal(initial, 'Dashboard');
});

test('useActiveTab: every shipped tab id round-trips through localStorage', () => {
  const s = mockStorage();
  for (const tab of TABS) {
    s.setItem('beetle-last-tab', tab);
    const initial = readInitial(s, 'beetle-last-tab', 'Dashboard', TABS);
    assert.equal(initial, tab, `tab ${tab} did not round-trip`);
  }
});

const NAV_ITEMS = ['pc', 'questions', 'advisor', 'reports', 'maintenance', 'rescue'];

test('useActiveNav: empty storage falls back to "pc"', () => {
  const s = mockStorage();
  const initial = readInitial(s, 'beetle-last-nav', 'pc', NAV_ITEMS);
  assert.equal(initial, 'pc');
});

test('useActiveNav: persisted sidebar item is read back correctly', () => {
  const s = mockStorage({ 'beetle-last-nav': 'rescue' });
  const initial = readInitial(s, 'beetle-last-nav', 'pc', NAV_ITEMS);
  assert.equal(initial, 'rescue');
});

test('useActiveNav: unknown persisted value falls back to "pc"', () => {
  const s = mockStorage({ 'beetle-last-nav': 'ai-mode-from-the-future' });
  const initial = readInitial(s, 'beetle-last-nav', 'pc', NAV_ITEMS);
  assert.equal(initial, 'pc');
});

test('useActiveNav: every shipped nav id round-trips', () => {
  const s = mockStorage();
  for (const n of NAV_ITEMS) {
    s.setItem('beetle-last-nav', n);
    const initial = readInitial(s, 'beetle-last-nav', 'pc', NAV_ITEMS);
    assert.equal(initial, n);
  }
});

// setActive's persistence behaviour. Mirror of the closure inside the
// hook that writes on every state change.
function writeActive(storage, key, value) {
  try { storage.setItem(key, String(value)); } catch (_) { /* ignore */ }
}

test('useActiveTab: setActive persists the new value', () => {
  const s = mockStorage();
  writeActive(s, 'beetle-last-tab', 'Clean Up');
  assert.equal(s.getItem('beetle-last-tab'), 'Clean Up');
});

test('useActiveNav: setActive persists the new value', () => {
  const s = mockStorage();
  writeActive(s, 'beetle-last-nav', 'maintenance');
  assert.equal(s.getItem('beetle-last-nav'), 'maintenance');
});

test('useActiveTab: setActive ignores quota errors (silent fail-open)', () => {
  const failingStorage = { setItem: () => { throw new Error('QuotaExceededError'); } };
  // The contract: the hook should swallow the error, log nothing (we
  // don't want the user to see "localStorage save failed!"), and let
  // the in-memory state continue working. This is the explicit try/
  // catch + void the error.
  let threw = false;
  try { writeActive(failingStorage, 'beetle-last-tab', 'Optimize'); } catch (_) { threw = true; }
  assert.equal(threw, false, 'setActive must swallow localStorage errors');
});
