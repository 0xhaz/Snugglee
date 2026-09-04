/**
 * SAFE-01 + SAFE-03 — the two generation safety layers.
 *
 * workplan §6: "A single layer will eventually emit something that ends the
 * app." So there are two, and they are independent by construction:
 *
 *   Layer 1 (SAFE-01) — constrained generation. A system prompt with explicit
 *                       thematic boundaries. Cheap, always on, prevents most of
 *                       it. But a system prompt is a request, not a guarantee.
 *   Layer 2 (SAFE-03) — a classifier pass over the generated text BEFORE it
 *                       reaches TTS, failing closed to the authored skeleton.
 *
 * Layer 2 must not be a second opinion from the same reasoning that produced
 * the text — it is given the output alone, with no knowledge of the prompt that
 * generated it, so it cannot inherit the same blind spot.
 *
 * ⚠️ NON-ENGLISH. techstacks.md §227: "classifier quality degrades in
 * non-English. Assess the gap before enabling a language, not after." Story
 * bodies are English-only today, so this classifier only ever sees English.
 * That assessment is a precondition of shipping a non-English Instant Path,
 * not a follow-up to it.
 */
import { textProvider } from './providers/gemini.ts';

/**
 * SAFE-01 — constrained generation.
 *
 * The boundaries are stated as absolutes rather than preferences because a
 * hedged instruction ("try to avoid") is one the model will trade away under
 * pressure from the rest of the prompt.
 *
 * The register rules are not decoration: design.md §10 rejects child-facing
 * interactivity outright, so the text must never ask the child anything. A
 * question invites a four-year-old to answer, and answering is being awake.
 */
export const STORY_SYSTEM_PROMPT = `You write one page of a bedtime story for a young child (ages 2-8).

ABSOLUTE BOUNDARIES — these are not preferences:
- No death, dying, illness, injury or blood.
- No peril beyond the very mildest. Nothing is ever lost, trapped, chased or in danger.
- No frightening imagery: no darkness that threatens, no monsters, no strangers, no storms, no falling.
- No conflict between characters. No unkindness, teasing or exclusion.
- No adult themes of any kind. No romance, money, work stress, politics or religion.
- No food or drink instructions, no medicine, no anything a child could imitate unsafely.
- Never address the reader or ask the child a question. The child is falling asleep, not participating.

REGISTER:
- Calm, warm, slow. Every page should settle further than the last.
- Present tense throughout.
- Simple sentences. One idea each.
- Concrete and sensory: soft light, warmth, quiet sounds, gentle movement.
- The child is safe and accompanied at all times.

FORM:
- Return ONLY the page text. No title, no page number, no quotation marks, no commentary.
- 60-90 words.

THE NAME PLACEHOLDER — this one is mechanical, not stylistic:
- The text contains the literal token {childName}. Copy it through EXACTLY as
  written, braces included. Never replace it, translate it, or invent a name.
- Keep it once or twice, never more.
- It is substituted after you finish, so a page that loses the token loses the
  child's name entirely.`;

/**
 * The generation prompt for one page.
 *
 * The authored skeleton page is supplied as the SPINE, not as an example to
 * riff on. The skeletons are hand-written, safety-reviewed and paced across
 * twelve pages; the model's job is to personalise the language around the
 * child, not to invent a new beat. This is also what keeps the pre-rendered art
 * (D-10) in step — the panels are drawn to the skeleton's beats, so a page that
 * wanders is a page whose illustration no longer matches.
 */
export function pagePrompt(opts: {
  skeletonPage: string;
  setting: string;
  companion: string;
  stretchWords: string[];
  pageNumber: number;
  pageCount: number;
}): string {
  return `Rewrite this bedtime story page so it feels written for the child named by the {childName} placeholder.

KEEP the events, the setting and the order exactly as they are. Do not add new events, characters or places. This page is illustrated already, so what happens must not change.

Page ${opts.pageNumber} of ${opts.pageCount}${opts.pageNumber >= opts.pageCount - 1 ? ' — this is the end of the story; it must settle, not build.' : ''}

Setting: ${opts.setting}
Companion: ${opts.companion}
${opts.stretchWords.length ? `If it fits naturally, you may use one of these words: ${opts.stretchWords.join(', ')}. Never force one in.\n` : ''}
The page to rewrite:
${opts.skeletonPage}`;
}

export type Verdict = { safe: boolean; reason?: string };

/**
 * SAFE-03 — classify generated text before it reaches TTS.
 *
 * Deliberately given ONLY the text. No child name, no skeleton, no generation
 * prompt: context is what would let it rationalise a borderline passage as
 * intended. It judges what a parent would actually hear.
 *
 * FAILS CLOSED. A timeout, a malformed response, an API error or an
 * unparseable verdict all return unsafe. The caller's fallback is the authored
 * skeleton text, which is hand-written and already reviewed — so failing closed
 * costs personalisation, never the story. Never an error at bedtime.
 */
export async function classify(text: string): Promise<Verdict> {
  if (!text.trim()) return { safe: false, reason: 'empty' };

  try {
    const res = await textProvider.generate({
      system: `You are a child-safety classifier for a bedtime story app used by children aged 2-8.

You will be shown one page of text. Decide whether it is safe for a young child to hear at bedtime.

Mark it UNSAFE if it contains any of:
- death, dying, illness, injury, blood
- peril, threat, being lost, trapped, chased or in danger
- frightening imagery: monsters, threatening darkness, storms, falling, strangers
- conflict, unkindness, teasing or exclusion between characters
- adult themes: romance, money, work, politics, religion
- anything a child could unsafely imitate
- a direct question or instruction to the child
- any language that is not calm and settling

When uncertain, mark it UNSAFE. A false alarm costs nothing; a miss reaches a child.

Respond with JSON only: {"safe": boolean, "reason": string}`,
      prompt: text,
      json: true,
    });

    const parsed = JSON.parse(res.text) as { safe?: unknown; reason?: unknown };
    // An explicit boolean true is the ONLY pass. A missing or truthy-ish field
    // must not be read as approval.
    if (parsed.safe !== true) {
      return { safe: false, reason: typeof parsed.reason === 'string' ? parsed.reason : 'flagged' };
    }
    return { safe: true };
  } catch (e) {
    return { safe: false, reason: e instanceof Error ? e.message : 'classifier unavailable' };
  }
}
