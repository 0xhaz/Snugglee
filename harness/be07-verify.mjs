/**
 * BE-07 verification: shared spec, 12 pages, present tense, companion held.
 *
 * Generates in BATCHES rather than one call — which is not just a timeout
 * workaround. D-16 requires lazy generation at prefetch depth 2, so production
 * never generates a whole story at once either. Batching here is closer to what
 * ships, and it lets each batch see the previous one for continuity.
 */
import { writeFileSync } from 'node:fs';
import {
  CHILD_NAME, PAGE_COUNT, WORDS_PER_PAGE, SYSTEM_PROMPT, renderPage1,
  COMPANION_SHORT, characterBlock, stretchWordCarryOver,
} from '/Volumes/extreme/Projects/Hackathons/Snugglee/harness/src/storySpec.ts';

const MODEL = 'gemini-3.1-flash-lite';
const PRICE = { input: 0.25, output: 1.5 };
const usd = (i, o) => (i / 1e6) * PRICE.input + (o / 1e6) * PRICE.output;
const BATCH = 4;

const post = (b) => fetch('http://localhost:5273/api/text', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
}).then((r) => r.json());

const setting = 'cloud fields';
const page1 = renderPage1({ childName: CHILD_NAME, companion: COMPANION_SHORT, setting });

console.log(`BE-07 verification · ${PAGE_COUNT} pages in batches of ${BATCH} · ${MODEL}\n`);
console.log(`page 1 (templated, present tense):\n  "${page1}"\n`);

const pages = [];
let cost = 0, stretch = [];

for (let start = 2; start <= PAGE_COUNT; start += BATCH) {
  const end = Math.min(start + BATCH - 1, PAGE_COUNT);
  const soFar = [page1, ...pages.map((p) => p.text)].join('\n\n');
  const r = await post({
    model: MODEL, system: SYSTEM_PROMPT, json: true,
    prompt: `Child's name: ${CHILD_NAME}
Age band: 4-6
Theme: a journey to the moon
Setting: ${setting}

${characterBlock(CHILD_NAME)}

The story so far (do not rewrite it):
${soFar}

Write pages ${start} to ${end} only (${end - start + 1} pages), each about ${WORDS_PER_PAGE} words,
continuing in PRESENT TENSE. This story runs to ${PAGE_COUNT} pages total and must wind down
steadily — pages ${start}-${end} should be calmer than what came before.${end === PAGE_COUNT ? ' End with the child asleep.' : ''}${stretchWordCarryOver([...new Set(stretch)])}`,
  });
  if (r.error) { console.log(`pages ${start}-${end} ERROR:`, r.error.slice(0, 200)); break; }
  cost += usd(r.inputTokens, r.outputTokens);
  const parsed = JSON.parse(r.text);
  pages.push(...(parsed.pages ?? []));
  stretch.push(...(parsed.stretchWords ?? []));
  console.log(`  pages ${start}-${end}: ${r.outputTokens} tok, ${r.ms}ms, $${usd(r.inputTokens, r.outputTokens).toFixed(6)}`);
}

const full = [page1, ...pages.map((p) => p.text)].join('\n\n');
console.log(`\ntotal: ${pages.length + 1} pages · $${cost.toFixed(6)} text\n`);

// --- defect checks -------------------------------------------------------
const past = full.match(/\b(was|were|had been|walked|stepped|looked|felt|whispered|drifted|closed his|reached)\b/gi) ?? [];
console.log('DEFECT 1 — tense mismatch:');
console.log(`  past-tense markers: ${past.length ? [...new Set(past.map(s=>s.toLowerCase()))].join(', ') : 'NONE ✓'}`);

console.log('\nDEFECT 2 — companion consistency:');
const col = full.match(/\b(grey|gray|teal|brown|blue|white|pink|green|golden|silver)\s+(rabbit|bunny|toy)/gi) ?? [];
console.log(`  colour+noun mentions: ${col.length ? [...new Set(col.map(s=>s.toLowerCase()))].join(' | ') : '(none explicit)'}`);
console.log(`  ribbon referenced: ${/ribbon/i.test(full) ? 'yes ✓' : 'no'}`);
console.log(`  floppy/bent ear:   ${/flop|bent ear/i.test(full) ? 'yes ✓' : 'no'}`);

const words = full.trim().split(/\s+/).length, chars = full.length;
const secPerChar = 70.9 / 886;
console.log('\nDEFECT 3 — story length:');
console.log(`  ${words} words / ${chars} chars / ${pages.length + 1} pages (${(words/(pages.length+1)).toFixed(0)} words/page)`);
console.log(`  duration @0.85: ${(chars*secPerChar/60).toFixed(1)} min   @0.75: ${(chars*secPerChar*(0.85/0.75)/60).toFixed(1)} min`);
console.log(`  real bedtime sessions: 15-19 min · expert guidance 10-15 min`);

const IMG = 4*0.0336, T = 299/8e6;
console.log(`\nCOGS fully consumed:      images $${IMG.toFixed(4)} + text $${cost.toFixed(4)} + TTS $${(chars*T).toFixed(4)} = $${(IMG+cost+chars*T).toFixed(4)}`);
const halfN = Math.ceil((pages.length+1)/2);
const halfChars = [page1, ...pages.slice(0, halfN-1).map(p=>p.text)].join('\n\n').length;
console.log(`COGS asleep at page ${halfN}:     images $${IMG.toFixed(4)} + text ~$${(cost/2).toFixed(4)} + TTS $${(halfChars*T).toFixed(4)} = $${(IMG+cost/2+halfChars*T).toFixed(4)}`);
console.log(`  (production generates lazily, so unread pages cost nothing at all)`);
console.log('\nstretch words:', [...new Set(stretch)].join(', '));

writeFileSync('/tmp/be07-story.txt', full);
console.log('\nwritten: /tmp/be07-story.txt');
