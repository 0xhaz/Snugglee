/**
 * BE-08 — Instant Path skeleton store.
 *
 * Skeletons are authored once (assets-pipeline/author-skeletons.mjs) and loaded
 * at boot. They are NOT generated per user — that is what makes a free story
 * affordable, and why the art can be pre-rendered per skeleton (D-10).
 *
 * Loaded eagerly at module scope so page requests never pay disk I/O. Three
 * skeletons of ~1,000 words is a few tens of KB.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Beat = { atPage: number; scene: string };

export type Skeleton = {
  id: string;
  tile: string;
  emoji: string;
  setting: string;
  companion: string;
  companionArt: string;
  pageCount: number;
  pages: { n: number; text: string }[];
  stretchWords: string[];
  beats: Beat[];
};

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'skeletons');

const load = (): Map<string, Skeleton> => {
  const map = new Map<string, Skeleton>();
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
    const sk = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Skeleton;
    map.set(sk.id, sk);
  }
  return map;
};

export const skeletons = load();

export const getSkeleton = (id: string): Skeleton | undefined => skeletons.get(id);

export const listSkeletons = () =>
  [...skeletons.values()].map((s) => ({
    id: s.id,
    tile: s.tile,
    emoji: s.emoji,
    pageCount: s.pageCount,
  }));

/**
 * Slot interpolation. Pure string replacement — no LLM, no network, no failure
 * mode. This is what lets page 1 hit its 300ms budget.
 *
 * ⚠️ **Deferred, deliberately:** techstacks.md §4 specifies Flash-Lite
 * personalisation on pages 2+ (~$0.001/story) on top of this. It is not wired
 * yet, because GATE-B is a *latency* gate and interpolation-only establishes
 * the floor — the number we must not regress below. Adding an LLM call per page
 * before that baseline exists would make a slow result impossible to attribute.
 *
 * The seam is `personalise()` below: swap its body and every caller inherits it.
 */
export function interpolate(
  text: string,
  vals: { childName: string; companion: string; setting: string },
): string {
  return text
    .replaceAll('{childName}', vals.childName)
    .replaceAll('{companion}', vals.companion)
    .replaceAll('{setting}', vals.setting);
}

export function personalise(
  skeleton: Skeleton,
  pageNumber: number,
  childName: string,
): string | undefined {
  const page = skeleton.pages.find((p) => p.n === pageNumber);
  if (!page) return undefined;
  return interpolate(page.text, {
    childName,
    companion: skeleton.companion,
    setting: skeleton.setting,
  });
}
