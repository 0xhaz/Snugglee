/**
 * BE-03 — THE PROVIDER ABSTRACTION.
 *
 * techstacks.md §3 requires these two interfaces be defined **before any vendor
 * SDK is imported anywhere**. This file therefore imports nothing.
 *
 * It is not premature abstraction. It is:
 *   - the mitigation for mid-window vendor pricing changes
 *   - the migration path to self-hosted inference (techstacks.md §7)
 *   - the SPIKE-01 fallback route to a reference-conditioned image pipeline
 *   - the seam that makes the MiniMax/Cartesia split a ROUTING decision
 *     rather than a rewrite (workplan §4, voice vendor routing)
 *
 * "If a vendor call lands directly in a route handler during the O-02 bake-off,
 * this becomes a refactor instead of a starting point."
 *
 * Rule: nothing outside `providers/` may import a vendor SDK or hit a vendor
 * URL. Route handlers talk to these types and nothing else.
 */

/* ---------------------------------- voice ---------------------------------- */

/**
 * Which voice is being asked for — not which vendor.
 *
 * Callers must never name a vendor. The split (workplan §4) is:
 *   stock  → MiniMax   pay-as-you-go, scales with SIGNUPS which are unbounded
 *   cloned → Cartesia  won O-02 on timbre; volume is bounded by revenue
 *
 * Timbre identity only matters for `cloned` — nobody asks whether the stock
 * narrator sounds like them — so the O-02 result simply does not apply to the
 * free path. Routing here keeps that reasoning in one place.
 */
export type VoiceKind =
  | { kind: 'stock'; voice?: string }
  | { kind: 'cloned'; voiceId: string };

export type SynthesizeRequest = {
  text: string;
  voice: VoiceKind;
  /** BCP-47 / ISO 639-1. Cross-lingual works from a 15s English clone (SPIKE-02). */
  lang: string;
  /** design.md §6 — the product winds down. Below 1.0 is slower. */
  speed?: number;
};

export type SynthesizeResult = {
  audio: Buffer;
  mimeType: string;
  /**
   * Vendor-reported billed characters where available — more authoritative
   * than our own string length, and the input to the COGS alarm (OPS-04).
   */
  billedCharacters: number;
  durationMs?: number;
  vendor: string;
  latencyMs: number;
};

export interface VoiceProvider {
  synthesize(req: SynthesizeRequest): Promise<SynthesizeResult>;
  /** 15s sample in, `voice_id` out. The raw sample is NEVER persisted (D-07). */
  clone(sample: Buffer, lang: string): Promise<{ voiceId: string; vendor: string }>;
  /** Must propagate to the vendor and be confirmed before local records clear. */
  deleteVoice(voiceId: string): Promise<void>;
}

/* ---------------------------------- image ---------------------------------- */

export type IllustrateRequest = {
  prompt: string;
  /**
   * Previous panels, base64. SPIKE-01 found chained reference is what holds the
   * character across panels — independent generation drifts. This parameter is
   * the whole reason the cheap path survived.
   */
  refs?: string[];
  aspectRatio?: string;
};

export type IllustrateResult = {
  image: Buffer;
  mimeType: string;
  /** For the COGS alarm — images are 54% of per-story cost. */
  estimatedUsd: number;
  vendor: string;
  latencyMs: number;
};

export interface ImageProvider {
  illustrate(req: IllustrateRequest): Promise<IllustrateResult>;
}

/* ----------------------------------- text ---------------------------------- */

export type GenerateTextRequest = {
  system?: string;
  prompt: string;
  json?: boolean;
};

export type GenerateTextResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  vendor: string;
  latencyMs: number;
};

export interface TextProvider {
  generate(req: GenerateTextRequest): Promise<GenerateTextResult>;
}

/* --------------------------------- registry -------------------------------- */

export type Providers = {
  voice: VoiceProvider;
  image: ImageProvider;
  text: TextProvider;
};
