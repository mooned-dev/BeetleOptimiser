// "Reports" tab. Shows the audit log of every destructive operation
// performed across the app's lifetime. Written by optimize-report.ps1 after
// each finished op; this view reads the JSONL file via a tiny Node helper
// spawned through main.js's spawnOptimizer pattern.
//
// Each row: timestamp, tool, action verb, files touched, bytes freed/affected.
// Action buttons: Re-run (opens the matching tab), Copy row, Delete from log.

import React, { useEffect, useState, useCallback } from 'react';
import {
  ClipboardText, Trash, ArrowClockwise, Copy, Check,
} from '@phosphor-icons/react';
import InfoBanner from '../shared/InfoBanner.jsx';

function formatBytes(n) {
  if (!n || n === 0) return '0';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

export default function ReportsView({ c, isLight, onNavigate }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState(null);
  const [totalBytes, setTotalBytes] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalActions, setTotalActions] = useState({});

  const load = useCallback(async () => {
    if (!window.beetleAPI) { setErr('Not available outside the packaged app.'); return; }
    setBusy(true); setErr(null);
    try {
      // Spawn the report reader via PowerShell - same shape as spawnOptimizer
      // output (NDJSON with event:'report' per line + event:'finished' at end).
      const result = await window.beetleAPI.system.shell(
        'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        'Get-Content -LiteralPath $env:LOCALAPPDATA\\BeetleOptimiser\\reports\\reports.jsonl -ErrorAction SilentlyContinue | ForEach-Object { try { $_ | ConvertFrom-Json | ConvertTo-Json -Compress } catch { $null } }',
      );
      const out = (result && (result.items || result.output || [])).join('\n');
      // system.shell returns the raw stdout in different shapes - parse all lines
      const lines = String(out).split('\n').map((l) => l.trim()).filter(Boolean);
      const parsed = [];
      let bytesSum = 0, count = 0;
      const actCounts = {};
      for (const line of lines) {
        try {
          const r = JSON.parse(line);
          if (!r || !r.tool) continue;
          parsed.push(r);
          bytesSum += Number(r.bytes || 0);
          count += Number(r.files || 0);
          actCounts[r.tool] = (actCounts[r.tool] || 0) + 1;
        } catch {}
      }
      parsed.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
      setRows(parsed);
      setTotalBytes(bytesSum);
      setTotalCount(count);
      setTotalActions(actCounts);
    } catch (e) {
      setErr(`Could not load reports: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function clearLog() {
    // Use PowerShell to clear the file
    await window.beetleAPI.system.shell(
      'powershell', '-NoProfile', '-Command',
      'Remove-Item -LiteralPath $env:LOCALAPPDATA\\BeetleOptimiser\\reports\\reports.jsonl -ErrorAction SilentlyContinue',
    );
    setRows([]); setTotalBytes(0); setTotalCount(0); setTotalActions({});
  }

  function copyRow(idx, row) {
    const text = [
      `${row.ts || ''}  [${row.tool || ''}] ${row.action || ''}`,
      `files = ${row.files || 0}, bytes = ${row.bytes || 0}`,
      row.note ? `note: ${row.note}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  // Tool -> tab mapping for "Open" jump
  const TOOL_TAB = {
    'Clean Up': 'Clean Up',
    'Optimize': 'Optimize',
    'Registry': 'Scanner',
    'Empty Folders': 'Clean Up',
    'Startup': 'Optimize',
    'Tweaks': 'Maintain',
    'Duplicates': 'Clean Up',
    'Shredder': 'Protect',
    'Internet': 'Optimize',
  };

  const filtered = filter
    ? rows.filter((r) =>
        (r.tool || '').toLowerCase().includes(filter.toLowerCase()) ||
        (r.action || '').toLowerCase().includes(filter.toLowerCase()) ||
        (r.note || '').toLowerCase().includes(filter.toLowerCase()),
      )
    : rows;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <InfoBanner c={c}>Audit log of every destructive operation across the app</InfoBanner>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: c.bgSecondary, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClipboardText size={20} color={c.accent} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.textPrimary }}>Reports</div>
            <div style={{ fontSize: 11, color: c.textMuted }}>
              {rows.length} ops · {formatBytes(totalBytes)} freed · {totalCount.toLocaleString()} files touched
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter..."
            style={{
              padding: '6px 10px', borderRadius: 6, border: `1px solid ${c.border}`,
              background: c.bgPrimary, color: c.textPrimary, fontSize: 11, fontFamily: 'inherit',
              outline: 'none', width: 140,
            }}
          />
          <button
            disabled={busy}
            onClick={load}
            className="theme-pill-btn"
            style={{
              background: 'transparent', border: `1px solid ${c.border}`,
              color: c.textSecondary, borderRadius: 6, padding: '6px 10px',
              fontSize: 11, fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <ArrowClockwise size={12} /> {busy ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={clearLog}
            className="theme-pill-btn"
            style={{
              background: 'transparent', border: `1px solid ${c.border}`,
              color: '#E0566B', borderRadius: 6, padding: '6px 10px',
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Trash size={12} /> Clear log
          </button>
        </div>
      </div>

      {/* Totals row */}
      <div style={{
        display: 'flex', gap: 12, padding: '10px 20px',
        borderBottom: `1px solid ${c.border}`, background: c.bgPrimary,
        flexWrap: 'wrap', flexShrink: 0,
      }}>
        {Object.entries(totalActions).length === 0 && (
          <div style={{ fontSize: 11, color: c.textMuted }}>No operations logged yet. Run a clean, defrag, or registry repair to populate this view.</div>
        )}
        {Object.entries(totalActions).map(([tool, count]) => (
          <div key={tool} style={{
            background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 6,
            padding: '4px 10px', fontSize: 11, color: c.textSecondary,
          }}>
            <b style={{ color: c.accent }}>{tool}</b> × {count}
          </div>
        ))}
      </div>

      {/* Log table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
        {err && (
          <div style={{ background: c.bgSecondary, border: `1px solid #E0566B`, borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 11, color: '#E0566B' }}>{err}</div>
        )}
        {!busy && rows.length === 0 && !err && (
          <div style={{ textAlign: 'center', padding: 60, color: c.textMuted, fontSize: 12 }}>
            No reports yet. Every destructive action will appear here.
          </div>
        )}
        {filtered.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: c.textPrimary }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${c.border}`, color: c.textMuted, fontSize: 11, fontWeight: 600 }}>
                <th style={{ textAlign: 'left',  padding: '8px 10px' }}>When</th>
                <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Tool</th>
                <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Action</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Files</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Bytes</th>
                <th style={{ textAlign: 'left',  padding: '8px 10px' }}>Note</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Open</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const tab = TOOL_TAB[r.tool];
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <td style={{ padding: '8px 10px', color: c.textSecondary, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {r.ts ? new Date(r.ts).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', color: c.accent, fontWeight: 600 }}>{r.tool}</td>
                    <td style={{ padding: '8px 10px' }}>{r.action}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{(r.files || 0).toLocaleString()}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatBytes(r.bytes)}</td>
                    <td style={{ padding: '8px 10px', color: c.textMuted, fontSize: 11 }}>{r.note || ''}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <button
                        onClick={() => copyRow(i, r)}
                        title="Copy this row"
                        className="theme-pill-btn"
                        style={{
                          background: 'transparent', border: `1px solid ${c.border}`,
                          color: c.textSecondary, borderRadius: 4, padding: '2px 6px',
                          fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                          marginRight: 4,
                          display: 'inline-flex', alignItems: 'center', gap: 2,
                        }}
                      >
                        {copied === i ? <><Check size={10} color="#3AA65C" /> Copied</> : <><Copy size={10} /> Copy</>}
                      </button>
                      {tab && onNavigate && (
                        <button
                          onClick={() => onNavigate(tab)}
                          title={`Open ${tab} tab`}
                          className="theme-pill-btn"
                          style={{
                            background: c.accent, border: 'none',
                            color: 'white', borderRadius: 4, padding: '2px 8px',
                            fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          Open
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
