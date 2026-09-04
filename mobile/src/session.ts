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
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  getAuth,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  type AuthCredential,
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
 * Attaches a credential to the CURRENT session, or signs in to the account that
 * already owns it.
 *
 * `linkWithCredential` preserves the same uid, so the ledger needs no migration
 * and no credits move — that is the whole reason for anonymous-then-link.
 *
 * `credential-already-in-use` is the reinstall case: this identity is attached
 * to an account that already exists, and THAT account holds the credits. Signing
 * in to it is the recovery. Treating it as an error would strand the money.
 *
 * Shared by both providers so this rule lives in exactly one place.
 */
async function linkOrSignIn(
  credential: AuthCredential,
): Promise<{ linked: true } | { linked: false; reason: string }> {
  const user = await ensureSession();
  try {
    await linkWithCredential(user, credential);
    return { linked: true };
  } catch (err) {
    if ((err as { code?: string })?.code === 'auth/credential-already-in-use') {
      await signInWithCredential(auth, credential);
      return { linked: true };
    }
    throw err;
  }
}

/* ---------------------------------- google --------------------------------- */

/**
 * Public OAuth client IDs, like the Firebase config above — they identify the
 * project, they do not authorise anything. The WEB client id is the one that
 * matters: Google only mints an `idToken` (which is what Firebase verifies)
 * when it is set. Configuring only the iOS id yields a silent sign-in that
 * Firebase then rejects.
 */
const GOOGLE_WEB_CLIENT_ID = Constants.expoConfig?.extra?.googleWebClientId as string | undefined;
const GOOGLE_IOS_CLIENT_ID = Constants.expoConfig?.extra?.googleIosClientId as string | undefined;

let googleConfigured = false;

function configureGoogle() {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
    // No server-side Google API calls — we only ever want the identity.
    offlineAccess: false,
  });
  googleConfigured = true;
}

/** False until the client ids are filled in, so the UI can stay honest. */
export const canUseGoogle = () => Boolean(GOOGLE_WEB_CLIENT_ID);

/**
 * S-17 on Android — links the anonymous session to a Google account.
 *
 * **This is the Android half of the only thing protecting purchased credits.**
 * Credits are consumables, and consumables cannot be restored by either store.
 * The ledger is the sole record that someone paid and it is keyed to a Firebase
 * uid that, while anonymous, dies with the install. Sign in with Apple covers
 * iOS; without this, an Android parent who reinstalls loses a paid balance
 * permanently and has no recourse.
 */
export async function linkGoogle(): Promise<{ linked: true } | { linked: false; reason: string }> {
  if (!GOOGLE_WEB_CLIENT_ID) return { linked: false, reason: 'not configured' };

  try {
    configureGoogle();

    // Android only — iOS has no Play Services and the call throws there.
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    const response = await GoogleSignin.signIn();
    // v13+ reports a user backing out as a RESULT, not a thrown error.
    if (!isSuccessResponse(response)) return { linked: false, reason: 'cancelled' };

    const idToken = response.data?.idToken;
    // Almost always a missing or mismatched webClientId — see above.
    if (!idToken) return { linked: false, reason: 'no identity token' };

    return await linkOrSignIn(GoogleAuthProvider.credential(idToken));
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return { linked: false, reason: 'cancelled' };
      if (err.code === statusCodes.IN_PROGRESS) return { linked: false, reason: 'cancelled' };
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { linked: false, reason: 'no play services' };
      }
    }
    return { linked: false, reason: 'failed' };
  }
}

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

    // Shared with Google — including the reinstall recovery. See linkOrSignIn.
    return await linkOrSignIn(oauth);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    // The parent cancelling is not an error and must not surface as one.
    if (code === 'ERR_REQUEST_CANCELED') return { linked: false, reason: 'cancelled' };
    return { linked: false, reason: 'failed' };
  }
}
