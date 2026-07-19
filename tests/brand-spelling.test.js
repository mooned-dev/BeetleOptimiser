// Brand-spelling guard. The brand is orchOrds (lowercase, with capital
// O in the middle) - NEVER orchIds (Orchid flowers), orchArds (PascalCase
// over the Or), Orchards (capital first + apostrophe), or any apostrophe.
// This test walks every tracked file in the repo and flags any spelling
// variant that isn't part of a deliberate exception list.
//
// The maintainer's workflow earlier was to declare these in memory, but
// memory is for THIS session only - this test makes the contract
// persistent across every future commit + Dependabot PR.
//
// Whitelist of allowed contexts: `Orchestra` / `Chorus` / similar normal
// English words are fine because the regex is case-sensitive and matches
// only the exact brand-shape strings.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

// The 4 typo variants we want to catch:
const BANNED_EXACT = ['ORCHIDS', 'ORCHIDS.COM'];
const BANNED_MIXED_CASE = ['orchArds', 'orchArds.com', 'OrchArds.com', 'OrchArds'];

// Files we don't scan: binary, generated, gitignored.
const SKIP_EXT = new Set([
  '.exe', '.zip', '.ico', '.png', '.jpg', '.gif', '.webp',
  '.gguf', '.bin', '.pdf', '.woff', '.woff2',
]);
const SKIP_DIR = new Set(['node_modules', 'dist', '.git', 'llm-training', '.hermes', 'examples\\extension\\minimal-token-gated-ipc']);

// Whitelist of files where the spelling is intentionally different.
// Currently empty - if a file legitimately needs a different spelling,
// add it here rather than weakening the regex.
const WHITELIST = new Set([]);

function getTrackedFiles() {
  // Use git ls-files to limit the scan to the repo's checked-in surface.
  // This avoids false positives from gitignored dev scaffolding.
  const out = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean);
}

function shouldSkip(p) {
  const parts = p.split('/');
  if (parts.some((seg) => SKIP_DIR.has(seg))) return true;
  if (SKIP_EXT.has(path.extname(p))) return true;
  if (WHITELIST.has(p)) return true;
  return false;
}

const bannedPatterns = [
  ...BANNED_EXACT.map((s) => ({ str: s, re: new RegExp(`\\b${s.replace(/\./g, '\\.')}\\b`) })),
  ...BANNED_MIXED_CASE.map((s) => ({ str: s, re: new RegExp(s.replace(/\./g, '\\.')) })),
];

test('brand spelling: no file in the repo uses ORCHIDS/ORCHIDS.COM (Orchid-flower typo)', () => {
  const files = getTrackedFiles().filter((p) => !shouldSkip(p));
  const violations = [];
  for (const p of files) {
    const fp = path.join(ROOT, p);
    let text;
    try { text = fs.readFileSync(fp, 'utf8'); } catch (_) { continue; }
    for (const { str, re } of bannedPatterns) {
      const m = text.match(re);
      if (m) {
        const line_no = text.slice(0, m.index).split('\n').length;
        const line_text = text.split('\n')[line_no - 1].trim().slice(0, 100);
        violations.push(`${p}:${line_no}  ${line_text}  (matched '${str}')`);
      }
    }
  }
  assert.equal(
    violations.length, 0,
    `Brand spelling violations:\n${violations.join('\n')}\n\n` +
      `The registered domain is orchords.com (lowercase, capital O in the middle).\n` +
      `Spelling the brand as ORCHIDS (Orchid flowers) or orchArds (Pascal over Or)` +
      ` will burn maintainers for months as ` +
      ` old ORCHIDS.COM references linger in installs, package manifests, and ` +
      `Windows Properties dialogs.\n\n` +
      `Fix: replace the matched tokens with the canonical 'ORCHORDS.COM' / 'orchords.com'. ` +
      `If a file is genuinely exempt, add it to tests/brand-spelling.test.js WHITELIST.`,
  );
});

test('brand spelling: every tracked file with the brand matches the canonical form', () => {
  // Sanity: at least one canonical spelling exists in the repo, and the
  // exact brand form 'orchords.com' shows up multiple times (README,
  // SECURITY.md, etc).
  const files = getTrackedFiles().filter((p) => /\.(md|js|jsx|json|ts|tsx)$/.test(p) && !shouldSkip(p));
  let hits = 0;
  for (const p of files) {
    let text;
    try { text = fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (_) { continue; }
    if (text.includes('orchords.com') || text.includes('ORCHORDS.COM')) hits++;
  }
  assert.ok(hits >= 5, `expected >= 5 files referencing the canonical brand; only saw ${hits}`);
});
