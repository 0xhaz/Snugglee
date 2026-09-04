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
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
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
import { addStory, getChild, recordProgress } from '../src/store';
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

  /**
   * Text auto-scroll (§10 — the parent should not have to touch the screen
   * mid-story, and the child must never be invited to).
   *
   * Driven off playback position rather than a timer, so it stays in step
   * through a pause, a seek or a buffering hold. Written straight to the
   * ScrollView imperatively: position updates arrive several times a second and
   * routing them through state would re-render the whole player each time.
   */
  const scrollRef = useRef<ScrollView | null>(null);
  const contentH = useRef(0);
  const viewH = useRef(0);
  /** A parent who scrolls by hand owns the text until this passes. */
  const manualUntil = useRef(0);
  /** Cleared on unmount — see onComplete. */
  const hookTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const lookupVoice = async (): Promise<string | undefined> => {
        try {
          const res = await fetch(`${config.apiBaseUrl}/voice`, {
            headers: { authorization: `Bearer ${token}` },
          });
          if (!res.ok) return undefined;
          const v = (await res.json()) as { enrolled: boolean; voiceId?: string };
          return v.enrolled ? v.voiceId : undefined;
        } catch {
          return undefined; // stock narrator
        }
      };

      /**
       * Starts a story on the server, which is where the credit is spent.
       *
       * A REPLAY never calls this — it reuses the existing id, so its audio is
       * already cached and it costs neither money nor a credit (design.md §4).
       * Only a new telling is charged.
       */
      const startStory = async (): Promise<{ storyId: string } | 'paywall' | null> => {
        try {
          const res = await fetch(`${config.apiBaseUrl}/story`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ childName: name, theme: skeleton }),
          });
          // 402 is the paywall. The balance is server-authoritative (D-03), so
          // this is the only place that decides a parent has run out.
          if (res.status === 402) return 'paywall';
          if (!res.ok) return null;
          const manifest = (await res.json()) as { storyId: string };
          return manifest.storyId ? { storyId: manifest.storyId } : null;
        } catch {
          return null;
        }
      };

      /**
       * In parallel — these are independent, and running them in sequence would
       * add a whole round trip to time-to-first-audio, which is the one number
       * GATE-B measures.
       */
      const [voiceId, started] = await Promise.all([
        lookupVoice(),
        existingId ? Promise.resolve(null) : startStory(),
      ]);
      if (cancelled) return;

      if (started === 'paywall') {
        // Purchase sits behind the parental gate (§4, S-14) — always.
        router.replace({ pathname: '/parental-gate', params: { next: '/paywall' } });
        return;
      }

      /**
       * Reuse the id when replaying from the library, so cached audio is found
       * and the replay genuinely costs nothing (design.md §4, offline replay).
       *
       * The server's id is used for a new story so the generated-page cache and
       * the abandonment record line up with a real document. Falling back to a
       * local id keeps the story playing if the start call failed — better a
       * free story than no story at bedtime.
       */
      const storyId = (existingId as string) ?? started?.storyId ?? `${skeleton}-${Date.now()}`;

      if (!existingId) {
        /**
         * A new story always belongs to the child the app is currently set to.
         * Looked up here rather than threaded through the theme picker so it
         * cannot drift out of step with the profile screen.
         */
        const child = await getChild();
        if (cancelled) return;
        void addStory({
          id: storyId,
          childId: child?.id ?? 'unknown',
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
            // New page, new text — back to the top, and the parent's manual
            // scroll on the previous page does not carry over.
            manualUntil.current = 0;
            scrollRef.current?.scrollTo({ y: 0, animated: false });
            void fetchText(n, token, storyId);
          },
          // Hold, never stop. The image stays, the drift continues.
          onBuffering: () => setHolding(true),
          onProgress: (_n, fraction) => {
            if (Date.now() < manualUntil.current) return;
            const max = contentH.current - viewH.current;
            // Short pages fit without scrolling; leave them alone.
            if (max <= 0) return;
            scrollRef.current?.scrollTo({ y: max * fraction, animated: true });
          },
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
            hookTimer.current = setTimeout(() => {
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
      queueRef.current = null;
      /**
       * A pending voice hook must not outlive the screen that scheduled it.
       * Left running, closing a story six seconds before the timer fires
       * replaces whatever the parent navigated to with the enrolment ask.
       */
      if (hookTimer.current) clearTimeout(hookTimer.current);
      hookTimer.current = null;
    };
  }, [skeleton, name]);

  /**
   * The real story id matters here, it is not cosmetic.
   *
   * This used to post a literal `x`. The server keys its generated-page cache
   * on the story, so a placeholder means pages 2+ can never be personalised and
   * — worse, once they can be — every replay would re-bill generation instead
   * of reading the cache. The audio route sends the same id, which is what lets
   * both resolve to the identical string.
   */
  async function fetchText(n: number, token: string, storyId: string) {
    try {
      const url =
        `${config.apiBaseUrl}/story/${encodeURIComponent(storyId)}/page/${n}` +
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
        {/*
          The text has to be CLIPPED, not just laid out. Previously this was a
          plain centred View, so a long page overflowed its box in both
          directions and rendered on top of the artwork above it.
        */}
        <ScrollView
          ref={scrollRef}
          style={styles.textScroll}
          contentContainerStyle={styles.textContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={(_w, h) => {
            contentH.current = h;
          }}
          onLayout={(e) => {
            viewH.current = e.nativeEvent.layout.height;
          }}
          onScrollBeginDrag={() => {
            // Hand control back to the narration after a while, so a parent who
            // nudged the text once is not left with a frozen page all story.
            manualUntil.current = Date.now() + 10_000;
          }}
        >
          <AppText variant="body" story muted center>
            {done
              ? // Narrative-safe ending — resolves the story rather than
                // abandoning it. A product requirement, not error handling (§4).
                `And so ${name} closed their eyes, safe and warm, and drifted off to sleep.`
              : text || `${name} is not quite ready to sleep…`}
          </AppText>
        </ScrollView>

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
          onExit={() => {
            /**
             * Silence FIRST, navigate second.
             *
             * Relying on the unmount cleanup is not enough: the stack animates
             * with a fade (_layout.tsx), so this screen stays mounted for the
             * whole transition and the story goes on narrating over the
             * library. stop() is idempotent, so the cleanup running afterwards
             * is harmless.
             */
            queueRef.current?.stop();
            if (router.canGoBack()) router.back();
            else router.replace('/home');
          }}
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
  caption: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xl, overflow: 'hidden' },
  textScroll: { flex: 1 },
  // Short pages stay optically centred; long ones start at the top and scroll.
  textContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.lg },
  hold: { marginTop: space.lg, opacity: 0.5 },
  gate: { marginTop: space.xl, padding: space.md, borderRadius: 8, backgroundColor: '#00000055' },
});
