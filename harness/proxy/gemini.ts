/**
 * Gemini vendor calls. Runs in Node (Vite dev middleware) — never in the browser.
 *
 * Stage-1 rule (architecture.md §6): direct vendor calls, no backend, throwaway.
 * This file is deliberately NOT the provider abstraction. BE-03 (Thu Jul 30)
 * defines `synthesize()` / `illustrate()` for the real server; this is a bench.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type ImageRequest = {
  model: string;
  prompt: string;
  /** Base64 images (no data: prefix) fed back in for character consistency. */
  references?: string[];
  aspectRatio?: string;
};

export type ImageResult = {
  base64: string;
  mimeType: string;
  via: string;
  ms: number;
};

function keyOrThrow(key: string | undefined, name: string): string {
  if (!key) {
    throw new Error(
      `${name} is not set. Copy harness/.env.example to harness/.env.local and fill it in.`,
    );
  }
  return key;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return j?.error?.message ?? text;
  } catch {
    return text;
  }
}

/** List models the key can actually reach. Verifies auth and real availability. */
export async function listModels(apiKey: string | undefined): Promise<unknown> {
  const key = keyOrThrow(apiKey, 'GEMINI_API_KEY');
  const res = await fetch(`${BASE}/models?key=${key}&pageSize=200`);
  if (!res.ok) throw new Error(`models list failed (${res.status}): ${await readError(res)}`);
  return res.json();
}

/**
 * Image generation across the Nano Banana family.
 *
 * Two API surfaces are in play: the newer `/interactions` endpoint used by the
 * 3.x image models, and `:generateContent` used by 2.5-flash-image. We try the
 * one that matches the model and fall back to the other, because being wrong
 * here would block SPIKE-01 — the gating spike — on a URL detail.
 */
export async function generateImage(
  apiKey: string | undefined,
  req: ImageRequest,
): Promise<ImageResult> {
  const key = keyOrThrow(apiKey, 'GEMINI_API_KEY');
  const started = Date.now();
  const prefersInteractions = !req.model.startsWith('gemini-2.5');

  const attempts = prefersInteractions
    ? ([viaInteractions, viaGenerateContent] as const)
    : ([viaGenerateContent, viaInteractions] as const);

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const out = await attempt(key, req);
      return { ...out, ms: Date.now() - started };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(errors.join('\n---\n'));
}

async function viaInteractions(key: string, req: ImageRequest) {
  const input: unknown[] = [{ type: 'text', text: req.prompt }];
  for (const ref of req.references ?? []) {
    // mime_type is REQUIRED here. Without it the interactions endpoint returns
    // "Missing/unsupported mime_type in image content" (400) — which the
    // fallback then silently masked, so every chained run was actually going
    // through generateContent rather than the intended path.
    input.push({ type: 'image', mime_type: 'image/jpeg', data: ref });
  }

  const res = await fetch(`${BASE}/interactions?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: req.model,
      input,
      response_format: {
        // Only image/jpeg is accepted here — image/png is rejected with a 400.
        type: 'image',
        mime_type: 'image/jpeg',
        aspect_ratio: req.aspectRatio ?? '1:1',
        image_size: '1K',
      },
    }),
  });
  if (!res.ok) throw new Error(`interactions (${res.status}): ${await readError(res)}`);

  const json = (await res.json()) as any;
  const direct = json?.output_image?.data;
  if (typeof direct === 'string') {
    return { base64: direct, mimeType: 'image/jpeg', via: 'interactions' };
  }
  for (const step of json?.steps ?? []) {
    for (const c of step?.content ?? []) {
      if (c?.type === 'image' && typeof c?.data === 'string') {
        return { base64: c.data, mimeType: 'image/jpeg', via: 'interactions' };
      }
    }
  }
  throw new Error(`interactions returned no image: ${JSON.stringify(json).slice(0, 400)}`);
}

async function viaGenerateContent(key: string, req: ImageRequest) {
  const parts: unknown[] = [{ text: req.prompt }];
  for (const ref of req.references ?? []) {
    // Chained-reference panels come back as JPEG from the interactions path.
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: ref } });
  }

  const res = await fetch(`${BASE}/models/${req.model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  if (!res.ok) throw new Error(`generateContent (${res.status}): ${await readError(res)}`);

  const json = (await res.json()) as any;
  for (const cand of json?.candidates ?? []) {
    for (const p of cand?.content?.parts ?? []) {
      const inline = p?.inlineData ?? p?.inline_data;
      if (inline?.data) {
        return {
          base64: inline.data as string,
          mimeType: (inline.mimeType ?? inline.mime_type ?? 'image/png') as string,
          via: 'generateContent',
        };
      }
    }
  }
  throw new Error(`generateContent returned no image: ${JSON.stringify(json).slice(0, 400)}`);
}

export type TextResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
};

export async function generateText(
  apiKey: string | undefined,
  opts: { model: string; system?: string; prompt: string; json?: boolean },
): Promise<TextResult> {
  const key = keyOrThrow(apiKey, 'GEMINI_API_KEY');
  const started = Date.now();

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }
  if (opts.json) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }

  const res = await fetch(`${BASE}/models/${opts.model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`generateText (${res.status}): ${await readError(res)}`);

  const json = (await res.json()) as any;
  const text = (json?.candidates?.[0]?.content?.parts ?? [])
    .map((p: any) => p?.text ?? '')
    .join('');

  return {
    text,
    inputTokens: json?.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json?.usageMetadata?.candidatesTokenCount ?? 0,
    ms: Date.now() - started,
  };
}
