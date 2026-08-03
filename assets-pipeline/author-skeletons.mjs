/**
 * BE-07 — author the Instant Path story skeletons.
 *
 * techstacks.md §4: skeletons are **authored once, stored server-side**, with
 * slots. They are NOT generated per user — that is the whole reason a free
 * story is affordable. Flash-Lite personalises pages 2+ at ~$0.001; the
 * structure and the art are fixed and amortised across every user.
 *
 * Run once (or when a theme changes). Output is committed.
 *
 *   node assets-pipeline/author-skeletons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const MODEL = 'gemini-3.1-flash-lite';
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error('GEMINI_API_KEY not set');

const PAGE_COUNT = 12;
const OUT = new URL('../server/skeletons/', import.meta.url).pathname;

/**
 * S-02 shows three tiles (design.md §4.1). Companion and setting are FIXED per
 * skeleton — they cannot be user-chosen on the free path because the art is
 * pre-rendered per skeleton, and every combination would need its own set.
 */
const THEMES = [
  {
    id: 'moon',
    tile: 'To the moon',
    emoji: '🌙',
    setting: 'cloud fields',
    companion: 'a small grey plush rabbit',
    companionArt:
      'a small plush toy rabbit, soft dove-grey fur, one ear that flops slightly forward, a faded cornflower-blue ribbon tied around its neck, black stitched eyes',
    arc: 'a slow drift up through cloud fields to a sleepy smiling moon, and gently home again',
    beats: [
      { atPage: 1, scene: 'sitting up in bed hugging {companion}, looking through a round window at a big low moon' },
      { atPage: 4, scene: 'stepping from the window sill onto a soft cloud, {companion} tucked under one arm, the bedroom glowing behind' },
      { atPage: 8, scene: 'sitting high on a cloud beside an enormous gentle smiling moon with closed eyes, {companion} on their lap' },
      { atPage: 11, scene: 'asleep curled on a cloud drifting back down towards the lit bedroom window, {companion} held close' },
    ],
  },
  {
    /**
     * ⚠️ REPLACED the "sea" theme, 2026-07-30. Layer 2 blocked it twice:
     *
     *   v1 "sinking slowly through warm still water, resting on soft sand"
     *      → "a child sinking to the bottom of water to fall asleep… drowning"
     *   v2 "drifting in a small safe wooden boat across a calm moonlit bay"
     *      → "a young child alone in a boat on open water at night… peril"
     *
     * The classifier was right both times, and the fault was the brief, not
     * the generation — Layer 1 wrote faithfully to a bad instruction. Water is
     * a hazard category for under-5s however the scene is dressed, and the
     * second block came even with "small", "safe" and "calm" in the prompt.
     *
     * The lesson generalises: **theme selection has a safety dimension**.
     * Avoid hazard categories a small child could imitate — deep water,
     * height, fire, dark woods alone, wandering off at night. A garden at
     * dusk has none, and is just as calm and sensory.
     */
    id: 'garden',
    tile: 'The firefly garden',
    emoji: '✨',
    setting: 'night garden',
    companion: 'a small knitted turtle',
    companionArt:
      'a small knitted toy turtle, sage-green shell with visible stitches, soft cream underside, tiny embroidered smile, one slightly crooked flipper',
    arc: 'wandering a warm safe garden just outside the back door as the fireflies come out, sitting on soft grass while the flowers close for the night, and growing sleepy under a blanket on the porch',
    beats: [
      { atPage: 1, scene: 'sitting up in bed hugging {companion}, watching a few fireflies blink outside the window' },
      { atPage: 4, scene: 'stepping out of a warm lit back door into a night garden filled with drifting fireflies, {companion} held close' },
      { atPage: 8, scene: 'sitting on soft grass surrounded by glowing fireflies while big flowers slowly close for the night, {companion} beside them' },
      { atPage: 11, scene: 'asleep under a blanket on the porch step, fireflies hovering softly, {companion} tucked under their chin' },
    ],
  },
  {
    id: 'train',
    tile: 'The slow train',
    emoji: '🚂',
    setting: 'sleeping countryside',
    companion: 'a well-worn corduroy bear',
    companionArt:
      'a small well-worn corduroy teddy bear, warm honey-brown ribbed fabric, one patched paw in slightly darker thread, small black bead eyes, a soft flattened nose',
    arc: 'a long unhurried night train through dark fields and small sleeping stations, rocking steadily',
    beats: [
      { atPage: 1, scene: 'sitting up in bed hugging {companion}, hearing a distant train whistle through the window' },
      { atPage: 4, scene: 'stepping aboard a small warm-lit night train at a tiny country platform, {companion} under one arm' },
      { atPage: 8, scene: 'INSIDE a cosy train carriage, sitting by a big window watching dark sleeping fields roll past, {companion} on the seat beside them, warm lamp overhead' },
      { atPage: 11, scene: 'asleep in the train carriage seat under a blanket, {companion} held close, the dark window and a small lamp behind them' },
    ],
  },
];

const SYSTEM = `You write bedtime story SKELETONS for young children (ages 4-6).

A skeleton is a reusable template. Write it with these placeholders EXACTLY as
written, and use them instead of any literal name or object:
  {childName}   the child
  {companion}   the child's toy companion
  {setting}     where the story takes place

Absolute constraints:
- NO death, injury, illness, blood, or weapons.
- NO peril beyond the very mildest. Nothing frightening.
- NO villains, monsters, or characters who intend harm.
- NO loud, startling, or high-energy events.
- The child is safe throughout and ends the story asleep.
- PRESENT TENSE THROUGHOUT. Never switch to past tense.
- Warm, calm, slow register. Short sentences. Sensory detail.

PACING: the story is long on purpose. The child is expected to fall asleep
partway through, so energy must decrease steadily from first page to last.
Later pages are quieter and less eventful than earlier ones. Do not save
anything exciting for the end — there is no end the child is meant to reach
awake.

THE COMPANION is a plush toy the child carries. It may move and feel things
inside the story, but it is the same toy on every page.

VOCABULARY: exactly 2-3 "stretch" words across the WHOLE story, each inferable
from context. Not per page — per story.

Return JSON only:
{"pages":[{"n":2,"text":"..."}],"stretchWords":["..."]}`;

const PAGE_1 =
  '{childName} is not quite ready to sleep. Outside the window the sky has gone soft and dark, and somewhere far away, in the {setting}, {companion} is waiting.';

const post = async (body) => {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `${r.status}`);
  return {
    text: (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
    inTok: j.usageMetadata?.promptTokenCount ?? 0,
    outTok: j.usageMetadata?.candidatesTokenCount ?? 0,
  };
};

const usd = (i, o) => (i / 1e6) * 0.25 + (o / 1e6) * 1.5;

mkdirSync(OUT, { recursive: true });
let spend = 0;

for (const theme of THEMES) {
  process.stdout.write(`${theme.id.padEnd(6)} `);
  const pages = [{ n: 1, text: PAGE_1 }];
  const stretch = [];

  // Batched, matching D-16's lazy generation — and it keeps each call small
  // enough to stay well inside request timeouts.
  for (let start = 2; start <= PAGE_COUNT; start += 4) {
    const end = Math.min(start + 3, PAGE_COUNT);
    const soFar = pages.map((p) => p.text).join('\n\n');
    const carry = stretch.length
      ? `\n\nSTRETCH WORDS ALREADY USED: ${[...new Set(stretch)].join(', ')}. The per-story budget is spent — introduce NO new ones and return an empty stretchWords array.`
      : '';

    const r = await post({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Theme: ${theme.arc}
Setting placeholder resolves to: ${theme.setting}
Companion placeholder resolves to: ${theme.companion}

The skeleton so far (do not rewrite it):
${soFar}

Write pages ${start} to ${end} only, each about 90 words, continuing in PRESENT
TENSE and winding down steadily.${end === PAGE_COUNT ? ' End with the child asleep.' : ''}
Remember to use {childName}, {companion} and {setting} rather than literal words.${carry}`,
            },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json' },
    });

    spend += usd(r.inTok, r.outTok);
    const parsed = JSON.parse(r.text);
    pages.push(...(parsed.pages ?? []));
    stretch.push(...(parsed.stretchWords ?? []));
    process.stdout.write('.');
  }

  /**
   * Four illustration beats, spread across the 12 pages. SPIKE-01 froze the
   * count at 4; the player holds each image across three pages via the slow
   * Ken Burns drift (design.md §6) rather than rendering more.
   */
  const beats = theme.beats;

  /**
   * Layer 2 gate on authored content (techstacks.md §8).
   *
   * Skeletons ship to every free user, so an unsafe one is not one bad story —
   * it is the same bad story for everybody. The first `sea` brief was blocked
   * here for depicting a child sinking underwater to sleep, which is why this
   * check runs at authoring time and not only at request time.
   */
  const interpolated = pages
    .map((p) => p.text)
    .join('\n\n')
    .replaceAll('{childName}', 'Amir')
    .replaceAll('{companion}', theme.companion)
    .replaceAll('{setting}', theme.setting);

  const check = await post({
    systemInstruction: {
      parts: [
        {
          text: `You are a child-safety classifier for bedtime stories aimed at ages 2-8.
Flag ANY of: death, injury, illness, blood, weapons, villains or characters
intending harm, frightening imagery, peril beyond the very mildest, drowning or
submersion, or content that would excite rather than settle a child.
Be strict. Return JSON only:
{"safe":true|false,"concerns":["..."],"reasoning":"one sentence"}`,
        },
      ],
    },
    contents: [{ role: 'user', parts: [{ text: interpolated }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });
  spend += usd(check.inTok, check.outTok);
  const verdict = JSON.parse(check.text);

  if (!verdict.safe) {
    console.log(`\n  ✗ BLOCKED: ${verdict.reasoning}`);
    console.log(`  Not written. Fix the theme brief — do not override.\n`);
    continue;
  }

  const skeleton = {
    id: theme.id,
    tile: theme.tile,
    emoji: theme.emoji,
    setting: theme.setting,
    companion: theme.companion,
    companionArt: theme.companionArt,
    pageCount: PAGE_COUNT,
    pages,
    stretchWords: [...new Set(stretch)],
    beats,
    authoredAt: '2026-07-30',
  };

  writeFileSync(`${OUT}${theme.id}.json`, JSON.stringify(skeleton, null, 2));
  const words = pages.map((p) => p.text).join(' ').split(/\s+/).length;
  console.log(` ${pages.length} pages, ${words} words, stretch: ${skeleton.stretchWords.join(', ')}`);
}

console.log(`\nauthoring spend: $${spend.toFixed(6)} (one-time, amortised across every user)`);
console.log(`written to ${OUT}`);
