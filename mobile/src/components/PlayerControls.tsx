/**
 * S-03 player controls.
 *
 * **For the parent, not the child.** Page advance is audio-driven: the story
 * plays itself and the child is meant to fall asleep, not operate it.
 * design.md §10 rejects child-facing interactivity outright — a swipeable story
 * invites the child to stay awake and drive it, which is the opposite of the
 * job. So there is no swipe, no tap-to-advance, no progress scrubber.
 *
 * What the parent does need: to stop, to step back a page the child missed, and
 * to put the screen out. §8 makes screen-off **first-class, not a fallback** —
 * for many families the phone goes face-down and the voice is the whole product.
 *
 * Deliberately dim and unobtrusive (player register, low contrast). Controls
 * bright enough to attract a four-year-old's eye would defeat the screen they
 * sit on.
 */
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { palette, player, radius, space } from '../theme/tokens';
import { AppText } from './AppText';

type Props = {
  page: number;
  pageCount: number;
  paused: boolean;
  screenOff: boolean;
  onTogglePause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onScreenOff: () => void;
  onExit: () => void;
};

export function PlayerControls({
  page,
  pageCount,
  paused,
  screenOff,
  onTogglePause,
  onPrev,
  onNext,
  onScreenOff,
  onExit,
}: Props) {
  // Soft and rare (§7). A bedtime app that buzzes frequently defeats itself.
  const tap = (fn: () => void) => () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    fn();
  };

  // Screen-off is handled by the player as a full-screen overlay — see
  // ScreenOffOverlay. "Tap anywhere" has to mean anywhere, which a control
  // strip cannot deliver.
  if (screenOff) return null;

  return (
    <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut} style={styles.root}>
      <View style={styles.row}>
        <Control label="✕" onPress={tap(onExit)} accessibilityLabel="Close story" />
        <Control label="‹" onPress={tap(onPrev)} disabled={page <= 1} accessibilityLabel="Previous page" />
        <Control
          label={paused ? '▶' : '❙❙'}
          onPress={tap(onTogglePause)}
          accessibilityLabel={paused ? 'Resume' : 'Pause'}
          wide
        />
        <Control
          label="›"
          onPress={tap(onNext)}
          disabled={page >= pageCount}
          accessibilityLabel="Next page"
        />
        <Control label="◐" onPress={tap(onScreenOff)} accessibilityLabel="Turn screen off" />
      </View>

      <AppText variant="caption" muted center style={styles.counter}>
        {page} of {pageCount}
      </AppText>
    </Animated.View>
  );
}

function Control({
  label,
  onPress,
  disabled,
  wide,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  wide?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        wide && styles.controlWide,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <AppText variant="subheading" center style={{ color: player.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: space.lg },
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.sm },
  control: {
    minWidth: 52,
    minHeight: 52, // comfortable target for a tired adult in the dark
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: player.surface,
  },
  controlWide: { minWidth: 76 },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.25 },
  counter: { marginTop: space.md, opacity: 0.6 },
});

/**
 * §8 — screen-off, first-class. Covers everything: art, text, controls.
 * Audio continues; only the visuals go.
 *
 * **No story text here, deliberately.** Showing it would make this a dimmer
 * copy of the normal player rather than a distinct mode. §8 is explicit that
 * the screen is secondary and, for many families, unwanted: phone face-down,
 * dark room, voice only.
 *
 * The hint FADES OUT after a few seconds. A permanently-lit label in a dark
 * room is a glow beside a sleeping child — precisely what this mode exists to
 * remove. It says its piece, then the screen genuinely goes dark. The tap
 * target stays live at full size regardless of whether anything is visible.
 */
const HINT_VISIBLE_MS = 4000;

export function ScreenOffOverlay({ onRestore }: { onRestore: () => void }) {
  const hint = useSharedValue(1);

  useEffect(() => {
    // Long fade, never a cut (§6) — even on the way to darkness.
    hint.value = withDelay(HINT_VISIBLE_MS, withTiming(0, { duration: 2500 }));
  }, [hint]);

  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }));

  return (
    <Animated.View entering={FadeIn.duration(800)} style={overlay.root}>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
          onRestore();
        }}
        style={overlay.tap}
        accessibilityRole="button"
        accessibilityLabel="Show screen"
      >
        <Animated.View style={hintStyle}>
          <AppText variant="subheading" muted center style={overlay.label}>
            Screen off
          </AppText>
          <AppText variant="body" muted center style={overlay.hint}>
            Tap anywhere to bring it back
          </AppText>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const overlay = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.screenOff,
    zIndex: 10,
  },
  // Centred both axes — the previous version pinned it to the bottom.
  tap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  label: { opacity: 0.5 },
  hint: { opacity: 0.32, marginTop: space.sm },
});
