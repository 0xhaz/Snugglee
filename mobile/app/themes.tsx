/**
 * S-02 — theme picker. T+0:05, with a 5-second budget to first tap.
 *
 * design.md §4.1: **tapping a tile IS the submit.** No "next" button, no
 * confirmation step. Every extra interaction is another chance to lose a room
 * containing an impatient four-year-old.
 *
 * Tiles show real pre-rendered art (D-10), bundled in the binary — no network
 * fetch, nothing to wait for. That is also why companion and setting are fixed
 * per theme rather than chosen: the art is rendered per skeleton, and every
 * combination would need its own set.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '../src/components/AppText';
import { Screen } from '../src/components/Screen';
import { mark, resetRun } from '../src/metrics';
import { getAiConsent } from '../src/store';
import { STORY_ART } from '../src/stories/art';
import { radius, shell, space } from '../src/theme/tokens';

/** Mirrors server/skeletons/*.json. Fixed per skeleton — see the note above. */
const THEMES = [
  { id: 'moon', tile: 'To the moon', blurb: 'Up through the cloud fields' },
  { id: 'garden', tile: 'The firefly garden', blurb: 'Just outside the back door' },
  { id: 'train', tile: 'The slow train', blurb: 'Through sleeping countryside' },
] as const;

export default function ThemePicker() {
  const router = useRouter();
  const { childName } = useLocalSearchParams<{ childName: string }>();

  /**
   * Guideline 5.1.1(i) — permission BEFORE any personal data is shared.
   *
   * Gated here rather than at each caller: S-01 and the home screen both lead
   * to the theme picker, and this is the last screen before a story exists.
   * Redirects rather than blocks, so an existing install upgrading into this
   * build is asked once and then never again.
   */
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void getAiConsent().then((c) => {
        if (alive && !c) router.replace('/ai-notice');
      });
      return () => {
        alive = false;
      };
    }, [router]),
  );
  const name = childName ?? 'your child';

  const pick = (id: string) => {
    // GATE-B's clock starts here: theme tap -> first audio, target < 2s.
    resetRun();
    mark('theme_tapped');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    router.push({ pathname: '/player', params: { childName: name, theme: id } });
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="title" bold>
          What shall tonight's story be?
        </AppText>
        <AppText variant="body" muted style={styles.sub}>
          For {name}
        </AppText>
      </View>

      {THEMES.map((theme, i) => (
        <Animated.View key={theme.id} entering={FadeInDown.delay(i * 90).duration(500)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${theme.tile}. ${theme.blurb}`}
            onPress={() => pick(theme.id)}
            style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
          >
            {/*
              The wrapper owns the box. An Image given only a percentage width
              plus aspectRatio collapses to zero inside a flex row — it has
              intrinsic dimensions that fight Yoga's aspect calculation.
            */}
            <View style={styles.artWrap}>
              <Image
                // Panel 3, not panel 1. Every skeleton opens on the same
                // composition — a child in bed — so panel 1 tiles were
                // indistinguishable from each other and told the parent
                // nothing about what they were choosing between. Panel 3 is
                // the in-setting shot: clouds, fireflies, train carriage.
                source={STORY_ART[theme.id]?.[2] ?? STORY_ART[theme.id]?.[0]}
                // width/height 100%, NOT StyleSheet.absoluteFill. Absolute
                // insets alone leave an Image at its intrinsic 1024px, so the
                // box just crops its top-left corner — which looked like a
                // solid colour block. resizeMode only engages against explicit
                // dimensions.
                style={styles.art}
                resizeMode="cover"
                // Bundled asset — no placeholder or spinner needed. A spinner
                // in front of a four-year-old is a failure (§2).
                accessible={false}
              />
            </View>
            <View style={styles.tileText}>
              <AppText variant="subheading" bold>
                {theme.tile}
              </AppText>
              <AppText variant="caption" muted>
                {theme.blurb}
              </AppText>
            </View>
          </Pressable>
        </Animated.View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.lg, paddingBottom: space.lg },
  sub: { marginTop: space.xs },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: shell.surface,
    borderRadius: radius.lg,
    padding: space.sm,
    marginBottom: space.md,
  },
  tilePressed: { opacity: 0.75 },
  artWrap: {
    // flexBasis + aspectRatio on a plain View: resolves reliably in a row,
    // and still scales with the container rather than being a fixed px size.
    flexBasis: '28%',
    flexGrow: 0,
    flexShrink: 0,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: shell.background,
  },
  art: { width: '100%', height: '100%' },
  tileText: { flex: 1, gap: 2 },
});
