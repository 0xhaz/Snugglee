/**
 * SPK-03 — story prompt iteration with the safety classifier shown alongside.
 *
 * Produces the system prompt that BE-07 ships on Friday, and exercises both
 * safety layers from techstacks.md §8:
 *   Layer 1 — constrained generation (the system prompt below)
 *   Layer 2 — classifier pass on generated text BEFORE TTS, failing closed
 *             to a template story rather than surfacing an error to a parent
 *             at bedtime.
 *
 * Also demonstrates the rule that page 1 is TEMPLATED, never LLM-generated
 * (design.md §3, techstacks.md §4). Page 1 has a 300ms budget; an LLM call
 * cannot fit inside it. Personalisation depth starts at page 2, by which point
 * audio is already playing.
 */
import { useState } from 'react';

import { api } from '../api';
import { TEXT_PRICE, textCost, type CostEntry, type TextModelId } from '../costs';
import {
  PAGE_COUNT,
  SYSTEM_PROMPT,
  WORDS_PER_PAGE,
  characterBlock,
  renderPage1,
  stretchWordCarryOver,
} from '../storySpec';

const TEXT_MODELS: TextModelId[] = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
];

/**
 * Layer 1 prompt and the page-1 template now live in `src/storySpec.ts`,
 * shared with the image pipeline. See that file for why.
 */
const DEFAULT_SYSTEM = SYSTEM_PROMPT;

type Verdict = { safe: boolean; concerns: string[]; reasoning: string };

export default function Story({ onCost }: { onCost: (e: CostEntry) => void }) {
  const [model, setModel] = useState<TextModelId>('gemini-3.1-flash-lite');
  const [system, setSystem] = useState(DEFAULT_SYSTEM);
  const [childName, setChildName] = useState('Amir');
  const [ageBand, setAgeBand] = useState('4-6');
  const [theme, setTheme] = useState('a journey to the moon');
  const [companion, setCompanion] = useState('a small grey plush rabbit');
  const [setting, setSetting] = useState('cloud fields');

  const [pages, setPages] = useState<{ n: number; text: string }[]>([]);
  const [stretch, setStretch] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const page1 = renderPage1({ childName, companion, setting });

  async function run() {
    setBusy(true);
    setErr('');
    setVerdict(null);
    setPages([]);
    setStretch([]);

    try {
      // Generated in BATCHES, matching D-16's lazy generation at prefetch depth
      // 2 — production never generates a whole story at once either. Also
      // avoids the request timeout a single 12-page call hits.
      const BATCH = 4;
      const acc: { n: number; text: string }[] = [];
      const words: string[] = [];

      for (let start = 2; start <= PAGE_COUNT; start += BATCH) {
        const end = Math.min(start + BATCH - 1, PAGE_COUNT);
        const soFar = [page1, ...acc.map((p) => p.text)].join('\n\n');

        const gen = await api.text({
          model,
          system,
          json: true,
          prompt: `Child's name: ${childName}
Age band: ${ageBand}
Theme: ${theme}
Setting: ${setting}

${characterBlock(childName)}

The story so far (do not rewrite it):
${soFar}

Write pages ${start} to ${end} only (${end - start + 1} pages), each about ${WORDS_PER_PAGE} words,
continuing in PRESENT TENSE and winding down steadily.${
            end === PAGE_COUNT ? ' End with the child asleep.' : ''
          }${stretchWordCarryOver([...new Set(words)])}`,
        });

        onCost({
          at: Date.now(),
          stage: `story generation (pages ${start}-${end})`,
          model,
          detail: `${gen.inputTokens} in / ${gen.outputTokens} out, ${gen.ms}ms`,
          usd: textCost(model, gen.inputTokens, gen.outputTokens),
        });

        setRaw(gen.text);
        const parsed = JSON.parse(gen.text);
        acc.push(...(parsed.pages ?? []));
        words.push(...(parsed.stretchWords ?? []));
        setPages([...acc]);
        setStretch([...new Set(words)]);
      }

      // Layer 2 — classifier pass before TTS.
      const fullText = [page1, ...acc.map((p) => p.text)].join('\n\n');
      const check = await api.text({
        model,
        json: true,
        system: `You are a child-safety classifier for bedtime stories aimed at ages 2-8.
Flag ANY of: death, injury, illness, blood, weapons, villains or characters
intending harm, frightening imagery, peril beyond the very mildest, or content
that would excite rather than settle a child.

Be strict. A false positive costs one regenerated story. A false negative ends
the app. Return JSON only:
{"safe":true|false,"concerns":["..."],"reasoning":"one sentence"}`,
        prompt: fullText,
      });

      const checkCost = textCost(model, check.inputTokens, check.outputTokens);
      onCost({
        at: Date.now(),
        stage: 'safety classifier (layer 2)',
        model,
        detail: `${check.inputTokens} in / ${check.outputTokens} out, ${check.ms}ms`,
        usd: checkCost,
      });

      setVerdict(JSON.parse(check.text));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <div>
      <h2>SPK-03 — story prompt + safety classifier</h2>
      <p className="note">
        {PAGE_COUNT} pages × ~{WORDS_PER_PAGE} words, generated in batches of 4 (D-16 lazy
        generation). Page 1 is <b>templated, never LLM-generated</b> — it has a 300ms budget.
        Raised from D-15's 6 pages: see spike-results/ECONOMICS.md §4.
      </p>

      <div className="row">
        <label>
          Model
          <select value={model} onChange={(e) => setModel(e.target.value as TextModelId)}>
            {TEXT_MODELS.map((m) => (
              <option key={m} value={m}>
                {m} — ${TEXT_PRICE[m].input}/${TEXT_PRICE[m].output} per 1M
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input value={childName} onChange={(e) => setChildName(e.target.value)} size={8} />
        </label>
        <label>
          Age band
          <input value={ageBand} onChange={(e) => setAgeBand(e.target.value)} size={5} />
        </label>
        <label>
          Theme
          <input value={theme} onChange={(e) => setTheme(e.target.value)} />
        </label>
        <label>
          Companion
          <input value={companion} onChange={(e) => setCompanion(e.target.value)} size={10} />
        </label>
        <label>
          Setting
          <input value={setting} onChange={(e) => setSetting(e.target.value)} size={12} />
        </label>
        <button onClick={run} disabled={busy}>
          {busy ? 'generating…' : 'Generate + classify'}
        </button>
      </div>

      {err ? <pre className="err">{err}</pre> : null}

      {verdict ? (
        <div className={verdict.safe ? 'verdict ok' : 'verdict bad'}>
          <b>Layer 2 classifier: {verdict.safe ? 'PASS' : 'FAIL → fall back to template story'}</b>
          <div>{verdict.reasoning}</div>
          {verdict.concerns?.length ? <div>Concerns: {verdict.concerns.join('; ')}</div> : null}
        </div>
      ) : null}

      {stretch.length ? (
        <div className="costbar">
          <b>Stretch words:</b> {stretch.join(', ')}
          <span className="hint"> — logged per story to feed the parent recap (fast-follow #2).</span>
        </div>
      ) : null}

      <div className="pages">
        <div className="page templated">
          <div className="panelhead">
            Page 1 <span className="hint">templated · no LLM · $0.00</span>
          </div>
          <p>{page1}</p>
        </div>
        {pages.map((p) => (
          <div className="page" key={p.n}>
            <div className="panelhead">
              Page {p.n} <span className="hint">generated</span>
            </div>
            <p>{p.text}</p>
          </div>
        ))}
      </div>

      <details>
        <summary>Layer 1 system prompt (ships in BE-07)</summary>
        <textarea value={system} onChange={(e) => setSystem(e.target.value)} rows={16} />
      </details>

      {raw ? (
        <details>
          <summary>Raw model output</summary>
          <pre>{raw}</pre>
        </details>
      ) : null}
    </div>
  );
}
