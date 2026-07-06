// Generic confirmation dialog for destructive actions (delete files,
// uninstall a program, disable startup items, repair registry keys).
//
// This is the actual safety gate the optimizer scripts' comments already
// assumed existed - main.js's destructive IPC handlers now require a
// confirmation token that only gets minted after the user accepts this
// modal (see App.jsx / view components for the request-confirm-then-call
// pattern). Don't wire a destructive action straight to a button without
// routing it through this.

import React from 'react';
import { WarningCircle } from '@phosphor-icons/react';

export default function ConfirmModal({
  c, open, title, message, details, confirmLabel = 'Confirm', busy, onConfirm, onCancel,
}) {
  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 420, background: c.bgSecondary, border: `1px solid ${c.border}`,
        borderRadius: 10, padding: 20, boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <WarningCircle size={24} color="#E6B43C" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary, marginBottom: 4 }}>
              {title}
            </div>
            <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5 }}>
              {message}
            </div>
          </div>
        </div>

        {details && (
          <div style={{
            background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6,
            padding: '10px 12px', marginBottom: 16, fontSize: 12, color: c.textSecondary,
          }}>
            {details}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            className="theme-pill-btn"
            style={{
              padding: '8px 16px', background: 'transparent', color: c.textPrimary,
              border: `1px solid ${c.border}`, borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1,
            }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="theme-pill-btn"
            style={{
              padding: '8px 16px', background: '#E6B43C', color: '#3A2A00',
              border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700,
              cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.7 : 1,
            }}
          >{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
