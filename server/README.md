# server — Cloud Run orchestration

**Live:** https://snugglee-api-75574145355.asia-southeast1.run.app
**Measured warm TTFB from Malaysia: 55–64ms** — comfortably inside the 300ms
page-1 budget, leaving ~240ms for actual work.

**Cloud Run with `min-instances=1`. Not Cloud Functions** (D-14): a cold start
consumes the entire page-1 budget, and idle cost is a few dollars a month.

```bash
npm install
npm run typecheck
PORT=8787 GEMINI_API_KEY=… npm run dev
npm run deploy:sg     # asia-southeast1
npm run deploy:us     # us-central1 — see Regions
```

## Before it can do anything: populate the secrets

The five secrets exist and Cloud Run's service account can read them, but they
have **no versions yet**. Add one value each:

```bash
printf 'YOUR_KEY' | gcloud secrets versions add GEMINI_API_KEY            --data-file=- --project=snugglee-prod
printf 'YOUR_KEY' | gcloud secrets versions add MINIMAX_API_KEY           --data-file=- --project=snugglee-prod
printf 'YOUR_ID'  | gcloud secrets versions add MINIMAX_GROUP_ID          --data-file=- --project=snugglee-prod
printf 'YOUR_KEY' | gcloud secrets versions add CARTESIA_API_KEY          --data-file=- --project=snugglee-prod
openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add REVENUECAT_WEBHOOK_SECRET --data-file=- --project=snugglee-prod
```

Then redeploy with them mounted:

```bash
gcloud run services update snugglee-api --region=asia-southeast1 --project=snugglee-prod \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest,\
MINIMAX_API_KEY=MINIMAX_API_KEY:latest,\
MINIMAX_GROUP_ID=MINIMAX_GROUP_ID:latest,\
CARTESIA_API_KEY=CARTESIA_API_KEY:latest,\
REVENUECAT_WEBHOOK_SECRET=REVENUECAT_WEBHOOK_SECRET:latest
```

The RevenueCat secret is the value you paste into the RevenueCat dashboard's
webhook Authorization header (`PAY-04`).

## Layout

| File | Task | Role |
|---|---|---|
| `src/providers/types.ts` | **BE-03** | The abstraction. **Imports nothing.** |
| `src/providers/voice.ts` | BE-03 | Only file that knows MiniMax/Cartesia exist |
| `src/providers/gemini.ts` | BE-03 | Only file that knows Gemini exists |
| `src/ledger.ts` | **BE-04** | Append-only credit ledger |
| `src/webhook.ts` | **BE-05** | RevenueCat receiver, idempotent |
| `src/story.ts` | **BE-06** | Manifest + streaming contract |
| `src/auth.ts` | BE-02 | Firebase Auth, anonymous → linked |
| `src/index.ts` | BE-01 | Routes |

### The rule that matters

**Nothing outside `providers/` may import a vendor SDK or hit a vendor URL.**
Route handlers talk to `synthesize()` / `illustrate()` and nothing else. That is
what makes the MiniMax/Cartesia split a routing decision rather than a rewrite,
and it is the migration path to self-hosted inference (techstacks.md §7).

Callers pass *which voice they need*, never which vendor:

```ts
voice: { kind: 'stock' }                   // → MiniMax, pay-as-you-go
voice: { kind: 'cloned', voiceId: '…' }    // → Cartesia, won O-02 on timbre
```

## Verified

- **Ledger idempotency, 8/8 against real Firestore** (`ledger-test.mjs`):
  duplicate webhook is a no-op, duplicate debit is a no-op, refund restores,
  overdraft refused, cached balance equals the replayed log.
- Auth boundaries: unauthenticated → 401, wrong webhook secret → 401.
- Deploy, `min-instances=1`, warm latency.

## Two deliberate choices worth knowing

**Manifest persist is fire-and-forget.** `createManifest` does not await the
Firestore write. Page 1 is fully determined by the template and the child's
name, so nothing in the response depends on it — awaiting would put a database
round-trip inside the 300ms budget. Tradeoff: a failed write means the story is
unresumable and abandonment goes unrecorded. Neither is visible to the child
mid-story; both are worth less than the latency they would cost.

**Cloned synthesis degrades to the stock narrator on failure.** Cartesia does
not publish what happens when plan credits run out. If it hard-fails, every
cloned-voice request fails at once, at bedtime — the exact failure design.md §2
forbids. We cannot substitute the parent's voice, so the story continues in the
stock voice rather than erroring. The response header marks it
`minimax:degraded-from-cartesia` so the client can mention it *later*, never
mid-story.

## Regions

Deployed to `asia-southeast1`. Measured 2026-07-27 from Malaysia: ~100ms vs
~310ms for `us-central1` on an idle container — the wrong region alone consumes
the whole page-1 budget.

`us-central1` is **not yet deployed**. The diaspora wedge puts buyer and
listener on different continents, so both are wanted before launch, with the
client picking by locale. Firestore is single-region (`asia-southeast1`,
permanent), so a US deployment pays cross-region on ledger reads — acceptable,
because the ledger is hit on the paywall, not on the bedtime path.

## Not built yet

`/story/:id/page/:n` generation, the safety gate, voice clone/consent endpoints,
and audio storage. Those are Phase 2A (`BE-08`) once the client exists to drive
them.
