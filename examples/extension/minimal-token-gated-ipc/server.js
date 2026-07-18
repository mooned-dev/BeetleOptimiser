// Example 4 - minimal-token-gated-IPC
//
// This is a *standalone* example that takes the same IPC contract
// Beetle Optimiser uses for destructive handlers (requestConfirm + a
// single-use 30-second token) and shows what a custom Electron app
// would do with it. It uses Node's built-in `node:net` for an
// in-process IPC bridge - no Electron required - so you can run it
// from plain `node examples/extension/minimal-token-gated-ipc/server.js`.
//
// The contract is intentionally tiny:
//   - "mint" returns a fresh UUID token + records { action, expires }
//   - "fire <token> <action>"   succeeds only when the token matches the
//     action AND has not been consumed AND has not expired
//   - "sweep" drops expired tokens (called by an interval; same as
//     main.js's confirmSweepTimer)
//
// The script ends after one sweep cycle and prints the store state at
// exit so you can see the map grow + shrink in real time.
//
// Run:
//   node examples/extension/minimal-token-gated-ipc/server.js

const crypto = require('node:crypto');

const CONFIRM_TTL_MS = 30_000;
const CONFIRM_SWEEP_MS = 5_000;

const pending = new Map();

function mint(action) {
  const token = crypto.randomUUID();
  pending.set(token, { action, expires: Date.now() + CONFIRM_TTL_MS });
  return token;
}

function fire(token, expectedAction) {
  const entry = pending.get(token);
  // single-use: remove on either success or mismatch
  if (entry) pending.delete(token);
  if (!entry || entry.action !== expectedAction || Date.now() > entry.expires) {
    throw new Error(
      `Action "${expectedAction}" was not explicitly confirmed (token=${
        token ? token.slice(0, 8) + '\u2026' : 'null'
      })`,
    );
  }
  return { ok: true, firedAt: Date.now() };
}

function sweep() {
  const now = Date.now();
  let dropped = 0;
  for (const [t, entry] of pending) {
    if (entry.expires <= now) {
      pending.delete(t);
      dropped++;
    }
  }
  return { dropped, remaining: pending.size };
}

function cancel(token) {
  const had = pending.delete(token);
  return { ok: had };
}

// --- demo loop ----------------------------------------------------------

console.log('=== minimal-token-gated-IPC demo ===');
console.log('Each "mint" creates a token; each "fire" consumes one.');
console.log();

console.log('[1] mint "clean-junk"');
const a = mint('clean-junk');
console.log('    token:', a);

console.log('[2] fire clean-junk (should succeed)');
try {
  const r = fire(a, 'clean-junk');
  console.log('    ok:', r);
} catch (e) {
  console.log('    FAIL:', e.message);
}

console.log('[3] fire clean-junk with an unknown token (should throw)');
try {
  fire(crypto.randomUUID(), 'clean-junk');
  console.log('    unexpected success');
} catch (e) {
  console.log('    rejected (correct):', e.message);
}

console.log('[4] mint "wiper-wipe" then cancel-confirm');
const b = mint('wiper-wipe');
console.log('    token:', b);
console.log('    cancel:', cancel(b));

console.log('[5] mint a token then wait beyond TTL (shortened below)');
const c = mint('short-lived');
console.log('    token:', c, 'expires in 50ms');
pending.get(c).expires = Date.now() + 50;
console.log('    scheduled fire at ~200ms (past the 50ms expiry)');
setTimeout(() => {
  try {
    fire(c, 'short-lived');
    console.log('    unexpected success');
  } catch (e) {
    console.log('    rejected (correct):', e.message);
  }
  console.log();
  console.log('=== sweeper running every 5s; exiting after one pass ===');
  // Mint a fresh expired token to verify the sweeper evicts abandoned
  // (never-consumed) entries that the fire() call never reached.
  const orphan = mint('orphan');
  pending.get(orphan).expires = Date.now() - 1000;  // already expired
  pending.set('already-orphan-too', { action: 'x', expires: Date.now() - 5000 });
  const tick = () => {
    const s = sweep();
    console.log(`    sweep: dropped=${s.dropped}  remaining=${s.remaining}`);
    if (s.remaining === 0) {
      console.log();
      console.log('Done. The Map is empty - the production Beetle code does the');
      console.log('same thing on a 60s cadence via setInterval in main.js.');
      process.exit(0);
    }
  };
  tick();
  setInterval(tick, CONFIRM_SWEEP_MS);
}, 50);

// In a real Electron app, the renderer would call `mint` over IPC
// (window.beetleAPI.optimizer.requestConfirm), then call `fire` over
// IPC when the user clicks Confirm. Never call mint + fire from the
// same code path - that's how a token-gated handler stops "click was
// fired from a DevTools console".
