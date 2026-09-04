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
  const [enrolled, setEnrolled] = useState<boolean | null>(null);

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
          const headers = { authorization: `Bearer ${token}` };
          const [balance, voice] = await Promise.all([
            fetch(`${config.apiBaseUrl}/credits`, { headers }).then((r) => r.json()),
            fetch(`${config.apiBaseUrl}/voice`, { headers }).then((r) => r.json()),
          ]);
          if (!alive) return;
          setCredits((balance as { balance: number }).balance);
          setEnrolled((voice as { enrolled: boolean }).enrolled);
        } catch {
          /* both are informational here, never blocking */
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

        {/*
          Profile lives behind a single quiet mark rather than a nav bar. §5
          rejects a five-tab bottom bar because it implies a catalogue — but it
          does not ask for the settings to be unreachable, which is what a lone
          "Privacy" link at the very bottom amounted to.
        */}
        <Pressable
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.avatar, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Profile and settings"
        >
          <AppText variant="body" bold>
            {name ? name.trim().charAt(0).toUpperCase() : '·'}
          </AppText>
        </Pressable>
      </View>

      {credits !== null ? (
        <View style={styles.quick}>
          <Pressable onPress={() => router.push('/credits')} accessibilityRole="button">
            <AppText variant="body" muted>
              {credits} {credits === 1 ? 'story' : 'stories'} left
            </AppText>
          </Pressable>
          {/* Purchase always goes via the gate (§4, S-14) — never straight in. */}
          <Pressable
            onPress={() => router.push({ pathname: '/parental-gate', params: { next: '/paywall' } })}
            accessibilityRole="button"
          >
            <AppText variant="body" style={styles.quickAction}>
              Get more
            </AppText>
          </Pressable>
        </View>
      ) : null}

      <PrimaryButton
        label="Tonight's story"
        onPress={() => router.push({ pathname: '/themes', params: { childName: name } })}
      />

      {/*
        D-06 / §2 — the voice ask NEVER precedes the story. That rule is about
        the first story, not about the rest of the parent's life: once they have
        heard one, enrolment stops being a toll and becomes a feature they
        cannot currently find, because S-04 fires once and never returns.
        So this appears only after a story exists, and disappears once enrolled.
      */}
      {stories.length > 0 && enrolled === false ? (
        <Pressable
          onPress={() => router.push({ pathname: '/consent', params: { childName: name } })}
          style={({ pressed }) => [styles.voiceRow, pressed && styles.rowPressed]}
          accessibilityRole="button"
        >
          <AppText variant="body" bold center>
            Use your own voice
          </AppText>
          <AppText variant="caption" muted center style={styles.voiceHint}>
            Read one short passage, and {name || 'your child'} hears the story in your voice
          </AppText>
        </Pressable>
      ) : null}

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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: shell.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.lg,
  },
  quickAction: { color: shell.accent },
  voiceRow: {
    marginTop: space.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: shell.surface,
  },
  // `textMuted`, not `cloud` — body copy on `raised` fails AA in the accents.
  voiceHint: { marginTop: space.xs },
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
