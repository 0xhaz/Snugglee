# assets-pipeline — build-time illustration rendering

Not yet scaffolded. Starts Fri Jul 31 (`ART-03`, workplan.md §4).

**LONG-POLE.** This is the only task that runs for two weeks. Started late, it
becomes the thing that delays the ship.

Instant Path art is **pre-rendered at build time, not per user**
(architecture.md D-10). The cost amortises across the entire user base instead
of scaling linearly with it — this is what makes a free first story affordable.

## Volume

`themes × pages-per-story`, where pages-per-story is frozen by **GATE-A1**
(SPIKE-01, Tue Jul 28):

| SPIKE-01 result | Illustrations per story |
|---|---|
| Consistent across ≥3 panels | 4 |
| Consistent across 2 panels | 2 |
| Inconsistent | 1 hero image, audio-first product |

Do not start rendering volume until that gate resolves.

## Notes

- Style is **flat, character-led vector on deep indigo** (D-19). This is not
  only preference: flat geometry is what image models hold consistent across
  generations, which makes it a direct SPIKE-01 mitigation.
- Output is **language-neutral and fully reusable**. The expensive asset
  amortises across every language added later (techstacks.md §11) — which is
  what makes multilingual cheap.
- `out/` is gitignored: large and reproducible.
