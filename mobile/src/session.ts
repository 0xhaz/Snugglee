/**
 * BE-02, client half — anonymous session on launch.
 *
 * design.md §2: **no blocking account wall before first value.** An anonymous
 * Firebase session is created silently at launch; identity is requested only
 * after the first purchase, before credits accumulate on a device the user
 * could lose (S-17).
 *
 * Anonymous and linked users share the same Firebase uid, so linking an account
 * later never requires migrating the ledger. That is the whole reason for
 * anonymous-then-link rather than a device identifier.
 *
 * The web API key below is **not a secret**. Firebase web config identifies the
 * project; it does not authorise access. Security comes from Firebase rules and
 * from the server verifying the ID token on every request (see auth.ts).
 * Real secrets live in Secret Manager and never reach the client
 * (techstacks.md §1).
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { getApps, initializeApp } from 'firebase/app';
import {
  OAuthProvider,
  getAuth,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyD177vo64SIdCIKqxQRuSTDj8kqTZHzizI',
  authDomain: 'snugglee-prod.firebaseapp.com',
  projectId: 'snugglee-prod',
  storageBucket: 'snugglee-prod.firebasestorage.app',
  messagingSenderId: '75574145355',
  appId: '1:75574145355:web:0e3e0fc496227735e3b8ce',
};

if (!getApps().length) initializeApp(firebaseConfig);

const auth = getAuth();

let signInPromise: Promise<User> | null = null;

/**
 * Resolves to a signed-in user, creating an anonymous one if needed.
 *
 * Deduped: the Day-0 path may call this from several places at once (S-01
 * mounting, the player starting), and two concurrent signInAnonymously calls
 * would create two anonymous users — and therefore two ledgers.
 */
export function ensureSession(): Promise<User> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (signInPromise) return signInPromise;

  signInPromise = new Promise<User>((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user);
      }
    });
    signInAnonymously(auth).catch((err) => {
      unsub();
      signInPromise = null;
      reject(err);
    });
  });

  return signInPromise;
}

/** Fresh ID token for the Authorization header. Firebase handles refresh. */
export async function getIdToken(): Promise<string> {
  const user = await ensureSession();
  return user.getIdToken();
}

export const isLinked = () =>
  Boolean(auth.currentUser && !auth.currentUser.isAnonymous);

export const canUseApple = () => AppleAuthentication.isAvailableAsync();

/**
 * S-17 — links the anonymous session to an Apple ID.
 *
 * **This is the only thing protecting purchased credits.** Credits are
 * *consumable* purchases, and consumables cannot be restored from the App
 * Store — Apple only restores non-consumables and subscriptions. So the ledger
 * is the sole record that someone paid, and it is keyed to the Firebase uid.
 * An anonymous uid is device-bound and does not survive a reinstall, which
 * means without this an uninstall silently destroys money the parent paid.
 *
 * `linkWithCredential` preserves the SAME uid, so the ledger needs no
 * migration and no credits move. That is the whole reason for
 * anonymous-then-link rather than asking for an account up front.
 */
export async function linkApple(): Promise<{ linked: true } | { linked: false; reason: string }> {
  try {
    /**
     * Nonce handling is not optional. Apple must be given the SHA-256 HASH,
     * and Firebase the RAW value — it re-hashes and compares. Skipping this (or
     * generating a nonce and never sending it, which is easy to do) means
     * Firebase cannot verify the token is fresh, and the link is replayable.
     */
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) return { linked: false, reason: 'no identity token' };

    const provider = new OAuthProvider('apple.com');
    const oauth = provider.credential({ idToken: credential.identityToken, rawNonce });

    const user = await ensureSession();
    try {
      await linkWithCredential(user, oauth);
      return { linked: true };
    } catch (err) {
      /**
       * `credential-already-in-use` means this Apple ID is already attached to
       * another account — typically the parent reinstalled and is signing back
       * in. Sign in to THAT account rather than failing: its ledger is the one
       * holding their credits.
       */
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/credential-already-in-use') {
        await signInWithCredential(auth, oauth);
        return { linked: true };
      }
      throw err;
    }
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    // The parent cancelling is not an error and must not surface as one.
    if (code === 'ERR_REQUEST_CANCELED') return { linked: false, reason: 'cancelled' };
    return { linked: false, reason: 'failed' };
  }
}
