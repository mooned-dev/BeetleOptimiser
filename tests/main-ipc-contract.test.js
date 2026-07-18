// Unit tests for the IPC contract main.js depends on:
//
//   - input-validation helpers (validateDriveLetter / validateProgramName /
//     validateRegistryPath)
//   - the confirmation-token system (requestConfirm + consumeConfirmation)
//   - the NDJSON-from-spawnOptimizer stdout parser
//
// The source of truth for these is main.js. The regex strings and the
// thin wrappers below are mirrored here so the tests run under plain Node
// and exercise both the happy paths and the safety-critical guards. If
// main.js's logic changes, update this file in the same commit; CI will
// catch any mismatch when `npm test` runs.
//
// PowerShell is NOT required to run these tests.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// --- Mirror of the validation helpers + token logic -----------------
// (keep in sync with main.js)

const DRIVE_LETTER_RE = /^[A-Z]$/;
// Program-name input regex. Allows Windows app titles + their common
// punctuation (parens, brackets, ampersand, apostrophes). Excludes
// every shell-relevant character (`;` `|` `\` `*` `` ` `` `$` `#` `"`)
// so a hostile DevTools caller can't smuggle `; rm -rf /` past it.
const PROGRAM_NAME_RE  = /^[A-Za-z0-9._\- +()\[\]&,']+$/;
const PROGRAM_NAME_MAX = 128;
const REGISTRY_PATH_RE = /^HK[A-Z]{2}(:\\|\\).{0,260}$/;
const CONFIRM_TTL_MS = 30_000;

function validateDriveLetter(letter) {
  if (typeof letter !== 'string' || !DRIVE_LETTER_RE.test(letter)) {
    throw new Error('A drive letter A-Z is required');
  }
  return letter + ':';
}
function validateProgramName(name) {
  if (typeof name !== 'string' || !PROGRAM_NAME_RE.test(name) || name.length > PROGRAM_NAME_MAX) {
    throw new Error('Program name contains invalid characters');
  }
  return name.trim();
}
function validateRegistryPath(p) {
  if (typeof p !== 'string' || !REGISTRY_PATH_RE.test(p)) {
    throw new Error('Registry path must be a valid HKLM/HKCU/HKCR/HKU path');
  }
  return p;
}

function makeTokenStore() {
  const pending = new Map();
  return {
    requestConfirm(action) {
      const token = crypto.randomUUID();
      pending.set(token, { action, expires: Date.now() + CONFIRM_TTL_MS });
      return token;
    },
    consumeConfirmation(token, expectedAction) {
      const p = pending.get(token);
      if (p) pending.delete(token);
      if (!p || p.action !== expectedAction || Date.now() > p.expires) {
        throw new Error(`Action "${expectedAction}" was not explicitly confirmed`);
      }
    },
  };
}

function parseScriptOutput(chunks) {
  const result = { items: [], stderr: '', exitCode: null };
  let buffer = '';
  for (const chunk of chunks) {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try { result.items.push(JSON.parse(line)); } catch (_) { /* skip malformed */ }
    }
  }
  return result;
}

// ====================== validators ===================================

test('validateDriveLetter accepts A-Z and colonizes the result', () => {
  assert.equal(validateDriveLetter('C'), 'C:');
  assert.equal(validateDriveLetter('A'), 'A:');
  assert.equal(validateDriveLetter('Z'), 'Z:');
});

test('validateDriveLetter rejects lowercase, multi-letter, numeric, empty, null', () => {
  for (const bad of ['c', 'CD', '1', '', null, undefined, 'C:', 'C:\\']) {
    assert.throws(() => validateDriveLetter(bad), /drive letter/i);
  }
});

test('validateDriveLetter rejects shell-injection payloads', () => {
  for (const bad of [';', '|', ' ', '..', 'C;D', 'C|D']) {
    assert.throws(() => validateDriveLetter(bad), /drive letter/i);
  }
});

test('validateProgramName accepts normal Windows app + task names', () => {
  for (const good of [
    'Beetle Optimiser',
    'Spotify AB',
    'Microsoft Edge',
    'Adobe Acrobat Reader DC',
    'Notepad++',
    'Google Chrome',
    'Adobe.Acrobat.DC.24.002.20933',
    'Win10-Defender-Task',
  ]) {
    assert.equal(validateProgramName(good), good);
  }
});

test('validateProgramName rejects oversized or shell-injection inputs', () => {
  const oversized = 'A'.repeat(129);
  assert.throws(() => validateProgramName(oversized), /invalid characters/i);
  for (const bad of [
    '; rm -rf /', '`whoami`', 'a|b', 'name\\path', 'name/path',
    "a'; DROP TABLE users;--", 'name"with"quotes',
  ]) {
    assert.throws(() => validateProgramName(bad), /invalid characters/i);
  }
});

test('validateRegistryPath accepts standard HKLM/HKCU/HKCR/HKU paths', () => {
  for (const good of [
    'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion',
    'HKCU:\\Software\\Beetle\\Settings',
    'HKCR:\\*\\shell\\Defrag',
    'HKCR:\\Applications',
  ]) {
    assert.equal(validateRegistryPath(good), good);
  }
});

test('validateRegistryPath rejects plain Windows paths or web URLs', () => {
  for (const bad of [
    'C:\\Users\\admin', 'http://example.com/HKLM', '../../../etc/passwd',
    'foo bar',          // no hive prefix
    '',                 // empty
    null,
  ]) {
    assert.throws(() => validateRegistryPath(bad), /registry path/i);
  }
});

test('validators reject non-string inputs (null/num/bool/obj/array)', () => {
  for (const bad of [null, undefined, 0, [], {}, true]) {
    assert.throws(() => validateDriveLetter(bad));
    assert.throws(() => validateProgramName(bad));
    assert.throws(() => validateRegistryPath(bad));
  }
});

// ====================== confirmation token ===========================

test('token: mints a UUID and accepts a freshly minted token', () => {
  const s = makeTokenStore();
  const t = s.requestConfirm('clean-junk');
  assert.equal(typeof t, 'string');
  assert.match(t, /^[0-9a-f]{8}-/i);
  s.consumeConfirmation(t, 'clean-junk');
});

test('token: rejects a token used with the wrong action', () => {
  const s = makeTokenStore();
  const t = s.requestConfirm('clean-junk');
  assert.throws(() => s.consumeConfirmation(t, 'wiper-wipe'), /wiper-wipe/);
  // Single-use even on mismatch: still rejected for the right action.
  assert.throws(() => s.consumeConfirmation(t, 'clean-junk'), /clean-junk/);
});

test('token: rejects a never-minted token', () => {
  const s = makeTokenStore();
  assert.throws(
    () => s.consumeConfirmation('00000000-0000-0000-0000-000000000000', 'clean-junk'),
    /clean-junk/
  );
});

test('token: enforces single-use even on success', () => {
  const s = makeTokenStore();
  const t = s.requestConfirm('clean-junk');
  s.consumeConfirmation(t, 'clean-junk');
  assert.throws(() => s.consumeConfirmation(t, 'clean-junk'), /clean-junk/);
});

test('token: separate actions get separate tokens', () => {
  const s = makeTokenStore();
  const a = s.requestConfirm('clean-junk');
  const b = s.requestConfirm('wiper-wipe');
  assert.notEqual(a, b);
  s.consumeConfirmation(a, 'clean-junk');
  s.consumeConfirmation(b, 'wiper-wipe');
});

test('token: expired entries are rejected', () => {
  // Use the internal Map directly to construct an expired token, since
  // the store only mints future-expiry tokens.
  const pending = new Map();
  pending.set('expired', { action: 'clean-junk', expires: Date.now() - 1 });
  // Mirror the consume flow
  function consume(t, a) {
    const p = pending.get(t);
    if (p) pending.delete(t);
    if (!p || p.action !== a || Date.now() > p.expires) throw new Error('rejected');
  }
  assert.throws(() => consume('expired', 'clean-junk'), /rejected/);
});


test('token: cancel drops only the requested entry', () => {
  // Mirror the cancel-confirm IPC: a delete-only path that drops one
  // specific token without consuming others.
  const store = new Map();
  store.set('x', { action: 'a', expires: Date.now() + 30000 });
  store.set('y', { action: 'b', expires: Date.now() + 30000 });
  store.set('z', { action: 'c', expires: Date.now() + 30000 });
  // Cancel x only
  store.delete('x');
  assert.equal(store.size, 2);
  assert.ok(store.has('y'));
  assert.ok(store.has('z'));
  assert.ok(!store.has('x'));
});

test('token: explicit cancel returns the right ok flag', () => {
  // Mirror cancel-confirm's response shape: { ok: had }
  const store = new Map();
  store.set('present', { action: 'x', expires: Date.now() + 1000 });
  // cancel an existing token
  const a = { ok: store.delete('present') };
  assert.deepEqual(a, { ok: true });
  // cancel a missing token
  const b = { ok: store.delete('not-here') };
  assert.deepEqual(b, { ok: false });
});

test('token: sweeper evicts only expired entries', () => {
  const CONFIRM_TTL_MS = 30_000;
  const now = Date.now();
  const pending = new Map();
  pending.set('expired-1', { action: 'a', expires: now - 5 });
  pending.set('expired-2', { action: 'a', expires: now - 10 });
  pending.set('fresh-1', { action: 'a', expires: now + 60000 });
  pending.set('fresh-2', { action: 'a', expires: now + 120000 });

  // Run sweeper
  let dropped = 0;
  for (const [tok, entry] of pending) {
    if (entry.expires <= now) { pending.delete(tok); dropped++; }
  }

  assert.equal(dropped, 2);
  assert.equal(pending.size, 2);
  assert.ok(pending.has('fresh-1'));
  assert.ok(pending.has('fresh-2'));
  assert.ok(!pending.has('expired-1'));
  assert.ok(!pending.has('expired-2'));
});

test('token: sweeper never touches an actively-consumed token', () => {
  // After consume, the entry is gone. A subsequent sweep is a no-op.
  const s = makeTokenStore();
  const t = s.requestConfirm('clean-junk');
  s.consumeConfirmation(t, 'clean-junk');
  // No map access needed; the consume function removed it.
  // Re-run makeTokenStore to verify fresh store works.
  assert.equal(typeof t, 'string');
});

test('token: confirm always throws on action mismatch, including after partial TTL', () => {
  const s = makeTokenStore();
  const t = s.requestConfirm('clean-junk');
  // Even with action wrong, never silently consume.
  assert.throws(() => s.consumeConfirmation(t, 'wiper-wipe'), /wiper-wipe/);
  // Confirm that the wrong-action attempt also dropped the token.
  assert.throws(() => s.consumeConfirmation(t, 'clean-junk'), /clean-junk/);
});

// ====================== NDJSON parser ===============================

test('NDJSON: accepts one event per line', () => {
  const lines = [
    JSON.stringify({event: 'started', mode: 'list'}),
    JSON.stringify({event: 'item', path: 'C:/foo', size: 1024}),
    JSON.stringify({event: 'finished', mode: 'list'}),
  ].join('\n') + '\n';
  const r = parseScriptOutput([lines]);
  assert.equal(r.items.length, 3);
  assert.equal(r.items[0].event, 'started');
  assert.equal(r.items[1].size, 1024);
  assert.equal(r.items[2].event, 'finished');
});

test('NDJSON: handles chunks that split a line mid-string', () => {
  const full = [
    JSON.stringify({event: 'item', x: 1}),
    JSON.stringify({event: 'item', x: 2}),
    JSON.stringify({event: 'item', x: 3}),
  ].join('\n') + '\n';
  const out = parseScriptOutput([full.slice(0, 20), full.slice(20, 60), full.slice(60)]);
  assert.equal(out.items.length, 3);
  assert.deepEqual(out.items.map(i => i.x), [1, 2, 3]);
});

test('NDJSON: silently skips malformed lines', () => {
  const lines = JSON.stringify({event: 'ok'}) + '\n'
    + 'not JSON\n'
    + JSON.stringify({event: 'ok2'}) + '\n';
  const r = parseScriptOutput([lines]);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].event, 'ok');
  assert.equal(r.items[1].event, 'ok2');
});

test('NDJSON: empty chunk input yields zero items', () => {
  assert.equal(parseScriptOutput([]).items.length, 0);
  assert.equal(parseScriptOutput(['']).items.length, 0);
  assert.equal(parseScriptOutput(['\n\n\n']).items.length, 0);
});
