/**
 * BE-06 — story manifest and the streaming contract.
 *
 * The rules this file exists to enforce (techstacks.md §4, design.md §3):
 *
 *  1. **Page 1 must never depend on an LLM call.** It has a 300ms budget and
 *     comes from a template with the name interpolated. Personalisation depth
 *     starts at page 2, by which point audio is already playing.
 *  2. **Never pre-generate a full story.** Prefetch depth 2, always. Children
 *     falling asleep mid-story is the product working, and pages past the
 *     drop-off are never generated and never billed — a direct COGS saving
 *     that only exists if generation stays lazy (D-16).
 *  3. Credits deduct on completion; generation failure refunds automatically.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { config } from './config.ts';
import { textProvider } from './providers/gemini.ts';
import { classify, pagePrompt, STORY_SYSTEM_PROMPT } from './safety.ts';
import { personalise, type Skeleton } from './skeletons.ts';

export type StoryPage = {
  n: number;
  text: string;
  /** Populated lazily. Absent means "not generated yet", not "failed". */
  audioUrl?: string;
  imageUrl?: string;
};

export type StoryManifest = {
  storyId: string;
  userId: string;
  path: 'instant' | 'custom';
  pageCount: number;
  /** Page 1 only. Pages 2..N are pending by construction. */
  pages: StoryPage[];
  prefetchDepth: number;
  childName: string;
  createdAt: number;
};

/**
 * Page-1 template. Present tense — the system prompt continues in present
 * tense, and a past-tense template made the story audibly change gear one page
 * in (found by running SPK-03 with the template and generated pages together).
 */
const PAGE_1_TEMPLATE =
  '{childName} is not quite ready to sleep. Outside the window the sky has gone soft and dark, and somewhere far away, in the {setting}, {companion} is waiting.';

export function renderPage1(v: {
  childName: string;
  companion: string;
  setting: string;
}): string {
  return PAGE_1_TEMPLATE.replace('{childName}', v.childName)
    .replace('{companion}', v.companion)
    .replace('{setting}', v.setting);
}

/**
 * Creates a manifest with page 1 fully materialised and nothing else.
 *
 * **No LLM call happens here.** If a future change adds one, the 300ms budget
 * is gone and with it the entire Day-0 thesis — this is the rule most likely to
 * be broken by a well-meaning refactor.
 */
export async function createManifest(opts: {
  userId: string;
  childName: string;
  theme: string;
  companion: string;
  setting: string;
  path: 'instant' | 'custom';
}): Promise<StoryManifest> {
  const db = getFirestore();
  const ref = db.collection('stories').doc();

  const manifest: StoryManifest = {
    storyId: ref.id,
    userId: opts.userId,
    path: opts.path,
    pageCount: config.story.pageCount,
    pages: [
      {
        n: 1,
        text: renderPage1({
          childName: opts.childName,
          companion: opts.companion,
          setting: opts.setting,
        }),
      },
    ],
    prefetchDepth: config.story.prefetchDepth,
    childName: opts.childName,
    createdAt: Date.now(),
  };

  /**
   * Fire-and-forget: the persist is deliberately NOT awaited.
   *
   * Page 1 is fully determined by the template and the child's name, so nothing
   * in the response depends on this write completing. Awaiting it would put a
   * Firestore round-trip inside the 300ms page-1 budget — and Firestore is
   * single-region, so for a user on the far side of that region the write alone
   * could exceed the whole budget.
   *
   * The tradeoff is honest: a failed write means the story is unresumable and
   * abandonment goes unrecorded. Neither is visible to the child mid-story, and
   * both are worth strictly less than the first-audio latency they would cost.
   */
  void ref
    .set({ ...manifest, theme: opts.theme, companion: opts.companion, setting: opts.setting })
    .catch((e) => console.error('[story] manifest persist failed', ref.id, e));

  return manifest;
}

/**
 * How many pages may exist given how far the child has actually got.
 *
 * This is the COGS control. Generating beyond `reached + prefetchDepth` spends
 * money on pages nobody will hear — and §4.1 is explicit that most stories are
 * not completed, which is the product working rather than a failure.
 */
export function generationCeiling(pagesReached: number): number {
  return Math.min(pagesReached + config.story.prefetchDepth, config.story.pageCount);
}

/**
 * Records how far the child actually got.
 *
 * **The single most important number in the product.** It feeds three decisions
 * at once (ECONOMICS.md §5): expected COGS and therefore pack pricing (O-03),
 * whether stories are long enough to do their job, and whether §4.1's 60-70%
 * correction is real.
 *
 * Measure it. Do NOT optimise it — a child asleep at page 4 is success.
 */
export async function recordAbandonment(storyId: string, lastPageHeard: number) {
  await getFirestore()
    .collection('stories')
    .doc(storyId)
    .set({ lastPageHeard, abandonedAt: Date.now() }, { merge: true });
}

/**
 * ⚠️ The speaker's role is a REQUIRED slot in most non-English languages.
 *
 * Found by SPIKE-02: the documented slots (`childName`, `theme`, `companion`,
 * `setting`) never identify who is speaking. English hides this behind "I love
 * you"; Malay cannot — a parent addressing a small child says *Ibu sayang kamu*
 * ("Mother loves you") or *Ayah sayang kamu*. Same in Tagalog, Vietnamese,
 * Korean, Japanese, Thai and child-register Mandarin. Arabic, Hebrew, Russian,
 * Polish and Hindi additionally inflect the speaker's own adjectives by gender.
 *
 * The reveal (D-06) is the one line spoken *as* the parent, so this is exactly
 * where it breaks — in the segment architecture.md §1 calls the sharpest wedge.
 *
 * Captured at S-06, where the parent is already engaged and about to record.
 * It also improves English: "Mummy loves you" lands warmer on a four-year-old.
 */
export type ParentRole = 'mother' | 'father' | 'grandmother' | 'grandfather' | 'other';

const PARENT_TERM: Record<string, Partial<Record<ParentRole, string>>> = {
  en: { mother: 'Mummy', father: 'Daddy', grandmother: 'Granny', grandfather: 'Grandad', other: 'I' },
  ms: { mother: 'Ibu', father: 'Ayah', grandmother: 'Nenek', grandfather: 'Atuk' },
  id: { mother: 'Ibu', father: 'Ayah', grandmother: 'Nenek', grandfather: 'Kakek' },
  tl: { mother: 'Nanay', father: 'Tatay', grandmother: 'Lola', grandfather: 'Lolo' },
  vi: { mother: 'Mẹ', father: 'Bố', grandmother: 'Bà', grandfather: 'Ông' },
  ko: { mother: '엄마', father: '아빠', grandmother: '할머니', grandfather: '할아버지' },
  ja: { mother: 'ママ', father: 'パパ', grandmother: 'おばあちゃん', grandfather: 'おじいちゃん' },
  zh: { mother: '妈妈', father: '爸爸', grandmother: '奶奶', grandfather: '爷爷' },
  th: { mother: 'แม่', father: 'พ่อ', grandmother: 'ยาย', grandfather: 'ตา' },
  es: { mother: 'Mamá', father: 'Papá' },
  fr: { mother: 'Maman', father: 'Papa' },
  de: { mother: 'Mama', father: 'Papa' },
};

/**
 * Per-language, never machine-translated from English — translation would
 * either drop the speaker's identity or invent one.
 */
const REVEAL: Record<string, (c: string, t: string) => string> = {
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

/**
 * Falls back per LANGUAGE, never per word.
 *
 * The previous fallback chain resolved the kinship term and the sentence
 * independently, so a gap in one produced a hybrid: `es` + grandmother has no
 * authored term, took the English "Granny", and emitted *"Buenas noches, Amir.
 * Granny te quiere mucho."* Likewise `ms` + other gave *"Selamat malam, Amir. I
 * sayang kamu."*
 *
 * Every non-English entry currently lacks `other`, and de/es/fr lack both
 * grandparents — so this was not an edge case, it was most of the matrix.
 *
 * §4.2 is explicit that this line is spoken *as* the parent at the emotional
 * peak. A clean English reveal is a small loss; a sentence that code-switches
 * mid-clause in the parent's own cloned voice is a broken one. So an
 * incomplete language degrades wholesale to English.
 *
 * The real fix is authoring the missing terms — but that needs a native
 * speaker, not a plausible guess, for the same reason translation is banned
 * above.
 */
export function revealLine(lang: string, childName: string, role: ParentRole): string {
  const term = PARENT_TERM[lang]?.[role];
  const sentence = REVEAL[lang];
  if (!term || !sentence) {
    return REVEAL.en!(childName, PARENT_TERM.en![role] ?? 'I');
  }
  return sentence(childName, term);
}

/* ------------------------- BE-08 page personalisation ---------------------- */

/**
 * How long the LLM and the classifier each get before we stop waiting.
 *
 * Pages 2+ are prefetched while the previous page narrates (~40s), so this is
 * generous. It exists for the pathological case: a hung vendor call must not
 * hold audio open, because the queue's buffering HOLD is covering it and a
 * child is waiting in silence.
 */
const GENERATION_TIMEOUT_MS = 6_000;

/** Stands in for the child's name everywhere an AI vendor can see the text. */
const NAME_TOKEN = '{childName}';

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

type CachedPage = { text: string; childName: string; source: 'llm' | 'template' };

const pageCache = () => getFirestore().collection('story_pages');

/**
 * Cache key. Per STORY, not per skeleton+name.
 *
 * Keying on the skeleton and name instead would be cheaper — two families with
 * an Amir would share generations — but it would also mean one child's story is
 * literally another's. Per-story keeps each telling its own, and is what makes
 * a replay free (design.md §4): the second play reads the cache rather than
 * re-billing generation.
 */
const cacheKey = (storyId: string, n: number) => `${storyId}__${n}`;

/**
 * In-process dedup. The client fetches a page's TEXT and its AUDIO at nearly
 * the same moment, and both resolve through here — without this they would
 * both call the LLM for the same page and one would lose the write race,
 * producing text that does not match what was narrated.
 *
 * Best-effort across instances; Firestore is the durable half. A duplicate
 * generation costs ~$0.001, so a stricter transaction is not worth the latency.
 */
const inflight = new Map<string, Promise<string>>();

/**
 * The single source of truth for what page `n` says.
 *
 * **Both the text route and the audio route must call this.** They used to call
 * `personalise()` independently, which was harmless while both were pure
 * template interpolation — and would silently desynchronise the moment one of
 * them started generating. The narrated words and the on-screen words have to
 * be the same string.
 */
export async function resolvePageText(opts: {
  storyId: string;
  skeleton: Skeleton;
  pageNumber: number;
  childName: string;
}): Promise<string | undefined> {
  /**
   * DATA MINIMISATION — the child's name never reaches the AI vendor.
   *
   * The page is sent for generation with the literal `{childName}` token still
   * in place, and the real name is substituted only after the text comes back
   * and has been classified. Google therefore receives an anonymous bedtime
   * page; the only service that ever sees the name is the TTS vendor, which
   * cannot avoid it because the name has to be spoken aloud.
   *
   * This is a privacy property, not an optimisation, and App Review 5.1.2(i)
   * turns on exactly this question: what personal data is shared, and with whom.
   * Keep it. Passing `opts.childName` into the prompt would silently undo it.
   */
  const anonymous = personalise(opts.skeleton, opts.pageNumber, NAME_TOKEN);
  if (!anonymous) return undefined;

  const withName = (text: string) => text.replaceAll(NAME_TOKEN, opts.childName);
  const template = withName(anonymous);

  /**
   * RULE 1, absolute: page 1 is never generated. It has a 300ms budget and is
   * the whole Day-0 thesis. An LLM call here is the single most likely way for
   * this file to regress.
   */
  if (opts.pageNumber <= 1) return template;

  /**
   * A story id is required to cache, and caching is what keeps replays free.
   * Older clients send a placeholder, so they get the authored text — the
   * previous behaviour, degraded cleanly rather than billed repeatedly.
   */
  if (!opts.storyId || opts.storyId.length < 8) return template;

  const key = cacheKey(opts.storyId, opts.pageNumber);

  const running = inflight.get(key);
  if (running) return running;

  const task = (async () => {
    try {
      const snap = await pageCache().doc(key).get();
      if (snap.exists) {
        const hit = snap.data() as CachedPage;
        // A renamed child invalidates: the name is inside the prose.
        if (hit.childName === opts.childName && hit.text) return hit.text;
      }
    } catch {
      // Cache unavailable is not a failure — generate and carry on.
    }

    let text = template;
    let source: CachedPage['source'] = 'template';

    try {
      const gen = await withTimeout(
        textProvider.generate({
          system: STORY_SYSTEM_PROMPT,
          prompt: pagePrompt({
            skeletonPage: anonymous,
            setting: opts.skeleton.setting,
            companion: opts.skeleton.companion,
            stretchWords: opts.skeleton.stretchWords ?? [],
            pageNumber: opts.pageNumber,
            pageCount: opts.skeleton.pageCount,
          }),
        }),
        GENERATION_TIMEOUT_MS,
        'generation',
      );

      const candidate = gen.text.trim();

      /**
       * SAFE-03 — classify BEFORE this reaches TTS, and fail closed.
       *
       * The fallback is the authored skeleton page: hand-written, already
       * reviewed, and the exact text the illustration was drawn for. So a
       * rejection costs personalisation and nothing else. A parent never sees
       * an error and a child never hears one.
       */
      if (candidate) {
        const verdict = await withTimeout(classify(candidate), GENERATION_TIMEOUT_MS, 'classifier');
        /**
         * The classifier also sees the anonymous text — one fewer service
         * handling the name, and it has no bearing on whether a page is safe.
         *
         * A page that lost the token would be narrated without the child's name
         * in it, which is the entire product. Fall back rather than ship that.
         */
        if (verdict.safe && candidate.includes(NAME_TOKEN)) {
          text = withName(candidate);
          source = 'llm';
        }
      }
    } catch {
      // Generation or classification failed. The template already holds.
    }

    try {
      await pageCache()
        .doc(key)
        .set({ text, childName: opts.childName, source, at: Date.now() });
    } catch {
      // Unwritable cache costs a regeneration next time, nothing more.
    }

    return text;
  })().finally(() => inflight.delete(key));

  inflight.set(key, task);
  return task;
}

/**
 * Pre-written closing beat used when generation fails mid-story.
 *
 * design.md §4: this is a **product requirement, not error handling**. Credits
 * refund server-side, but the child experiences a story that stopped — so the
 * story must resolve rather than be abandoned. Same voice, narrative-safe exit.
 */
export function narrativeSafeEnding(childName: string): string {
  return `And so ${childName} closed their eyes, safe and warm, and drifted off to sleep.`;
}
