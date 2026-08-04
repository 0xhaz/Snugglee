/**
 * PAY-03 — RevenueCat.
 *
 * **RevenueCat handles the store transaction; the balance is ours.** Consumables
 * are non-subscription transactions — RevenueCat reports them, it does not
 * maintain a balance. So the flow is:
 *
 *   purchase (here)
 *      -> RevenueCat webhook -> our server
 *      -> idempotency check on transaction_id
 *      -> append CREDIT entry to the ledger
 *      -> client refreshes balance FROM THE SERVER
 *
 * The client never adds credits locally, even optimistically. A client-side
 * balance is trivially forged and it is the number that decides whether a story
 * gets generated (D-03).
 *
 * ⚠️ `react-native-purchases` is a native module — it does not run in Expo Go.
 * Anything here needs an EAS dev build to exercise.
 */
import Constants from 'expo-constants';
import Purchases, {
  LOG_LEVEL,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from 'react-native-purchases';
import { Platform } from 'react-native';

import { ensureSession } from './session';

/**
 * RevenueCat's public SDK key. Safe in the client by design — it identifies the
 * app, it does not authorise anything. The webhook secret, which does, lives in
 * Secret Manager and never leaves the server.
 */
const API_KEY =
  Platform.select({
    ios: Constants.expoConfig?.extra?.revenuecatIosKey,
    android: Constants.expoConfig?.extra?.revenuecatAndroidKey,
  }) ?? '';

/** Credits per product. Must match `server/src/webhook.ts` exactly. */
export const CREDITS_BY_PRODUCT: Record<string, number> = {
  'com.snugglee.credits.3': 3,
  'com.snugglee.credits.5': 5,
  'com.snugglee.credits.20': 20,
};

export type Pack = {
  productId: string;
  credits: number;
  /** Localised, store-formatted price — never hardcoded. */
  priceString: string;
  pkg: PurchasesPackage | null;
};

let configured = false;

/**
 * Configures RevenueCat with the Firebase uid as the app user id.
 *
 * Using our uid rather than letting RevenueCat generate an anonymous one is
 * what makes the webhook able to credit the right ledger — `app_user_id` in the
 * webhook payload is this value.
 */
export async function initPurchases(): Promise<boolean> {
  if (configured) return true;
  if (!API_KEY) return false; // not configured yet — paywall falls back

  try {
    const user = await ensureSession();
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    await Purchases.configure({ apiKey: API_KEY, appUserID: user.uid });
    configured = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Live packs with real localised prices.
 *
 * Falls back to null pricing rather than throwing: a paywall that fails to load
 * should still explain what is on offer, not show an error to a parent at
 * bedtime.
 */
export async function getPacks(): Promise<Pack[] | null> {
  if (!(await initPurchases())) return null;

  try {
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    if (!packages.length) return null;

    return packages
      .map((pkg) => {
        const product: PurchasesStoreProduct = pkg.product;
        return {
          productId: product.identifier,
          credits: CREDITS_BY_PRODUCT[product.identifier] ?? 0,
          priceString: product.priceString,
          pkg,
        };
      })
      .filter((p) => p.credits > 0)
      .sort((a, b) => a.credits - b.credits);
  } catch {
    return null;
  }
}

export type PurchaseResult =
  | { status: 'ok' }
  | { status: 'cancelled' }
  | { status: 'failed' };

/**
 * Buys a pack.
 *
 * Returning `ok` means the STORE accepted payment — not that credits have
 * landed. Those arrive via the webhook, so the caller must re-read the balance
 * from the server rather than assuming.
 */
export async function buy(pack: Pack): Promise<PurchaseResult> {
  if (!pack.pkg) return { status: 'failed' };

  try {
    await Purchases.purchasePackage(pack.pkg);
    return { status: 'ok' };
  } catch (e) {
    // A parent changing their mind is not an error and must not read as one.
    if ((e as { userCancelled?: boolean })?.userCancelled) {
      return { status: 'cancelled' };
    }
    return { status: 'failed' };
  }
}

/**
 * Restore.
 *
 * Present for App Review, which expects a restore affordance on any paid app —
 * but consumables are NOT restored by the store, so this cannot bring credits
 * back. It re-syncs the RevenueCat user, and the honest recovery path for a
 * balance is signing in (S-17).
 */
export async function restore(): Promise<boolean> {
  if (!(await initPurchases())) return false;
  try {
    await Purchases.restorePurchases();
    return true;
  } catch {
    return false;
  }
}
