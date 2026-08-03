/**
 * Gemini providers — images and text. The only file that knows Gemini exists.
 *
 * Both are pay-as-you-go per unit (GCP bills monthly *in arrears on usage* —
 * a billing date, not a subscription). Together they are ~55% of per-story
 * COGS and 100% variable.
 */
import { config } from '../config.ts';
import type {
  GenerateTextRequest,
  GenerateTextResult,
  IllustrateRequest,
  IllustrateResult,
  ImageProvider,
  TextProvider,
} from './types.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Verified 2026-07-27. Re-verify before freezing pack pricing. */
const IMAGE_USD_PER_1K: Record<string, number> = {
  'gemini-3.1-flash-lite-image': 0.0336,
  'gemini-2.5-flash-image': 0.039,
  'gemini-3.1-flash-image': 0.067,
  'gemini-3-pro-image': 0.134,
};
const TEXT_USD_PER_1M: Record<string, { input: number; output: number }> = {
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-3.5-flash-lite': { input: 0.25, output: 1.5 },
};

const readErr = async (r: Response) => {
  const t = await r.text();
  try {
    return JSON.parse(t)?.error?.message ?? t;
  } catch {
    return t;
  }
};

/* ---------------------------------- images --------------------------------- */

export const imageProvider: ImageProvider = {
  async illustrate(req: IllustrateRequest): Promise<IllustrateResult> {
    const t0 = Date.now();
    const model = config.gemini.imageModel;

    const input: unknown[] = [{ type: 'text', text: req.prompt }];
    // SPIKE-01: chained reference is what holds the character across panels.
    for (const ref of req.refs ?? []) input.push({ type: 'image', data: ref });

    const res = await fetch(`${BASE}/interactions?key=${config.gemini.apiKey()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        input,
        response_format: {
          type: 'image',
          // Only image/jpeg is accepted here; image/png is rejected with a 400.
          mime_type: 'image/jpeg',
          aspect_ratio: req.aspectRatio ?? '1:1',
          image_size: '1K',
        },
      }),
    });
    if (!res.ok) throw new Error(`illustrate (${res.status}): ${await readErr(res)}`);

    const json = (await res.json()) as any;
    const b64 =
      json?.output_image?.data ??
      json?.steps?.flatMap((s: any) => s?.content ?? []).find((c: any) => c?.type === 'image')?.data;
    if (!b64) throw new Error('illustrate returned no image');

    return {
      image: Buffer.from(b64, 'base64'),
      mimeType: 'image/jpeg',
      estimatedUsd: IMAGE_USD_PER_1K[model] ?? 0,
      vendor: `gemini:${model}`,
      latencyMs: Date.now() - t0,
    };
  },
};

/* ----------------------------------- text ---------------------------------- */

export const textProvider: TextProvider = {
  async generate(req: GenerateTextRequest): Promise<GenerateTextResult> {
    const t0 = Date.now();
    const model = config.gemini.textModel;

    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
    };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    if (req.json) body.generationConfig = { responseMimeType: 'application/json' };

    const res = await fetch(`${BASE}/models/${model}:generateContent?key=${config.gemini.apiKey()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`generateText (${res.status}): ${await readErr(res)}`);

    const json = (await res.json()) as any;
    const text = (json?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p?.text ?? '')
      .join('');
    const inTok = json?.usageMetadata?.promptTokenCount ?? 0;
    const outTok = json?.usageMetadata?.candidatesTokenCount ?? 0;
    const price = TEXT_USD_PER_1M[model] ?? { input: 0, output: 0 };

    return {
      text,
      inputTokens: inTok,
      outputTokens: outTok,
      estimatedUsd: (inTok / 1e6) * price.input + (outTok / 1e6) * price.output,
      vendor: `gemini:${model}`,
      latencyMs: Date.now() - t0,
    };
  },
};
