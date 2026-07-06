// "My Advisor" tab. Info banner + left goal-category list + recommendation
// rows, each with a "Clean up now" action button that fires the real
// optimizer IPC the same way the Dashboard tiles do. State + handlers are
// passed in from App.jsx so this tab stays a thin view.

import React, { useState } from 'react';
import {
  Desktop, GlobeHemisphereWest, Package, Files, FolderSimpleMinus,
} from '@phosphor-icons/react';
import InfoBanner from '../shared/InfoBanner.jsx';

const GOALS = [
  { id: 'cleanup',     label: 'I want to clean up my Windows...' },
  { id: 'stability',   label: 'I want to improve stability of my Windows...' },
  { id: 'maintenance', label: 'I want to maintain reliable Windows operation...' },
  { id: 'privacy',     label: 'I want to protect my privacy and security...' },
];

const RECOMMENDATIONS = [
  {
    id: 'system-drive', Icon: Desktop, title: 'Clean up system drive',
    description: 'Use Deep Disk Cleaner to find and delete unneeded system items and other junk from your system drive.',
    action: 'scan',
  },
  {
    id: 'browsers', Icon: GlobeHemisphereWest, title: 'Clean up web browsers',
    description: 'Delete unneeded cache and activity traces from web browsers to clear space for more important files.',
    action: 'scan',
  },
  {
    id: 'programs', Icon: Package, title: 'Remove unused programs',
    description: 'Use Uninstall Manager to get rid of applications you no longer use.',
    action: 'uninstall',
  },
  {
    id: 'large-files', Icon: Files, title: 'Sort through large files',
    description: 'Use Disk Explorer to find the biggest space hogs and move or delete them to clear valuable disk space.',
    action: 'disk',
  },
  {
    id: 'windows-folder', Icon: FolderSimpleMinus, title: 'Compact Windows folder',
    description: 'Use Windows Slimmer to reduce Windows folder size by cleaning out temporary and other unneeded items.',
    action: 'scan',
  },
];

export default function AdvisorView({ c, isLight, onAction }) {
  const [activeGoal, setActiveGoal] = useState('cleanup');

  // onAction(actionId) is wired by App.jsx to fire the same handler the
  // Dashboard tile uses. Falls back to no-op for unknown actions.
  function handleAction(action) {
    if (!onAction) return;
    onAction(action);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <InfoBanner c={c}>
        Here you will find recommendations to help improve Windows components' stability, security and speed
      </InfoBanner>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: goal list */}
        <div style={{
          width: 220, background: c.bgSecondary, borderRight: `1px solid ${c.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'auto', flexShrink: 0, padding: 10,
        }}>
          {GOALS.map(g => {
            const active = g.id === activeGoal;
            return (
              <button
                key={g.id}
                onClick={() => setActiveGoal(g.id)}
                className="scanner-cat-btn"
                style={{
                  display: 'block', textAlign: 'left', padding: '12px 14px', margin: '2px 0',
                  background: active ? (isLight ? 'rgba(74,46,138,0.10)' : 'rgba(166,120,224,0.18)') : 'transparent',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: active ? 600 : 500,
                  color: active ? c.accent : c.textSecondary, lineHeight: 1.4,
                }}
              >{g.label}</button>
            );
          })}
        </div>

        {/* RIGHT: recommendation rows */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {RECOMMENDATIONS.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 8,
              padding: '16px 20px',
            }}>
              <r.Icon size={28} color={c.accent} weight="regular" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary, marginBottom: 3 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.4 }}>{r.description}</div>
              </div>
              <button
                onClick={() => handleAction(r.action)}
                className="theme-pill-btn"
                style={{
                  background: c.accent, color: 'white', border: 'none', borderRadius: 6,
                  padding: '9px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap',
                }}
              >Clean up now</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}