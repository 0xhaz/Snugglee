/**
 * BE-02 — Firebase Auth. Anonymous on launch, upgraded to a linked account later.
 *
 * design.md §2: "No blocking account wall before first value." An anonymous
 * session exists from the first launch; identity is requested only once the
 * user has something to lose — after the first purchase, but before credits
 * accumulate on a device they could lose (S-17).
 *
 * Anonymous and linked users are the same Firebase uid, so the ledger never
 * needs migrating when an account is linked. That is the whole reason for
 * anonymous-then-link rather than a device id.
 */
import { getAuth } from 'firebase-admin/auth';
import type { Context, Next } from 'hono';

export type AuthedUser = {
  uid: string;
  /** False for anonymous sessions. Gates nothing on the free path. */
  isLinked: boolean;
};

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthedUser;
  }
}

/**
 * Verifies the Firebase ID token on `Authorization: Bearer <token>`.
 *
 * Rejects with 401 rather than falling through to an anonymous default — a
 * silent fallback would let a forged request act as a fresh user, which on a
 * server-authoritative ledger is a way to mint free credits.
 */
export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: 'unauthenticated' }, 401);

  try {
    const decoded = await getAuth().verifyIdToken(token);
    c.set('user', {
      uid: decoded.uid,
      isLinked: decoded.firebase?.sign_in_provider !== 'anonymous',
    });
  } catch {
    // Deliberately not echoing the verification error — it tells an attacker
    // whether a token is malformed, expired, or for the wrong project.
    return c.json({ error: 'unauthenticated' }, 401);
  }

  await next();
}
