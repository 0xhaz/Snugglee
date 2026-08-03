/**
 * S-09 — home / library.
 *
 * design.md §5 is explicit about what does NOT transfer from catalogue-style
 * sleep apps:
 *   - **no browse-first navigation.** There is no library on Day 0, and the
 *     card grid belongs here rather than in the core loop.
 *   - **no social proof** (favourites, listener counts). Content is personal
 *     and private; those numbers would be meaningless.
 *   - **no five-tab bottom bar.** It implies a catalogue. The surface is thin.
 *
 * So this is a single primary action with a quiet history beneath it, not a
 * browsing experience. The parent came here to start a story, not to shop.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText } from '../src/components/AppText';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { config } from '../src/config';
import { getIdToken } from '../src/session';
import { STORY_ART } from '../src/stories/art';
import { getChild, listStories, type StoryRecord } from '../src/store';
import { radius, shell, space } from '../src/theme/tokens';

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [credits, setCredits] = useState<number | null>(null);

  // Refresh on focus — returning from a story should show it immediately.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const [child, list] = await Promise.all([getChild(), listStories()]);
        if (!alive) return;
        setName(child?.name ?? '');
        setStories(list);

        try {
          const token = await getIdToken();
          const res = await fetch(`${config.apiBaseUrl}/credits`, {
            headers: { authorization: `Bearer ${token}` },
          });
          const json = (await res.json()) as { balance: number };
          if (alive) setCredits(json.balance);
        } catch {
          /* balance is informational here, never blocking */
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="title" bold>
          {name ? `${name}'s stories` : 'Stories'}
        </AppText>
        {credits !== null ? (
          <Pressable onPress={() => router.push('/credits')} accessibilityRole="button">
            <AppText variant="body" muted>
              {credits} {credits === 1 ? 'story' : 'stories'} left
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <PrimaryButton
        label="Tonight's story"
        onPress={() => router.push({ pathname: '/themes', params: { childName: name } })}
      />

      {stories.length === 0 ? (
        <Animated.View entering={FadeIn.delay(300)} style={styles.empty}>
          <AppText variant="body" muted center>
            Stories you've made will wait here, ready to hear again.
          </AppText>
        </Animated.View>
      ) : (
        <View style={styles.list}>
          <AppText variant="caption" muted style={styles.listLabel}>
            Again
          </AppText>
          {stories.map((s, i) => (
            <Animated.View key={s.id} entering={FadeInDown.delay(i * 60).duration(400)}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/player',
                    params: { childName: s.childName, theme: s.theme, storyId: s.id },
                  })
                }
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${s.title}. Play again.`}
              >
                <View style={styles.thumbWrap}>
                  {STORY_ART[s.theme]?.[0] ? (
                    <Animated.Image
                      source={STORY_ART[s.theme]![0]}
                      style={styles.thumb}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>
                <View style={styles.rowText}>
                  <AppText variant="body" bold>
                    {s.title}
                  </AppText>
                  <AppText variant="caption" muted>
                    {/* Replays are free — worth saying, it changes how often they use it. */}
                    {s.lastPageHeard ? `slept at page ${s.lastPageHeard}` : 'free to hear again'}
                  </AppText>
                </View>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      )}

      <Pressable onPress={() => router.push('/privacy')} style={styles.settings}>
        <AppText variant="caption" muted center>
          Privacy & your voice
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: space.xl,
    paddingBottom: space.lg,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  empty: { marginTop: space.xxl, paddingHorizontal: space.lg },
  list: { marginTop: space.xxl },
  listLabel: { marginBottom: space.md, textTransform: 'uppercase', letterSpacing: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    marginBottom: space.sm,
  },
  rowPressed: { opacity: 0.6 },
  thumbWrap: {
    flexBasis: 64,
    flexGrow: 0,
    flexShrink: 0,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: shell.surface,
  },
  thumb: { width: '100%', height: '100%' },
  rowText: { flex: 1, gap: 2 },
  settings: { marginTop: space.xxl, padding: space.lg },
});
