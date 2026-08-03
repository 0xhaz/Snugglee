/**
 * O-02 — voice vendor bake-off. MiniMax vs Cartesia.
 *
 * Decision rule (techstacks.md §5): same real 15s sample, same 200-word
 * passage, BLIND A/B on one question — *does this sound like me?*
 * Timbre identity is the product, not general TTS quality.
 *
 * **Tie-break on cost, not latency.** Audio-only is first-class and pages 2+
 * are prefetched, so nothing here is latency-critical enough to trade fidelity
 * for. Latency is displayed only because it is free to display.
 *
 * Blindness is enforced in the UI: which player is A and which is B is
 * randomised per run and not revealed until a verdict is recorded. Knowing
 * which vendor you are listening to contaminates exactly the judgement this
 * spike exists to make.
 *
 * Hard constraint (D-08): the winner must support UNBOUNDED per-user clones.
 * ElevenLabs is already disqualified on this — its voice slots cap per plan.
 */
import { useRef, useState } from 'react';

import { api } from '../api';
import {
  CARTESIA_PLANS,
  MINIMAX_USD_PER_1K_CHARS_DEFAULT,
  STORY_CHARS_D15_ENFORCED,
  STORY_CHARS_MEASURED,
  cartesiaUsdPerCredit,
  type CartesiaTier,
  type CostEntry,
} from '../costs';

type Vendor = 'minimax' | 'cartesia';

/** ~200 words, in-register: what the product will actually say. */
const PASSAGE = `Goodnight, my love. The day is finished now, and there is nothing left in it that needs you. The lights are low. The house is quiet. Outside the window the sky has gone soft and dark, and the last birds have already tucked themselves away. You did so many things today. You were brave when it was hard, and kind when it would have been easier not to be, and I saw all of it. Now you can put it down. Let your shoulders go loose. Let your hands go soft. Let the bed hold you, because it is very good at holding, and it does not mind how heavy you are. I am here. Even when you cannot see me, I am here, and I will be here when the morning comes back around. There is nothing to finish. There is nothing to fix. There is only this: warm blankets, slow breathing, and the quiet sound of someone who loves you saying that everything is all right. Close your eyes now. I love you. Goodnight.`;

export default function Voice({ onCost }: { onCost: (e: CostEntry) => void }) {
  const [sample, setSample] = useState<string>('');
  const [sampleName, setSampleName] = useState('');
  const [passage, setPassage] = useState(PASSAGE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [choice, setChoice] = useState<'A' | 'B' | 'tie' | null>(null);

  /** Which vendor sits behind slot A this run. Randomised, hidden until reveal. */
  const [slotA, setSlotA] = useState<Vendor>('minimax');
  const [results, setResults] = useState<Partial<Record<Vendor, { audio: string; ms: number }>>>(
    {},
  );

  const recorder = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [tier, setTier] = useState<CartesiaTier>('Pro');
  const [mmRate, setMmRate] = useState(MINIMAX_USD_PER_1K_CHARS_DEFAULT);
  const [speed, setSpeed] = useState(0.85);
  // Restored per preference. Note this is Cartesia-only — MiniMax has no
  // equivalent — so it makes the A/B asymmetric. Fine for auditioning.
  const [emotion, setEmotion] = useState('calm');

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSample(String(reader.result).split(',')[1] ?? '');
      setSampleName(f.name);
    };
    reader.readAsDataURL(f);
  }

  async function toggleRecord() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (ev) => chunks.push(ev.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType });
        const reader = new FileReader();
        reader.onload = () => {
          setSample(String(reader.result).split(',')[1] ?? '');
          setSampleName(`recorded (${mr.mimeType})`);
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      recorder.current = mr;
      setRecording(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function run() {
    if (!sample) {
      setErr('Load a 15-second voice sample first.');
      return;
    }
    setBusy(true);
    setErr('');
    setRevealed(false);
    setChoice(null);
    setResults({});
    setSlotA(Math.random() < 0.5 ? 'minimax' : 'cartesia');

    const out: Partial<Record<Vendor, { audio: string; ms: number }>> = {};
    for (const vendor of ['minimax', 'cartesia'] as Vendor[]) {
      try {
        const cloned = await api.cloneVoice({ vendor, sampleBase64: sample });
        onCost({
          at: Date.now(),
          stage: `O-02 clone`,
          model: vendor,
          detail: `${cloned.ms}ms`,
          usd: 0,
        });

        const spoken = await api.speak({
          vendor,
          voiceId: cloned.voiceId,
          text: passage,
          speed,
          emotion: emotion || undefined,
        });
        // Prefer the vendor's own billed count over our local string length.
        const chars = spoken.usageCharacters ?? passage.length;
        const usd =
          vendor === 'cartesia'
            ? chars * cartesiaUsdPerCredit(tier)
            : (chars / 1000) * mmRate;
        onCost({
          at: Date.now(),
          stage: 'O-02 synthesis',
          model: vendor,
          detail:
            vendor === 'cartesia'
              ? `${chars} chars = ${chars} credits @ ${tier}, ${spoken.ms}ms`
              : `billed ${chars} chars (vendor-reported) @ $${mmRate}/1K, ${
                  spoken.audioLengthMs ? `${(spoken.audioLengthMs / 1000).toFixed(1)}s audio, ` : ''
                }${spoken.ms}ms`,
          usd,
        });

        out[vendor] = { audio: spoken.audioBase64, ms: spoken.ms };
      } catch (e) {
        setErr((prev) => `${prev}\n[${vendor}] ${e instanceof Error ? e.message : String(e)}`.trim());
      }
    }
    setResults(out);
    setBusy(false);
  }

  const slotB: Vendor = slotA === 'minimax' ? 'cartesia' : 'minimax';
  const winner = choice === 'A' ? slotA : choice === 'B' ? slotB : null;

  return (
    <div>
      <h2>O-02 — voice vendor bake-off (blind)</h2>
      <p className="note">
        One question only: <b>does this sound like me?</b> Not "is this good TTS" — timbre
        identity is the product. Tie-break on <b>cost, not latency</b>.
      </p>
      <div className="costbar">
        <b>Credits per story — Cartesia bills 1 credit per character.</b>
        <div className="hint">
          Measured from a real SPK-03 story: 543 words / <b>{STORY_CHARS_MEASURED} chars</b>{' '}
          (5.48 chars/word) — within 6% of architecture.md §4's 2,800, so §4 holds. But the
          model wrote <b>91 words/page, not the 120 D-15 specifies</b>. Tighten the prompt to
          actually hit 120 and narration grows ~33% to ~{STORY_CHARS_D15_ENFORCED} chars,
          moving every figure below. Page length is a live cost lever.
        </div>
        <table style={{ marginTop: 8 }}>
          <tbody>
            <tr className="hint">
              <td>tier</td>
              <td>$/mo</td>
              <td>credits</td>
              <td>stories/mo (measured)</td>
              <td>$/story at full use</td>
              <td>cloning</td>
            </tr>
            {(Object.keys(CARTESIA_PLANS) as CartesiaTier[]).map((t) => {
              const p = CARTESIA_PLANS[t];
              const stories = p.credits / STORY_CHARS_MEASURED;
              return (
                <tr key={t} style={t === tier ? { color: '#6ee7a0' } : undefined}>
                  <td>
                    <label style={{ flexDirection: 'row', gap: 4 }}>
                      <input
                        type="radio"
                        checked={tier === t}
                        onChange={() => setTier(t)}
                        style={{ width: 'auto' }}
                      />
                      {t}
                    </label>
                  </td>
                  <td>${p.usd}</td>
                  <td>{(p.credits / 1000).toFixed(0)}K</td>
                  <td>{stories.toFixed(1)}</td>
                  <td>{p.usd ? `$${(p.usd / stories).toFixed(3)}` : '—'}</td>
                  <td className="hint">{p.cloning}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="hint" style={{ marginTop: 6 }}>
          A fixed monthly bucket, not pay-as-you-go: these $/story figures assume you consume
          the whole plan. Use half and the real cost per story doubles.
        </div>

        <div className="row" style={{ marginTop: 10, borderTop: '1px solid #333', paddingTop: 10 }}>
          <label>
            MiniMax $ per 1K chars
            <input
              type="number"
              step="0.01"
              value={mmRate}
              onChange={(e) => setMmRate(Number(e.target.value) || 0)}
              size={6}
            />
          </label>
          <div>
            <b>
              MiniMax: ${((STORY_CHARS_MEASURED / 1000) * mmRate).toFixed(3)}/story
            </b>{' '}
            vs{' '}
            <b>
              Cartesia {tier}: $
              {(STORY_CHARS_MEASURED * cartesiaUsdPerCredit(tier)).toFixed(3)}/story
            </b>
            <div className="hint">
              at {STORY_CHARS_MEASURED} measured chars. MiniMax is pay-as-you-go with no
              monthly floor; Cartesia's figure assumes you consume the entire plan.
            </div>
          </div>
        </div>
        <div className="hint" style={{ marginTop: 4 }}>
          ⚠️ Default $0.05 is a <b>reseller</b> estimate for speech-02-hd, not your billed rate
          (OpenRouter lists the newer speech-2.8-hd at $0.10). Replace it with the number from
          your MiniMax console before deciding O-02 on cost.
          {Math.abs(mmRate - cartesiaUsdPerCredit('Pro') * 1000) < 1e-9 ? (
            <>
              {' '}
              <b>
                Note: $0.05/1K is also Cartesia Pro's exact effective rate ($5 ÷ 100K), which is
                why the two per-call costs match. That is arithmetic, not a measurement.
              </b>
            </>
          ) : null}
        </div>

        <div style={{ marginTop: 10, borderTop: '1px solid #333', paddingTop: 10 }}>
          <b>Break-even — the number that actually decides this</b>
          <div className="hint">
            MiniMax has no monthly floor, so a Cartesia plan only wins above a volume you have
            to actually hit. Below it you are paying for credits you never use.
          </div>
          <table style={{ marginTop: 6 }}>
            <tbody>
              {(['Pro', 'Startup', 'Scale'] as CartesiaTier[]).map((t) => {
                const p = CARTESIA_PLANS[t];
                const per = (STORY_CHARS_MEASURED / 1000) * mmRate;
                const be = per > 0 ? p.usd / per : Infinity;
                const cap = p.credits / STORY_CHARS_MEASURED;
                return (
                  <tr key={t}>
                    <td>{t}</td>
                    <td>${p.usd}/mo</td>
                    <td>
                      {be > cap ? (
                        <span style={{ color: '#ff8a8a' }}>
                          never — caps at {cap.toFixed(0)} stories before break-even
                        </span>
                      ) : (
                        <span style={{ color: '#6ee7a0' }}>
                          cheaper above <b>{be.toFixed(0)} stories/mo</b> (cap {cap.toFixed(0)})
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/^tts|synth|elevenlabs|voicetext/i.test(sampleName) ? (
        <div className="verdict bad">
          <b>⚠️ That looks like a synthetic (TTS-generated) sample: “{sampleName}”.</b>
          <div>
            O-02 asks <i>“does this sound like <b>me</b>?”</i> — a question a machine-generated
            reference cannot answer, because there is no “me” to compare against. Cloning a
            synthetic voice also feeds these models unnaturally clean input, which is the
            opposite of the real case: accented amateur, phone mic, noisy room, 15 seconds.
            <b> Re-run with a real human voice before recording a verdict.</b>
          </div>
        </div>
      ) : null}

      <div className="row">
        <label>
          speed (both)
          <input
            type="number"
            step="0.05"
            min="0.6"
            max="1.5"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value) || 0.85)}
            size={5}
          />
        </label>
        <label>
          emotion (both)
          <select value={emotion} onChange={(e) => setEmotion(e.target.value)}>
            <option value="">none</option>
            <option value="calm">calm</option>
            <option value="neutral">neutral</option>
          </select>
        </label>
        <span className="hint">
          Applied to both vendors — MiniMax takes <code>emotion</code> in{' '}
          <code>voice_setting</code>, Cartesia in <code>generation_config</code>. Parity holds,
          and both get the bedtime register the product ships.
        </span>
      </div>

      <div className="row">
        <button onClick={toggleRecord}>{recording ? '⏹ stop' : '⏺ record 15s'}</button>
        <label>
          or upload
          <input type="file" accept="audio/*" onChange={onFile} />
        </label>
        <span className="hint">{sampleName || 'no sample loaded'}</span>
        <button onClick={run} disabled={busy || !sample}>
          {busy ? 'cloning…' : 'Clone with both + synthesise'}
        </button>
      </div>

      {err ? <pre className="err">{err}</pre> : null}

      {results.minimax || results.cartesia ? (
        <div className="ab">
          {(['A', 'B'] as const).map((slot) => {
            const vendor = slot === 'A' ? slotA : slotB;
            const r = results[vendor];
            return (
              <div className="abslot" key={slot}>
                <div className="panelhead">
                  Sample {slot}
                  {revealed ? <span className="hint"> — {vendor} · {r?.ms}ms</span> : null}
                </div>
                {r ? (
                  <audio controls src={`data:audio/mpeg;base64,${r.audio}`} />
                ) : (
                  <div className="placeholder">failed — see error above</div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {(results.minimax || results.cartesia) && !revealed ? (
        <div className="row">
          <b>Which sounds more like you?</b>
          <button onClick={() => { setChoice('A'); setRevealed(true); }}>A</button>
          <button onClick={() => { setChoice('B'); setRevealed(true); }}>B</button>
          <button onClick={() => { setChoice('tie'); setRevealed(true); }}>
            Tie → decide on cost
          </button>
        </div>
      ) : null}

      {revealed ? (
        <div className="verdict ok">
          {choice === 'tie' ? (
            <b>Tie → pick the cheaper vendor. Do not tie-break on latency.</b>
          ) : (
            <b>You picked {choice} — that is {winner}.</b>
          )}
          <div className="hint">
            Record this against O-02 in workplan.md §11 before moving on. Verify the winner
            supports unbounded per-user clones (D-08).
          </div>
        </div>
      ) : null}

      <details>
        <summary>Passage ({passage.trim().split(/\s+/).length} words)</summary>
        <textarea value={passage} onChange={(e) => setPassage(e.target.value)} rows={10} />
      </details>
    </div>
  );
}
