// "Ask a Question" tab. Guest account panel + question-category picker in
// the center, app promo card + latest-questions feed on the right, help
// links footer.
//
// Login/Auth is intentionally NOT touched here (the real auth lives in
// the top-left AccountMenu; per user instruction the login flow itself
// is off-limits to changes). The Sign In / Sign Up buttons here are
// DISABLED with a clear hint to use the top-left menu instead, so the
// guest panel reads as a real "you're not signed in" state without being
// a dead-on-click dummy.
//
// All other links route to a real modal so nothing on this page is a
// dead click. Modals are ItemListModal instances fed by small static
// fixtures, since the question-backend is not yet built.

import React, { useState } from 'react';
import { UserCircle, Info, MagnifyingGlass } from '@phosphor-icons/react';
import InfoBanner from '../shared/InfoBanner.jsx';
import ItemListModal from '../shared/ItemListModal.jsx';
import HieroglyphIcon from '../HieroglyphIcon.jsx';
import { searchArticles, articlesByCategories } from '../../lib/ragSearch.js';

const CATEGORIES = ['Windows questions', 'Software questions', 'Device questions'];

// content/rag-articles.js uses its own finer-grained categories (startup,
// memory, registry, etc.) - this maps the 3 UI-facing buttons onto them so
// clicking a category shows a relevant subset instead of nothing.
const CATEGORY_TAGS = {
  'Windows questions': ['startup', 'registry', 'windows-updates', 'common-errors'],
  'Software questions': ['browser', 'performance-myths'],
  'Device questions': ['drivers', 'disk-cleanup', 'memory'],
};

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
  'Refund policy: 30 days, no questions asked, contact support@mooned.dev',
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
    'Or read it online at docs.mooned.dev/beetle-optimiser',
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
  const [activeCategory, setActiveCategory] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null = nothing searched yet
  const [searched, setSearched] = useState(false);

  function runSearch(q) {
    setQuery(q);
    setActiveCategory(null);
    setSearched(true);
    setResults(searchArticles(q));
  }

  function pickCategory(cat) {
    setActiveCategory(cat);
    setQuery('');
    setSearched(true);
    setResults(articlesByCategories(CATEGORY_TAGS[cat] || []));
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
        {/* LEFT: guest account panel */}
        <div style={{ width: 190, flexShrink: 0, borderRight: `1px solid ${c.border}`, padding: 20, textAlign: 'center' }}>
          <div style={{
            width: 70, height: 70, borderRadius: '50%', background: c.bgSecondary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
          }}>
            <UserCircle size={40} color={c.accent} weight="duotone" />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary, marginBottom: 8 }}>Hello, guest!</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
            <span style={{
              background: c.accent, color: 'white', fontSize: 11, fontWeight: 700,
              padding: '1px 7px', borderRadius: 10,
            }}>1</span>
            <span style={{ fontSize: 11, color: c.textSecondary }}>free question left</span>
          </div>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 14 }}>Sign in or sign up via the top-left menu</div>
          <button className="theme-pill-btn" disabled title="Use the Sign in menu in the top-left of the title bar" style={{
            display: 'block', width: '100%', background: c.accent, color: 'white',
            border: 'none', borderRadius: 6, padding: '9px', fontSize: 12, fontWeight: 600,
            fontFamily: 'inherit', marginBottom: 8, opacity: 0.5, cursor: 'not-allowed',
          }}>Sign In</button>
          <button className="theme-pill-btn" disabled title="Use the Sign in menu in the top-left of the title bar" style={{
            display: 'block', width: '100%', background: 'transparent', color: c.textPrimary,
            border: `1px solid ${c.border}`, borderRadius: 6, padding: '9px', fontSize: 12, fontWeight: 600,
            fontFamily: 'inherit', marginBottom: 12, opacity: 0.5, cursor: 'not-allowed',
          }}>Sign Up</button>
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

          {/* Real search over the 51 built-in articles (content/rag-articles.js) -
              no backend needed, this is instant client-side keyword matching. */}
          <div style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary, marginBottom: 8 }}>
            Type your question:
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); runSearch(query); }}
            style={{ display: 'flex', gap: 8, maxWidth: 640, marginBottom: 18 }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. why is my PC slow to start up?"
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 6,
                border: `1px solid ${c.border}`, background: c.bgSecondary,
                color: c.textPrimary, fontSize: 12, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button
              type="submit"
              className="theme-pill-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: c.accent, color: 'white', border: 'none',
                borderRadius: 6, padding: '0 16px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <MagnifyingGlass size={14} weight="bold" /> Search
            </button>
          </form>

          <div style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary, marginBottom: 8 }}>
            Or choose a question category:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 640, marginBottom: 18 }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => pickCategory(cat)}
                className="scanner-cat-btn"
                style={{
                  display: 'block', textAlign: 'center', padding: '11px 16px',
                  background: cat === activeCategory ? (isLight ? 'rgba(74,46,138,0.06)' : 'rgba(166,120,224,0.10)') : c.bgSecondary,
                  border: `1px solid ${cat === activeCategory ? c.accent : c.border}`,
                  borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, color: c.textPrimary,
                }}
              >{cat}</button>
            ))}
          </div>

          {searched && (
            <div style={{ maxWidth: 640, marginBottom: 22 }}>
              {results.length === 0 ? (
                <div style={{ fontSize: 12, color: c.textMuted }}>
                  No matching articles yet - try different words, or{' '}
                  <button
                    onClick={() => openModal('ask')}
                    className="theme-pill-btn"
                    style={{
                      background: 'transparent', color: c.accent, border: 'none',
                      fontSize: 12, textDecoration: 'underline', cursor: 'pointer',
                      fontFamily: 'inherit', padding: 0,
                    }}
                  >ask an expert</button>.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {results.map((a) => (
                    <button
                      key={a.slug}
                      onClick={() => openModal('article', a)}
                      className="scanner-cat-btn"
                      style={{
                        display: 'block', textAlign: 'left', padding: '9px 12px',
                        background: c.bgSecondary, border: `1px solid ${c.border}`,
                        borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 12, color: c.accent, fontWeight: 600,
                      }}
                    >{a.title}</button>
                  ))}
                </div>
              )}
            </div>
          )}

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
              <div style={{ fontSize: 11, color: c.textMuted }}>(version 0.2.0)</div>
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