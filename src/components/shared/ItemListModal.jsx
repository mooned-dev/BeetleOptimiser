// Generic "list of items, each with one action" modal - used for Unused
// Programs and Startup Items. Each row's action still goes through the
// caller's own confirm-then-execute flow (this modal doesn't call any IPC
// itself); `busyId` marks which row is mid-action so its button can show
// a working state without disabling the whole list.
//
// If `actionLabel` is empty (or the literal sentinel '—') the per-row
// action button is suppressed entirely, so read-only info modals don't
// show a useless dash. The modal's close-X still works.

import React from 'react';
import { X } from '@phosphor-icons/react';

export default function ItemListModal({
  c, open, title, items, emptyText = 'Nothing to show.',
  actionLabel, busyId, onAction, onClose,
}) {
  if (!open) return null;

  // Treat undefined, empty string, or em-dash as "no per-row action".
  const hasAction = actionLabel && actionLabel !== '—' && actionLabel !== '-';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 560, maxHeight: '75vh', display: 'flex', flexDirection: 'column',
        background: c.bgSecondary, border: `1px solid ${c.border}`,
        borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: `1px solid ${c.border}`,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer', color: c.textMuted, borderRadius: 4,
            }}
          ><X size={14} /></button>
        </div>

        <div style={{ overflow: 'auto', padding: 8 }}>
          {items.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: c.textMuted }}>{emptyText}</div>
          )}
          {items.map((item) => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 6,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* No truncation here - some callers (article/question detail
                    modals) pass a full paragraph as `primary`, not a short
                    row label, and nowrap+ellipsis silently cut those down to
                    one line with no way to read the rest. Wrapping normally
                    costs nothing for the short-label callers (startup items,
                    program names) since those still render on one line. */}
                <div style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {item.primary}
                </div>
                {item.secondary && (
                  <div style={{ fontSize: 11, color: c.textMuted, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginTop: 2 }}>
                    {item.secondary}
                  </div>
                )}
              </div>
              {hasAction && (
                <button
                  onClick={() => onAction(item)}
                  disabled={busyId === item.id}
                  className="theme-pill-btn"
                  style={{
                    flexShrink: 0, padding: '6px 12px', background: 'transparent',
                    border: `1px solid ${c.border}`, borderRadius: 6, fontSize: 11, fontWeight: 600,
                    color: c.textPrimary, cursor: busyId === item.id ? 'default' : 'pointer',
                    fontFamily: 'inherit', opacity: busyId === item.id ? 0.6 : 1,
                  }}
                >{busyId === item.id ? 'Working…' : (item.actionLabelOverride || actionLabel)}</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
