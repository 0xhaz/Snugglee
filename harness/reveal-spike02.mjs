/**
 * Two tests in one clone, both outstanding from Phase 1:
 *
 * A. THE REVEAL (D-06) — the closing line in the parent's voice. ~30 characters.
 *    Never tested: every prior run used a 176-word passage. Short utterances are
 *    where cloned voices most often fall apart, and this line is simultaneously
 *    the aha moment, the paywall trigger and the demo video's climax.
 *
 * B. SPIKE-02 (techstacks.md §11) — cross-lingual quality from a 15s sample.
 *    "If a 15s English sample can't produce convincing Spanish, non-English
 *    enrolment needs a longer sample" — which would change S-06's copy and UI.
 *
 * Also compares 15s vs 60s enrolment. Every O-02 result so far used a 60-second
 * reference, 4x what D-06 specifies, which flatters the clone.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.CARTESIA_API_KEY;
const VER = '2026-03-01';
const H = { authorization: `Bearer ${KEY}`, 'Cartesia-Version': VER };
const created = [];

const clone = async (file, label, language = 'en') => {
  const clip = readFileSync(file);
  const form = new FormData();
  form.append('clip', new Blob([new Uint8Array(clip)], { type: 'audio/mpeg' }), 'c.mp3');
  form.append('name', `__test_${label}_${Date.now()}`);
  form.append('language', language);
  const r = await fetch('https://api.cartesia.ai/voices/clone', { method: 'POST', headers: H, body: form });
  if (!r.ok) throw new Error(`clone ${label} (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const id = (await r.json()).id;
  created.push(id);
  console.log(`  cloned ${label.padEnd(12)} -> ${id}`);
  return id;
};

const speak = async (voiceId, text, language, out) => {
  const t0 = Date.now();
  const r = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json' },
    body: JSON.stringify({
      model_id: 'sonic-3.5', transcript: text,
      voice: { mode: 'id', id: voiceId },
      output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
      language, generation_config: { speed: 0.85, emotion: 'calm' },
    }),
  });
  if (!r.ok) return { err: `${r.status}: ${(await r.text()).slice(0, 160)}` };
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(out, buf);
  return { ms: Date.now() - t0, kb: Math.round(buf.length / 1024), out };
};

try {
  console.log('cloning from 15s (what D-06 actually specifies) and 60s (what we tested with):');
  const v15 = await clone('/tmp/sample-15s.mp3', '15s');
  const v60 = await clone('/tmp/sample-60s.mp3', '60s');

  // ---- A. THE REVEAL -----------------------------------------------------
  console.log('\n=== A. THE REVEAL (D-06) — the closing line ===');
  const line = 'Goodnight, Amir. I love you.';
  console.log(`  text: "${line}"  (${line.length} chars)`);
  for (const [label, v] of [['15s', v15], ['60s', v60]]) {
    const r = await speak(v, line, 'en', `/tmp/reveal-${label}.mp3`);
    console.log(`  ${label}: ${r.err ?? `${r.ms}ms, ${r.kb}KB -> ${r.out}`}`);
  }

  // ---- B. SPIKE-02 -------------------------------------------------------
  console.log('\n=== B. SPIKE-02 — cross-lingual from a 15s English sample ===');
  const langs = [
    ['es', 'Buenas noches, Amir. Te quiero mucho. Cierra los ojos ahora.', 'Spanish'],
    ['fr', 'Bonne nuit, Amir. Je t’aime. Ferme les yeux maintenant.', 'French'],
    ['de', 'Gute Nacht, Amir. Ich habe dich lieb. Schließ jetzt die Augen.', 'German'],
    ['id', 'Selamat malam, Amir. Ibu sayang kamu. Tutup matamu sekarang.', 'Indonesian/Malay'],
    ['tl', 'Magandang gabi, Amir. Mahal kita. Ipikit mo na ang iyong mga mata.', 'Tagalog'],
    ['zh', '晚安，阿米尔。我爱你。现在闭上眼睛吧。', 'Chinese'],
  ];
  for (const [code, text, name] of langs) {
    const r = await speak(v15, text, code, `/tmp/xling-${code}.mp3`);
    console.log(`  ${code} ${name.padEnd(18)} ${r.err ?? `${r.ms}ms, ${r.kb}KB -> ${r.out}`}`);
  }

  console.log('\nListen and judge:');
  console.log('  reveal:      afplay /tmp/reveal-15s.mp3 ; afplay /tmp/reveal-60s.mp3');
  console.log('  cross-lingual: afplay /tmp/xling-es.mp3   (etc)');
  console.log('\nQuestion for the reveal: does a 28-character line still sound like the person?');
  console.log('Question for SPIKE-02: does the Spanish still sound like the ENGLISH speaker?');
} catch (e) {
  console.log('ERROR:', e.message);
} finally {
  console.log(`\ncleaning up ${created.length} test voices…`);
  let ok = 0;
  for (const id of created) {
    const r = await fetch(`https://api.cartesia.ai/voices/${id}`, { method: 'DELETE', headers: H });
    if (r.ok) ok++;
  }
  console.log(`deleted ${ok}/${created.length}`);
}
