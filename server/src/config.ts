/**
 * Configuration. All vendor credentials come from the environment — in
 * production from Secret Manager, never from the client (techstacks.md §1).
 */

const req = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env: ${name}`);
  return v;
};

const opt = (name: string, fallback = ''): string => process.env[name] ?? fallback;

export const config = {
  port: Number(process.env.PORT ?? 8080),
  projectId: opt('GOOGLE_CLOUD_PROJECT', 'snugglee-prod'),

  /**
   * Region this instance runs in. Measured 2026-07-27 from Malaysia:
   * asia-southeast1 ~100ms TTFB vs us-central1 ~310ms — the 300ms page-1
   * budget is entirely consumed by the wrong region before any work happens.
   * The diaspora wedge puts buyer and listener on different continents, so
   * both regions are deployed and the client picks by locale.
   */
  region: opt('K_SERVICE_REGION', opt('REGION', 'asia-southeast1')),

  gemini: {
    apiKey: () => req('GEMINI_API_KEY'),
    textModel: opt('GEMINI_TEXT_MODEL', 'gemini-3.1-flash-lite'),
    imageModel: opt('GEMINI_IMAGE_MODEL', 'gemini-3.1-flash-lite-image'),
  },

  minimax: {
    apiKey: () => req('MINIMAX_API_KEY'),
    groupId: () => req('MINIMAX_GROUP_ID'),
    /** .chat is the China endpoint and rejects international keys as "invalid api key". */
    baseUrl: opt('MINIMAX_BASE_URL', 'https://api.minimax.io'),
    model: opt('MINIMAX_MODEL', 'speech-02-hd'),
  },

  cartesia: {
    apiKey: () => req('CARTESIA_API_KEY'),
    version: opt('CARTESIA_VERSION', '2026-03-01'),
    model: opt('CARTESIA_MODEL', 'sonic-3.5'),
    /**
     * The stock narrator, from Cartesia's own voice library.
     *
     * Set this to a calm, warm, unhurried voice — it is what every parent
     * hears before they enrol, so it is the product's first impression.
     * Left empty, stock synthesis falls back to MiniMax.
     */
    stockVoiceId: opt('CARTESIA_STOCK_VOICE_ID', ''),
  },

  revenuecat: {
    /** Shared secret on the webhook Authorization header. */
    webhookSecret: () => req('REVENUECAT_WEBHOOK_SECRET'),
  },

  story: {
    /**
     * Raised from D-15's 6. Measured stories ran 4.0 min against real bedtime
     * sessions of 15-19 min; a story ending with the child awake has failed and
     * forces another credit. Lazy generation (D-16) makes page count nearly free
     * — unread pages are never generated or billed.
     */
    pageCount: Number(opt('STORY_PAGE_COUNT', '12')),
    /** D-16. Never pre-generate a full story: it is a COGS control, not a latency trick. */
    prefetchDepth: Number(opt('STORY_PREFETCH_DEPTH', '2')),
    illustrations: Number(opt('STORY_ILLUSTRATIONS', '4')),
  },
} as const;
