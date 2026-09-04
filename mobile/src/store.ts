/**
 * Local persistence — child profiles and story history.
 *
 * Deliberately on-device rather than server-side. D-13 keeps child data to a
 * first name and an age band, and the less of that which leaves the phone the
 * simpler the COPPA posture stays (techstacks.md §9). The server never needs to
 * know the child's name to do its job — it is interpolated into text that is
 * synthesised and discarded.
 *
 * Story history is the index behind S-09 (library) and S-13 (replay). The audio
 * itself lives in the cache directory, written by the audio queue, so replays
 * cost nothing and work offline — which matters for a wedge whose child is
 * disproportionately at a grandparent's house or on a plane (design.md §4).
 *
 * ── SIBLINGS ───────────────────────────────────────────────────────────────
 * A household has more than one child, and a story made for one is not a story
 * for the other. So a child is an ENTITY with a stable id, and every story
 * belongs to exactly one. The library shows the active child's stories only.
 *
 * The id is what makes a rename a rename. Keyed on the name instead, correcting
 * a typo would silently orphan every story that child had; now the name is just
 * a mutable field and the stories follow the child through it.
 *
 * D-13 is unaffected: more children means more rows of {first name, age band},
 * which is the same class of data, still never leaving the device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

/** Pre-siblings key. Read once by the migration below, then left alone. */
const LEGACY_CHILD_KEY = 'snugglee.child';

const CHILDREN_KEY = 'snugglee.children';
const ACTIVE_KEY = 'snugglee.activeChild';
const STORIES_KEY = 'snugglee.stories';
const AI_CONSENT_KEY = 'snugglee.aiConsent';

export type ChildProfile = {
  id: string;
  name: string;
  /** Age BAND, never a birthday — D-13. */
  ageBand?: '2-3' | '4-6' | '7-8';
};

export type StoryRecord = {
  id: string;
  /** Which child this was made for. Absent only on pre-siblings records. */
  childId: string;
  theme: string;
  title: string;
  /**
   * The name as it was SPOKEN when this story was generated. Kept alongside
   * childId because it is baked into the cached audio — a rename invalidates
   * that cache rather than silently mismatching text and voice.
   */
  childName: string;
  createdAt: number;
  /** How far the child actually got. The key business metric. */
  lastPageHeard?: number;
  /** Whether it played in the parent's voice or the stock narrator. */
  voiceId?: string;
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/* ------------------------------- AI consent -------------------------------- */

/**
 * App Store Guideline 5.1.1(i) / 5.1.2(i).
 *
 * Snugglee sends a child's first name to a third-party speech service so the
 * story can be read aloud with their name in it. That is personal data going to
 * a third party, and Apple requires the app itself to disclose what is sent, to
 * whom, and to obtain permission BEFORE sending — stating it only in the
 * privacy policy is explicitly not sufficient.
 *
 * Stored with a timestamp and the version of the copy that was agreed to, so a
 * later change to what we send can invalidate an old consent rather than
 * silently inheriting it. Same pattern as the voice consent logged server-side.
 */
export const AI_NOTICE_VERSION = '2026-08-08.1';

export type AiConsent = { version: string; grantedAt: number };

export async function getAiConsent(): Promise<AiConsent | null> {
  const c = await readJson<AiConsent | null>(AI_CONSENT_KEY, null);
  // A consent given against older copy does not carry forward.
  return c?.version === AI_NOTICE_VERSION ? c : null;
}

export async function setAiConsent(): Promise<void> {
  const record: AiConsent = { version: AI_NOTICE_VERSION, grantedAt: Date.now() };
  await AsyncStorage.setItem(AI_CONSENT_KEY, JSON.stringify(record));
}

/* -------------------------------- migration -------------------------------- */

/**
 * Upgrades a pre-siblings install in place. Idempotent and safe to call on
 * every read — it does nothing once `snugglee.children` exists.
 *
 * Existing stories predate `childId`, so they are adopted by the one child who
 * could have made them. Without this they would filter out of the library and
 * read as data loss.
 */
async function migrate(): Promise<void> {
  const existing = await AsyncStorage.getItem(CHILDREN_KEY);
  if (existing) return;

  const legacy = await readJson<{ name: string; ageBand?: ChildProfile['ageBand'] } | null>(
    LEGACY_CHILD_KEY,
    null,
  );
  if (!legacy?.name) return; // fresh install — nothing to carry over

  const child: ChildProfile = { id: randomUUID(), name: legacy.name, ageBand: legacy.ageBand };
  const stories = await readJson<StoryRecord[]>(STORIES_KEY, []);
  const adopted = stories.map((s) => (s.childId ? s : { ...s, childId: child.id }));

  await AsyncStorage.multiSet([
    [CHILDREN_KEY, JSON.stringify([child])],
    [ACTIVE_KEY, child.id],
    [STORIES_KEY, JSON.stringify(adopted)],
  ]);
}

/* -------------------------------- children --------------------------------- */

export async function listChildren(): Promise<ChildProfile[]> {
  await migrate();
  return readJson<ChildProfile[]>(CHILDREN_KEY, []);
}

/** The child the app is currently making stories for. */
export async function getChild(): Promise<ChildProfile | null> {
  const children = await listChildren();
  if (children.length === 0) return null;
  const activeId = await AsyncStorage.getItem(ACTIVE_KEY);
  return children.find((c) => c.id === activeId) ?? children[0]!;
}

export async function addChild(
  name: string,
  ageBand?: ChildProfile['ageBand'],
): Promise<ChildProfile> {
  const children = await listChildren();
  const child: ChildProfile = { id: randomUUID(), name: name.trim(), ageBand };
  await AsyncStorage.multiSet([
    [CHILDREN_KEY, JSON.stringify([...children, child])],
    // A newly added child becomes active — you added them to use them.
    [ACTIVE_KEY, child.id],
  ]);
  return child;
}

/**
 * Edits a child in place. A rename keeps their stories: same child, new
 * spelling.
 *
 * The rename PROPAGATES to that child's library. Their stories carry the name
 * that gets spoken, so leaving it frozen would replay "Amir" from a library
 * headed "Princess" — the bug this exists to fix.
 *
 * The knock-on is deliberate and worth stating: the audio cache is keyed by
 * name (audio/queue.ts), so the first replay after a rename MISSES the cache
 * and re-synthesises. That costs a round of TTS. The alternative is text and
 * voice disagreeing, which is worse. Renames should be rare; this is not a
 * per-play cost.
 */
export async function updateChild(id: string, patch: Partial<Omit<ChildProfile, 'id'>>) {
  const children = await listChildren();
  await AsyncStorage.setItem(
    CHILDREN_KEY,
    JSON.stringify(children.map((c) => (c.id === id ? { ...c, ...patch } : c))),
  );

  if (patch.name === undefined) return;
  const name = patch.name.trim();
  if (!name) return;

  const all = await readJson<StoryRecord[]>(STORIES_KEY, []);
  const next = all.map((s) => (s.childId === id ? { ...s, childName: name } : s));
  await AsyncStorage.setItem(STORIES_KEY, JSON.stringify(next));
}

export async function setActiveChild(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_KEY, id);
}

/**
 * Removes a child and everything made for them.
 *
 * Their stories go too: an orphaned story cannot be shown (there is no child to
 * show it under) and cannot be replayed correctly, so leaving the rows behind
 * would be clutter that looks like a bug.
 */
export async function removeChild(id: string): Promise<void> {
  const children = (await listChildren()).filter((c) => c.id !== id);
  const stories = (await readJson<StoryRecord[]>(STORIES_KEY, [])).filter((s) => s.childId !== id);
  const activeId = await AsyncStorage.getItem(ACTIVE_KEY);

  const writes: [string, string][] = [
    [CHILDREN_KEY, JSON.stringify(children)],
    [STORIES_KEY, JSON.stringify(stories)],
  ];
  if (activeId === id && children[0]) writes.push([ACTIVE_KEY, children[0].id]);
  await AsyncStorage.multiSet(writes);

  if (children.length === 0) await AsyncStorage.removeItem(ACTIVE_KEY);
}

/* -------------------------------- stories --------------------------------- */

/** Every story on the device, regardless of child. Rarely what you want. */
async function allStories(): Promise<StoryRecord[]> {
  await migrate();
  const all = await readJson<StoryRecord[]>(STORIES_KEY, []);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** The library. Scoped to one child — a sibling's stories are not theirs. */
export async function listStories(childId?: string): Promise<StoryRecord[]> {
  const all = await allStories();
  const id = childId ?? (await getChild())?.id;
  if (!id) return [];
  return all.filter((s) => s.childId === id);
}

export async function addStory(record: StoryRecord): Promise<void> {
  const all = await allStories();
  // Replace rather than duplicate if the same story is re-opened.
  const next = [record, ...all.filter((s) => s.id !== record.id)];
  await AsyncStorage.setItem(STORIES_KEY, JSON.stringify(next));
}

/**
 * Records how far the child got.
 *
 * Stored locally as well as posted to the server: the server copy feeds pack
 * pricing (ECONOMICS.md §5), and the local copy lets the library show where a
 * story was left without a round-trip.
 */
export async function recordProgress(id: string, lastPageHeard: number): Promise<void> {
  const all = await allStories();
  const next = all.map((s) => (s.id === id ? { ...s, lastPageHeard } : s));
  await AsyncStorage.setItem(STORIES_KEY, JSON.stringify(next));
}

export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove([LEGACY_CHILD_KEY, CHILDREN_KEY, ACTIVE_KEY, STORIES_KEY, AI_CONSENT_KEY]);
}
