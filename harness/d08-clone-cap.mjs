/**
 * D-08 empirical check: does Cartesia cap the number of stored cloned voices?
 *
 * Every paying user needs their own clone (architecture.md D-08), so a per-plan
 * cap is a hard ceiling on subscribers — the exact property that disqualified
 * ElevenLabs. Cartesia publishes no number.
 *
 * Creates N throwaway clones from one generated sample, records where (if
 * anywhere) it stops, then deletes every voice it created. Cleanup runs in a
 * finally block so it happens even if the loop throws.
 */
const KEY = process.env.CARTESIA_API_KEY;
const VER = '2026-03-01';
const N = Number(process.argv[2] ?? 15);
const H = { authorization: `Bearer ${KEY}`, 'Cartesia-Version': VER };

const created = [];

try {
  // 1. Generate a sample to clone from — a library voice, so we clone a
  //    synthetic source. Fine here: we are counting, not judging quality.
  process.stdout.write('generating sample clip… ');
  const tts = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json' },
    body: JSON.stringify({
      model_id: 'sonic-3.5',
      transcript:
        'Goodnight, my love. The day is finished now. The lights are low and the house is quiet. Close your eyes.',
      voice: { mode: 'id', id: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4' },
      output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
      language: 'en',
    }),
  });
  if (!tts.ok) throw new Error(`tts failed ${tts.status}: ${(await tts.text()).slice(0, 300)}`);
  const clip = Buffer.from(await tts.arrayBuffer());
  console.log(`${(clip.length / 1024).toFixed(0)}KB`);

  // 2. Clone repeatedly until it refuses or we hit N.
  console.log(`\nattempting ${N} clones…`);
  for (let i = 1; i <= N; i++) {
    const form = new FormData();
    form.append('clip', new Blob([new Uint8Array(clip)], { type: 'audio/mpeg' }), 'c.mp3');
    form.append('name', `__d08_captest_${i}`);
    form.append('language', 'en');

    const res = await fetch('https://api.cartesia.ai/voices/clone', { method: 'POST', headers: H, body: form });
    const body = await res.text();
    if (!res.ok) {
      console.log(`  #${i}: REFUSED ${res.status} — ${body.slice(0, 240)}`);
      console.log(`\n>>> CAP FOUND AT ${created.length} STORED CLONES <<<`);
      break;
    }
    const id = JSON.parse(body)?.id;
    created.push(id);
    console.log(`  #${i}: ok  ${id}`);
  }

  console.log(`\nresult: created ${created.length}/${N} clones with no refusal.`);
  if (created.length === N) {
    console.log('No cap encountered at this depth. Does NOT prove unbounded —');
    console.log('a limit could sit at 100, 1000, or be enforced per plan at scale.');
  }
} catch (err) {
  console.log('\nERROR:', err instanceof Error ? err.message : String(err));
} finally {
  // 3. Always clean up.
  console.log(`\ncleaning up ${created.length} test voices…`);
  let deleted = 0, failed = 0;
  for (const id of created) {
    const r = await fetch(`https://api.cartesia.ai/voices/${id}`, { method: 'DELETE', headers: H });
    r.ok ? deleted++ : failed++;
    if (!r.ok) console.log(`  delete failed ${id}: ${r.status}`);
  }
  console.log(`deleted ${deleted}, failed ${failed}`);
  if (failed) console.log('⚠️ Remove any stragglers manually at play.cartesia.ai');
}
