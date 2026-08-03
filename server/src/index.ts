/**
 * BE-01 — Cloud Run service entry.
 *
 * **Cloud Run, `min-instances=1`. Not Cloud Functions** (D-14): a cold start
 * consumes the entire 300ms page-1 budget, and idle cost is a few dollars a
 * month.
 *
 * Deployed to BOTH `asia-southeast1` and `us-central1`. Measured 2026-07-27
 * from Malaysia: ~100ms vs ~310ms TTFB on an idle container. The diaspora wedge
 * puts buyer and listener on different continents — the parent in California,
 * the child in Manila — and playback happens where the child is.
 */
import { serve } from '@hono/node-server';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { Hono } from 'hono';

import { requireAuth } from './auth.ts';
import { config } from './config.ts';
import { getBalance, history } from './ledger.ts';
import { voiceProvider } from './providers/voice.ts';
import { getSkeleton, listSkeletons, personalise } from './skeletons.ts';
import { createManifest, generationCeiling, narrativeSafeEnding, recordAbandonment } from './story.ts';
import { revealLine } from './story.ts';
import { deleteVoice, enrol, getVoice, type ParentRole } from './voice.ts';
import { revenuecatWebhook } from './webhook.ts';

initializeApp({ credential: applicationDefault(), projectId: config.projectId });

const app = new Hono();

/* ---------------------------------- health --------------------------------- */

app.get('/health', (c) =>
  c.json({ ok: true, region: config.region, pageCount: config.story.pageCount }),
);

/* --------------------------------- webhook --------------------------------- */
// Before requireAuth: RevenueCat authenticates with a shared secret, not a
// Firebase token.
app.post('/webhooks/revenuecat', revenuecatWebhook);

/* --------------------------------- credits --------------------------------- */

app.get('/credits', requireAuth, async (c) => {
  const { uid } = c.get('user');
  return c.json({ balance: await getBalance(uid) });
});

app.get('/credits/history', requireAuth, async (c) => {
  const { uid } = c.get('user');
  return c.json({ entries: await history(uid) });
});

/* --------------------------------- themes ---------------------------------- */

/** S-02's tiles. Public — no auth needed to see what stories exist. */
app.get('/themes', (c) => c.json({ themes: listSkeletons() }));

/* ---------------------------------- story ---------------------------------- */

/**
 * Starts a story. Returns page 1 fully materialised and nothing else.
 *
 * No LLM call on this path. If one ever appears here the 300ms budget is gone.
 */
app.post('/story', requireAuth, async (c) => {
  const { uid } = c.get('user');
  const body = await c.req.json<{
    childName: string;
    theme: string;
    companion?: string;
    setting?: string;
    path?: 'instant' | 'custom';
  }>();

  if (!body?.childName?.trim()) return c.json({ error: 'childName required' }, 400);

  const manifest = await createManifest({
    userId: uid,
    childName: body.childName.trim(),
    theme: body.theme ?? 'a journey to the moon',
    companion: body.companion ?? 'a small grey plush rabbit',
    setting: body.setting ?? 'cloud fields',
    path: body.path ?? 'instant',
  });

  return c.json(manifest);
});

/**
 * BE-08 — a single page of an Instant Path story.
 *
 * **Lazy by contract.** Refuses any page beyond `reached + prefetchDepth`
 * (D-16). This is a COGS control, not a latency trick: pages past where the
 * child fell asleep are never generated and never billed, and §4.1 estimates
 * that at 30-40% of a story's modelled cost. A client that tried to fetch the
 * whole story up front would silently undo it, so the server refuses rather
 * than trusting the client to stay honest.
 */
app.get('/story/:id/page/:n', requireAuth, async (c) => {
  const pageNumber = Number(c.req.param('n'));
  const skeletonId = c.req.query('theme') ?? 'moon';
  const childName = c.req.query('childName') ?? 'you';
  const reached = Number(c.req.query('reached') ?? pageNumber);

  const skeleton = getSkeleton(skeletonId);
  if (!skeleton) return c.json({ error: 'unknown theme' }, 404);

  if (pageNumber > generationCeiling(reached)) {
    return c.json(
      { error: 'beyond prefetch window', ceiling: generationCeiling(reached) },
      429,
    );
  }

  const text = personalise(skeleton, pageNumber, childName);
  if (!text) return c.json({ error: 'no such page' }, 404);

  return c.json({
    n: pageNumber,
    text,
    isLast: pageNumber >= skeleton.pageCount,
    pageCount: skeleton.pageCount,
  });
});

/**
 * Audio for one page, streamed as mp3 bytes.
 *
 * Stock narrator on the Instant Path (D-05) — which routes to MiniMax, since
 * timbre identity is irrelevant for a voice nobody is claiming is theirs, and
 * this is the path that scales with signups rather than revenue.
 */
app.get('/story/:id/page/:n/audio', requireAuth, async (c) => {
  const pageNumber = Number(c.req.param('n'));
  const skeletonId = c.req.query('theme') ?? 'moon';
  const childName = c.req.query('childName') ?? 'you';
  const voiceId = c.req.query('voiceId');

  const skeleton = getSkeleton(skeletonId);
  if (!skeleton) return c.json({ error: 'unknown theme' }, 404);

  const text = personalise(skeleton, pageNumber, childName) ?? narrativeSafeEnding(childName);

  const result = await voiceProvider.synthesize({
    text,
    voice: voiceId ? { kind: 'cloned', voiceId } : { kind: 'stock' },
    lang: c.req.query('lang') ?? 'en',
  });

  return new Response(new Uint8Array(result.audio), {
    headers: {
      'content-type': result.mimeType,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-voice-vendor': result.vendor,
      'x-billed-characters': String(result.billedCharacters),
      'x-latency-ms': String(result.latencyMs),
    },
  });
});

/**
 * How far the child actually got.
 *
 * The single most important number in the product (ECONOMICS.md §5): it feeds
 * expected COGS and therefore pack pricing, tells us whether stories are long
 * enough, and is the only way to confirm §4.1's 60-70% correction is real.
 * Measure it; do not optimise it — a child asleep at page 4 is success.
 */
app.post('/story/:id/abandon', requireAuth, async (c) => {
  const body = await c.req.json<{ lastPageHeard: number }>().catch(() => null);
  if (!body?.lastPageHeard) return c.json({ error: 'lastPageHeard required' }, 400);
  const storyId = c.req.param('id');
  if (!storyId) return c.json({ error: 'story id required' }, 400);
  await recordAbandonment(storyId, body.lastPageHeard);
  return c.json({ ok: true });
});

/* ------------------------------ voice enrolment ---------------------------- */

/** Consent copy version — logged with the grant so we know what was agreed. */
const CONSENT_VERSION = '2026-08-01.1';

/**
 * VOX-01 — enrol the parent's voice from a 15s sample.
 *
 * The sample is read into memory, passed once to the vendor, and dropped.
 * **It is never written to disk, logged, or stored** (D-07).
 */
app.post('/voice/enrol', requireAuth, async (c) => {
  const { uid } = c.get('user');
  const body = await c.req.json<{
    sampleBase64: string;
    role: ParentRole;
    lang?: string;
    consent: boolean;
  }>();

  // The consent gate is a hard precondition, not a checkbox we record after.
  if (!body?.consent) return c.json({ error: 'consent required' }, 400);
  if (!body?.role) return c.json({ error: 'role required' }, 400);

  const sample = Buffer.from(body.sampleBase64 ?? '', 'base64');
  if (sample.length < 1024) return c.json({ error: 'sample too short' }, 400);

  try {
    const { voiceId } = await enrol({
      userId: uid,
      sample,
      role: body.role,
      lang: body.lang ?? 'en',
      policyVersion: CONSENT_VERSION,
    });
    return c.json({ voiceId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('rate limit')) return c.json({ error: 'rate_limited' }, 429);
    throw e;
  }
});

app.get('/voice', requireAuth, async (c) => {
  const { uid } = c.get('user');
  const v = await getVoice(uid);
  return c.json({
    enrolled: Boolean(v),
    // Returned so the client can request narration in the parent's voice.
    // Safe to expose to its owner: it is a vendor handle, not a credential,
    // and every synthesis call is authenticated as this user anyway.
    voiceId: v?.voiceId ?? null,
    role: v?.role ?? null,
    lang: v?.lang ?? null,
  });
});

/** VOX-02 — deletion. Mandatory for review, and propagates to the vendor. */
app.delete('/voice', requireAuth, async (c) => {
  const { uid } = c.get('user');
  await deleteVoice(uid);
  return c.json({ ok: true });
});

/**
 * S-07 — the reveal. The closing line in the parent's own voice.
 *
 * D-06: simultaneously the aha moment and the paywall trigger, and the climax
 * of the demo video. The line is authored per language rather than translated,
 * because in most non-English languages the speaker's own role is
 * grammatically load-bearing — see story.ts.
 */
app.get('/voice/reveal', requireAuth, async (c) => {
  const { uid } = c.get('user');
  const childName = c.req.query('childName') ?? 'you';
  const lang = c.req.query('lang') ?? 'en';

  const record = await getVoice(uid);
  if (!record) return c.json({ error: 'no voice enrolled' }, 404);

  const text = revealLine(lang, childName, record.role);
  const result = await voiceProvider.synthesize({
    text,
    voice: { kind: 'cloned', voiceId: record.voiceId },
    lang,
    // Slower than narration. This is the one line that should not be hurried.
    speed: 0.8,
  });

  return new Response(new Uint8Array(result.audio), {
    headers: {
      'content-type': result.mimeType,
      'x-reveal-text': encodeURIComponent(text),
      'x-voice-vendor': result.vendor,
      'x-latency-ms': String(result.latencyMs),
    },
  });
});

/* ---------------------------------- voice ---------------------------------- */

/**
 * Synthesises a page. Callers pass which VOICE they need, never which vendor —
 * routing lives in `providers/voice.ts`.
 */
app.post('/voice/synthesize', requireAuth, async (c) => {
  const body = await c.req.json<{
    text: string;
    voiceId?: string;
    lang?: string;
    speed?: number;
  }>();
  if (!body?.text) return c.json({ error: 'text required' }, 400);

  const result = await voiceProvider.synthesize({
    text: body.text,
    voice: body.voiceId ? { kind: 'cloned', voiceId: body.voiceId } : { kind: 'stock' },
    lang: body.lang ?? 'en',
    speed: body.speed,
  });

  return new Response(new Uint8Array(result.audio), {
    headers: {
      'content-type': result.mimeType,
      'x-voice-vendor': result.vendor,
      'x-billed-characters': String(result.billedCharacters),
      'x-latency-ms': String(result.latencyMs),
    },
  });
});

/* --------------------------------- errors ---------------------------------- */

/**
 * design.md §2: errors are never technical and never terminal. No copy here
 * mentions networks, servers or codes — the client turns this into a
 * narrative-safe exit, and the real reason goes to the logs only.
 */
app.onError((err, c) => {
  console.error('[error]', c.req.method, c.req.path, err);
  return c.json({ error: 'something went quiet' }, 500);
});

app.notFound((c) => c.json({ error: 'not found' }, 404));

serve({ fetch: app.fetch, port: config.port }, (info) =>
  console.log(`snugglee-api listening on :${info.port} (${config.region})`),
);
