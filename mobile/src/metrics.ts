/**
 * OPS-03 — Day-0 timing instrumentation.
 *
 * GATE-B is a measured number, not an impression: "on a physical device, over
 * cellular, cold start → first audio in < 2s from theme tap." A stopwatch
 * cannot separate network from TTS from client work, so when the gate misses
 * you would not know which of the three fixes to reach for.
 *
 * The marks below mirror the Day-0 table in design.md §3 exactly, so a run can
 * be compared against the budget line by line.
 *
 * `timeToFirstAudio` is the headline metric in techstacks.md §10 (target < 2s)
 * — the one the entire Day-0 thesis rests on.
 */

export type Mark =
  | 'app_open'
  | 'name_submitted'
  | 'theme_tapped'
  | 'session_ready'
  | 'page1_text'
  | 'audio_requested'
  | 'audio_downloaded'
  | 'first_audio';

const marks = new Map<Mark, number>();
let listeners: ((summary: Summary) => void)[] = [];

export type Summary = {
  marks: Record<string, number>;
  /** The gate: theme tap → first audio. Target < 2000ms. */
  timeToFirstAudio: number | null;
  /** design.md §3 budgets ~11s from app open. */
  timeToFirstValue: number | null;
  /** Where the time actually went — this is what makes a miss diagnosable. */
  breakdown: { label: string; ms: number }[];
};

export function mark(name: Mark) {
  if (!marks.has(name)) marks.set(name, Date.now());
  if (name === 'first_audio') emit();
}

/** New story run — clears everything except app_open. */
export function resetRun() {
  const open = marks.get('app_open');
  marks.clear();
  if (open) marks.set('app_open', open);
}

const delta = (a: Mark, b: Mark) => {
  const x = marks.get(a);
  const y = marks.get(b);
  return x != null && y != null ? y - x : null;
};

export function summary(): Summary {
  const out: Record<string, number> = {};
  for (const [k, v] of marks) out[k] = v;

  const breakdown = [
    { label: 'auth (anonymous session)', ms: delta('theme_tapped', 'session_ready') },
    { label: 'page 1 text (no LLM — 300ms budget)', ms: delta('session_ready', 'page1_text') },
    { label: 'TTS synthesis + download', ms: delta('audio_requested', 'audio_downloaded') },
    { label: 'decode → playback start', ms: delta('audio_downloaded', 'first_audio') },
  ].filter((b): b is { label: string; ms: number } => b.ms != null);

  return {
    marks: out,
    timeToFirstAudio: delta('theme_tapped', 'first_audio'),
    timeToFirstValue: delta('app_open', 'first_audio'),
    breakdown,
  };
}

function emit() {
  const s = summary();
  // Logged unconditionally: GATE-B is measured on a real device where a debug
  // overlay may not be visible, and the Metro console is the record.
  console.log('[GATE-B]', JSON.stringify(s, null, 2));
  listeners.forEach((fn) => fn(s));
}

export function onSummary(fn: (s: Summary) => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}

/** Pass condition from workplan §5, with the documented fix order on a miss. */
export function verdict(s: Summary): { pass: boolean; note: string } {
  if (s.timeToFirstAudio == null) return { pass: false, note: 'no measurement' };
  if (s.timeToFirstAudio < 2000) {
    return { pass: true, note: `${s.timeToFirstAudio}ms — under the 2s bar` };
  }
  const slowest = [...s.breakdown].sort((a, b) => b.ms - a.ms)[0];
  return {
    pass: false,
    note: `${s.timeToFirstAudio}ms — over. Slowest: ${slowest?.label} (${slowest?.ms}ms). Fix order: (1) confirm min-instances=1 is warm, (2) confirm page 1 makes zero LLM calls, (3) shrink page-1 text.`,
  };
}
