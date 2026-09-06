/**
 * Voice providers. The ONLY file that knows MiniMax or Cartesia exist.
 *
 * Routing (workplan §4) is by which VOICE is needed, not which vendor won O-02:
 *
 *   stock narrator (D-05, every free story)  -> MiniMax, pay-as-you-go
 *   cloned parent  (D-06, reveal + Custom)   -> Cartesia, won O-02 on timbre
 *
 * The free path scales with SIGNUPS — unbounded and unpredictable — so it must
 * not sit on a fixed monthly credit bucket. Cartesia Pro is exhausted by ~34
 * signups if free narration runs through it; under this split the same plan
 * covers a few hundred users.
 */
import { config } from '../config.ts';
import type {
  SynthesizeRequest,
  SynthesizeResult,
  VoiceProvider,
} from './types.ts';

const err = async (r: Response, who: string) =>
  new Error(`${who} (${r.status}): ${(await r.text()).slice(0, 300)}`);

/* --------------------------------- MiniMax --------------------------------- */

async function minimaxSynthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
  const t0 = Date.now();
  const gid = config.minimax.groupId();
  const voiceId = req.voice.kind === 'stock' ? (req.voice.voice ?? 'male-qn-qingse') : '';

  const res = await fetch(`${config.minimax.baseUrl}/v1/t2a_v2?GroupId=${gid}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.minimax.apiKey()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.minimax.model,
      text: req.text,
      stream: false,
      voice_setting: { voice_id: voiceId, speed: req.speed ?? 0.85, emotion: 'calm' },
      audio_setting: { format: 'mp3' },
    }),
  });
  if (!res.ok) throw await err(res, 'minimax synthesize');

  const json = (await res.json()) as any;
  const hex = json?.data?.audio;
  if (typeof hex !== 'string') {
    throw new Error(`minimax returned no audio: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return {
    audio: Buffer.from(hex, 'hex'),
    mimeType: 'audio/mpeg',
    // Vendor-reported: more authoritative than our own string length.
    billedCharacters: json?.extra_info?.usage_characters ?? req.text.length,
    durationMs: json?.extra_info?.audio_length,
    vendor: 'minimax',
    latencyMs: Date.now() - t0,
  };
}

/* -------------------------------- Cartesia --------------------------------- */

const cartesiaHeaders = () => ({
  authorization: `Bearer ${config.cartesia.apiKey()}`,
  'Cartesia-Version': config.cartesia.version,
});

async function cartesiaSynthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
  const t0 = Date.now();
  /**
   * Cartesia takes a voice id and does not care where it came from — cloned vs
   * stock is OUR distinction, not the vendor's. A stock request uses the
   * configured library voice.
   */
  const voiceId =
    req.voice.kind === 'cloned' ? req.voice.voiceId : config.cartesia.stockVoiceId;
  if (!voiceId) throw new Error('cartesia: no voice id (CARTESIA_STOCK_VOICE_ID unset?)');

  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: { ...cartesiaHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({
      model_id: config.cartesia.model,
      transcript: req.text,
      voice: { mode: 'id', id: voiceId },
      output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
      language: req.lang,
      generation_config: { speed: req.speed ?? 0.85, emotion: 'calm' },
    }),
  });
  if (!res.ok) throw await err(res, 'cartesia synthesize');

  return {
    audio: Buffer.from(await res.arrayBuffer()),
    mimeType: 'audio/mpeg',
    billedCharacters: req.text.length, // Cartesia bills 1 credit per character
    vendor: 'cartesia',
    latencyMs: Date.now() - t0,
  };
}

async function cartesiaClone(sample: Buffer, lang: string) {
  const form = new FormData();
  form.append('clip', new Blob([new Uint8Array(sample)], { type: 'audio/mpeg' }), 'clip.mp3');
  form.append('name', `snugglee-${Date.now()}`);
  form.append('language', lang);

  const res = await fetch('https://api.cartesia.ai/voices/clone', {
    method: 'POST',
    headers: cartesiaHeaders(),
    body: form,
  });
  if (!res.ok) throw await err(res, 'cartesia clone');
  const json = (await res.json()) as any;
  if (!json?.id) throw new Error(`cartesia clone returned no id`);
  return { voiceId: json.id as string, vendor: 'cartesia' };
}

/* --------------------------------- routing --------------------------------- */

export const voiceProvider: VoiceProvider = {
  /**
   * ── VENDOR CONSOLIDATION, 2026-09-06 ──────────────────────────────────
   *
   * Both paths now go to Cartesia first. The original split sent stock to
   * MiniMax because the free tier "scales with SIGNUPS, which are unbounded"
   * and MiniMax bills per character with no floor, whereas Cartesia sells a
   * fixed monthly bucket.
   *
   * That reasoning was written when the free tier was unlimited. **D-17 caps
   * it at one story per install**, so free volume is now bounded by installs
   * rather than by usage — which is what made the two-vendor split worth its
   * cost. Paying two vendors to hedge a risk the product no longer carries is
   * not a hedge, it is just a second bill.
   *
   * It also removes an asymmetry that caused a real outage: cloned synthesis
   * had a fallback and stock did not, so an empty MiniMax account returned 500
   * on page 1 for every new user — the free path being the ONE path a
   * first-time parent hits, and D-06 putting the voice ask after the first
   * story so they cannot route around it.
   *
   * MiniMax stays wired as the fallback. Keeping a second vendor reachable
   * costs nothing while unused and means a Cartesia outage degrades the voice
   * instead of ending the story.
   *
   * ⚠️ The shared bucket is the trade being made: free users now draw on the
   * same Cartesia credits paying users depend on. Watch the balance, because
   * Cartesia does not publish what happens at exhaustion (workplan §4).
   */
  async synthesize(req) {
    try {
      return await cartesiaSynthesize(req);
    } catch (e) {
      /**
       * ⚠️ CREDIT-EXHAUSTION FALLBACK.
       *
       * Cartesia does not publish what happens when a plan's credits run out
       * (workplan §4). If it hard-fails rather than billing overage, every
       * cloned-voice request fails simultaneously, at bedtime — the one failure
       * design.md §2 forbids: "errors are never technical and never terminal".
       *
       * We cannot fall back to the parent's cloned voice (MiniMax has no such
       * clone), so we degrade to the stock narrator rather than returning an
       * error to a parent at bedtime. The story still plays. The caller is told
       * the voice was substituted so it can surface it *later*, never mid-story.
       */
      console.error('[voice] cartesia synthesis failed, degrading to stock narrator', e);
      const stock = await minimaxSynthesize({ ...req, voice: { kind: 'stock' } });
      return { ...stock, vendor: 'minimax:degraded-from-cartesia' };
    }
  },

  clone: (sample, lang) => cartesiaClone(sample, lang),

  async deleteVoice(voiceId) {
    // Must be confirmed before the local record clears (techstacks.md §5).
    const res = await fetch(`https://api.cartesia.ai/voices/${voiceId}`, {
      method: 'DELETE',
      headers: cartesiaHeaders(),
    });
    if (!res.ok && res.status !== 404) throw await err(res, 'cartesia deleteVoice');
  },
};
