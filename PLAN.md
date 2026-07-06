# 🪲 Beetle Optimiser Electron — Full SaaS Plan (1,000 MAU target)

> **Target repo**: `C:\Users\X79\Desktop\BeetleOptimiser-Electron`
> **Author**: MOONED DEV STUDIO
> **Date**: 2026-07-05
> **Status**: Plan (ready to execute)

---

## Table of contents
1. [Current state (audit)](#1-current-state-audit)
2. [Architecture](#2-architecture)
3. [Target numbers](#3-target-numbers)
4. [Firestore data model + capacity math](#4-firestore-data-model--capacity-math)
5. [Token economy + pricing](#5-token-economy--pricing)
6. [Stripe payment flow](#6-stripe-payment-flow)
7. [LLM + RAG (Ask a Question)](#7-llm--rag-ask-a-question)
8. [AdMob rewarded video](#8-admob-rewarded-video)
9. [Native optimizer ops (PowerShell)](#9-native-optimizer-ops-powershell)
10. [Auth + security](#10-auth--security)
11. [Code signing + auto-update](#11-code-signing--auto-update)
12. [Phase-by-phase roadmap (with effort estimates)](#12-phase-by-phase-roadmap)
13. [File-by-file changes](#13-file-by-file-changes)
14. [Cost & revenue rollup (1,000 MAU)](#14-cost--revenue-rollup-1000-mau)
15. [Scaling beyond 1,000 MAU](#15-scaling-beyond-1000-mau)
16. [Risk register](#16-risk-register)
17. [Verification checklist before declaring done](#17-verification-checklist-before-declaring-done)

---

## 1. Current state (audit)

### What exists
| Item | Status | Notes |
|---|---|---|
| Electron + Vite + React 18 | ✅ built | `BeetleOptimiser 0.2.0.exe` (77 MB) shipped |
| Firebase `beetle-studio` project | ✅ exists | Auth + Firestore only |
| Client Firebase wired | ✅ | `src/lib/firebase.js` — public config |
| Auth (Google + GitHub popup) | ✅ | UA-strip workaround in `main.js` |
| Token/plan read | ✅ | `users/{uid}/tokens/balance`, `users/{uid}.plan` — read-only client |
| Tab UI | ✅ | 8 tabs rendered (Dashboard/Scanner/Advisor/CleanUp/Optimize/Protect/Maintain/Ask) |
| Theme toggle, sidebar fold, window controls | ✅ | |
| Telemetry PowerShell loop | ✅ | `scripts/telemetry.ps1` — already produces JSON every 2s |

### What's stubbed (no backend logic)
- All optimizer buttons → `onClick={() => { /* TODO */ }}`
- StatusBar shows hardcoded `CPU: 0%`, `RAM: 11%` (telemetry.ps1 isn't wired)
- Token spend flow → not started
- Stripe / payments → not started
- Cloud Functions → not deployed (need Blaze plan)
- "Ask a Question" → just a form with hardcoded `LATEST_QUESTIONS`
- AdMob → not started
- Auto-update, code signing → not done

### Source stats
- 24 `.jsx` + 14 `.js` files (excluding `node_modules`, `dist`, `win-unpacked`)
- 2,271 LOC total
- Single Firebase config in `src/lib/firebase.js`

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron Renderer (React 18, Vite, Phosphor)                   │
│  24 .jsx + 14 .js, ~600 KB bundled                              │
│  - Reads wallet/plan via Firestore SDK (real-time onSnapshot)   │
│  - All writes via httpsCallable(Cloud Functions)                │
│  - Calls window.beetleAPI.* for native ops                      │
└──────────┬──────────────────────────────────────┬────────────────┘
           │ window.beetleAPI (preload IPC)       │ Firebase SDK 12.15
           ▼                                      ▼
┌──────────────────────────────┐    ┌───────────────────────────────┐
│  Electron Main (Node 20)     │    │  Firebase `beetle-studio`     │
│  - IPC: optimizer/system/app │    │  - Auth (Google + GitHub)     │
│  - spawn PowerShell          │    │  - Firestore                  │
│  - electron-store for prefs  │    │  - Cloud Functions (Blaze)    │
│  - electron-updater          │    │  - App Check (reCAPTCHA)      │
│  - Hidden BrowserWindow for  │    │  - Cloud Storage (FAQ PDFs)   │
│    AdMob rewarded video      │    └───────────────┬───────────────┘
└──────────┬───────────────────┘                    │
           │ child_process.spawn                     ▼
           ▼                          ┌───────────────────────────────┐
┌──────────────────────────────┐      │  Stripe                         │
│  PowerShell scripts          │      │  - Checkout (one-time)          │
│  scripts/telemetry.ps1       │      │  - Subscriptions (Pro Monthly)  │
│  scripts/optimize-*.ps1      │      │  - Customer Portal              │
│  (cleanup, registry, etc.)   │      │  - Webhook → Cloud Function     │
└──────────────────────────────┘      └───────────────────────────────┘
                                          │
                                          ▼
                            ┌───────────────────────────────┐
                            │  Cloudflare (LLM layer)        │
                            │  - Workers AI (Llama 3.1 8B)   │
                            │  - Vectorize (RAG embeddings)  │
                            │  - AI Gateway (cache + log)    │
                            └───────────────────────────────┘
```

---

## 3. Target numbers

| Metric | Value | Drives |
|---|---|---|
| MAU | 1,000 | everything below |
| DAU/MAU | 30% = 300 DAU | telemetry poll count |
| Free users | 80% = 800 | ad revenue |
| Paying | 20% = 200 | Stripe revenue |
| Pro tier (of paying) | 50% = 100 | LLM usage |
| Avg paid spend | $6.99/mo | MRR |
| MRR (gross) | **$1,398** | |

---

## 4. Firestore data model + capacity math

### Collections

```
/users/{uid}                                  [50 fields, 1KB]
   email, displayName, photoURL, plan, planExpiresAt,
   createdAt, lastSeen, country, marketingOptIn

/users/{uid}/wallet/main                      [1 doc/user = 1,000]
   balance, lifetimeBought, lifetimeSpent,
   lastTopupAt

/users/{uid}/transactions/{txId}             [~3/day/user avg]
   type, amount, feature, cost, ts,           [3,000/day = 1.1M/yr]
   stripePaymentId, adRewardId

/users/{uid}/questions/{qId}                 [Pro: 5/day]
   prompt, answer, tokensSpent, model,        [250/day = 91K/yr]
   latencyMs, ts

/users/{uid}/dailyLimits/{YYYY-MM-DD}        [1 doc/user/day]
   adsWatched, questionsAsked

/articles/{slug}                             [RAG corpus, ~50]
   title, body, category, tags, updatedAt
```

### Capacity at 1,000 MAU

**Storage (after 1 year):**
| Collection | Docs/yr | Size/doc | Storage |
|---|---|---|---|
| `/users` | 1,000 | 1 KB | 1 MB |
| `/transactions` | 1.1M | 0.4 KB | 440 MB |
| `/questions` | 91K | 3 KB | 270 MB |
| `/articles` | 50 | 10 KB | 0.5 MB |
| **Total** | | | **~720 MB** |

→ Within 1 GB free tier. ✅

**Operations per day (assuming 300 DAU):**
| Op | Per-user/day | Total/day | Free limit | Status |
|---|---|---|---|---|
| Reads (wallet/plan check) | 6 | 1,800 | 50,000 | ✅ |
| Reads (real-time listeners) | 1 | 300 | 50,000 | ✅ |
| Writes (spends) | 3 | 3,000 | 20,000 | ✅ |
| Writes (questions) | 0.83 | 250 | 20,000 | ✅ |
| Writes (ad rewards) | 0.6 | 480 | 20,000 | ✅ |

→ **Within Spark (free) tier for 1,000 MAU.** Blaze plan still required for Cloud Functions.

---

## 5. Token economy + pricing

### Token cost per action

| Action | Tokens | Real cost to you |
|---|---|---|
| Startup scan | 5 | $0 (local) |
| Quick registry tweak | 5 | $0 |
| Deep disk scan | 25 | $0 |
| Browser cleanup | 25 | $0 |
| Memory optimize (RAM trim) | 50 | $0 |
| GPU shader clear | 30 | $0 |
| One-click boost (full tune-up) | 200 | $0 |
| Ask a Question (LLM) | 20 | ~$0.001 |
| Ask a Question (Pro) | 0 | ~$0.05/day/user |

### Pricing tiers

| Tier | Price | Tokens | LLM/day | Stripe price ID |
|---|---|---|---|---|
| **Free** | $0 | 50 welcome | 1 question total | — |
| **Starter** | $2.99 once | 200 | 0 | `price_starter` |
| **Pro Monthly** | $6.99/mo | 500/mo + 50 LLM | 50 | `price_pro_monthly` |
| **Pro Lifetime** | $49.99 once | ∞ | ∞ | `price_pro_lifetime` |

### Atomic spend flow

```js
// Cloud Function: spendTokens
export const spendTokens = onCall(async (req, ctx) => {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'sign in first');
  const uid = ctx.auth.uid;
  const { feature, cost } = req.data;

  return db.runTransaction(async (t) => {
    const wallet = t.get(db.doc(`users/${uid}/wallet/main`));
    const user   = t.get(db.doc(`users/${uid}`));
    const [w, u] = await Promise.all([wallet, user]);

    const balance = w.exists ? w.data().balance : 0;
    const plan    = u.data().plan;

    // Pro = unlimited (skip check)
    if (plan !== 'Pro' && plan !== 'Pro Lifetime') {
      if (balance < cost) throw new HttpsError('failed-precondition', 'insufficient_tokens');
    }

    if (plan !== 'Pro' && plan !== 'Pro Lifetime') {
      t.update(w.ref, { balance: FieldValue.increment(-cost) });
    }
    t.set(db.collection(`users/${uid}/transactions`).doc(), {
      type: 'spend', amount: -cost, feature, cost,
      ts: FieldValue.serverTimestamp(),
    });
    return { newBalance: Math.max(0, balance - cost) };
  });
});
```

### Margin check
- $6.99 Pro user × 50 LLM queries/day × 30 days × $0.0001/query = **$0.15/mo LLM cost**
- $6.99 revenue → **98% gross margin on LLM**
- All other "actions" cost you $0 (local PowerShell)

---

## 6. Stripe payment flow

### Pattern: open Checkout in user's real browser

```
User clicks "Buy 500 tokens"
   ↓
renderer: window.beetleAPI.store.buyTokens('price_starter')
   ↓
main.js: stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price: 'price_starter', quantity: 1 }],
  success_url: 'beetleoptimiser://success?session_id={CHECKOUT_SESSION_ID}',
  cancel_url:  'beetleoptimiser://cancel',
  metadata: { uid, tokens: 500 },
  customer_email: user.email,
})
   ↓
main.js: shell.openExternal(session.url)   ← opens in Chrome/Edge (trusted)
   ↓
User pays in real browser
   ↓
Stripe POST webhook → Cloud Function stripeWebhook
   ↓
Cloud Function verifies signature, atomic wallet increment, logs tx
   ↓
Stripe redirects to beetleoptimiser://success?session_id=...
   ↓
Electron deep-link handler picks this up
   ↓
Renderer: onSnapshot already updated balance → modal closes
```

### Why external browser
- Electron popups get blocked by some anti-virus
- User trusts their real browser more (saves card, etc.)
- No PCI scope — Stripe Checkout is hosted

### package.json changes
```json
"protocols": [{
  "name": "Beetle Optimiser",
  "schemes": ["beetleoptimiser"]
}]
```

### Deep-link handler (main.js)
```js
app.setAsDefaultProtocolClient('beetleoptimiser');
app.on('open-url', (event, url) => {
  // macOS deep link
  if (url.startsWith('beetleoptimiser://success')) {
    mainWindow.webContents.send('payment:success');
  }
});
// Windows: single-instance lock + second-instance event
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', (event, argv) => {
  const url = argv.find(a => a.startsWith('beetleoptimiser://'));
  if (url) mainWindow.webContents.send('payment:success');
});
```

### Stripe webhook (Cloud Function)
```js
export const stripeWebhook = onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const uid = session.metadata.uid;
    const tokens = parseInt(session.metadata.tokens || '0', 10);

    await db.runTransaction(async (t) => {
      const wallet = t.get(db.doc(`users/${uid}/wallet/main`));
      const w = await wallet;
      t.set(w.ref, {
        balance: FieldValue.increment(tokens),
        lifetimeBought: FieldValue.increment(tokens),
        lastTopupAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      t.set(db.collection(`users/${uid}/transactions`).doc(), {
        type: 'purchase',
        amount: tokens,
        stripePaymentId: session.payment_intent,
        ts: FieldValue.serverTimestamp(),
      });
    });
  }

  // subscription events set users/{uid}.plan
  if (event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated') {
    const sub = event.data.object;
    const uid = sub.metadata.uid;
    await db.doc(`users/${uid}`).set({
      plan: 'Pro',
      planExpiresAt: new Date(sub.current_period_end * 1000),
      stripeSubscriptionId: sub.id,
    }, { merge: true });
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    await db.doc(`users/${sub.metadata.uid}`).set({
      plan: 'Free',
    }, { merge: true });
  }

  res.status(200).send('ok');
});
```

### Subscription reconciliation cron (daily)
Stripe webhooks can fail. Add a daily Cloud Function that queries Stripe for active subs and reconciles:
```js
export const reconcileStripe = onSchedule('every 24 hours', async () => {
  const subs = await stripe.subscriptions.list({ status: 'active', limit: 100 });
  for (const sub of subs.data) {
    await db.doc(`users/${sub.metadata.uid}`).set({
      plan: 'Pro',
      planExpiresAt: new Date(sub.current_period_end * 1000),
    }, { merge: true });
  }
});
```

---

## 7. LLM + RAG (Ask a Question)

### Pipeline
```
User: "My PC is slow after Windows Update"
   ↓
Cloud Function askQuestion({ prompt })
  1. Verify user has ≥ 20 tokens OR plan === 'Pro'
  2. Atomic spend: wallet -20 (skip if Pro), log tx
  3. Embed prompt: Workers AI @cf/baai/bge-base-en-v1.5  (FREE tier)
  4. Query Vectorize: top 3 matching /articles docs
  5. Build prompt: <system> + <context: 3 articles> + <user>
  6. Stream response: Workers AI @cf/meta/llama-3.1-8b-instruct
  7. Save full Q&A to /users/{uid}/questions/{qId}
  8. Return streaming response
   ↓
renderer: streams into AskQuestionView answer panel
```

### Cloudflare setup (one-time)
```bash
# Create Vectorize index
wrangler vectorize create beetle-rag --dimensions=768 --metric=cosine

# Add to wrangler.toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "beetle-rag"

[ai]
binding = "AI"
```

### RAG seeding (one-off script)
```js
// scripts/seed-rag.js (run as Cloud Function or wrangler)
import { indexArticles } from '../functions/rag';

const articles = [
  { slug: 'speed-up-windows-11', title: '...', body: '...', tags: ['speed', 'win11'] },
  // ~50 articles
];
await indexArticles(articles);  // chunks + embeds + upserts to Vectorize + writes to /articles
```

### Streaming response (Cloud Function)
```js
export const askQuestion = onCall({ enforceAppCheck: true }, async (req) => {
  const uid = req.auth.uid;
  const { prompt } = req.data;

  // Gate + spend
  await gateAndSpend(uid, 'ask_question', 20);

  // RAG
  const embed = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: prompt });
  const matches = await env.VECTORIZE.query(embed.data[0], { topK: 3 });
  const context = await fetchArticles(matches.map(m => m.id));

  // Stream
  const answer = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      { role: 'system', content: `You are a Windows PC optimization expert. Use ONLY the following context to answer. If unsure, say so.\n\nContext:\n${context}` },
      { role: 'user', content: prompt },
    ],
    stream: true,
  });

  // Return as a ReadableStream (callable function streaming)
  return new Response(answer, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
});
```

### LLM cost at 1,000 MAU
| Segment | Users | Q/day | Tokens/Q | Daily | Cost/day |
|---|---|---|---|---|---|
| Free | 800 | 0.1 (cap=1) | 1,200 | 96K | $0.003 |
| Starter | 100 | 2 | 1,200 | 240K | $0.008 |
| Pro Monthly | 50 | 5 | 1,200 | 300K | $0.010 |
| Pro Lifetime | 50 | 5 | 1,200 | 300K | $0.010 |
| **Total** | 1,000 | ~650 | — | **~936K/day** | **~$0.031/day = $0.93/mo** |

**Workers AI free tier: 10K neurons/day** (≈4 queries). Not enough → paid tier needed.
**Paid Workers AI**: Llama 3.1 8B = $0.02/M input + $0.05/M output → $0.93/mo. Negligible.

### Free-tier question logic
```
free user → asks question #1 → succeeds, balance 30 → asks #2 → "free limit reached, upgrade?"
```

```js
async function gateAndSpend(uid, feature, cost) {
  const today = new Date().toISOString().slice(0,10);
  const limRef = db.doc(`users/${uid}/dailyLimits/${today}`);
  const userRef = db.doc(`users/${uid}`);

  return db.runTransaction(async (t) => {
    const [user, lim] = await Promise.all([
      t.get(userRef), t.get(limRef),
    ]);
    const plan = user.data().plan;
    const questionsToday = lim.exists ? lim.data().questionsAsked || 0 : 0;

    // Free users get 1 question ever (not per day — they're one-shots)
    const lifetimeQuestions = lim.exists ? lim.data().lifetimeQuestions || 0 : 0;
    if (plan === 'Free' && lifetimeQuestions >= 1) {
      throw new HttpsError('failed-precondition', 'free_limit');
    }
    if (plan === 'Pro' || plan === 'Pro Lifetime') {
      // No spend, no token check
      t.set(limRef, {
        questionsAsked: FieldValue.increment(1),
        lifetimeQuestions: FieldValue.increment(1),
      }, { merge: true });
      return;
    }
    // Starter: just spend
    const wallet = await t.get(db.doc(`users/${uid}/wallet/main`));
    const bal = wallet.exists ? wallet.data().balance : 0;
    if (bal < cost) throw new HttpsError('failed-precondition', 'insufficient');
    t.update(db.doc(`users/${uid}/wallet/main`), { balance: FieldValue.increment(-cost) });
    t.set(db.collection(`users/${uid}/transactions`).doc(), {
      type: 'spend', amount: -cost, feature, cost,
      ts: FieldValue.serverTimestamp(),
    });
    t.set(limRef, {
      questionsAsked: FieldValue.increment(1),
      lifetimeQuestions: FieldValue.increment(1),
    }, { merge: true });
  });
}
```

---

## 8. AdMob rewarded video

### Realistic expected revenue at 1,000 MAU

```
800 free users × 30% DAU × 2 ads/day avg (cap = 3)
= 480 rewarded views/day

AdMob CPM (utility apps, rewarded): $10–20
Per-view revenue: $0.015
Daily:   480 × $0.015 = $7.20
Monthly: $216
```

Token cost: 5 tokens × $0.005/token implicit = $0.025 value per view.
Net: $0.015 revenue – $0.025 token value = -$0.010 per view (if you treat tokens as cash).
Reality: tokens are virtual → real net = **+$180–$216/mo at 1,000 MAU**.

### Daily caps
| Plan | Ads/day | Reward |
|---|---|---|
| Free | 3 | +5 |
| Starter | 1 | +5 |
| Pro Monthly | 0 (hidden) | — |
| Pro Lifetime | 0 (hidden) | — |

### Files
```
src/components/AdRewardModal.jsx        (NEW)
src/lib/admob.js                         (NEW) — web SDK init
src/hooks/useAdReward.js                 (NEW)
src/main.js                              ← add hidden BrowserWindow for ad
src/ad-player.html                       (NEW) — loads AdSense web SDK
firebase/functions/index.js              ← add grantAdReward + admobSsv
```

### Cloud Function: AdMob SSV verifier
```js
import { verifyAdmobSignature } from './admob-verify';  // google official lib

export const admobSsv = onRequest(async (req, res) => {
  const ok = verifyAdmobSignature(req.query, process.env.ADMOB_SSV_SECRET);
  if (!ok) return res.status(400).send('bad signature');
  const uid = req.query.custom_data;
  if (!uid) return res.status(400).send('no uid');

  const today = new Date().toISOString().slice(0,10);
  const limRef = db.doc(`users/${uid}/dailyLimits/${today}`);

  await db.runTransaction(async (t) => {
    const lim = await t.get(limRef);
    const watched = lim.exists ? lim.data().adsWatched || 0 : 0;
    if (watched >= 3) throw new Error('daily_cap_reached');
    t.set(limRef, { adsWatched: watched + 1 }, { merge: true });
  });

  await db.runTransaction(async (t) => {
    const walletRef = db.doc(`users/${uid}/wallet/main`);
    t.set(walletRef, {
      balance: FieldValue.increment(5),
      lifetimeBought: FieldValue.increment(5),
    }, { merge: true });
    t.set(db.collection(`users/${uid}/transactions`).doc(), {
      type: 'ad_reward', amount: 5, source: 'admob',
      adUnitId: req.query.ad_unit, ts: FieldValue.serverTimestamp(),
    });
  });

  res.status(200).send('ok');
});
```

### Hidden BrowserWindow in main.js
```js
ipcMain.handle('ad:show', async (event, adUnitId, uid) => {
  return new Promise((resolve) => {
    const adWindow = new BrowserWindow({
      width: 480, height: 720,
      show: true,                    // must be visible (Google ToS)
      parent: mainWindow, modal: true,
      webPreferences: { contextIsolation: true },
    });
    adWindow.loadURL(`file://${__dirname}/src/ad-player.html?unit=${adUnitId}&uid=${uid}`);
    adWindow.on('closed', () => resolve({ completed: true }));
  });
});
```

### AdMob setup (one-time, manual)
1. Apply at https://apps.admob.com (requires ID verification)
2. Create ad unit (Rewarded Video) → copy `adUnitId` (`ca-app-pub-XXXX/YYYY`)
3. Set SSV callback: `https://us-central1-beetle-studio.cloudfunctions.net/admobSsv`
4. Generate SSV secret → save as `ADMOB_SSV_SECRET` in Cloud Function env

---

## 9. Native optimizer ops (PowerShell)

### Pattern: spawn PowerShell from main.js

```js
const { spawn } = require('child_process');
const path = require('path');

function runPowerShell(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'scripts', scriptName),
      ...args,
    ], { windowsHide: true });

    let stdout = '', stderr = '';
    ps.stdout.on('data', d => stdout += d);
    ps.stderr.on('data', d => stderr += d);
    ps.on('close', code => {
      if (code !== 0) return reject(new Error(`PS exit ${code}: ${stderr}`));
      try { resolve(JSON.parse(stdout)); } catch { resolve({ raw: stdout }); }
    });
  });
}

ipcMain.handle('optimizer:runMemory', async () => {
  return runPowerShell('optimize-memory.ps1');
});
```

### Scripts to add
```
scripts/
├─ telemetry.ps1                    ✅ exists
├─ optimize-memory.ps1              NEW — RAM trim via NtSetSystemInformation
├─ optimize-cleanup.ps1             NEW — temp/recycle/thumbs/logs/WU
├─ optimize-registry.ps1            NEW — registry cleanup
├─ optimize-startup.ps1             NEW — startup items list
├─ optimize-defrag.ps1              NEW — SSD-aware defrag
├─ optimize-gpu-shader.ps1          NEW — GPU shader cache clear
└─ optimize-boost.ps1               NEW — orchestrator: runs all 5
```

### `optimize-memory.ps1` (skeleton)
```powershell
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class N {
  [DllImport("ntdll.dll")] public static extern uint NtSetSystemInformation(int c, IntPtr p, int l);
}
"@
# ...
# Build SYSTEM_MEMORY_LIST_INFORMATION command buffer, call NtSetSystemInformation
# See Windows Internals for the layout; this is the same call Auslogics uses
```

### Why not port `BeetleOptimiser.Core.dll`?
- 90% of those calls are P/Invoke into `ntdll.dll` — PowerShell + Add-Type does the same thing
- PowerShell works without extra dependencies, can be updated without recompiling the EXE
- Saves 2 weeks of porting effort
- Single source of truth: WPF can also call the same `.ps1` scripts in a future v2

---

## 10. Auth + security

### Auth providers
- Google (already wired)
- GitHub (already wired)
- Email magic link (fallback if Google blocks the Electron UA)
  ```js
  import { sendSignInLinkToEmail } from 'firebase/auth';
  await sendSignInLinkToEmail(auth, email, { url: 'beetleoptimiser://auth', handleCodeInApp: true });
  ```

### App Check (mandatory for production)
- Provider: **reCAPTCHA Enterprise** (free up to 100K verifications/mo)
- Without App Check: anyone with your Firebase config can spam your Cloud Functions

```js
// src/lib/firebase.js
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
const appCheck = initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaEnterpriseProvider(process.env.REACT_APP_RECAPTCHA_KEY),
  isTokenAutoRefreshEnabled: true,
});
```

**Caveat**: App Check on Electron requires a debug token in dev (which prints a warning). For production builds you need to register a reCAPTCHA site key bound to your domain (or use DeviceCheck on macOS). Workaround: **use App Check in enforcement mode only for high-cost Cloud Functions (askQuestion, spendTokens), not for cheap reads.**

### Firestore Security Rules (lock down everything)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    // Helper: signed in + App Check passed
    function authed() {
      return request.auth != null
          && request.auth.token.app_check == true;
    }

    match /users/{uid} {
      allow read: if authed() && request.auth.uid == uid;
      allow write: if false;  // only Cloud Functions

      match /wallet/main {
        allow read: if authed() && request.auth.uid == uid;
        allow write: if false;
      }
      match /transactions/{tx} {
        allow read: if authed() && request.auth.uid == uid;
        allow write: if false;
      }
      match /questions/{q} {
        allow read: if authed() && request.auth.uid == uid;
        allow write: if false;  // Cloud Functions write on completion
      }
      match /dailyLimits/{day} {
        allow read: if authed() && request.auth.uid == uid;
        allow write: if false;
      }
    }

    match /articles/{slug} {
      allow read: if authed();
      allow write: if false;
    }
  }
}
```

---

## 11. Code signing + auto-update

### Code signing
- Buy cert: **Certum Open Source** ($25/yr, for OSS) or **SignTool** ($70/yr)
- Subject: `CN=MOONED DEV STUDIO`
- electron-builder `win.certificateFile` config
- Without signing: SmartScreen warning (1 extra click for users)
- With signing: clean install

### Auto-update via GitHub Releases
- `electron-updater` (built into `electron-builder`)
- New release → user gets a "Update available" toast → clicks → restarts → done
- Required for security patches

```js
// main.js
const { autoUpdater } = require('electron-updater');
autoUpdater.checkForUpdatesAndNotify();
```

```json
// package.json
"build": {
  "publish": [{
    "provider": "github",
    "owner": "mooned-dev",
    "repo": "BeetleOptimiser"
  }]
}
```

---

## 12. Phase-by-phase roadmap

| Phase | Days | Deliverable |
|---|---|---|
| **1. IPC bridge + telemetry** | 2 | All native ops reachable; status bar live |
| **2. Wire optimizer buttons** | 2 | Every tab triggers real action via IPC |
| **3. Firebase hardening** | 1 | Blaze + App Check + rules + reCAPTCHA key |
| **4. Stripe + token economy** | 3 | Buy / Pro subscription / auto-renew |
| **5a. RAG article corpus** | 1.5 | 50 articles written, embedded, indexed |
| **5b. Ask a Question (LLM)** | 2.5 | Streaming LLM answers in AskQuestionView |
| **6. AdMob rewarded video** | 1.5 | Free-token faucet with daily caps |
| **7. Polish + ship** | 3 | Code-signed portable `.exe` + auto-updater |
| **TOTAL** | **16.5 days** | **Ship v1.0 paid SaaS** |

### Phase 1 detail (IPC + telemetry)
- [ ] Expand `src/preload.js`: expose `optimizer.*`, `system.*`, `store.*`, `updater.*`
- [ ] Implement `getTelemetry` in main.js: spawn `scripts/telemetry.ps1` once, parse JSON lines, stream via IPC
- [ ] Implement 8 optimizer IPC handlers
- [ ] Wire `useTelemetry.js` hook → `StatusBar.jsx` polls every 2s
- [ ] **Verify**: status bar shows live CPU/RAM changing

### Phase 2 detail (wire buttons)
- [ ] Each tab's "Run" buttons call `window.beetleAPI.optimizer.runX()`
- [ ] Add `ConfirmSpendModal.jsx` — "This will cost N tokens. Continue?"
- [ ] Add `useTokens.js` hook with optimistic update + rollback
- [ ] **Verify**: scan triggers PowerShell, results stream back, tokens decrement

### Phase 3 detail (Firebase hardening)
- [ ] Upgrade `beetle-studio` to Blaze plan
- [ ] Set budget alert at $25
- [ ] Enable reCAPTCHA Enterprise → create site key
- [ ] Add App Check to `src/lib/firebase.js`
- [ ] Deploy Firestore rules from `firebase/firestore.rules`
- [ ] **Verify**: external request to Firestore without App Check → rejected

### Phase 4 detail (Stripe)
- [ ] Create Stripe account, products, prices
- [ ] Create Cloud Functions: `createCheckoutSession`, `stripeWebhook`, `createPortalSession`
- [ ] Add Stripe npm dep to main process
- [ ] `BuyTokensModal.jsx` with 3 tiers + Lifetime CTA
- [ ] Test with `4242 4242 4242 4242` test card
- [ ] Switch to live Stripe keys
- [ ] **Verify**: end-to-end test card → tokens arrive within 5s

### Phase 5a detail (RAG articles)
- [ ] Write 50 short articles (~500 words each) covering: startup, RAM, disk cleanup, registry, browser, drivers, Windows updates, common errors, performance myths
- [ ] `scripts/seed-rag.js` chunks each article into 500-token chunks, embeds with Workers AI, upserts to Vectorize + writes to `/articles`
- [ ] **Verify**: query "speed up startup" returns relevant chunks in test

### Phase 5b detail (Ask a Question)
- [ ] Cloud Function `askQuestion` with RAG + streaming
- [ ] `useAskQuestion.js` hook reads streamed response into state
- [ ] `AskQuestionView.jsx` rewrites to: input box at bottom, streamed markdown answer, history sidebar
- [ ] Token gate + daily limit enforcement
- [ ] **Verify**: ask a question, get a streamed answer with proper citations to /articles

### Phase 6 detail (AdMob)
- [ ] Apply for AdMob, create rewarded ad unit
- [ ] `src/ad-player.html` + AdSense web SDK
- [ ] Hidden BrowserWindow in main.js
- [ ] Cloud Function `admobSsv` with signature verification
- [ ] `AdRewardModal.jsx` with "Watch ad for +5 tokens" button
- [ ] Daily cap enforcement
- [ ] **Verify**: real ad plays, SSV callback fires, wallet updates

### Phase 7 detail (polish + ship)
- [ ] Add `favicon.ico` to `index.html`
- [ ] Buy code signing cert, configure electron-builder
- [ ] Add `electron-updater` + GitHub Release workflow
- [ ] Write README.md with screenshots + install steps
- [ ] Test on Win 10 + 11 clean VM
- [ ] Tag v1.0.0 → GitHub Actions builds + signs + uploads
- [ ] **Verify**: fresh Win 11 install → download → run → no SmartScreen warning → all features work

---

## 13. File-by-file changes

### New files
```
src/
  ad-player.html                              (AdMob player)
  hooks/
    useTelemetry.js                           (2s polling)
    useTokens.js                              (spend/buy optimistic)
    useAskQuestion.js                         (streaming LLM)
  components/
    BuyTokensModal.jsx
    ConfirmSpendModal.jsx
    AdRewardModal.jsx
    PricingCards.jsx
    SpendingBreakdown.jsx                     (token usage chart in Settings)
  preload.js                                  ← REWRITE (full API)
  lib/
    stripe.js                                 (main-side only)

scripts/
  optimize-memory.ps1
  optimize-cleanup.ps1
  optimize-registry.ps1
  optimize-startup.ps1
  optimize-defrag.ps1
  optimize-gpu-shader.ps1
  optimize-boost.ps1

firebase/
  functions/
    package.json
    tsconfig.json
    src/
      index.ts                                (all Cloud Functions)
      stripe.ts                               (Stripe init + helpers)
      llm.ts                                  (Workers AI wrapper)
      rag.ts                                  (Vectorize wrapper)
      admob-ssv.ts                            (signature verify)
    seed-rag.ts                               (one-off RAG seeding)
  firestore.rules
  firestore.indexes.json
  .firebaserc

.github/
  workflows/
    release.yml                               (build + sign + release on tag)
```

### Modified files
```
package.json                  ← add electron-store, electron-updater, stripe (main only)
src/main.js                   ← REWRITE: IPC + telemetry + ad-window + deep-link
src/lib/firebase.js           ← add Functions, App Check, Analytics
src/hooks/useAuth.js          ← add token/plan live updates (already there)
src/components/StatusBar.jsx  ← wire to useTelemetry
src/components/TitleBar.jsx   ← admin badge (from WPF parity)
src/components/shared/AccountMenu.jsx  ← add "Buy tokens" + "Manage subscription"
src/components/TabBar.jsx     ← (no change unless adding badge)
src/components/tabs/*.jsx     ← wire onClick to IPC + token check
README.md                     ← full Electron-specific docs
```

---

## 14. Cost & revenue rollup (1,000 MAU steady state)

### Revenue
| Source | Calculation | Monthly |
|---|---|---|
| Pro Monthly subs | 100 × $6.99 | $699 |
| Pro Lifetime (amortized) | assume 20/yr × $49.99 ÷ 12 | $83 |
| Starter one-time | assume 50/yr × $2.99 ÷ 12 | $12 |
| AdMob | 480 views/day × $0.015 × 30 | $216 |
| **Total revenue** | | **$1,010/mo** |

(The "200 paying × $6.99" earlier assumed everyone was Pro Monthly. Real mix is more conservative.)

### Costs
| Item | Monthly |
|---|---|
| Stripe fees (2.9% + 30¢ on $699/mo subs) | $100 |
| Firebase Blaze (Firestore 100K reads + 100K writes + 5M function invocations) | $5 |
| Workers AI (Llama 3.1 8B, ~24M tokens/mo) | $1 |
| Vectorize (over free tier) | $1 |
| Cloudflare Workers invocations (RAG lookup) | $1 |
| Domain (beetle.studio) | $1 |
| Code signing cert (amortized $70/yr) | $6 |
| **Total cost** | **~$115/mo** |

### Margin
```
$1,010 revenue – $115 cost = $895/mo net
At 5,000 MAU: ~$4,500/mo net
At 10,000 MAU: ~$9,000/mo net (assuming same conversion rate)
```

---

## 15. Scaling beyond 1,000 MAU

| MAU | Bottleneck | Mitigation |
|---|---|---|
| 1,000 | none — fits free tier + Blaze | ship v1 |
| 5,000 | Firestore reads/writes climb | enable D1 cache for `/articles`, Cloud Function min-instances=1 |
| 10,000 | LLM token cost grows | switch to OpenAI gpt-4o-mini via AI Gateway (similar price, better DX) |
| 25,000 | Stripe webhook latency | dedicated IP, idempotency keys |
| 50,000 | Need monitoring | Sentry, Cloudflare Analytics, support inbox |
| 100,000+ | Real company | hire, segment, raise |

---

## 16. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Google OAuth breaks in Electron | Med | High | Fallback: email magic link |
| Stripe rejects the account | Low | High | Real product, real test mode, ToS-compliant |
| Workers AI rate limit during traffic spike | Low | Med | OpenAI fallback via AI Gateway |
| User pays but tokens don't appear | Med | High | Stripe webhook idempotency + daily reconciliation cron |
| Free users farm tokens (multi-account) | Med | Med | App Check + daily caps + transaction audit |
| AdMob account banned for invalid traffic | Med | High | Real visible ads, no auto-click, 60s minimum between ads |
| Code signing cert expires | Low | Med | Calendar reminder, renew 30 days early |
| PowerShell blocked by antivirus | High | Med | README: first-run allow prompt; use signed scripts |
| App Check enforcement breaks dev builds | Med | Med | Use `isTokenAutoRefreshEnabled` + debug token in dev only |
| LLM hallucinates dangerous registry edits | Med | High | Strict system prompt: "recommend actions, never claim to execute them; always link to docs" |
| Stripe webhook signature secret leaks | Low | Critical | Rotate via Stripe dashboard; never commit to repo |

---

## 17. Verification checklist before declaring done

Use this **after Phase 7** before tagging v1.0.0:

- [ ] Fresh Win 11 VM, no dev tools installed
- [ ] Download `BeetleOptimiser-Setup-1.0.0.exe` from GitHub Release
- [ ] Double-click → no SmartScreen warning (code signed)
- [ ] App opens to Dashboard tab
- [ ] Status bar shows live CPU/RAM values that change
- [ ] Sign in with Google → account avatar appears in title bar
- [ ] Buy 200 tokens (test card `4242 4242 4242 4242`)
- [ ] Tokens appear in wallet within 5s
- [ ] Run "Deep Disk Scan" → confirmation modal "Will cost 25 tokens" → confirm → scan runs → tokens decrement
- [ ] Ask a Question → streaming answer appears within 3s
- [ ] Watch ad → +5 tokens (test with real AdMob test ad unit)
- [ ] Cancel Pro Monthly subscription from Customer Portal → plan drops to Free within 1 day
- [ ] Force-quit + relaunch → auth persists, wallet persists
- [ ] Check release on second PC → auto-updater detects v1.0.1 → prompts to update
- [ ] Sentry (if installed) shows no crashes during 10-minute smoke test
- [ ] `npm audit` → no high-severity vulns
- [ ] electron-builder portable build = ~85 MB (acceptable)
- [ ] All Phases 1–7 deliverables in repo

If all ✅ → tag `v1.0.0` and ship.

---

## Appendix A: Critical environment variables

```
# .env.local (renderer; prefix with VITE_ for Vite)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=beetle-studio
VITE_RECAPTCHA_KEY=...

# .env (main process; loaded by electron from disk, never committed)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_LIFETIME=price_...
ADMOB_SSV_SECRET=...
```

## Appendix B: Why Electron + PowerShell (not pure native)

| | Electron + PS | Pure native (Rust/C++) |
|---|---|---|
| Build time | 16 days | 60+ days |
| Binary size | 85 MB | 15 MB |
| Hot-fix shipping | edit .ps1, push update | rebuild + sign + release |
| Same code as WPF? | ✅ (calls same APIs) | ❌ |
| Cross-platform later | easy (mac/linux PS Core) | separate codebases |

**Verdict**: Electron + PowerShell wins for shipping in 3 weeks.

---

**END OF PLAN**