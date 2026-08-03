/**
 * SPIKE-01 — character consistency. THE GATING SPIKE (architecture.md §7).
 *
 * Question: can the Nano Banana family hold a visually consistent child
 * character across sequential illustrations, in the D-19 flat-vector style?
 *
 * Two controls here go beyond the method written in §7, deliberately:
 *
 * 1. MODEL TIER. §7 says "standard Nano Banana", but that family is now four
 *    models at four price points, and the tier choice *is* the unit economics
 *    (architecture.md §4). Testing one tier answers half the question.
 *
 * 2. CHAINED REFERENCE. §7's method is four independent generations from one
 *    description. But these models accept reference images natively, so
 *    feeding panel N-1 into panel N is a consistency lever available today —
 *    far cheaper than fallback (c) (IP-Adapter / per-story LoRA), which §7
 *    itself concedes is out of window. If independent fails and chained
 *    passes, the cheap path survives and the economics hold.
 *
 * Judge against the LOOSENED bar in §7: two consistent panels plus imagination
 * is a defensible product, not a compromise. Audio-only is first-class
 * (design.md §8), so art is supporting, not central.
 */
import { useState } from 'react';

import { api } from '../api';
import {
  IMAGE_PRICE_1K,
  IMAGE_TIER_NOTE,
  type CostEntry,
  type ImageModelId,
} from '../costs';
import { CHILD_NAME, IMAGE_STYLE, characterBlock } from '../storySpec';

const MODELS: ImageModelId[] = [
  'gemini-3.1-flash-lite-image',
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
];

/**
 * Style and character now come from `src/storySpec.ts` — the SAME definitions
 * the text pipeline uses. Previously each pipeline had its own idea of the
 * companion (living creature vs stuffed toy), which is what made the rabbit
 * drift grey → teal → brown across panels.
 */
const DEFAULT_STYLE = IMAGE_STYLE;
const DEFAULT_CHARACTER = characterBlock(CHILD_NAME);

/** Every beat names the companion explicitly — omitting it is what dropped it. */
const DEFAULT_BEATS = [
  'sitting up in bed hugging the plush rabbit, looking out of a round window at the night sky',
  'stepping onto a floating cloud outside the window, the plush rabbit tucked under one arm',
  'riding the cloud past a large friendly smiling moon, the plush rabbit beside him',
  'curled up asleep on the cloud, the plush rabbit held close against his chest',
];

type Panel = {
  beat: string;
  base64?: string;
  mime?: string;
  ms?: number;
  via?: string;
  error?: string;
};

export default function Spike01({
  onCost,
}: {
  onCost: (e: CostEntry) => void;
}) {
  const [model, setModel] = useState<ImageModelId>('gemini-3.1-flash-lite-image');
  const [mode, setMode] = useState<'independent' | 'chained'>('independent');
  const [style, setStyle] = useState(DEFAULT_STYLE);
  const [character, setCharacter] = useState(DEFAULT_CHARACTER);
  const [beats, setBeats] = useState(DEFAULT_BEATS);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [busy, setBusy] = useState(false);
  const [runCost, setRunCost] = useState(0);

  const setBeat = (i: number, v: string) =>
    setBeats((b) => b.map((x, j) => (j === i ? v : x)));

  async function run() {
    setBusy(true);
    setPanels(beats.map((beat) => ({ beat })));
    setRunCost(0);

    let cost = 0;
    let previous: string | undefined;

    for (let i = 0; i < beats.length; i++) {
      const prompt = [
        style,
        '',
        `CHARACTERS (must look identical in every image):\n${character}`,
        '',
        `SCENE: ${CHILD_NAME} ${beats[i]}`,
        mode === 'chained' && previous
          ? '\nMatch the character in the reference image exactly — same face, same hair, same clothing, same proportions.'
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      try {
        const out = await api.image({
          model,
          prompt,
          references: mode === 'chained' && previous ? [previous] : undefined,
          aspectRatio: '1:1',
        });

        cost += IMAGE_PRICE_1K[model];
        setRunCost(cost);
        onCost({
          at: Date.now(),
          stage: `SPIKE-01 panel ${i + 1}`,
          model,
          detail: `${mode}, ${out.via}, ${out.ms}ms`,
          usd: IMAGE_PRICE_1K[model],
        });

        if (mode === 'chained') previous = out.base64;

        setPanels((p) =>
          p.map((x, j) =>
            j === i ? { ...x, base64: out.base64, mime: out.mimeType, ms: out.ms, via: out.via } : x,
          ),
        );
      } catch (err) {
        setPanels((p) =>
          p.map((x, j) =>
            j === i ? { ...x, error: err instanceof Error ? err.message : String(err) } : x,
          ),
        );
        break;
      }
    }
    setBusy(false);
  }

  return (
    <div>
      <h2>SPIKE-01 — character consistency (GATING)</h2>
      <p className="note">
        Evaluate <b>face, hair, clothing, proportion</b> across panels. Pass bar is loosened:
        two consistent panels plus imagination is a defensible product. Result decides
        illustrations-per-story, which sets the whole COGS table.
      </p>

      <div className="row">
        <label>
          Model tier
          <select value={model} onChange={(e) => setModel(e.target.value as ImageModelId)}>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m} — ${IMAGE_PRICE_1K[m].toFixed(4)}/img
              </option>
            ))}
          </select>
        </label>

        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="independent">independent (§7 method)</option>
            <option value="chained">chained reference (panel N-1 → N)</option>
          </select>
        </label>

        <button onClick={run} disabled={busy}>
          {busy ? 'generating…' : `Generate ${beats.length} panels`}
        </button>
      </div>

      <p className="tiernote">{IMAGE_TIER_NOTE[model]}</p>

      <div className="costbar">
        <b>This run:</b> ${runCost.toFixed(4)} &nbsp;·&nbsp;
        <b>4 panels at this tier:</b> ${(IMAGE_PRICE_1K[model] * 4).toFixed(4)} &nbsp;·&nbsp;
        <b>2 panels:</b> ${(IMAGE_PRICE_1K[model] * 2).toFixed(4)}
        <span className="hint">
          {' '}
          — architecture.md §4.1: real COGS is ~60–70% of a complete story, because pages past
          the child falling asleep are never generated.
        </span>
      </div>

      <details>
        <summary>Prompt controls</summary>
        <label className="block">
          Style (D-19)
          <textarea value={style} onChange={(e) => setStyle(e.target.value)} rows={4} />
        </label>
        <label className="block">
          Character description (held constant across panels)
          <textarea value={character} onChange={(e) => setCharacter(e.target.value)} rows={3} />
        </label>
        {beats.map((b, i) => (
          <label className="block" key={i}>
            Beat {i + 1}
            <input value={b} onChange={(e) => setBeat(i, e.target.value)} />
          </label>
        ))}
      </details>

      <div className="panels">
        {panels.map((p, i) => (
          <div className="panel" key={i}>
            <div className="panelhead">
              Panel {i + 1}
              {p.ms ? <span className="hint"> {p.ms}ms · {p.via}</span> : null}
            </div>
            {p.base64 ? (
              <img src={`data:${p.mime};base64,${p.base64}`} alt={`panel ${i + 1}`} />
            ) : p.error ? (
              <pre className="err">{p.error}</pre>
            ) : (
              <div className="placeholder">…</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
