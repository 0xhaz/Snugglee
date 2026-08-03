/**
 * Measured cost model for the harness.
 *
 * architecture.md §6: "Log actual cost per call. O-03 is downstream of measured
 * COGS." The pack pricing decision (O-03) must not be made against the modelled
 * table in architecture.md §4 — it must be made against what these calls
 * actually cost.
 *
 * Prices verified from ai.google.dev/gemini-api/docs/pricing on 2026-07-27.
 * architecture.md §4 carries the same warning: re-verify before freezing packs.
 */

export type ImageModelId =
  | 'gemini-3.1-flash-lite-image'
  | 'gemini-3.1-flash-image'
  | 'gemini-3-pro-image'
  | 'gemini-2.5-flash-image';

/**
 * NOTE: `gemini-2.5-flash-lite` — the model D-09 was costed against — is
 * retired for new projects ("no longer available to new users", verified
 * 2026-07-27). The cheapest reachable Flash-Lite is now gemini-3.1-flash-lite
 * at $0.25/$1.50 per 1M vs 2.5's $0.10/$0.40, so real text cost is ~4× the
 * $0.0006/story in D-09 — about $0.0024. Still negligible against $0.13+ of
 * images and $0.14 of TTS, so D-09's conclusion ("free relative to image and
 * audio") holds. The number in it does not.
 */
export type TextModelId =
  | 'gemini-3.1-flash-lite'
  | 'gemini-3.5-flash-lite'
  | 'gemini-flash-lite-latest';

/** USD per generated image at ~1K resolution. */
export const IMAGE_PRICE_1K: Record<ImageModelId, number> = {
  'gemini-3.1-flash-lite-image': 0.0336,
  'gemini-2.5-flash-image': 0.039,
  'gemini-3.1-flash-image': 0.067,
  'gemini-3-pro-image': 0.134,
};

/**
 * How each tier maps onto the economics already written down in
 * architecture.md §4. Shown in the UI so the SPIKE-01 judgement is made with
 * the margin consequence visible, not inferred later.
 */
export const IMAGE_TIER_NOTE: Record<ImageModelId, string> = {
  'gemini-3.1-flash-lite-image':
    'Cheapest, and newer than the doc’s cheap path. Not in architecture.md §4.',
  'gemini-2.5-flash-image': 'The §4 "cheap path" ($0.156 for 4). ~65% margin on a $4.99/5 pack.',
  'gemini-3.1-flash-image': 'Middle tier. Did not exist when §4 was written.',
  'gemini-3-pro-image': 'The §4 "premium path" ($0.536 for 4). ~3% margin — effectively unshippable.',
};

/** USD per 1M tokens. */
export const TEXT_PRICE: Record<TextModelId, { input: number; output: number }> = {
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-3.5-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-flash-lite-latest': { input: 0.25, output: 1.5 },
};

export function imageCost(model: ImageModelId, count: number): number {
  return (IMAGE_PRICE_1K[model] ?? 0) * count;
}

export function textCost(model: TextModelId, inTok: number, outTok: number): number {
  const p = TEXT_PRICE[model];
  if (!p) return 0;
  return (inTok / 1e6) * p.input + (outTok / 1e6) * p.output;
}

export type CostEntry = {
  at: number;
  stage: string;
  model: string;
  detail: string;
  usd: number;
};

/* ------------------------------ voice / TTS -------------------------------- */

/**
 * MEASURED from a real generated story (SPK-03, 2026-07-28):
 *   6 pages · **543 words · 2,975 characters** · 5.48 chars/word
 *
 * architecture.md §4 assumes "~500 words ≈ 2,800 characters" — **within 6% of
 * measured, so the §4 table is broadly sound.**
 *
 * But the reason it holds is worth knowing: D-15 specifies 6 × ~120 = 720
 * words, and the model actually wrote **91 words per page**, not 120. §4's
 * numbers work because the model under-delivers against the spec, not because
 * the spec was costed correctly.
 *
 * **If the prompt is tightened to genuinely hit 120 words/page, narration
 * grows ~33% to ~3,950 characters** and every per-character cost moves with
 * it. So D-15's page length is a live cost lever, not a fixed input — decide
 * deliberately whether 91 or 120 words per page is the product, and re-cost if
 * it changes. Narration length also drives session length, which is the thing
 * the product is actually selling.
 *
 * Offset by §4.1: at prefetch depth 2, pages past the child falling asleep are
 * never generated and never billed, so effective COGS is ~60–70% of these.
 */
export const CHARS_PER_WORD = 5.48;
export const STORY_CHARS_MEASURED = 2975;
export const STORY_WORDS_MEASURED = 543;
/** What D-15 would cost if the prompt actually enforced 120 words/page. */
export const STORY_CHARS_D15_ENFORCED = Math.round(720 * CHARS_PER_WORD);
export const STORY_CHARS_S4 = 2800;

/** Measured text cost per story: generation + Layer-2 classifier. */
export const TEXT_USD_PER_STORY_MEASURED = 0.001466;

/** Cartesia bills TTS at 1 credit per character. */
export const CARTESIA_CREDITS_PER_CHAR = 1;

export type CartesiaTier = 'Free' | 'Pro' | 'Startup' | 'Scale';

export const CARTESIA_PLANS: Record<
  CartesiaTier,
  { usd: number; credits: number; cloning: string }
> = {
  Free: { usd: 0, credits: 20_000, cloning: 'none — 402 plan_upgrade_required' },
  Pro: { usd: 5, credits: 100_000, cloning: 'instant' },
  Startup: { usd: 49, credits: 1_250_000, cloning: 'pro' },
  Scale: { usd: 299, credits: 8_000_000, cloning: 'pro' },
};

/** Effective $/credit at full plan utilisation. Under-use raises this. */
export function cartesiaUsdPerCredit(tier: CartesiaTier): number {
  const p = CARTESIA_PLANS[tier];
  return p.usd === 0 ? 0 : p.usd / p.credits;
}

/**
 * MiniMax does not publish direct per-character rates publicly — they are in
 * the platform console once logged in. Reseller rates found 2026-07-28 conflict:
 *
 *   speech-02-hd  (what this harness calls)  ~$0.05 / 1K chars  (several resellers)
 *   speech-2.8-hd (newer)                     $0.10 / 1K chars  (OpenRouter)
 *
 * The default below is the lower figure for the model we actually call, but it
 * is an ESTIMATE FROM A RESELLER, not your billed rate. The panel exposes it as
 * an editable field — replace it with the number from your console before O-02
 * is decided on cost, because O-03 pack pricing hangs off it.
 */
export const MINIMAX_USD_PER_1K_CHARS_DEFAULT = 0.05;

/**
 * Projects a per-story COGS from a single measured run, so the SPIKE-01 call
 * and the O-03 pack decision are made against the same number.
 *
 * NOTE: this is the cost of a *complete* story. architecture.md §4.1 is
 * explicit that most stories will not be completed — a child asleep at page 4
 * of 6 is the product working — and that at prefetch depth 2, pages past the
 * drop-off are never generated and never billed. Effective COGS is therefore
 * roughly 60–70% of this figure. Do not price packs off this number until
 * abandonment is measured from real usage.
 */
export function projectStoryCost(opts: {
  imageModel: ImageModelId;
  imagesPerStory: number;
  textUsd: number;
  ttsUsd: number;
}): { images: number; text: number; tts: number; total: number } {
  const images = imageCost(opts.imageModel, opts.imagesPerStory);
  const total = images + opts.textUsd + opts.ttsUsd;
  return { images, text: opts.textUsd, tts: opts.ttsUsd, total };
}
