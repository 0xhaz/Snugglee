/**
 * SINGLE SOURCE OF TRUTH for story generation — text and images both read it.
 *
 * This module exists because of a defect SPK-03 exposed: the text pipeline and
 * the image pipeline had independent, contradictory ideas of what `{companion}`
 * was. The text had the rabbit standing, waving a paw, whispering a story and
 * sighing — a living creature. The image prompt had it as an inanimate stuffed
 * toy. Same template slot, two pipelines, no shared definition.
 *
 * That also explains the companion's colour drifting between SPIKE-01 panels
 * (grey → teal → brown): it was never described as carefully as the child.
 *
 * Prefigures BE-07. When the real backend is built, this is the shape the
 * skeleton store should have — one canonical spec, consumed by both
 * `synthesize()` and `illustrate()` paths.
 */

/* ------------------------------- resolution -------------------------------- */
/**
 * Is the companion alive or a toy? **Both, deliberately.**
 *
 * It is a physical plush toy in the child's bed — a real comfort object the
 * child can hold, which is the emotionally correct anchor — and it is animate
 * inside the story world. That is the oldest structure in children's bedtime
 * fiction and it resolves the contradiction without weakening either pipeline:
 *
 *   images → render the plush toy, always, identically
 *   text   → may animate it freely
 *
 * The appearance description is what both share, and it is deliberately
 * over-specified. Vague descriptions are what let the colour drift.
 */
export const COMPANION_APPEARANCE =
  'a small plush toy rabbit, soft dove-grey fur, one ear that flops slightly forward, a faded cornflower-blue ribbon tied around its neck, and black stitched eyes';

/** Includes its article — it is interpolated mid-sentence into PAGE_1_TEMPLATE. */
export const COMPANION_SHORT = 'a small grey plush rabbit';

export const CHILD_APPEARANCE =
  'a 5-year-old boy with short curly black hair, warm brown skin, round cheeks, big dark eyes, wearing butter-yellow pyjamas printed with small gold stars, and one red slipper';

export const CHILD_NAME = 'Amir';

/** D-19 — flat, character-led vector on deep indigo. */
export const IMAGE_STYLE = `Flat vector children's book illustration. Simple geometric shapes, bold clean outlines, no gradients, no photorealism, no 3D rendering. Warm friendly character design with large simple facial features. Deep indigo night background. Soft rounded forms. Muted warm accent colours: gold, teal, periwinkle. Calm bedtime mood, low visual energy, nothing frightening or high-contrast.`;

/**
 * Shared character block — identical text in both pipelines.
 * The companion is described with the same specificity as the child.
 */
export function characterBlock(childName = CHILD_NAME): string {
  return [
    `${childName}: ${CHILD_APPEARANCE}.`,
    `${childName}'s companion: ${COMPANION_APPEARANCE}. It is a physical plush toy the child carries; it must look identical in every illustration.`,
  ].join('\n');
}

/* ------------------------------ the speaker -------------------------------- */
/**
 * ⚠️ MISSING SLOT, found by SPIKE-02 (2026-07-29).
 *
 * The documented slots are `{childName}`, `{theme}`, `{companion}`, `{setting}`.
 * **None of them identify who is speaking** — which is fine in English and
 * broken in most of the languages the diaspora wedge targets.
 *
 * English lets you hide behind "I love you". Malay does not: speaking to a
 * small child you use a kinship term for yourself — *Ibu sayang kamu* ("Mother
 * loves you") or *Ayah sayang kamu* ("Father loves you"). There is no natural
 * neutral form. The same is true of Tagalog, Thai, Japanese, Korean,
 * Vietnamese and child-register Mandarin; Arabic, Hebrew, Russian, Polish and
 * Hindi additionally inflect the speaker's own adjectives by gender.
 *
 * Since the reveal (D-06) is the one line spoken *as the parent*, this is
 * exactly where it breaks — the emotional peak of the product, in the segment
 * architecture.md §1 calls the sharpest wedge.
 *
 * Capture it at S-06, where the parent is already engaged and about to record:
 * one tap, and it improves English too — "Mummy loves you" lands warmer on a
 * four-year-old than "I love you".
 *
 * Bonus: techstacks.md §7 already needs the parent's vocal range for sung
 * lullabies ("cross-gender conversion degrades — record the source library
 * twice and route by the parent's sample"). One question serves both.
 */
export type ParentRole = 'mother' | 'father' | 'grandmother' | 'grandfather' | 'other';

/** How the speaker refers to themselves when talking to a young child. */
export const PARENT_TERM: Record<string, Partial<Record<ParentRole, string>>> = {
  en: { mother: 'Mummy', father: 'Daddy', grandmother: 'Granny', grandfather: 'Grandad', other: 'I' },
  ms: { mother: 'Ibu', father: 'Ayah', grandmother: 'Nenek', grandfather: 'Atuk' },
  id: { mother: 'Ibu', father: 'Ayah', grandmother: 'Nenek', grandfather: 'Kakek' },
  tl: { mother: 'Nanay', father: 'Tatay', grandmother: 'Lola', grandfather: 'Lolo' },
  vi: { mother: 'Mẹ', father: 'Bố', grandmother: 'Bà', grandfather: 'Ông' },
  ko: { mother: '엄마', father: '아빠', grandmother: '할머니', grandfather: '할아버지' },
  ja: { mother: 'ママ', father: 'パパ', grandmother: 'おばあちゃん', grandfather: 'おじいちゃん' },
  zh: { mother: '妈妈', father: '爸爸', grandmother: '奶奶', grandfather: '爷爷' },
  th: { mother: 'แม่', father: 'พ่อ', grandmother: 'ยาย', grandfather: 'ตา' },
  // Neutral in these — the term is optional warmth, not grammar.
  es: { mother: 'Mamá', father: 'Papá' },
  fr: { mother: 'Maman', father: 'Papa' },
  de: { mother: 'Mama', father: 'Papa' },
};

export function parentTerm(lang: string, role: ParentRole): string {
  return PARENT_TERM[lang]?.[role] ?? PARENT_TERM.en[role] ?? 'I';
}

/**
 * The reveal line (D-06). Templated per language because the speaker's role is
 * grammatically load-bearing in most of them — this cannot be machine-translated
 * from English without losing or inventing the speaker's identity.
 */
export const REVEAL_LINE: Record<string, (child: string, term: string) => string> = {
  en: (c, t) => (t === 'I' ? `Goodnight, ${c}. I love you.` : `Goodnight, ${c}. ${t} loves you.`),
  ms: (c, t) => `Selamat malam, ${c}. ${t} sayang kamu.`,
  id: (c, t) => `Selamat malam, ${c}. ${t} sayang kamu.`,
  tl: (c, t) => `Magandang gabi, ${c}. Mahal ka ni ${t}.`,
  vi: (c, t) => `Chúc ${c} ngủ ngon. ${t} yêu con.`,
  ko: (c, t) => `잘 자, ${c}. ${t}가 사랑해.`,
  ja: (c, t) => `おやすみ、${c}。${t}は大好きだよ。`,
  zh: (c, t) => `晚安，${c}。${t}爱你。`,
  th: (c, t) => `ราตรีสวัสดิ์ ${c} ${t}รักหนูนะ`,
  es: (c, t) => `Buenas noches, ${c}. ${t} te quiere mucho.`,
  fr: (c, t) => `Bonne nuit, ${c}. ${t} t'aime.`,
  de: (c, t) => `Gute Nacht, ${c}. ${t} hat dich lieb.`,
};

export function revealLine(lang: string, childName: string, role: ParentRole): string {
  const term = parentTerm(lang, role);
  const fn = REVEAL_LINE[lang] ?? REVEAL_LINE.en;
  return fn(childName, term);
}

/* --------------------------------- length ---------------------------------- */
/**
 * ⚠️ CHANGED from D-15's 6 pages. See `spike-results/ECONOMICS.md` §4.
 *
 * Measured stories ran 4.0 min against real bedtime sessions of 15–19 min
 * (Ipsos / OnePoll) and expert guidance of 10–15. A story ending with the child
 * still awake has failed its only job and forces another credit.
 *
 * Raising page COUNT is nearly free: D-16 holds prefetch at depth 2 and never
 * pre-generates, so pages past the drop-off are never generated or billed.
 * Raising words PER PAGE would be +15% per story forever. So: more pages, same
 * page length.
 */
export const PAGE_COUNT = 12;
export const WORDS_PER_PAGE = 90;

/* ------------------------------ page 1 template ---------------------------- */
/**
 * PRESENT TENSE — fixes the second SPK-03 defect.
 *
 * The old template was past tense ("Amir *was* not quite ready") while the
 * system prompt asks for present tense and the model complied ("Amir *steps*
 * out"). Narrated aloud the story audibly changed gear one page in. Present
 * tense throughout: it reads more immediate and matches the model's register.
 *
 * Still pure interpolation — no LLM call. Page 1 has a 300ms budget.
 */
export const PAGE_1_TEMPLATE = `{childName} is not quite ready to sleep. Outside the window the sky has gone soft and dark, and somewhere far away, in the {setting}, {companion} is waiting.`;

export function renderPage1(vals: {
  childName: string;
  companion: string;
  setting: string;
}): string {
  return PAGE_1_TEMPLATE.replace('{childName}', vals.childName)
    .replace('{companion}', vals.companion)
    .replace('{setting}', vals.setting);
}

/* ------------------------------ system prompt ------------------------------ */
/** Layer 1 — constrained generation (techstacks.md §8). Ships in BE-07. */
export const SYSTEM_PROMPT = `You write bedtime stories for young children. Absolute constraints:

- NO death, injury, illness, blood, or weapons.
- NO peril beyond the very mildest (a lost toy, a wrong turn). Nothing frightening.
- NO villains, monsters, or characters who intend harm.
- NO loud, startling, or high-energy events. The story must wind DOWN, not up.
- The child protagonist is safe at all times and ends the story asleep or nearly asleep.
- Warm, calm, slow register. Short sentences.

TENSE: PRESENT TENSE THROUGHOUT. Page 1 is already written in present tense and
you must continue in it. Do not switch to past tense at any point.

THE COMPANION is a plush toy the child carries. Inside the story it may move,
speak softly and feel things — but it remains the same toy, with the same
appearance, on every page. Never change its colour, size or markings.

PACING: this story is long on purpose. The child is expected to fall asleep
partway through, so the energy must decrease steadily from the first page to the
last. Later pages should be quieter, slower and less eventful than earlier ones.
Do not save excitement for the end — there is no end the child is meant to reach
awake.

VOCABULARY SEEDING: the story as a whole contains only 2-3 "stretch" words
slightly above the child's age band. They must be INFERABLE FROM CONTEXT, never
puzzling. A word that makes a child ask "what does that mean?" wakes them up and
defeats the entire purpose. Carry the meaning in the surrounding sentence.

⚠️ The story is generated in BATCHES. The stretch-word budget is PER STORY, not
per batch. If stretch words have already been used (listed below), reuse or
simply do not add more — do not introduce a fresh set for each batch.

Return JSON only:
{"pages":[{"n":2,"text":"..."}],"stretchWords":["..."]}`;

/**
 * Appended to each batch prompt after the first.
 *
 * Fixes a defect found by generating a 12-page story in 3 batches: each batch
 * independently added 2-3 stretch words, so the story ended up with **nine**
 * (serene, luminous, tranquil, ethereal, languid, profound, contentment, basin,
 * silence) against a budget of 2-3. Several were far above a 4-6 age band.
 *
 * This is a production bug, not a harness artifact — D-16 requires lazy
 * generation at prefetch depth 2, so the real pipeline batches the same way and
 * would accumulate the same way. Any per-story constraint has to be carried
 * across batch boundaries explicitly; the model cannot see what it wrote in a
 * previous call.
 */
export function stretchWordCarryOver(used: string[]): string {
  if (!used.length) return '';
  return `\n\nSTRETCH WORDS ALREADY USED in this story: ${used.join(', ')}.
The per-story budget of 2-3 is already spent. Do NOT introduce any new stretch
words. Return an empty "stretchWords" array.`;
}
