#!/usr/bin/env node
/**
 * STORE-06 — mint a promo code.
 *
 * Grants credits through the same ledger a purchase uses, so a redemption
 * reconciles like any other entry and shows up in the parent's credit history.
 *
 * Lives under `server/` rather than the repo root because it imports
 * `firebase-admin`, and Node resolves modules from the SCRIPT's directory
 * upward — not from the working directory. At the repo root there is no
 * package.json and no node_modules, so it could never resolve there.
 *
 * Usage (from `server/`, with gcloud ADC already set up):
 *
 *   npm run promo -- REVIEW2026 --credits 20 --uses 50 \
 *     --note "App Review — attached to review notes"
 *
 *   npm run promo -- JUDGE2026 --credits 20 --uses 200 \
 *     --note "Hackathon judges" --days 90
 *
 * Codes are normalised to UPPERCASE with spaces and hyphens stripped, so
 * "judge 2026" and "JUDGE-2026" redeem the same code. Re-running with an
 * existing code OVERWRITES it and resets its use count.
 *
 * One redemption per user is enforced by the ledger's idempotency key, not by
 * `--uses`; that limit is a courtesy cap on total redemptions.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const argv = process.argv.slice(2);
const code = argv[0];

if (!code || code.startsWith('--')) {
  console.error('usage: create-promo-code.mjs <CODE> [--credits N] [--uses N] [--days N] [--note "..."]');
  process.exit(1);
}

const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const credits = Number(flag('credits', 20));
const maxUses = Number(flag('uses', 50));
const days = flag('days', null);
const note = flag('note', '');

if (!Number.isFinite(credits) || credits <= 0) {
  console.error('--credits must be a positive number');
  process.exit(1);
}

const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? 'snugglee-prod';
initializeApp({ credential: applicationDefault(), projectId });

const normalised = code.trim().toUpperCase().replace(/[\s-]+/g, '');
const doc = {
  credits,
  maxUses,
  uses: 0,
  active: true,
  note,
  ...(days ? { expiresAt: Date.now() + Number(days) * 86_400_000 } : {}),
};

await getFirestore().collection('promo_codes').doc(normalised).set(doc);

console.log(`\n  code      ${normalised}`);
console.log(`  credits   ${credits} per redeeming user`);
console.log(`  max uses  ${maxUses}`);
console.log(`  expires   ${doc.expiresAt ? new Date(doc.expiresAt).toISOString() : 'never'}`);
if (note) console.log(`  note      ${note}`);
console.log(`\n  Redeem in-app: Profile -> Credits -> "I have a code"\n`);

process.exit(0);
