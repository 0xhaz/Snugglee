/**
 * BE-05 — RevenueCat webhook receiver.
 *
 * techstacks.md §6: RevenueCat handles the store transaction; **balance
 * tracking is ours**. Consumables are non-subscription transactions —
 * RevenueCat reports them, it does not maintain a balance.
 *
 *   Purchase (client, RevenueCat SDK)
 *      -> webhook -> here
 *      -> idempotency check on transaction_id
 *      -> append CREDIT entry to the ledger
 *      -> client refreshes balance from the server
 *
 * **Idempotency is mandatory. Webhooks retry.**
 */
import { timingSafeEqual } from 'node:crypto';

import type { Context } from 'hono';
import { config } from './config.ts';
import { append } from './ledger.ts';

/**
 * Constant-time comparison of the webhook secret.
 *
 * Tolerates an optional `Bearer ` prefix: RevenueCat's UI shows
 * "e.g. Bearer Xz3aHxYNQFcdgRvb" as the placeholder, so the value gets pasted
 * both ways in practice. Rejecting one of them produces a 401 on every event
 * with nothing in the logs explaining why, and credits silently never arrive.
 *
 * timingSafeEqual rather than `!==` — a plain comparison leaks the secret one
 * character at a time to anyone willing to measure.
 */
function authorised(header: string, secret: string): boolean {
  const provided = header.startsWith('Bearer ') ? header.slice(7) : header;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // Length differences are not secret — and timingSafeEqual throws on mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Credits granted per product.
 *
 * **Must match the IAP products in App Store Connect / Play Console exactly.**
 * A product configured in the store but missing here is a purchase that takes
 * a parent's money and grants nothing — the webhook logs it loudly and
 * acknowledges, but the credits never arrive. Keep this list and the paywall
 * in lockstep.
 *
 * Pricing rationale lives in the internal docs, not here.
 */
const CREDITS_BY_PRODUCT: Record<string, number> = {
  'com.snugglee.credits.3': 3,
  'com.snugglee.credits.5': 5,
  'com.snugglee.credits.20': 20,
};

/** Events that grant credits. Everything else is acknowledged and ignored. */
const GRANTING = new Set(['NON_RENEWING_PURCHASE', 'INITIAL_PURCHASE', 'UNCANCELLATION']);
/** Events that claw credits back. */
const REVOKING = new Set(['CANCELLATION', 'REFUND', 'EXPIRATION']);

export async function revenuecatWebhook(c: Context) {
  // RevenueCat sends a shared secret on the Authorization header.
  const auth = c.req.header('authorization') ?? '';
  if (!authorised(auth, config.revenuecat.webhookSecret())) {
    // Logged so a misconfigured header is diagnosable — the value is never
    // logged, only the fact that one arrived.
    console.error('[revenuecat] rejected webhook: bad or missing Authorization');
    return c.json({ error: 'unauthorized' }, 401);
  }

  const body = (await c.req.json().catch(() => null)) as any;
  const event = body?.event;
  if (!event) return c.json({ error: 'no event' }, 400);

  const type: string = event.type ?? '';
  const userId: string = event.app_user_id ?? '';
  const productId: string = event.product_id ?? '';
  const transactionId: string = event.transaction_id ?? event.id ?? '';

  if (!userId || !transactionId) {
    return c.json({ error: 'missing app_user_id or transaction_id' }, 400);
  }

  // Always 200 on events we do not act on. A non-2xx makes RevenueCat retry
  // forever on something we were never going to process.
  if (!GRANTING.has(type) && !REVOKING.has(type)) {
    return c.json({ ok: true, ignored: type });
  }

  const credits = CREDITS_BY_PRODUCT[productId];
  if (credits === undefined) {
    // Unknown product: acknowledge, but make it loud. Silently dropping a real
    // purchase is how a paying parent ends up with no credits and no recourse.
    console.error('[revenuecat] UNKNOWN PRODUCT', { productId, transactionId, userId, type });
    return c.json({ ok: true, warning: 'unknown product' });
  }

  const revoking = REVOKING.has(type);
  const delta = revoking ? -credits : credits;

  try {
    // transaction_id is the idempotency key. A retried delivery collides on the
    // document id and becomes a no-op rather than a second grant.
    const result = await append(
      {
        userId,
        delta,
        reason: revoking ? 'adjustment' : 'purchase',
        transactionId,
        note: revoking ? `revoked by ${type}` : undefined,
      },
      `rc:${transactionId}:${revoking ? 'revoke' : 'grant'}`,
    );

    console.log('[revenuecat]', {
      type,
      productId,
      delta,
      applied: result.applied,
      balance: result.balance,
    });
    return c.json({ ok: true, applied: result.applied, balance: result.balance });
  } catch (e) {
    // A revoke that would take the balance negative throws. Do NOT 500 —
    // RevenueCat would retry forever. Log it for manual reconciliation; the
    // credits were already spent, which is a business decision, not a bug.
    console.error('[revenuecat] ledger append failed', e);
    return c.json({ ok: true, warning: String(e) });
  }
}
