/**
 * ART-03 — build-time illustration rendering. THE LONG POLE.
 *
 * D-10: Instant Path art is **pre-rendered per skeleton, not per user**. The
 * cost amortises across the entire user base instead of scaling with it, which
 * is what makes a free first story affordable.
 *
 *   node assets-pipeline/render-art.mjs            # render everything missing
 *   node assets-pipeline/render-art.mjs moon       # one skeleton
 *   node assets-pipeline/render-art.mjs --force    # re-render existing
 *
 * IDEMPOTENT: skips anything already on disk unless --force. Re-running after
 * a failure costs nothing for the panels that already succeeded.
 *
 * SPIKE-01 froze two things this depends on:
 *   - 4 illustrations per story
 *   - CHAINED REFERENCE mode — panel N-1 is fed into panel N. Independent
 *     generation drifted on clothing colour and broke the flat-vector style by
 *     panel 4. Chaining is therefore sequential and cannot be parallelised.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error('GEMINI_API_KEY not set');

const MODEL = process.env.IMAGE_MODEL ?? 'gemini-3.1-flash-lite-image';
const USD_PER_IMAGE = 0.0336; // verified 2026-07-27

const SKELETONS = new URL('../server/skeletons/', import.meta.url).pathname;
const OUT = new URL('./out/', import.meta.url).pathname;

/** D-19 — flat, character-led vector on deep indigo. Palette matches ART-01. */
const STYLE = `Flat vector children's book illustration. Simple geometric shapes, bold clean outlines, no gradients, no photorealism, no 3D rendering. Warm friendly character design with large simple facial features. Deep indigo night background (#2C2C4D). Soft rounded forms. Muted warm accent colours: periwinkle (#9AA5D1), moon gold (#F2D18F). Calm bedtime mood, low visual energy, nothing frightening or high-contrast.`;

/**
 * The hero is rendered generically, NOT as a specific child.
 *
 * Instant Path art is shared by every user, so it cannot depict any one child.
 * The personalisation the product actually sells is the NAME and the VOICE —
 * design.md §3 accepts this explicitly: "children respond to hearing their own
 * name far more than to bespoke illustration."
 */
const HERO =
  'a small child in butter-yellow pyjamas printed with tiny gold stars, seen mostly from behind or in soft profile so their face is never the focus, short dark hair, warm skin';

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

async function generate(prompt, refB64) {
  const input = [{ type: 'text', text: prompt }];
  // mime_type is REQUIRED on image input — omitting it returns
  // "Missing/unsupported mime_type in image content" (400).
  if (refB64) input.push({ type: 'image', mime_type: 'image/jpeg', data: refB64 });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/interactions?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        input,
        response_format: {
          type: 'image',
          mime_type: 'image/jpeg', // png is rejected with a 400
          aspect_ratio: '1:1',
          image_size: '1K',
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const b64 =
    j?.output_image?.data ??
    j?.steps?.flatMap((s) => s?.content ?? []).find((c) => c?.type === 'image')?.data;
  if (!b64) throw new Error('no image in response');
  return b64;
}

const files = readdirSync(SKELETONS).filter((f) => f.endsWith('.json'));
const targets = only.length ? files.filter((f) => only.includes(f.replace('.json', ''))) : files;

let spend = 0;
let rendered = 0;
let skipped = 0;

console.log(`ART-03 · ${MODEL} · $${USD_PER_IMAGE}/image · chained reference\n`);

for (const file of targets) {
  const sk = JSON.parse(readFileSync(SKELETONS + file, 'utf8'));
  const dir = `${OUT}${sk.id}/`;
  mkdirSync(dir, { recursive: true });
  console.log(`${sk.id} — ${sk.tile}`);

  /** Chained: each panel conditions on the previous one. Strictly sequential. */
  let previous;

  for (let i = 0; i < sk.beats.length; i++) {
    const beat = sk.beats[i];
    const path = `${dir}${String(i + 1).padStart(2, '0')}.jpg`;

    if (existsSync(path) && !force) {
      // Still need this panel as the reference for the next one.
      previous = readFileSync(path).toString('base64');
      console.log(`  ${i + 1}. skip (exists)`);
      skipped++;
      continue;
    }

    const scene = beat.scene
      .replaceAll('{companion}', sk.companionArt)
      .replaceAll('{setting}', sk.setting);

    const prompt = [
      STYLE,
      '',
      'CHARACTERS (must look identical in every image):',
      `Child: ${HERO}.`,
      `Companion: ${sk.companionArt}. It is a physical plush toy the child carries.`,
      '',
      `SCENE: the child ${scene}`,
      previous
        ? '\nMatch the characters in the reference image exactly — same hair, same clothing, same proportions, and the SAME toy with the same colours and markings.'
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const t0 = Date.now();
    try {
      const b64 = await generate(prompt, previous);
      writeFileSync(path, Buffer.from(b64, 'base64'));
      previous = b64;
      spend += USD_PER_IMAGE;
      rendered++;
      console.log(`  ${i + 1}. ok  ${Date.now() - t0}ms  page ${beat.atPage}  -> ${path.replace(OUT, 'out/')}`);
    } catch (e) {
      // Do not abort the run — later skeletons are independent, and the
      // idempotent skip means a re-run only retries what failed.
      console.log(`  ${i + 1}. FAILED: ${e.message}`);
      break; // but stop this skeleton: chaining needs an unbroken sequence
    }
  }

  writeFileSync(
    `${dir}manifest.json`,
    JSON.stringify(
      { skeletonId: sk.id, model: MODEL, beats: sk.beats, renderedAt: '2026-07-30' },
      null,
      2,
    ),
  );
}

console.log(`\nrendered ${rendered}, skipped ${skipped}`);
console.log(`spend this run: $${spend.toFixed(4)}`);
console.log(`\nOne-time cost, amortised across every user (D-10).`);
console.log(`At $${USD_PER_IMAGE}/image, 20 themes x 4 panels would be $${(20 * 4 * USD_PER_IMAGE).toFixed(2)}.`);
console.log(`Theme count is limited by authoring effort, not budget.`);
