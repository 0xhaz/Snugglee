/**
 * S-07 — THE REVEAL. The closing line in the parent's own voice.
 *
 * This is the emotional peak of the product, the paywall trigger, and the
 * climax of the demo video (D-06). design.md §11 is explicit that the craft
 * budget belongs here rather than in the shell, and §7 names this as the one
 * place a richer haptic pattern is warranted.
 *
 * So: no chrome, no buttons until it has played, no progress bar. The screen
 * goes almost dark, the line arrives, and nothing competes with it.
 */
import * as Haptics from 'expo-haptics';
import { createAudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '../src/components/AppText';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { config } from '../src/config';
import { getIdToken } from '../src/session';
import { palette, radius, space } from '../src/theme/tokens';

type Phase = 'preparing' | 'playing' | 'played' | 'failed';

export default function Reveal() {
  const router = useRouter();
  const { childName } = useLocalSearchParams<{ childName: string }>();
  const name = childName ?? 'your child';

  const [phase, setPhase] = useState<Phase>('preparing');
  const [line, setLine] = useState('');
  const glow = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [glow]);

  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + glow.value * 0.08 }],
    opacity: 0.18 + glow.value * 0.22,
  }));

  useEffect(() => {
    let player: ReturnType<typeof createAudioPlayer> | null = null;

    (async () => {
      try {
        const token = await getIdToken();
        const url = `${config.apiBaseUrl}/voice/reveal?childName=${encodeURIComponent(name)}&lang=en`;

        const dir = new Directory(Paths.cache, 'reveal');
        if (!dir.exists) dir.create({ intermediates: true });
        const dest = new File(dir, 'reveal.mp3');
        if (dest.exists) dest.delete();

        const task = File.createDownloadTask(url, dest, {
          headers: { authorization: `Bearer ${token}` },
        });
        const out = await task.downloadAsync();

        // Same validation as the story queue: a JSON error body written to a
        // .mp3 segfaults the native decoder rather than throwing.
        if (!out?.exists || (out.size ?? 0) < 1024) throw new Error('no audio');

        setLine(`Goodnight, ${name}. I love you.`);
        setPhase('playing');

        // §7 — the signature haptic. The one place a richer pattern earns itself.
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        player = createAudioPlayer({ uri: out.uri });
        player.play();
        setTimeout(() => setPhase('played'), 4000);
      } catch {
        setPhase('failed');
      }
    })();

    return () => player?.remove();
  }, [name]);

  return (
    <Screen register="player" center>
      <View style={styles.stage}>
        <Animated.View style={[styles.halo, halo]} />

        {phase === 'preparing' ? (
          <AppText variant="body" muted center>
            One moment…
          </AppText>
        ) : phase === 'failed' ? (
          <AppText variant="body" muted center>
            That did not quite take. Your voice is saved — we can try again.
          </AppText>
        ) : (
          <Animated.View entering={FadeIn.duration(1400)}>
            <AppText variant="display" bold center style={styles.line}>
              {line}
            </AppText>
            <AppText variant="body" muted center style={styles.sub}>
              in your voice
            </AppText>
          </Animated.View>
        )}
      </View>

      {/* Nothing competes with the line until it has finished. */}
      {phase === 'played' || phase === 'failed' ? (
        <Animated.View entering={FadeIn.duration(900)} style={styles.actions}>
          <PrimaryButton label="Continue" onPress={() => router.replace('/paywall')} />
        </Animated.View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center', minHeight: 320 },
  halo: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: radius.pill,
    backgroundColor: palette.moon,
  },
  line: { paddingHorizontal: space.md },
  sub: { marginTop: space.lg, opacity: 0.6 },
  actions: { marginTop: space.xxl },
});
