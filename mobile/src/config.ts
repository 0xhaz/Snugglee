/**
 * Client configuration.
 *
 * **Region matters more than it looks.** Measured 2026-07-27 from Malaysia:
 * asia-southeast1 ~100ms TTFB vs us-central1 ~310ms on an idle container. The
 * 300ms page-1 budget is consumed entirely by the wrong region before any work
 * happens.
 *
 * The diaspora wedge (architecture.md §1) puts buyer and listener on different
 * continents — a parent in California, a child in Manila — and playback happens
 * where the child is. So the region is chosen from the DEVICE, not from where
 * the account was created.
 *
 * ⚠️ `us-central1` is not deployed yet, so both entries currently point at
 * Singapore. Wire the second deployment before launch (workplan §4).
 */
import { getLocales } from 'expo-localization';

const REGIONS = {
  asia: 'https://snugglee-api-75574145355.asia-southeast1.run.app',
  americas: 'https://snugglee-api-75574145355.asia-southeast1.run.app', // TODO: us-central1
} as const;

/** Crude but nearly free — a global load balancer is the Phase 4 answer. */
function pickRegion(): string {
  try {
    const region = getLocales()[0]?.regionCode ?? '';
    const americas = ['US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE'];
    return americas.includes(region) ? REGIONS.americas : REGIONS.asia;
  } catch {
    return REGIONS.asia;
  }
}

/**
 * Languages the product can actually deliver, not languages the vendors accept.
 *
 * This list mirrors the authored reveal lines in `server/src/story.ts` exactly.
 * The reveal is the one line spoken *as* the parent, and design.md §4.2 makes
 * the speaker's role a required slot: a father's cloned voice saying *Ibu
 * sayang kamu* ("Mother loves you") is not a rough edge, it is wrong about who
 * he is. So a language ships only once its reveal AND its kinship terms are
 * authored — never machine-translated.
 *
 * Deliberately narrower than vendor capability (Cartesia 42, MiniMax 40+).
 * Sending an arbitrary device locale to the clone endpoint would risk a vendor
 * rejection on VOX-01, the one path where a failure costs the enrolment.
 *
 * ⚠️ Story BODIES are still English — the Instant Path skeletons are English
 * prose (techstacks.md §11 puts the cost there). This makes the reveal land in
 * the parent's language, not the whole story. Widening it is workplan phase 5,
 * gated on judging SPK-04 clone quality and on assessing the safety
 * classifier per language BEFORE enabling it.
 */
const SUPPORTED_LANGUAGES = [
  'en',
  'ms',
  'id',
  'tl',
  'vi',
  'ko',
  'ja',
  'zh',
  'th',
  'es',
  'fr',
  'de',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * The device's language, clamped to what we can deliver. Falls back to English,
 * which is always safe: the server falls back the same way.
 */
function pickLanguage(): SupportedLanguage {
  try {
    // `languageCode` is the bare subtag — 'ms', not 'ms-MY'.
    const code = getLocales()[0]?.languageCode?.toLowerCase() ?? '';
    return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
      ? (code as SupportedLanguage)
      : 'en';
  } catch {
    return 'en';
  }
}

export const config = {
  apiBaseUrl: pickRegion(),
  /**
   * Resolved once at launch. A parent who changes their phone's language mid-
   * session gets the new one on next open, which is the same contract as region.
   */
  language: pickLanguage(),
  /** D-16. The server also enforces this — belt and braces on the COGS control. */
  prefetchDepth: 2,
} as const;
