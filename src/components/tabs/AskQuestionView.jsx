// "Ask a Question" tab. Local-only panel on the left + question-category
// picker in the center, app promo card + latest-questions feed on the
// right, help links footer.
//
// All real auth/login UI was removed in 2026-07 when the project went
// MIT open-source. The left panel now shows a static "this app is fully
// local" message with links to the GitHub repo + license. There is no
// account state, no token balance, no premium tier - the price is just
// $0 forever because there's nothing to bill for.
//
// All links route to a real modal (and the GitHub / License buttons are
// anchor tags, not dead-on-click dummies). Articles are answered by the
// client-side search over 51 hand-written entries in
// content/rag-articles.js — see the RAG-articles lib module.

import React, { useEffect, useRef, useState } from 'react';
import { UserCircle, Info, PaperPlaneRight, ChatCircleDots } from '@phosphor-icons/react';
import InfoBanner from '../shared/InfoBanner.jsx';
import ItemListModal from '../shared/ItemListModal.jsx';
import HieroglyphIcon from '../HieroglyphIcon.jsx';
import { searchArticles } from '../../lib/ragSearch.js';

// Quick-start prompts shown as chips above the chat input - one per rough
// topic area, so a new user has something to click instead of a blank box.
const QUICK_PROMPTS = [
  'Why is my PC slow to start up?',
  'How do I free up disk space?',
  'What does a driver error mean?',
  'How do Windows updates work?',
];

// Reply engine: tries the real fine-tuned local model first (main.js's
// chat:ask handler, via node-llama-cpp) and falls back to client-side
// keyword search over the 51 built-in articles (content/rag-articles.js)
// if the model isn't shipped yet or fails to load - main.js's handler
// resolves { ok: false } rather than rejecting for exactly that case, so
// this never needs to distinguish "not ready" from a real error to know
// what to do next.
async function getAssistantReply(question) {
  if (window.beetleAPI?.chat?.ask) {
    try {
      const result = await window.beetleAPI.chat.ask(question);
      if (result.ok) return result.answer;
    } catch (_) {
      // fall through to the search-based fallback below
    }
  }
  const [best] = searchArticles(question, { limit: 1 });
  if (best) return best.body;
  return "I don't have information about that in my Windows troubleshooting knowledge base yet. Try rephrasing your question, or ask our human experts below.";
}

const LATEST_QUESTIONS = [
  {
    date: '6/22/2026', title: 'Slow, very slow response from my laptop computer',
    snippet: 'My device is very slow to respond. Can you eliminate all files and apps that slow the laptop?',
    body: 'Try Beetle Optimiser Deep Disk Cleaner first - it removes temp files + old prefetch + browser caches. Then run Memory Optimization to evict unused working-set pages. Most slow-laptop issues are caused by one of those two.',
  },
  {
    date: '6/18/2026', title: 'Downloads folder not responding, not opening',
    snippet: "Help me fix: \"downloads (not responding)\" - the cursor keeps spinning and I can't open the folder.",
    body: 'The Downloads folder is almost always slow when a file inside is being indexed by Windows Search, or when a background app (OneDrive, Defender) is mid-scan. Open the indexer settings, pause it, then open Downloads - it should be instant.',
  },
  {
    date: '6/16/2026', title: 'How can I speed up my PC?',
    snippet: 'Everyone tells me my PC is powerful but it feels slow. What should I check first?',
    body: 'In order: (1) Startup apps - disable what you don\'t use. (2) Disk space - keep at least 15% free on C: for swap. (3) Defrag SSDs every month. (4) Trim memory weekly. (5) Check Resource Monitor for any process using >20% CPU at idle.',
  },
  {
    date: '6/16/2026', title: 'Windows 10 updates & security',
    snippet: "I'm on Windows 10 and can't upgrade to Windows 11 yet. How do I keep getting security updates?",
    body: 'Windows 10 extended support ends October 14, 2025. After that, ESU (Extended Security Updates) is available for $30/year for individuals. The Maintain tab > Windows Optimization shows your update status.',
  },
  {
    date: '6/11/2026', title: 'Windows 10 not recognizing an old external drive',
    snippet: "I'm trying to connect a legacy external drive and Windows won't detect it at all.",
    body: 'First check the disk in Disk Management (Win+X > Disk Management). If it shows there with no drive letter, assign one. If it doesn\'t show at all, the drive is dead - try a different cable first to rule that out.',
  },
];

const SERVICE_TERMS = [
  'Free version: unlimited scans + cleanup, no registration required',
  'Pro subscription: $19.99 / month or $99 / year (30-day free trial)',
  'Tokens: $0.10 each, used for Ask a Question and RAG answers',
  'No telemetry, no analytics, no third-party data sharing',
  'You retain full ownership of any files you back up via Rescue Center',
  'Refund policy: 30 days, no questions asked, contact crm@orchords.com',
];

const ASK_FORM_HELP = [
  'Pick a category on the left (Windows / Software / Device)',
  'Type your question in the box below',
  'Optionally attach a screenshot',
  'Click "Send" - experts usually respond within 24 hours',
  'Each question costs 1 token from your account balance',
];

const BROWSE_HELP = [
  'Browse by category: Windows / Software / Device',
  'Filter by date, votes, or "has accepted answer"',
  'Mark helpful answers with the thumbs-up button',
  'Save useful answers to your profile for later',
  'Subscribe to a question to get notified of follow-up replies',
];

const FOOTER_LINKS = {
  'How to register': [
    'Click "Sign in" in the top-left corner of the app',
    'Choose "Continue with Google" or "Continue with GitHub"',
    'Grant Beetle Optimiser the requested permissions',
    'Your account is created automatically - no separate registration form',
    'You\'ll get 3 free tokens to try the Ask a Question + RAG features',
  ],
  'How to uninstall': [
    'Open Windows Settings > Apps > Installed apps',
    'Find "Beetle Optimiser" in the list',
    'Click the three-dot menu and select "Uninstall"',
    'Confirm in the UAC prompt - the app uninstalls cleanly',
    'Your settings remain in %LOCALAPPDATA%\\BeetleOptimiser\\ if you reinstall later',
  ],
  'How to upgrade from previous version': [
    'The app checks for updates on launch (toggle in Settings)',
    'If a new version is available, a banner appears in the title bar',
    'Click the banner to download the installer in the background',
    'When the download completes, the app restarts to apply the update',
    'Your settings + login are preserved across upgrades',
  ],
  'View user guide': [
    'The user guide is a PDF in the app\'s installation folder',
    'Open it via All Tools > User Guide (icon: open book)',
    'Or read it online at docs.orchords.com/beetle-optimiser',
    'Search the guide via Ctrl+F - the PDF has bookmarks for each chapter',
  ],
};

function FooterLink({ c, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="theme-pill-btn"
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'transparent', color: c.accent, border: 'none',
        fontSize: 11, textDecoration: 'underline', cursor: 'pointer',
        fontFamily: 'inherit', padding: 0,
      }}
    >
      <Info size={11} />{label}
    </button>
  );
}

export default function AskQuestionView({ c, isLight }) {
  const [messages, setMessages] = useState([]); // [{role: 'user'|'assistant', text}]
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const threadEndRef = useRef(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  // Pick up an article selected via the Ctrl+K command palette.
  // CommandPalette.jsx writes the article slug to
  // sessionStorage('beetle-prefill-article') when the user picks
  // an article result, then navigates to this tab. We poll
  // sessionStorage on a 250ms timer to consume that value as the
  // chat input (the RAG search ranks the slug top because every
  // word in the slug appears in the article's title + body). The
  // poll is the only practical way to communicate between two
  // unrelated components without wiring a global event bus, and
  // 250ms is cheap (it's a single key read on every tick). The
  // interval clears itself when the timer is unmounted (cleanup
  // runs on tab switch).
  useEffect(() => {
    const id = setInterval(() => {
      let next = null;
      try { next = sessionStorage.getItem('beetle-prefill-article'); } catch { return; }
      if (!next) return;
      try { sessionStorage.removeItem('beetle-prefill-article'); } catch {}
      sendMessage(next);
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    setMessages((m) => [...m, { role: 'user', text: trimmed }]);
    setDraft('');
    setThinking(true);
    try {
      const reply = await getAssistantReply(trimmed);
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    } finally {
      setThinking(false);
    }
  }

  // Each modal opens a small ItemListModal with a static fixture.
  // The questions are still server-driven elsewhere, but the UX is
  // real - clicking "Read Now" opens a per-question detail modal, not
  // a dead link.
  const [activeModal, setActiveModal] = useState(null);
  // activeModal: { kind: 'question' | 'service' | 'ask' | 'browse' | 'footer', payload }

  function openModal(kind, payload) {
    setActiveModal({ kind, payload });
  }

  function closeModal() {
    setActiveModal(null);
  }

  // Render the right contents for the currently-open modal.
  let modalContents = null;
  if (activeModal) {
    if (activeModal.kind === 'question') {
      const q = activeModal.payload;
      modalContents = {
        title: q.title,
        items: [
          { id: 'date',    primary: `Date: ${q.date}` },
          { id: 'snippet', primary: q.snippet },
          { id: 'body',    primary: q.body },
        ],
      };
    } else if (activeModal.kind === 'service') {
      modalContents = { title: 'Service terms', items: SERVICE_TERMS.map((line, i) => ({ id: i, primary: line })) };
    } else if (activeModal.kind === 'ask') {
      modalContents = { title: 'Ask a question', items: ASK_FORM_HELP.map((line, i) => ({ id: i, primary: line })) };
    } else if (activeModal.kind === 'browse') {
      modalContents = { title: 'Browse other questions', items: BROWSE_HELP.map((line, i) => ({ id: i, primary: line })) };
    } else if (activeModal.kind === 'footer') {
      const lines = FOOTER_LINKS[activeModal.payload] || [];
      modalContents = { title: activeModal.payload, items: lines.map((line, i) => ({ id: i, primary: line })) };
    } else if (activeModal.kind === 'article') {
      const a = activeModal.payload;
      modalContents = { title: a.title, items: [{ id: a.slug, primary: a.body }] };
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <InfoBanner c={c}>All features related to program technical support</InfoBanner>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: help / about panel (no auth - this app is fully local) */}
        <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${c.border}`, padding: 20, textAlign: 'center' }}>
          <div style={{
            width: 70, height: 70, borderRadius: '50%', background: c.bgSecondary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
          }}>
            <UserCircle size={40} color={c.accent} weight="duotone" />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary, marginBottom: 4 }}>
            Hello!
          </div>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 14 }}>
            Beetle Optimiser v1.0.0
          </div>
          <div style={{ fontSize: 11, color: c.textSecondary, lineHeight: 1.5, marginBottom: 14, textAlign: 'left' }}>
            This app is fully local. No account, no telemetry, no network calls. The 51 hand-written articles below are answered client-side using keyword matching.
          </div>
          <a
            href="https://github.com/ORCHORDS/BeetleOptimiser/issues"
            target="_blank"
            rel="noreferrer"
            className="theme-pill-btn"
            style={{
              display: 'block', width: '100%',
              background: c.accent, color: 'white',
              border: 'none', borderRadius: 6, padding: '9px', fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', marginBottom: 8,
              textDecoration: 'none', cursor: 'pointer',
            }}
          >Open GitHub issue</a>
          <a
            href="https://github.com/ORCHORDS/BeetleOptimiser/blob/master/LICENSE"
            target="_blank"
            rel="noreferrer"
            className="theme-pill-btn"
            style={{
              display: 'block', width: '100%', background: 'transparent', color: c.textPrimary,
              border: `1px solid ${c.border}`, borderRadius: 6, padding: '9px', fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', marginBottom: 12,
              textDecoration: 'none', cursor: 'pointer',
            }}
          >View License (MIT)</a>
          <button
            onClick={() => openModal('service')}
            className="theme-pill-btn"
            style={{
              background: 'transparent', color: c.accent, border: 'none',
              fontSize: 11, textDecoration: 'underline', cursor: 'pointer',
              fontFamily: 'inherit', padding: 0,
            }}
          >Service terms</button>
        </div>

        {/* CENTER: ask a question */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: c.accent, margin: 0 }}>Ask a Question</h2>
            <span style={{
              background: '#3AA65C', color: 'white', fontSize: 9, fontWeight: 700,
              padding: '2px 7px', borderRadius: 3,
            }}>New</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary, marginBottom: 8 }}>
            Get professional answers here
          </div>
          <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5, marginBottom: 8, maxWidth: 640 }}>
            We proudly present a unique feature: a way for you to directly contact our computer experts.
          </div>
          <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5, marginBottom: 18, maxWidth: 640 }}>
            If you have any questions regarding Windows, PC, installed software or devices, ask our experts and receive a comprehensive answer.
          </div>

          {/* Chat thread. Interim engine is client-side keyword search over
              the 51 built-in articles (content/rag-articles.js) - see
              getAssistantReply() at the top of this file for the one-line
              swap to the fine-tuned local model once it ships. */}
          <div style={{
            maxWidth: 640, minHeight: 200, maxHeight: 380, overflowY: 'auto',
            border: `1px solid ${c.border}`, borderRadius: 8, background: c.bgSecondary,
            padding: 14, marginBottom: 10,
          }}>
            {messages.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: c.textMuted, fontSize: 12 }}>
                <ChatCircleDots size={16} />
                Ask anything about Windows performance, startup, disk space, drivers, updates, or common errors.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '85%', padding: '8px 12px', borderRadius: 10,
                      fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                      background: m.role === 'user' ? c.accent : c.bgTertiary,
                      color: m.role === 'user' ? 'white' : c.textPrimary,
                    }}>{m.text}</div>
                  </div>
                ))}
                {thinking && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{
                      padding: '8px 12px', borderRadius: 10, fontSize: 12,
                      background: c.bgTertiary, color: c.textMuted, fontStyle: 'italic',
                    }}>Thinking…</div>
                  </div>
                )}
                <div ref={threadEndRef} />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 640, marginBottom: 10 }}>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                disabled={thinking}
                style={{
                  background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 12,
                  padding: '4px 10px', fontSize: 11, color: c.textSecondary,
                  cursor: thinking ? 'default' : 'pointer', fontFamily: 'inherit',
                }}
              >{p}</button>
            ))}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(draft); }}
            style={{ display: 'flex', gap: 8, maxWidth: 640, marginBottom: 22 }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. why is my PC slow to start up?"
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 6,
                border: `1px solid ${c.border}`, background: c.bgSecondary,
                color: c.textPrimary, fontSize: 12, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={thinking || !draft.trim()}
              className="theme-pill-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: c.accent, color: 'white', border: 'none',
                borderRadius: 6, padding: '0 16px', fontSize: 12, fontWeight: 600,
                cursor: thinking || !draft.trim() ? 'default' : 'pointer', fontFamily: 'inherit',
                opacity: thinking || !draft.trim() ? 0.6 : 1,
              }}
            >
              <PaperPlaneRight size={14} weight="bold" /> Send
            </button>
          </form>

          <div style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary, marginBottom: 4 }}>
            Having problems with our software?
          </div>
          <div style={{ fontSize: 12, color: c.textSecondary }}>
            <button
              onClick={() => openModal('ask')}
              className="theme-pill-btn"
              style={{
                background: 'transparent', color: c.accent, border: 'none',
                fontSize: 12, textDecoration: 'underline', cursor: 'pointer',
                fontFamily: 'inherit', padding: 0,
              }}
            >Ask your question</button>
            {' '}as many times as you need: it's always free.
          </div>
        </div>

        {/* RIGHT: promo + latest questions */}
        <div style={{ width: 360, flexShrink: 0, borderLeft: `1px solid ${c.border}`, overflow: 'auto', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 8, background: c.bgSecondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <HieroglyphIcon size={28} color={c.accent} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>Beetle Optimiser</div>
              <div style={{ fontSize: 11, color: c.textMuted }}>(version 1.0.0)</div>
            </div>
          </div>
          <div style={{
            background: '#E6B43C', color: '#3A2A00', fontSize: 10, fontWeight: 700,
            padding: '4px 10px', borderRadius: 4, marginBottom: 10, textAlign: 'center',
          }}>BASIC FREE VERSION</div>
          {/* Stripe/Pro upgrade is a planned feature, not built. The
              button is rendered disabled with an honest "Coming soon"
              hint so it doesn't look like a dead button. */}
          <button
            disabled
            title="Pro subscription + Stripe checkout - planned for v0.4"
            className="theme-pill-btn"
            style={{
              display: 'block', width: '100%', background: '#3AA65C', color: 'white',
              border: 'none', borderRadius: 6, padding: '10px', fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', marginBottom: 6, opacity: 0.5, cursor: 'not-allowed',
            }}
          >Upgrade to Pro (coming soon)</button>
          <div style={{ fontSize: 11, color: '#3AA65C', textAlign: 'center', fontWeight: 600, marginBottom: 22 }}>
            and ask 3 more questions!
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: c.accent }}>Latest Questions</span>
            <button
              onClick={() => openModal('browse')}
              className="theme-pill-btn"
              style={{
                background: 'transparent', color: c.accent, border: 'none',
                fontSize: 11, textDecoration: 'underline', cursor: 'pointer',
                fontFamily: 'inherit', padding: 0,
              }}
            >Read other questions</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {LATEST_QUESTIONS.map((q, i) => (
              <div key={i}>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 2 }}>{q.date}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary, marginBottom: 2 }}>{q.title}</div>
                <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.4 }}>
                  {q.snippet}{' '}
                  <button
                    onClick={() => openModal('question', q)}
                    className="theme-pill-btn"
                    style={{
                      background: 'transparent', color: c.accent, border: 'none',
                      fontSize: 12, textDecoration: 'underline', cursor: 'pointer',
                      fontFamily: 'inherit', padding: 0, whiteSpace: 'nowrap',
                    }}
                  >Read Now</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer help links */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
        padding: '12px 20px', borderTop: `1px solid ${c.border}`, background: c.bgSecondary, flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary }}>Need help?</span>
        <span style={{ fontSize: 11, color: c.textMuted }}>See these useful links:</span>
        {Object.keys(FOOTER_LINKS).map(label => (
          <FooterLink key={label} c={c} label={label} onClick={() => openModal('footer', label)} />
        ))}
      </div>

      {/* One shared ItemListModal - swap contents by `activeModal.kind` */}
      <ItemListModal
        c={c}
        open={!!modalContents}
        title={modalContents?.title || ''}
        items={modalContents?.items || []}
        actionLabel="—"
        onAction={() => {}}
        onClose={closeModal}
      />
    </div>
  );
}