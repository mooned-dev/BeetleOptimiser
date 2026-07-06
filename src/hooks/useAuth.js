// Firebase Auth (Google + GitHub) + the user's Firestore profile/token doc.
//
// Note on tokens: Firestore security rules make users/{uid}/tokens/{doc}
// read-only from the client ("allow write: if false") by design, so actual
// balance changes must come from a trusted backend (Cloud Function), which
// isn't deployed yet (requires upgrading the Firebase project off the free
// Spark plan). This hook only reads the balance for now.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GoogleAuthProvider, GithubAuthProvider, signInWithCredential, signOut as firebaseSignOut,
  onAuthStateChanged, fetchSignInMethodsForEmail, linkWithCredential,
} from 'firebase/auth';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tokens, setTokens] = useState(null);
  const [plan, setPlan] = useState('Free');
  const [authError, setAuthError] = useState(null);
  // Firebase refuses to silently merge two providers sharing one email
  // (auth/account-exists-with-different-credential) - the fix is to sign
  // the user into whichever provider they used FIRST, then link the
  // just-attempted provider's credential onto that same account. This ref
  // holds that pending credential across the two sign-in attempts.
  const pendingLinkCredential = useRef(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (firebaseUser) {
        await setDoc(doc(db, 'users', firebaseUser.uid), {
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          lastSeen: serverTimestamp(),
        }, { merge: true });
      }
    });
  }, []);

  useEffect(() => {
    if (!user) { setTokens(null); setPlan('Free'); return; }

    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setPlan(snap.exists() && snap.data().plan ? snap.data().plan : 'Free');
    });
    const unsubTokens = onSnapshot(doc(db, 'users', user.uid, 'tokens', 'balance'), (snap) => {
      setTokens(snap.exists() ? snap.data().amount : 0);
    });
    return () => { unsubProfile(); unsubTokens(); };
  }, [user]);

  // signInWithPopup/signInWithRedirect don't work here: Google blocks OAuth
  // from any embedded webview (including an Electron BrowserWindow popup)
  // outright, regardless of origin or User-Agent. main.js instead runs the
  // whole OAuth exchange via the loopback-redirect flow in the user's real
  // system browser and hands back the provider's own token, which Firebase
  // accepts client-side via signInWithCredential - no backend needed.
  // Buttons in AccountMenu fire these without awaiting the result, so any
  // rejection here has to be caught and surfaced via authError - otherwise
  // it's an unhandled promise rejection the user never sees, which looked
  // like sign-in silently doing nothing on failure (e.g. GitHub's token
  // endpoint returning an error body with the account picker still open).
  const signInWithProvider = useCallback(async (buildCredential, credentialFromError) => {
    setAuthError(null);
    try {
      const credential = await buildCredential();
      const result = await signInWithCredential(auth, credential);
      // Arrived here after the user resolved an account-exists conflict by
      // signing into their original provider - link the other provider's
      // credential we stashed earlier onto this same account.
      if (pendingLinkCredential.current) {
        try {
          await linkWithCredential(result.user, pendingLinkCredential.current);
        } catch (linkErr) {
          // Non-fatal - the user is signed in either way; linking is a
          // nice-to-have so both providers work for them next time.
        }
        pendingLinkCredential.current = null;
      }
      return result;
    } catch (err) {
      if (err.code === 'auth/account-exists-with-different-credential') {
        pendingLinkCredential.current = credentialFromError(err);
        let providerName = 'a different sign-in method';
        try {
          const email = err.customData?.email;
          const methods = email ? await fetchSignInMethodsForEmail(auth, email) : [];
          if (methods[0] === 'google.com') providerName = 'Google';
          else if (methods[0] === 'github.com') providerName = 'GitHub';
        } catch (_) { /* best-effort - fall back to the generic message */ }
        setAuthError(`This email is already signed in with ${providerName}. Sign in with ${providerName} first, and this account will link automatically.`);
      } else {
        setAuthError(err.message || String(err));
      }
      throw err;
    }
  }, []);

  const signInWithGoogle = useCallback(() => signInWithProvider(
    async () => {
      const { idToken, accessToken } = await window.beetleAPI.auth.loginGoogle();
      return GoogleAuthProvider.credential(idToken, accessToken);
    },
    GoogleAuthProvider.credentialFromError,
  ), [signInWithProvider]);

  const signInWithGitHub = useCallback(() => signInWithProvider(
    async () => {
      const { accessToken } = await window.beetleAPI.auth.loginGithub();
      return GithubAuthProvider.credential(accessToken);
    },
    GithubAuthProvider.credentialFromError,
  ), [signInWithProvider]);
  const signOut = useCallback(() => firebaseSignOut(auth), []);

  return { user, authLoading, tokens, plan, authError, signInWithGoogle, signInWithGitHub, signOut };
}
