/**
 * BE-04 verification against real Firestore.
 *
 * "Idempotency is mandatory. Webhooks retry. A duplicated grant leaks money;
 *  a duplicated debit produces a furious parent." — techstacks.md §6
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
initializeApp({ credential: applicationDefault(), projectId: 'snugglee-prod' });

const { append, getBalance, recomputeBalance, debitForStory, refundForStory } =
  await import('/Volumes/extreme/Projects/Hackathons/Snugglee/server/src/ledger.ts');

const uid = `__test_${Date.now()}`;
const pass = (label, ok, detail = '') =>
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);

console.log(`test user: ${uid}\n`);

// 1. grant
const g1 = await append({ userId: uid, delta: 5, reason: 'purchase', transactionId: 'tx_abc' }, 'rc:tx_abc:grant');
pass('grant 5 credits', g1.applied && g1.balance === 5, `balance ${g1.balance}`);

// 2. THE CRITICAL ONE — same webhook delivered again
const g2 = await append({ userId: uid, delta: 5, reason: 'purchase', transactionId: 'tx_abc' }, 'rc:tx_abc:grant');
pass('DUPLICATE webhook is a no-op', !g2.applied && g2.balance === 5, `balance ${g2.balance} (must stay 5)`);

// 3. a genuinely different transaction still applies
const g3 = await append({ userId: uid, delta: 3, reason: 'purchase', transactionId: 'tx_def' }, 'rc:tx_def:grant');
pass('different transaction applies', g3.applied && g3.balance === 8, `balance ${g3.balance}`);

// 4. debit
const d1 = await debitForStory(uid, 'story_1');
pass('debit for story', d1.applied && d1.balance === 7, `balance ${d1.balance}`);

// 5. duplicate debit — a retried completion must not double-charge
const d2 = await debitForStory(uid, 'story_1');
pass('DUPLICATE debit is a no-op', !d2.applied && d2.balance === 7, `balance ${d2.balance} (must stay 7)`);

// 6. refund on generation failure
const r1 = await refundForStory(uid, 'story_1', 'generation failed');
pass('refund restores credit', r1.applied && r1.balance === 8, `balance ${r1.balance}`);

// 7. overdraft must be refused
let refused = false;
try { await append({ userId: uid, delta: -999, reason: 'story_consumed' }, `overdraft:${Date.now()}`); }
catch { refused = true; }
pass('overdraft refused', refused);

// 8. cached balance must equal the replayed log
const cached = await getBalance(uid);
const replayed = await recomputeBalance(uid);
pass('cached balance == sum of log', cached === replayed, `${cached} vs ${replayed}`);

// cleanup
const { getFirestore } = await import('firebase-admin/firestore');
const db = getFirestore();
const snap = await db.collection('credit_entries').where('userId', '==', uid).get();
await Promise.all(snap.docs.map((d) => d.ref.delete()));
await db.collection('credit_balances').doc(uid).delete();
console.log(`\ncleaned up ${snap.size} entries + balance`);
process.exit(0);
