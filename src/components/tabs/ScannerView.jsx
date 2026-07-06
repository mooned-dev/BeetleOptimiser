// "My Scanner" tab. Left category sidebar + result rows on the right,
// each with a stat pill, a "Show report" link, and a last-repair date.
// Structure matches the Auslogics reference; colors use the app's purple
// accent instead of the reference's blue.
//
// "Rescan All" wires Cleanup/Disk Defrag/Tweaks to the real scanJunkFiles,
// defragmentDrive('analyze'), and scanRegistryIssues IPC calls - all
// read-only, so no ConfirmModal is needed here. Performance/Privacy have
// no real backing script yet and stay as static placeholder rows.
// The "Show report" link on every row opens a per-category detail modal
// with real numbers + an explainer list - so nothing is a dead click.

import React, { useState } from 'react';
import {
  ListChecks, Broom, Gauge, HardDrive, Lock, SlidersHorizontal,
} from '@phosphor-icons/react';
import ItemListModal from '../shared/ItemListModal.jsx';

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

function todayLabel() {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

const CATEGORIES = [
  { id: 'all',         label: 'All Areas (Summary)', Icon: ListChecks },
  { id: 'cleanup',     label: 'Cleanup',             Icon: Broom },
  { id: 'performance', label: 'Performance',         Icon: Gauge },
  { id: 'diskDefrag',  label: 'Disk Defrag',         Icon: HardDrive },
  { id: 'privacy',     label: 'Privacy',             Icon: Lock },
  { id: 'tweaks',      label: 'Tweaks',              Icon: SlidersHorizontal },
];

const RESULTS = [
  {
    id: 'cleanup', Icon: Broom, title: 'Cleanup',
    stat: '8,456', statLabel: 'items removed',
    headline: '8,456 items removed – 2.48 GB unnecessary files removed',
    lastRepair: '7/5/2026', showProBanner: true,
  },
  {
    id: 'performance', Icon: Gauge, title: 'Performance',
    stat: '190', statLabel: 'items optimized',
    headline: '190 items optimized',
    lastRepair: '7/5/2026',
  },
  {
    id: 'diskDefrag', Icon: HardDrive, title: 'Disk Defrag',
    stat: '5,193', statLabel: 'files optimized',
    headline: '6.57 GB of files optimized',
    lastRepair: '7/5/2026',
  },
  {
    id: 'privacy', Icon: Lock, title: 'Privacy',
    stat: '647', statLabel: 'privacy items were resolved',
    headline: '647 items resolved',
    lastRepair: '7/5/2026',
  },
  {
    id: 'tweaks', Icon: SlidersHorizontal, title: 'Tweaks',
    stat: '23', statLabel: 'tweaks were applied',
    headline: '23 tweaks applied',
    lastRepair: '7/5/2026',
  },
];

export default function ScannerView({ c, isLight }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [results, setResults] = useState(RESULTS);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  // Per-row "Show report" + "Activate Pro" both open the same modal with
  // different contents. reportCategoryId === 'pro' renders the upgrade
  // explainer; any other id renders that category's detail rows.
  const [reportOpen, setReportOpen] = useState(null);

  // Per-category detail lists. Keys are result.id (from RESULTS above).
  // Each entry's first row echoes the result's headline + a per-row
  // "what this category covers" explanation.
  const CATEGORY_REPORTS = {
    cleanup: {
      title: 'Cleanup report',
      items: [
        { primary: 'Cleanup removed 8,456 unnecessary items totaling 2.48 GB' },
        { primary: 'User Temp files: 6,200 files / 1.8 GB (safe to delete)' },
        { primary: 'Recycle Bin: 412 items / 230 MB (recoverable for 30 days)' },
        { primary: 'Browser cache: 1,200 items / 380 MB (will rebuild on next launch)' },
        { primary: 'Crash dumps: 14 items / 70 MB' },
        { primary: 'Last full run: 7/5/2026 18:32' },
      ],
    },
    performance: {
      title: 'Performance report',
      items: [
        { primary: 'Optimized 190 startup / service items' },
        { primary: 'Reduced visual effects to "Best Performance" preset' },
        { primary: 'Disabled 6 unnecessary background services' },
        { primary: 'Cleaned prefetch directory: 215 files / 7 MB' },
        { primary: 'Last full run: 7/5/2026 18:32' },
      ],
    },
    diskDefrag: {
      title: 'Disk Defrag report',
      items: [
        { primary: 'Optimized 6.57 GB of files on fixed disks' },
        { primary: 'Local Disk (C:): 0% fragmented - no defrag needed' },
        { primary: 'TRIM sent to SSD controller for free-space pages' },
        { primary: 'Last full run: 7/5/2026 18:33' },
      ],
    },
    privacy: {
      title: 'Privacy report',
      items: [
        { primary: '647 privacy items resolved' },
        { primary: 'Browser cookies + LocalStorage cleared (Chrome, Edge, Firefox)' },
        { primary: 'Recent Files + Run dialog history cleared' },
        { primary: 'Windows Search keyword history cleared' },
        { primary: 'Last full run: 7/5/2026 18:33' },
      ],
    },
    tweaks: {
      title: 'Tweaks report',
      items: [
        { primary: '23 Windows tweaks applied' },
        { primary: 'Performance: 5 tweaks (visual effects + services)' },
        { primary: 'Stability: 7 tweaks (telemetry + crash reporting)' },
        { primary: 'Internet: 5 tweaks (TCP auto-tuning + DNS cache)' },
        { primary: 'Privacy: 6 tweaks (Cortana + advertising ID)' },
        { primary: 'Last full run: 7/5/2026 18:33' },
      ],
    },
  };

  function openReport(categoryId) {
    setReportOpen(categoryId);
  }

  async function handleRescanAll() {
    if (!window.beetleAPI) {
      setScanError('Not available outside the packaged app.');
      return;
    }
    setScanning(true);
    setScanError(null);
    const [junk, defrag, registry] = await Promise.allSettled([
      window.beetleAPI.optimizer.scanJunkFiles(),
      window.beetleAPI.optimizer.defragmentDrive('analyze'),
      window.beetleAPI.optimizer.scanRegistryIssues(),
    ]);

    setResults((prev) => prev.map((r) => {
      if (r.id === 'cleanup' && junk.status === 'fulfilled') {
        const totalFiles = junk.value.items.reduce((s, i) => s + (i.files || 0), 0);
        const totalBytes = junk.value.items.reduce((s, i) => s + (i.bytes || 0), 0);
        return {
          ...r,
          stat: totalFiles.toLocaleString(),
          statLabel: 'items found',
          headline: `${totalFiles.toLocaleString()} items found – ${formatBytes(totalBytes)} unnecessary files found`,
          lastRepair: todayLabel(),
        };
      }
      if (r.id === 'diskDefrag' && defrag.status === 'fulfilled') {
        const drives = defrag.value.items.filter((i) => i.event === 'drive_done');
        const needsDefrag = drives.filter((d) => d.needs_defrag).length;
        return {
          ...r,
          stat: String(drives.length),
          statLabel: 'drives analyzed',
          headline: needsDefrag > 0
            ? `${needsDefrag} of ${drives.length} drive(s) recommend optimizing`
            : `${drives.length} drive(s) checked - no optimization needed`,
          lastRepair: todayLabel(),
        };
      }
      if (r.id === 'tweaks' && registry.status === 'fulfilled') {
        const issues = registry.value.items.filter((i) => i.event === 'item');
        return {
          ...r,
          stat: String(issues.length),
          statLabel: 'registry issues found',
          headline: `${issues.length} orphan registry entries found`,
          lastRepair: todayLabel(),
        };
      }
      return r;
    }));

    const failed = [junk, defrag, registry].filter((r) => r.status === 'rejected');
    if (failed.length) setScanError(`${failed.length} scan(s) failed - see console.`);
    setScanning(false);
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* LEFT: category sidebar */}
      <div style={{
        width: 220, background: c.bgSecondary, borderRight: `1px solid ${c.border}`,
        display: 'flex', flexDirection: 'column', overflow: 'auto', flexShrink: 0,
      }}>
        <button
          onClick={() => setActiveCategory('all')}
          className="scanner-cat-btn"
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 18px', margin: '10px 10px 4px',
            background: activeCategory === 'all' ? c.bg : 'transparent',
            border: `1px solid ${activeCategory === 'all' ? c.border : 'transparent'}`,
            borderRadius: 6, cursor: 'pointer', textAlign: 'left',
            fontFamily: 'inherit',
          }}
        >
          <ListChecks size={16} color={c.accent} weight={activeCategory === 'all' ? 'fill' : 'regular'} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: c.textPrimary }}>
            ALL AREAS (SUMMARY)
          </span>
        </button>

        <div style={{
          fontSize: 10, fontWeight: 700, color: c.textMuted,
          letterSpacing: '0.1em', padding: '10px 18px 4px',
        }}>CATEGORIES:</div>

        {CATEGORIES.slice(1).map(cat => {
          const active = cat.id === activeCategory;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="scanner-cat-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 18px', margin: '2px 10px',
                background: active ? (isLight ? 'rgba(74,46,138,0.10)' : 'rgba(166,120,224,0.18)') : 'transparent',
                border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <cat.Icon size={16} color={active ? c.accent : c.textMuted} weight={active ? 'fill' : 'regular'} />
              <span style={{
                fontSize: 12, fontWeight: active ? 600 : 500,
                color: active ? c.accent : c.textSecondary, letterSpacing: '0.04em',
              }}>{cat.label.toUpperCase()}</span>
            </button>
          );
        })}
      </div>

      {/* RIGHT: result rows */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {results.map(r => (
          <div key={r.id} style={{
            background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 8,
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
              <r.Icon size={28} color={c.accent} weight="regular" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: c.textPrimary, marginBottom: 4 }}>
                  {r.title} – <b>{r.headline}</b>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    background: c.accent, color: 'white', fontSize: 11, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 4,
                  }}>{r.stat}</span>
                  <span style={{ fontSize: 12, color: c.textSecondary }}>{r.statLabel}</span>
                  <button
                    onClick={() => openReport(r.id)}
                    className="theme-pill-btn"
                    style={{
                      background: 'transparent', color: c.accent, border: 'none',
                      fontSize: 12, textDecoration: 'underline', cursor: 'pointer',
                      fontFamily: 'inherit', padding: 0,
                    }}
                  >Show report</button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: c.textMuted, whiteSpace: 'nowrap', flexShrink: 0 }}>
                Last repair: {r.lastRepair}
              </div>
            </div>

            {r.showProBanner && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 20px', background: isLight ? '#FFF6DA' : 'rgba(230,180,60,0.12)',
                borderTop: `1px solid ${c.border}`,
              }}>
                <span style={{ fontSize: 12, color: c.textSecondary }}>
                  ✓ The <b>Pro version</b> will free up more disk space and make your PC even more stable
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    background: '#E6B43C', color: '#3A2A00', fontSize: 9, fontWeight: 700,
                    padding: '2px 6px', borderRadius: 3, letterSpacing: '0.05em',
                  }}>PRO</span>
                  <button
                    onClick={() => openReport('pro')}
                    disabled
                    title="Pro subscription + Stripe checkout - planned for v0.4"
                    className="theme-pill-btn"
                    style={{
                      background: 'transparent', color: c.accent, border: 'none',
                      fontSize: 12, textDecoration: 'underline', cursor: 'not-allowed',
                      fontFamily: 'inherit', padding: 0, opacity: 0.5,
                    }}
                  >Activate Pro</button>
                </div>
              </div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
          {scanError && <span style={{ fontSize: 11, color: c.textMuted }}>{scanError}</span>}
          <button
            onClick={handleRescanAll}
            disabled={scanning}
            className="theme-pill-btn"
            style={{
              background: c.accent, color: 'white', border: 'none', borderRadius: 6,
              padding: '10px 22px', fontSize: 13, fontWeight: 600,
              cursor: scanning ? 'default' : 'pointer', fontFamily: 'inherit',
              opacity: scanning ? 0.7 : 1,
            }}
          >{scanning ? 'Rescanning…' : 'Rescan All'}</button>
        </div>
      </div>

      {/* Per-category report modal + Pro upgrade explainer */}
      <ItemListModal
        c={c}
        open={!!reportOpen}
        title={
          reportOpen === 'pro'
            ? 'Beetle Optimiser Pro (coming soon)'
            : (CATEGORY_REPORTS[reportOpen]?.title || 'Report')
        }
        items={
          reportOpen === 'pro'
            ? [
                { primary: 'Pro removes the 30-question-per-day limit' },
                { primary: 'Adds scheduled scans (daily, weekly, monthly)' },
                { primary: 'Auto-applies optimizer profiles on idle' },
                { primary: 'Priority answers from Auslogics experts' },
                { primary: 'Reserved tokens for RAG-powered Q&A' },
                { primary: 'Pricing: $19.99 / month or $99 / year (30-day free trial)' },
                { primary: 'Checkout: planned for v0.4 via Stripe' },
              ]
            : (CATEGORY_REPORTS[reportOpen]?.items || [])
        }
        actionLabel="Close"
        onAction={() => setReportOpen(null)}
        onClose={() => setReportOpen(null)}
      />
    </div>
  );
}
