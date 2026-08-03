# Snugglee

A personalised bedtime story where your child is the hero, narrated in your own
voice.

Built for RevenueCat Shipaton 2026.

---

## Layout

| Directory | What it is |
|---|---|
| `mobile/` | React Native / Expo client (iOS + Android) |
| `server/` | Cloud Run API — story orchestration, credit ledger, voice broker |
| `harness/` | Throwaway pipeline bench used to evaluate vendors and prompts |
| `assets-pipeline/` | Build-time story authoring and illustration rendering |
| `scripts/` | Operational helpers |

## Running it

**Client**

```bash
cd mobile
npm install
npx expo start            # add --localhost for a simulator
```

**Server**

```bash
cd server
npm install
npm run typecheck
PORT=8787 npm run dev
```

Vendor credentials come from Secret Manager in production and are never bundled
into the client. See `server/README.md`.

**Pipeline** (only needed when adding or changing a story theme)

```bash
node assets-pipeline/author-skeletons.mjs   # write story skeletons
node assets-pipeline/render-art.mjs         # render illustrations
node assets-pipeline/optimise.mjs           # compress + bundle into the app
```

## Architecture in one paragraph

Stories come in two flavours. The **Instant Path** interpolates a pre-authored
skeleton and uses illustrations rendered once at build time, so a free story
costs almost nothing per user. The **Custom Path** generates both text and art
per story and consumes a credit. Generation is lazy in both cases — never more
than two pages ahead of where the child has actually reached — because a child
falling asleep partway through is the product working, and pages nobody hears
are never generated or paid for.

The parent's voice is cloned from a short recording. The raw recording is never
stored; only a vendor reference is kept, and deleting it propagates to the
vendor before the local record clears.

## Safety

Generated content passes two independent layers: a constrained generation
prompt, and a classifier pass before any text is spoken. The classifier runs at
authoring time too — a bad story skeleton would otherwise ship to every user.
Regression tests live in `harness/safety-tests/`.

## Notes

`_internal/` holds product strategy, unit economics and schedule. It is
deliberately untracked.
