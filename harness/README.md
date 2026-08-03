# harness — pipeline test bench

Stage 1 built. A React **web** harness, because the pipeline cannot be
meaningfully evaluated in a mobile simulator (architecture.md §6).

## Run it

```bash
cd harness
cp .env.example .env.local     # then fill in the keys
npm run dev                    # http://localhost:5273
```

The header shows a ✓/✗ per vendor key. `GEMINI_API_KEY` alone unlocks SPIKE-01
and SPK-03; the voice A/B additionally needs both MiniMax and Cartesia.

Fetch the Gemini key for `snugglee-prod`:

```bash
gcloud services api-keys list --project=snugglee-prod \
  --filter="displayName:'Snugglee harness (local dev)'" --format="value(name)"
gcloud services api-keys get-key-string <NAME> --project=snugglee-prod
```

## Panels

| Panel | Task | Needs |
|---|---|---|
| **SPIKE-01 · images** | The gating spike. 4 story-beat panels, model-tier and generation-mode controls. | Gemini |
| **SPK-03 · story + safety** | Story prompt iteration with the Layer-2 classifier verdict shown alongside. | Gemini |
| **O-02 · voice A/B** | Blind bake-off, MiniMax vs Cartesia. | MiniMax + Cartesia |

### Two controls in SPIKE-01 go beyond architecture.md §7, deliberately

1. **Model tier.** §7 says "standard Nano Banana", but that is now a family of
   four models at four price points, and the tier choice *is* the unit
   economics. Prices verified 2026-07-27:

   | Model | per 1K image | ×4 panels | §4 mapping |
   |---|---|---|---|
   | `gemini-3.1-flash-lite-image` | $0.0336 | $0.134 | newer + cheaper than the doc's cheap path |
   | `gemini-2.5-flash-image` | $0.039 | $0.156 | = §4 "cheap path" |
   | `gemini-3.1-flash-image` | $0.067 | $0.268 | middle tier, didn't exist in §4 |
   | `gemini-3-pro-image` | $0.134 | $0.536 | = §4 "premium path", ~3% margin |

2. **Chained reference.** §7's method is four *independent* generations from one
   description. But these models take reference images natively, so feeding
   panel N-1 into panel N is a consistency lever available today — far cheaper
   than fallback (c) (IP-Adapter / per-story LoRA), which §7 concedes is out of
   window. **If independent fails and chained passes, the cheap path survives.**

Judge against the loosened bar in §7: two consistent panels plus imagination is
a defensible product, not a compromise.

## Rules

- **A harness, not a second app. Ugly on purpose.** One page per pipeline stage.
  No routing, no state library, no design system.
- **Log actual cost per call.** O-03 (pack pricing) is downstream of measured
  COGS, not modelled COGS. Footer tracks session spend; export CSV.
- **No `<StrictMode>`.** It double-invokes effects, which on a bench making paid
  calls would double the bill and corrupt the measured figure.
- **Keys live in Node.** `harness/proxy/*` runs in Vite dev middleware; nothing
  vendor-related is bundled into client code. Mirrors techstacks.md §1.

## Known gap

`proxy/voice.ts` — the MiniMax and Cartesia endpoint shapes were written from
memory, **not verified against live docs**. Confirm before the Wednesday
bake-off or the panel will fail on a field name. The Gemini shapes in
`proxy/gemini.ts` were checked against current documentation.

## What the harness cannot answer

Everything on a device: time-to-first-audio over real networks · audio session on
backgrounding, calls, lock screen · buffering with genuine latency · RevenueCat
purchase and restore · parental gate · offline replay · notification timing.

The harness answers *does the pipeline produce good output*.
The device answers *does the experience hold up*.

## Stage 2 (Aug 1–10)

Rebuilt against the **real backend**. Simulating it validates a fiction, and the
contract breaks the first time a device touches it.
