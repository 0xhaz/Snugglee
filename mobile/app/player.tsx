/**
 * S-03 — story player. The centre of the product.
 *
 * design.md §11: "differentiation must come from the player, not the shell", so
 * the craft budget belongs here. What is wired:
 *
 *   - Ken Burns drift, 25s per page — reads as breathing, not movement (§6)
 *   - Progressive dim across the arc — the transition between registers (§5)
 *   - Long cross-fade between panels, never a cut (§6)
 *   - Audio queue at prefetch depth 2 (D-16)
 *   - Buffering HOLD rather than a stop — no dead air, ever (§2)
 *   - Narrative-safe ending if generation fails (§4) — a product requirement
 *   - Abandonment reporting, the key business metric (ECONOMICS.md §5)
 *
 * NOT YET: screen-off mode and lock-screen playback (§8, CLI-24) — those need
 * an EAS dev build, since Expo Go does not apply config plugin options.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { StoryAudioQueue } from '../src/audio/queue';
import { AppText } from '../src/components/AppText';
import { PlayerControls, ScreenOffOverlay } from '../src/components/PlayerControls';
import { Screen } from '../src/components/Screen';
import { config } from '../src/config';
import { mark, onSummary, verdict, type Summary } from '../src/metrics';
import { getIdToken } from '../src/session';
import { panelForPage } from '../src/stories/art';
import { addStory, recordProgress } from '../src/store';
import { motion, player as playerTokens, space } from '../src/theme/tokens';

const PAGE_COUNT = 12;

const TITLES: Record<string, string> = {
  moon: 'To the moon',
  garden: 'The firefly garden',
  train: 'The slow train',
};

export default function Player() {
  const { childName, theme, storyId: existingId } = useLocalSearchParams<{
    childName: string;
    theme: string;
    storyId?: string;
  }>();
  const { width } = useWindowDimensions();
  const skeleton = theme ?? 'moon';
  const name = childName ?? 'you';

  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const [gate, setGate] = useState<Summary | null>(null);
  const [paused, setPaused] = useState(false);
  const [screenOff, setScreenOff] = useState(false);
  const router = useRouter();
  const queueRef = useRef<StoryAudioQueue | null>(null);

  const drift = useSharedValue(0);
  const progress = useSharedValue(0);

  // GATE-B readout. Dev only — the gate is measured on a real device where
  // scrolling Metro logs mid-run is impractical.
  useEffect(() => onSummary(setGate), []);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration: motion.pageDriftMs, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [drift]);

  /** Progressive dim tracks story position, not wall-clock. */
  useEffect(() => {
    progress.value = withTiming((page - 1) / (PAGE_COUNT - 1), { duration: 2000 });
  }, [page, progress]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await getIdToken();
      mark('session_ready');
      if (cancelled) return;

      /**
       * Use the parent's voice if they have one. This is the product's whole
       * thesis (§1) — once enrolled, the stock narrator is a downgrade.
       *
       * Deliberately non-blocking on failure: if the lookup errors we fall
       * back to stock rather than delaying first audio. A story in the wrong
       * voice beats no story at bedtime.
       */
      let voiceId: string | undefined;
      try {
        const res = await fetch(`${config.apiBaseUrl}/voice`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const v = (await res.json()) as { enrolled: boolean; voiceId?: string };
          if (v.enrolled) voiceId = v.voiceId;
        }
      } catch {
        /* stock narrator */
      }
      if (cancelled) return;

      /**
       * Reuse the id when replaying from the library, so cached audio is found
       * and the replay genuinely costs nothing (design.md §4, offline replay).
       */
      const storyId = (existingId as string) ?? `${skeleton}-${Date.now()}`;

      if (!existingId) {
        void addStory({
          id: storyId,
          theme: skeleton,
          title: TITLES[skeleton] ?? 'A bedtime story',
          childName: name,
          createdAt: Date.now(),
          voiceId,
        });
      }

      const queue = new StoryAudioQueue({
        storyId,
        theme: skeleton,
        childName: name,
        pageCount: PAGE_COUNT,
        baseUrl: config.apiBaseUrl,
        token,
        voiceId,
        events: {
          onPageStart: (n) => {
            setHolding(false);
            setPage(n);
            void fetchText(n, token);
          },
          // Hold, never stop. The image stays, the drift continues.
          onBuffering: () => setHolding(true),
          onComplete: () => {
            setDone(true);
            /**
             * D-06 — the voice hook fires HERE, at the end of the story, and
             * nowhere else. design.md §2 restates this because it is the rule
             * most likely to be broken by a refactor: the voice ask never
             * precedes the story.
             *
             * The delay lets the narrative-safe ending land first. Cutting
             * straight to an upsell over a sleeping child would undo the
             * moment we just built.
             */
            setTimeout(() => {
              router.replace({ pathname: '/voice-hook', params: { childName: name } });
            }, 6000);
          },
          onAbandon: (lastPageHeard) => {
            void recordProgress(storyId, lastPageHeard);
            // Fire-and-forget: measuring must never delay teardown.
            void fetch(`${config.apiBaseUrl}/story/${storyId}/abandon`, {
              method: 'POST',
              headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
              body: JSON.stringify({ lastPageHeard }),
            }).catch(() => {});
          },
        },
      });

      queueRef.current = queue;
      void queue.start();
    })();

    return () => {
      cancelled = true;
      queueRef.current?.stop();
    };
  }, [skeleton, name]);

  async function fetchText(n: number, token: string) {
    try {
      const url =
        `${config.apiBaseUrl}/story/x/page/${n}` +
        `?theme=${encodeURIComponent(skeleton)}&childName=${encodeURIComponent(name)}&reached=${n}`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const json = (await res.json()) as { text: string };
      if (n === 1) mark('page1_text');
      setText(json.text);
    } catch {
      // Text is decoration; the audio is the product. Never surface this.
    }
  }

  const art = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(drift.value, [0, 1], [1.0, 1.08]) },
      { translateX: interpolate(drift.value, [0, 1], [-8, 8]) },
    ],
    opacity: interpolate(progress.value, [0, 1], [motion.dimFrom, motion.dimTo]),
  }));

  const panel = panelForPage(skeleton, page);

  return (
    <Screen register="player" bleed>
      <View style={[styles.stage, { height: width }]}>
        {panel ? (
          // Keyed on the panel so a change cross-fades rather than cutting (§6).
          <Animated.View
            key={String(panel)}
            entering={FadeIn.duration(motion.pageCrossfadeMs)}
            style={[StyleSheet.absoluteFill, art]}
          >
            <Image source={panel} style={styles.art} resizeMode="cover" />
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.caption}>
        <AppText variant="body" story muted center>
          {done
            ? // Narrative-safe ending — resolves the story rather than
              // abandoning it. A product requirement, not error handling (§4).
              `And so ${name} closed their eyes, safe and warm, and drifted off to sleep.`
            : text || `${name} is not quite ready to sleep…`}
        </AppText>

        {/* Holding, not stopped. No spinner — §2. */}
        {holding ? (
          <AppText variant="caption" muted center style={styles.hold}>
            …
          </AppText>
        ) : null}

        <PlayerControls
          page={page}
          pageCount={PAGE_COUNT}
          paused={paused}
          screenOff={screenOff}
          onTogglePause={() => {
            const q = queueRef.current;
            if (!q) return;
            paused ? q.resume() : q.pause();
            setPaused(!paused);
          }}
          onPrev={() => queueRef.current?.seek(Math.max(1, page - 1))}
          onNext={() => queueRef.current?.seek(Math.min(PAGE_COUNT, page + 1))}
          onScreenOff={() => setScreenOff((v) => !v)}
          onExit={() => router.back()}
        />

        {__DEV__ && gate ? (
          <View style={styles.gate}>
            <AppText variant="caption" center bold>
              {verdict(gate).pass ? 'GATE-B PASS' : 'GATE-B MISS'} ·{' '}
              {gate.timeToFirstAudio}ms to first audio
            </AppText>
            {gate.breakdown.map((b) => (
              <AppText key={b.label} variant="caption" muted center>
                {b.label}: {b.ms}ms
              </AppText>
            ))}
          </View>
        ) : null}
      </View>
      {/*
        §8 — screen-off is FIRST-CLASS, not a fallback. Phone face-down, dark
        room, voice only. Rendered last and absolutely positioned so it covers
        art, text AND controls; audio keeps playing underneath.
      */}
      {screenOff ? <ScreenOffOverlay onRestore={() => setScreenOff(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', overflow: 'hidden', backgroundColor: playerTokens.background },
  art: { width: '100%', height: '100%' },
  caption: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xl },
  hold: { marginTop: space.lg, opacity: 0.5 },
  gate: { marginTop: space.xl, padding: space.md, borderRadius: 8, backgroundColor: '#00000055' },
});
