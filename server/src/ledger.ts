/**
 * BE-04 — server-authoritative credit ledger.
 *
 * D-03: client-side balances are trivially forged. This is the only place a
 * balance may be derived, and it is derived by summing an append-only log —
 * never by mutating a counter.
 *
 * "Never mutate a balance field directly; the audit trail is what lets you
 * diagnose disputes and refund correctly." (techstacks.md §6)
 *
 * Idempotency is mandatory. Webhooks retry. A duplicated grant leaks money; a
 * duplicated debit produces a furious parent.
 */
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

export type LedgerReason =
  | 'purchase' // RevenueCat webhook, +credits
  | 'welcome' // D-17, the free story every new account starts with
  | 'story_consumed' // story started, -1
  | 'story_refund' // generation failed after debit, +1
  | 'promo' // judge / reviewer / promo code grant
  | 'adjustment'; // manual, always with a note

export type LedgerEntry = {
  userId: string;
  delta: number;
  reason: LedgerReason;
  /** Store transaction id. The idempotency key for purchases. */
  transactionId?: string;
  storyId?: string;
  note?: string;
  createdAt: FirebaseFirestore.Timestamp | FieldValue;
};

let dbInstance: Firestore | null = null;
const db = () => (dbInstance ??= getFirestore());

const entries = () => db().collection('credit_entries');
const balances = () => db().collection('credit_balances');

/**
 * Append an entry and update the cached balance in one transaction.
 *
 * `idempotencyKey` makes retries safe: the entry document ID *is* the key, so a
 * duplicate delivery collides and becomes a no-op rather than a second grant.
 */
export async function append(
  entry: Omit<LedgerEntry, 'createdAt'>,
  idempotencyKey: string,
): Promise<{ applied: boolean; balance: number }> {
  const entryRef = entries().doc(idempotencyKey);
  const balRef = balances().doc(entry.userId);

  return db().runTransaction(async (tx) => {
    const existing = await tx.get(entryRef);
    const balSnap = await tx.get(balRef);
    const current = (balSnap.data()?.balance as number | undefined) ?? 0;

    if (existing.exists) {
      // Already applied. This is the retry path and it must be silent.
      return { applied: false, balance: current };
    }

    if (entry.delta < 0 && current + entry.delta < 0) {
      throw new Error('insufficient credits');
    }

    tx.set(entryRef, { ...entry, createdAt: FieldValue.serverTimestamp() });
    tx.set(
      balRef,
      { balance: current + entry.delta, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { applied: true, balance: current + entry.delta };
  });
}

/** Cached sum. Authoritative because only `append` may write it. */
export async function getBalance(userId: string): Promise<number> {
  const snap = await balances().doc(userId).get();
  return (snap.data()?.balance as number | undefined) ?? 0;
}

/**
 * Recompute from the log. The cached balance is a convenience; this is the
 * truth. Use it to reconcile, and in any dispute.
 */
export async function recomputeBalance(userId: string): Promise<number> {
  const snap = await entries().where('userId', '==', userId).get();
  return snap.docs.reduce((sum, d) => sum + ((d.data().delta as number) ?? 0), 0);
}

export async function history(userId: string, limit = 50) {
  const snap = await entries()
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * D-17 — every account starts with one free story.
 *
 * Granted lazily rather than at signup: the session is anonymous and created
 * silently in the background (S-17, no account wall before value), so there is
 * no "signup" moment to hook. Idempotent on the uid, so calling it on every
 * balance read is safe and the grant happens exactly once.
 *
 * "Tune post-launch" (D-17) means this number moves. It is the only place it
 * is written down in code.
 */
export const WELCOME_CREDITS = 1;

export const grantWelcome = (userId: string) =>
  append(
    { userId, delta: WELCOME_CREDITS, reason: 'welcome', note: 'D-17 free story' },
    `welcome:${userId}`,
  );

/**
 * Debit for a story.
 *
 * **Charged at START, not on completion.** The docs originally said completion,
 * but ECONOMICS §5 is explicit that a child asleep at page 4 is the product
 * WORKING and the expected case — so charging on completion would make most
 * stories free while we still pay the per-page TTS ($0.149 marginal on the
 * Instant Path). The credit buys the telling, not the finishing.
 *
 * `refundForStory` covers the case where we take the credit and then fail to
 * deliver. The story id is the idempotency key, so a retried start cannot
 * double-charge.
 *
 * Throws `insufficient credits` when the balance would go negative — that is
 * the paywall trigger, and it is enforced here rather than in the client
 * because a client-side balance is trivially forged (D-03).
 */
export const debitForStory = (userId: string, storyId: string) =>
  append(
    { userId, delta: -1, reason: 'story_consumed', storyId },
    `story_consumed:${storyId}`,
  );

export const refundForStory = (userId: string, storyId: string, note?: string) =>
  append(
    { userId, delta: 1, reason: 'story_refund', storyId, note },
    `story_refund:${storyId}`,
  );
