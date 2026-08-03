/**
 * Voice cloning vendors for the O-02 bake-off (Wed Jul 29).
 *
 * VERIFICATION STATUS (2026-07-28): **both vendors confirmed working end-to-end**
 * — clone + synthesis returning playable audio.
 *   Cartesia — auth is `Authorization: Bearer` (not `X-API-Key`), version header
 *              `2026-03-01` (not `2024-11-13`), model `sonic-3.5` (not `sonic-2`).
 *              Cloning requires a paid plan; free tier returns 402.
 *   MiniMax  — base URL must be `api.minimax.io`. `api.minimax.chat` is the
 *              China-mainland endpoint and rejects international keys with
 *              `status_code 2049 "invalid api key"`, which reads like a bad key
 *              and is not. Paths and the hex-encoded audio response confirmed
 *              by a successful run.
 *
 * Decision rule (techstacks.md §5): same real 15s sample, same 200-word
 * passage, blind A/B on ONE question — *does this sound like me?* Timbre
 * identity is the product, not general TTS quality.
 * **Tie-break on cost, not latency.**
 *
 * Hard vendor constraint (D-08): must support UNBOUNDED per-user clones.
 * ElevenLabs is disqualified — its stored-voice slots cap per plan, and every
 * paying user needs a clone.
 */

export type CloneResult = { voiceId: string; ms: number; raw: unknown };
export type SpeakResult = {
  audioBase64: string;
  mimeType: string;
  ms: number;
  /** Vendor-reported billed characters, where the vendor reports them. */
  usageCharacters?: number;
  /** Vendor-reported audio duration in ms. */
  audioLengthMs?: number;
};

/**
 * Synthesis settings, applied IDENTICALLY to both vendors.
 *
 * A blind A/B where one vendor gets a calmer preset measures the settings, not
 * the vendors — the tuned side simply gets reported as "clearer".
 *
 * **Correction (2026-07-28):** an earlier version of this file asserted that
 * `emotion` was Cartesia-only and dropped it to force parity. That was wrong
 * and unverified — MiniMax accepts `emotion` inside `voice_setting`, and
 * validates it (a bogus value is rejected with "invalid params:
 * voice_setting emotion", so it is not being silently ignored).
 *
 * Both vendors therefore get speed AND emotion. Parity is preserved *and* both
 * sides are tuned to the bedtime register the product actually ships
 * (design.md §6) — which is a better comparison than forcing both to be flat.
 */
export const SPEAK_SPEED_DEFAULT = 0.85;

async function readError(res: Response): Promise<string> {
  const t = await res.text();
  try {
    return JSON.parse(t)?.error?.message ?? t;
  } catch {
    return t;
  }
}

function need(v: string | undefined, name: string): string {
  if (!v) throw new Error(`${name} is not set — see harness/.env.example`);
  return v;
}

/* ---------------------------------- MiniMax --------------------------------- */
/* Prior favourite (techstacks.md §5): its timbre/content separation targets
   exactly our input — accented amateur, phone mic, 15 seconds.
 *
 * BASE URL MATTERS. `api.minimax.chat` is the China-mainland endpoint and
 * rejects international keys with `{"status_code":2049,"status_msg":"invalid
 * api key"}` — which reads like a bad key and is not. International keys issued
 * from platform.minimax.io must go to api.minimax.io.
 * Override with MINIMAX_BASE_URL if the account is on the .chat side. */

const MINIMAX_BASE = process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io';

export async function minimaxClone(
  apiKey: string | undefined,
  groupId: string | undefined,
  sample: Buffer,
): Promise<CloneResult> {
  const key = need(apiKey, 'MINIMAX_API_KEY');
  const gid = need(groupId, 'MINIMAX_GROUP_ID');
  const started = Date.now();

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(sample)], { type: 'audio/mpeg' }), 'sample.mp3');
  form.append('purpose', 'voice_clone');

  const up = await fetch(`${MINIMAX_BASE}/v1/files/upload?GroupId=${gid}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  if (!up.ok) throw new Error(`minimax upload (${up.status}): ${await readError(up)}`);
  const upJson = (await up.json()) as any;
  const fileId = upJson?.file?.file_id ?? upJson?.file_id;
  if (!fileId) throw new Error(`minimax upload returned no file_id: ${JSON.stringify(upJson)}`);

  const voiceId = `snugglee_${Date.now()}`;
  const clone = await fetch(`${MINIMAX_BASE}/v1/voice_clone?GroupId=${gid}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ file_id: fileId, voice_id: voiceId }),
  });
  if (!clone.ok) throw new Error(`minimax clone (${clone.status}): ${await readError(clone)}`);

  return { voiceId, ms: Date.now() - started, raw: await clone.json() };
}

export async function minimaxSpeak(
  apiKey: string | undefined,
  groupId: string | undefined,
  voiceId: string,
  text: string,
  speed: number = SPEAK_SPEED_DEFAULT,
  emotion?: string,
): Promise<SpeakResult> {
  const key = need(apiKey, 'MINIMAX_API_KEY');
  const gid = need(groupId, 'MINIMAX_GROUP_ID');
  const started = Date.now();

  const res = await fetch(`${MINIMAX_BASE}/v1/t2a_v2?GroupId=${gid}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'speech-02-hd',
      text,
      stream: false,
      voice_setting: emotion
        ? { voice_id: voiceId, speed, emotion }
        : { voice_id: voiceId, speed },
      audio_setting: { format: 'mp3' },
    }),
  });
  if (!res.ok) throw new Error(`minimax speak (${res.status}): ${await readError(res)}`);

  const json = (await res.json()) as any;
  const hex = json?.data?.audio;
  if (typeof hex !== 'string') {
    throw new Error(`minimax speak returned no audio: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return {
    audioBase64: Buffer.from(hex, 'hex').toString('base64'),
    mimeType: 'audio/mpeg',
    ms: Date.now() - started,
    // MiniMax reports what it actually bills — more authoritative than our own
    // character count, which can differ on whitespace and markup handling.
    usageCharacters: json?.extra_info?.usage_characters,
    audioLengthMs: json?.extra_info?.audio_length,
  };
}

/* ---------------------------------- Cartesia -------------------------------- */
/* Keys: https://play.cartesia.ai/keys — they look like `sk_car_...` */

const CARTESIA_VERSION = '2026-03-01';

export async function cartesiaClone(
  apiKey: string | undefined,
  sample: Buffer,
): Promise<CloneResult> {
  const key = need(apiKey, 'CARTESIA_API_KEY');
  const started = Date.now();

  const form = new FormData();
  form.append('clip', new Blob([new Uint8Array(sample)], { type: 'audio/mpeg' }), 'sample.mp3');
  form.append('name', `snugglee-${Date.now()}`);
  form.append('language', 'en');

  const res = await fetch('https://api.cartesia.ai/voices/clone', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'Cartesia-Version': CARTESIA_VERSION },
    body: form,
  });
  if (!res.ok) throw new Error(`cartesia clone (${res.status}): ${await readError(res)}`);

  const json = (await res.json()) as any;
  const voiceId = json?.id ?? json?.voice_id;
  if (!voiceId) throw new Error(`cartesia clone returned no id: ${JSON.stringify(json)}`);
  return { voiceId, ms: Date.now() - started, raw: json };
}

export async function cartesiaSpeak(
  apiKey: string | undefined,
  voiceId: string,
  text: string,
  speed: number = SPEAK_SPEED_DEFAULT,
  emotion?: string,
): Promise<SpeakResult> {
  const key = need(apiKey, 'CARTESIA_API_KEY');
  const started = Date.now();

  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'Cartesia-Version': CARTESIA_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-3.5',
      transcript: text,
      voice: { mode: 'id', id: voiceId },
      output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
      language: 'en',
      // Same speed and emotion as MiniMax — see the note at the top of this file.
      generation_config: emotion ? { speed, emotion } : { speed },
    }),
  });
  if (!res.ok) throw new Error(`cartesia speak (${res.status}): ${await readError(res)}`);

  const buf = Buffer.from(await res.arrayBuffer());
  return {
    audioBase64: buf.toString('base64'),
    mimeType: 'audio/mpeg',
    ms: Date.now() - started,
  };
}
