/**
 * Local persistence — child profile and story history.
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
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHILD_KEY = 'snugglee.child';
const STORIES_KEY = 'snugglee.stories';

export type ChildProfile = {
  name: string;
  /** Age BAND, never a birthday — D-13. */
  ageBand?: '2-3' | '4-6' | '7-8';
};

export type StoryRecord = {
  id: string;
  theme: string;
  title: string;
  childName: string;
  createdAt: number;
  /** How far the child actually got. The key business metric. */
  lastPageHeard?: number;
  /** Whether it played in the parent's voice or the stock narrator. */
  voiceId?: string;
};

/* --------------------------------- child ---------------------------------- */

export async function getChild(): Promise<ChildProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(CHILD_KEY);
    return raw ? (JSON.parse(raw) as ChildProfile) : null;
  } catch {
    return null;
  }
}

export async function setChild(profile: ChildProfile): Promise<void> {
  await AsyncStorage.setItem(CHILD_KEY, JSON.stringify(profile));
}

/* -------------------------------- stories --------------------------------- */

export async function listStories(): Promise<StoryRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORIES_KEY);
    const all = raw ? (JSON.parse(raw) as StoryRecord[]) : [];
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function addStory(record: StoryRecord): Promise<void> {
  const all = await listStories();
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
  const all = await listStories();
  const next = all.map((s) => (s.id === id ? { ...s, lastPageHeard } : s));
  await AsyncStorage.setItem(STORIES_KEY, JSON.stringify(next));
}

export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove([CHILD_KEY, STORIES_KEY]);
}
