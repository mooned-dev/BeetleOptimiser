// Account dropdown - lives in the titlebar's left slot. Logged out shows
// "Sign in" with Google/GitHub options; logged in shows an avatar pill
// (initial or photo, name, plan) with token balance + sign out.

import React, { useEffect, useRef, useState } from 'react';
import { CaretDown, GoogleLogo, GithubLogo, SignOut, Coins } from '@phosphor-icons/react';

export default function AccountMenu({ c, user, authLoading, tokens, plan, authError, onSignInGoogle, onSignInGitHub, onSignOut }) {
  const [open, setOpen] = useState(false);
  // Signing in means shell.openExternal + waiting for the browser round
  // trip to complete, which can take a while - closing the menu instantly
  // on click (the old behavior) gave no feedback at all while waiting, and
  // silently swallowed failures since the click handler never awaited the
  // promise. Keeping the menu open through the attempt and showing either
  // a spinner state or the error message fixes both.
  const [signingIn, setSigningIn] = useState(null); // 'google' | 'github' | null
  const rootRef = useRef(null);

  async function handleSignIn(provider, fn) {
    setSigningIn(provider);
    try {
      await fn();
      setOpen(false);
    } catch (err) {
      // authError (from useAuth) already holds the message; this catch just
      // stops the rejection from becoming an unhandled promise rejection.
    } finally {
      setSigningIn(null);
    }
  }

  // If the user closes/abandons the browser tab without finishing, the
  // main-process promise would otherwise sit there until a 5-minute
  // timeout, leaving these buttons disabled with no way out in the
  // meantime - this lets them bail immediately and try again.
  async function handleCancel() {
    try { await window.beetleAPI?.auth?.cancelLogin(); } catch (_) {}
  }

  useEffect(() => {
    function onClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (authLoading) {
    return <div style={{ width: 110, WebkitAppRegion: 'no-drag' }} />;
  }

  const initial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div ref={rootRef} style={{ position: 'relative', WebkitAppRegion: 'no-drag' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className={user ? 'theme-pill-btn' : undefined}
        style={user ? {
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '4px 10px 4px 4px', background: c.bgSecondary,
          border: `1px solid ${c.border}`, borderRadius: 16,
          fontSize: 12, fontWeight: 500, color: c.textPrimary,
          cursor: 'pointer', fontFamily: 'inherit', height: 28,
        } : {
          display: 'flex', alignItems: 'center', gap: 5,
          padding: 0, background: 'transparent', border: 'none',
          fontSize: 12, fontWeight: 500, color: c.textPrimary,
          cursor: 'pointer', fontFamily: 'inherit', height: 28,
        }}
      >
        {user ? (
          <>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              background: c.accent, color: 'white', fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {user.photoURL
                ? <img src={user.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initial}
            </span>
            <span style={{ lineHeight: 1 }}>{(user.displayName || user.email || 'Account').split(' ')[0]} · {plan}</span>
          </>
        ) : (
          <span style={{ lineHeight: 1 }}>Sign in</span>
        )}
        <CaretDown size={10} weight="bold" color={c.textMuted} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 34, left: 0, minWidth: 220, zIndex: 50,
          background: c.bgSecondary, border: `1px solid ${c.border}`, borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', padding: 8,
        }}>
          {user ? (
            <>
              <div style={{ padding: '8px 10px', borderBottom: `1px solid ${c.border}`, marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary }}>{user.displayName || 'Account'}</div>
                <div style={{ fontSize: 11, color: c.textMuted }}>{user.email}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: c.textSecondary }}>
                  <Coins size={13} color={c.accent} />
                  {tokens === null ? '—' : tokens} tokens
                </div>
              </div>
              <button
                onClick={() => { onSignOut(); setOpen(false); }}
                className="scanner-cat-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 10px', background: 'transparent', border: 'none',
                  borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, color: c.textPrimary, textAlign: 'left',
                }}
              >
                <SignOut size={14} /> Sign out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleSignIn('google', onSignInGoogle)}
                disabled={signingIn !== null}
                className="scanner-cat-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '9px 10px', background: 'transparent', border: 'none',
                  borderRadius: 6, cursor: signingIn ? 'default' : 'pointer', fontFamily: 'inherit',
                  fontSize: 12, color: c.textPrimary, textAlign: 'left',
                  opacity: signingIn && signingIn !== 'google' ? 0.5 : 1,
                }}
              >
                <GoogleLogo size={16} />
                {signingIn === 'google' ? 'Waiting for browser…' : 'Continue with Google'}
              </button>
              <button
                onClick={() => handleSignIn('github', onSignInGitHub)}
                disabled={signingIn !== null}
                className="scanner-cat-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '9px 10px', background: 'transparent', border: 'none',
                  borderRadius: 6, cursor: signingIn ? 'default' : 'pointer', fontFamily: 'inherit',
                  fontSize: 12, color: c.textPrimary, textAlign: 'left',
                  opacity: signingIn && signingIn !== 'github' ? 0.5 : 1,
                }}
              >
                <GithubLogo size={16} />
                {signingIn === 'github' ? 'Waiting for browser…' : 'Continue with GitHub'}
              </button>
              {signingIn && (
                <button
                  onClick={handleCancel}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: 'none', border: 'none', padding: '4px 10px',
                    cursor: 'pointer', color: c.textMuted, fontSize: 11, fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
              )}
              {authError && (
                <div style={{
                  marginTop: 6, padding: '8px 10px', borderRadius: 6,
                  background: 'rgba(220,53,69,0.12)', color: '#e0566b',
                  fontSize: 11, lineHeight: 1.4,
                }}>
                  {authError}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
