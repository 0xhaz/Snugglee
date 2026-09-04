/**
 * STORE-06 — promo codes.
 *
 * Two audiences, one mechanism:
 *
 *  1. **Hackathon judges.** The requirement is explicit: judges must reach
 *     *every* premium feature, and "the free first story is not sufficient on
 *     its own". With D-17 in force, one free story does not get a judge to a
 *     cloned voice on a second story.
 *
 *  2. **App Review.** Reviewers test IAP in the StoreKit *sandbox* and do not
 *     need a code to purchase. This is the fallback for when sandbox misbehaves
 *     — which it does — so a reviewer is never blocked from premium features by
 *     an outage on Apple's side. Put the code in the App Review notes.
 *
 * Deliberately NOT an Apple "promo code": those are store-issued, limited in
 * number, and do not exist for consumables in the way people expect. This is
 * our own ledger grant, so it works identically on both platforms and on a
 * build that has never been through review.
 *
 * Codes are ledger entries like any other (D-03 — the server-authoritative
 * ledger is the only way credits come into existence), so a redemption appears
 * in credit history and reconciles like a purchase.
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { append } from './ledger.ts';

export type PromoCode = {
  /** Credits granted per redeeming user. */
  credits: number;
  /** Total redemptions allowed across all users. */
  maxUses: number;
  uses: number;
  active: boolean;
  /** Free text — who it was issued to, so codes can be reasoned about later. */
  note?: string;
  /** Epoch ms. Absent means no expiry. */
  expiresAt?: number;
};

export type RedeemResult =
  | { ok: true; credits: number; balance: number; alreadyRedeemed: boolean }
  | { ok: false; reason: 'unknown' | 'inactive' | 'expired' | 'exhausted' };

const codes = () => getFirestore().collection('promo_codes');

/** Case- and whitespace-insensitive: these get typed by hand, often on a phone. */
export const normalise = (raw: string) => raw.trim().toUpperCase().replace(/[\s-]+/g, '');

export async function redeem(userId: string, rawCode: string): Promise<RedeemResult> {
  const code = normalise(rawCode);
  if (!code) return { ok: false, reason: 'unknown' };

  const ref = codes().doc(code);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'unknown' };

  const promo = snap.data() as PromoCode;
  if (!promo.active) return { ok: false, reason: 'inactive' };
  if (promo.expiresAt && Date.now() > promo.expiresAt) return { ok: false, reason: 'expired' };
  if ((promo.uses ?? 0) >= promo.maxUses) return { ok: false, reason: 'exhausted' };

  /**
   * One redemption per user per code, enforced by the idempotency key rather
   * than by a lookup. A second attempt returns `applied: false` and the
   * unchanged balance, so re-entering a code is harmless rather than a second
   * grant — and the caller can tell the user plainly that they already have it.
   */
  const result = await append(
    { userId, delta: promo.credits, reason: 'promo', note: `promo:${code}` },
    `promo:${code}:${userId}`,
  );

  /**
   * Usage counting is best-effort and deliberately outside the ledger
   * transaction. `maxUses` is a courtesy limit on codes we hand out ourselves,
   * not a security boundary — the security boundary is the per-user
   * idempotency key above, which no race can defeat. Trading exactness here
   * avoids a cross-collection transaction on the path a reviewer is using.
   */
  if (result.applied) {
    await ref.update({ uses: FieldValue.increment(1) }).catch(() => {});
  }

  return {
    ok: true,
    credits: promo.credits,
    balance: result.balance,
    alreadyRedeemed: !result.applied,
  };
}

/** Used by scripts/create-promo-code.mjs. Overwrites an existing code. */
export async function upsert(code: string, promo: Omit<PromoCode, 'uses'>): Promise<string> {
  const id = normalise(code);
  await codes().doc(id).set({ ...promo, uses: 0 });
  return id;
}
