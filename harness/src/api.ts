/** Thin fetch helpers against the dev middleware in harness/proxy. */

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `${res.status} ${path}`);
  return json as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `${res.status} ${path}`);
  return json as T;
}

export type KeyHealth = {
  ok: boolean;
  keys: { gemini: boolean; minimax: boolean; cartesia: boolean };
};

export const api = {
  health: () => get<KeyHealth>('/api/health'),
  models: () => get<any>('/api/models'),

  image: (body: {
    model: string;
    prompt: string;
    references?: string[];
    aspectRatio?: string;
  }) => post<{ base64: string; mimeType: string; via: string; ms: number }>('/api/image', body),

  text: (body: { model: string; system?: string; prompt: string; json?: boolean }) =>
    post<{ text: string; inputTokens: number; outputTokens: number; ms: number }>(
      '/api/text',
      body,
    ),

  cloneVoice: (body: { vendor: 'minimax' | 'cartesia'; sampleBase64: string }) =>
    post<{ voiceId: string; ms: number }>('/api/voice/clone', body),

  speak: (body: {
    vendor: 'minimax' | 'cartesia';
    voiceId: string;
    text: string;
    speed?: number;
    emotion?: string;
  }) =>
    post<{
      audioBase64: string;
      mimeType: string;
      ms: number;
      usageCharacters?: number;
      audioLengthMs?: number;
    }>('/api/voice/speak', body),
};
