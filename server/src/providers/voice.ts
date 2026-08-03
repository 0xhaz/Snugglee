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
  if (req.voice.kind !== 'cloned') throw new Error('cartesia is only used for cloned voices');

  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: { ...cartesiaHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({
      model_id: config.cartesia.model,
      transcript: req.text,
      voice: { mode: 'id', id: req.voice.voiceId },
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
  async synthesize(req) {
    if (req.voice.kind === 'stock') return minimaxSynthesize(req);

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
      console.error('[voice] cloned synthesis failed, degrading to stock narrator', e);
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
