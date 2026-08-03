/**
 * Dev-only API router for the harness, mounted as Vite middleware.
 *
 * Exists for two reasons, both of which the "no backend" rule in
 * architecture.md §6 does not actually forbid:
 *   1. CORS — vendor APIs will not accept browser-origin requests.
 *   2. Keys stay in Node. techstacks.md §1: no API keys in the client, ever.
 *
 * This is a local dev shim, not a backend. It holds no state, no ledger, no
 * auth. The real thing is BE-01..BE-06 on Thu Jul 30.
 */
import type { Connect } from 'vite';
import { generateImage, generateText, listModels } from './gemini.ts';
import {
  cartesiaClone,
  cartesiaSpeak,
  minimaxClone,
  minimaxSpeak,
} from './voice.ts';

type Env = Record<string, string | undefined>;

function readBody(req: Connect.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`bad JSON body: ${(err as Error).message}`));
      }
    });
    req.on('error', reject);
  });
}

export function apiMiddleware(env: Env): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/')) return next();

    const send = (status: number, payload: unknown) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(payload));
    };

    try {
      const route = url.split('?')[0];

      if (route === '/api/health') {
        return send(200, {
          ok: true,
          keys: {
            gemini: Boolean(env.GEMINI_API_KEY),
            minimax: Boolean(env.MINIMAX_API_KEY && env.MINIMAX_GROUP_ID),
            cartesia: Boolean(env.CARTESIA_API_KEY),
          },
        });
      }

      if (route === '/api/models') {
        return send(200, await listModels(env.GEMINI_API_KEY));
      }

      if (route === '/api/image' && req.method === 'POST') {
        const body = await readBody(req);
        const out = await generateImage(env.GEMINI_API_KEY, {
          model: body.model,
          prompt: body.prompt,
          references: body.references,
          aspectRatio: body.aspectRatio,
        });
        return send(200, out);
      }

      if (route === '/api/text' && req.method === 'POST') {
        const body = await readBody(req);
        const out = await generateText(env.GEMINI_API_KEY, {
          model: body.model,
          system: body.system,
          prompt: body.prompt,
          json: body.json,
        });
        return send(200, out);
      }

      if (route === '/api/voice/clone' && req.method === 'POST') {
        const body = await readBody(req);
        const sample = Buffer.from(body.sampleBase64 ?? '', 'base64');
        if (!sample.length) return send(400, { error: 'empty voice sample' });

        const out =
          body.vendor === 'cartesia'
            ? await cartesiaClone(env.CARTESIA_API_KEY, sample)
            : await minimaxClone(env.MINIMAX_API_KEY, env.MINIMAX_GROUP_ID, sample);
        return send(200, out);
      }

      if (route === '/api/voice/speak' && req.method === 'POST') {
        const body = await readBody(req);
        const out =
          body.vendor === 'cartesia'
            ? await cartesiaSpeak(
                env.CARTESIA_API_KEY,
                body.voiceId,
                body.text,
                body.speed,
                body.emotion,
              )
            : await minimaxSpeak(
                env.MINIMAX_API_KEY,
                env.MINIMAX_GROUP_ID,
                body.voiceId,
                body.text,
                body.speed,
                body.emotion,
              );
        return send(200, out);
      }

      return send(404, { error: `no route ${route}` });
    } catch (err) {
      // Surface the real vendor error to the UI. A spike bench that hides the
      // failure reason costs more time than it saves.
      return send(500, { error: err instanceof Error ? err.message : String(err) });
    }
  };
}
