/**
 * S-06 — voice recording. ~20 seconds (see the script note below).
 *
 * States that matter (design.md §4): idle, recording, too-short, too-noisy,
 * uploading, cloning, clone-failed, success.
 *
 * The parent is given a SCRIPT rather than "say something" — see ENROLMENT_SCRIPT.
 */
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
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
import { radius, shell, space } from '../src/theme/tokens';

/**
 * ENROLMENT SCRIPT — fixed, not improvised.
 *
 * Two jobs, and they pull in different directions:
 *
 * 1. **Phonetic coverage.** The clone reproduces sounds it has heard. This
 *    script hits 38 of ~40 English phonemes (missing only /ɔɪ/ and /θ/, both
 *    genuinely hard to place in bedtime language without sounding odd). The
 *    previous script covered 18/40 — under half — and ran only ~7 seconds,
 *    which is *below* the minimum and would have tripped the too-short branch.
 *
 * 2. **Register.** Tone does not come from phoneme coverage; it comes from how
 *    the line is read. A phonetically perfect but flatly-read pangram produces
 *    a flat clone. So the script is real bedtime language the parent can mean,
 *    not "the quick brown fox" — and it is close to what the child will
 *    actually hear, so the register transfers.
 *
 * The two are reconciled by writing the pangram *as* a goodnight, rather than
 * bolting phonetics onto a test sentence.
 *
 * ⚠️ Runs ~20-25s at bedtime pace, not the 15s in D-06. That is deliberate:
 * SPIKE-02 found every O-02 clone we judged used a **60-second** reference, so
 * 15s was never actually validated. Longer is safer for clone quality, and the
 * cost of asking is a few extra seconds once.
 */
const ENROLMENT_SCRIPT =
  'Goodnight, my love. The day is finished now. The birds have gone to bed, ' +
  'the stars are out, and the house is soft and quiet. Close your eyes. ' +
  'I am here, and I will be here when the morning comes. ' +
  'Sleep gently. I love you so much.';

const TARGET_MS = 22_000;
const MIN_MS = 12_000;

type Phase = 'idle' | 'recording' | 'tooShort' | 'uploading' | 'cloning' | 'failed' | 'done';

/**
 * Why the enrolment did not take.
 *
 * The copy stays gentle and non-technical (§2 — never a code, never a stack),
 * but the CAUSES are kept apart, because they need different actions from the
 * parent. Collapsing them into one "that did not quite take" left a parent
 * retrying forever against a daily cap that no amount of retrying clears.
 */
type Failure = 'rateLimited' | 'tooQuiet' | 'network';

const FAILURE_COPY: Record<Failure, string> = {
  rateLimited:
    'We have made a few voices today already. Your voice will keep — try again tomorrow.',
  tooQuiet: 'That came through very quietly. Somewhere a little quieter, perhaps?',
  network: 'That did not quite take. Shall we try once more?',
};

export default function Record() {
  const router = useRouter();
  const { childName, role } = useLocalSearchParams<{ childName: string; role: string }>();
  const name = childName ?? 'your child';

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState<Failure>('network');
  const [granted, setGranted] = useState<boolean | null>(null);

  const pulse = useSharedValue(0);

  useEffect(() => {
    (async () => {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      setGranted(perm.granted);
      if (perm.granted) {
        try {
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        } catch {
          // Non-fatal — recording usually still works; start() catches the rest.
        }
      }
    })();
  }, []);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: phase === 'recording' ? 1 + pulse.value * 0.12 : 1 }],
    opacity: phase === 'recording' ? 0.35 + pulse.value * 0.35 : 0.25,
  }));

  const elapsed = state.durationMillis ?? 0;
  const progress = Math.min(elapsed / TARGET_MS, 1);

  async function start() {
    setPhase('recording');
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      // The recorder itself can refuse — another app holding the mic, or a
      // session the OS tore down while we were backgrounded. Previously this
      // rejected unhandled and left the screen stuck in 'recording' with a
      // timer that never moved.
      setFailure('network');
      setPhase('failed');
    }
  }

  async function stop() {
    try {
      await recorder.stop();
    } catch {
      // Falls through to the uri check below, which handles a missing file.
    }
    const uri = recorder.uri;

    if (elapsed < MIN_MS || !uri) {
      setPhase('tooShort');
      return;
    }

    setPhase('uploading');
    try {
      const file = new File(uri);
      const base64 = await file.base64();
      const token = await getIdToken();

      setPhase('cloning');
      const res = await fetch(`${config.apiBaseUrl}/voice/enrol`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        /**
         * The clone is tagged with the parent's own language, not 'en'. The
         * vendor uses it to pick the acoustic model, and it is stored on the
         * voice record so every later synthesis routes the same way.
         *
         * The enrolment script above is still English. SPIKE-02 confirmed a 15s
         * English sample clones cross-lingually, so this is sound — but a
         * per-language script is the better answer once those languages ship.
         */
        body: JSON.stringify({ sampleBase64: base64, role, lang: config.language, consent: true }),
      });
      if (!res.ok) {
        // 429 is the daily clone cap (VOX-03); 400 is a sample the server would
        // not accept. Neither is worth another identical retry.
        setFailure(res.status === 429 ? 'rateLimited' : res.status === 400 ? 'tooQuiet' : 'network');
        setPhase('failed');
        return;
      }

      // The local recording is deleted immediately. The server never stores it
      // either — only the voice_id (D-07).
      try {
        file.delete();
      } catch {
        /* best effort */
      }

      setPhase('done');
      router.replace({ pathname: '/reveal', params: { childName: name } });
    } catch {
      // Pre-response: DNS, TLS, offline, or a body too large to serialise.
      setFailure('network');
      setPhase('failed');
    }
  }

  /** Always available once something has gone wrong — see the render below. */
  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }

  if (granted === false) {
    return (
      <Screen center>
        <AppText variant="heading" bold center>
          We need the microphone
        </AppText>
        <AppText variant="body" muted center style={styles.body}>
          Snugglee can only make your voice if it can hear it. You can turn this on in Settings.
        </AppText>
        <Pressable onPress={leave} style={styles.leave} accessibilityRole="button">
          <AppText variant="body" muted center>
            Back to stories
          </AppText>
        </Pressable>
      </Screen>
    );
  }

  // Nothing to retry on a daily cap — offering the button would just fail again.
  const canRetry = phase === 'idle' || phase === 'tooShort' || (phase === 'failed' && failure !== 'rateLimited');
  const stuck = phase === 'tooShort' || phase === 'failed';

  return (
    // `scroll` so the long enrolment script plus both buttons stay reachable on
    // a small screen with the keyboard-free error states.
    <Screen center scroll>
      <View style={styles.center}>
        {/*
          The ring is a live indicator, not decoration: it pulses while
          recording. In the settled error states it is a meaningless coloured
          disc, so it goes — which is what made the failure screen look broken
          rather than calm.
        */}
        {stuck ? null : (
          <Animated.View style={[styles.ring, ring]}>
            {/* Drawn rather than an icon font — the app ships no icon set. */}
            <View style={styles.micCapsule} />
            <View style={styles.micStem} />
            <View style={styles.micBase} />
          </Animated.View>
        )}

        <AppText variant="subheading" bold center style={styles.script}>
          {phase === 'recording' || phase === 'idle' ? ENROLMENT_SCRIPT : ''}
        </AppText>

        <AppText variant="body" muted center style={styles.status}>
          {phase === 'idle' &&
            `Read this out loud, slowly and warmly — the way you would to ${name}.`}
          {phase === 'recording' && `${Math.round(elapsed / 1000)}s — keep going`}
          {phase === 'tooShort' && 'A little more, so we catch your voice properly.'}
          {phase === 'uploading' && 'Got it…'}
          {phase === 'cloning' && 'Making your voice…'}
          {/* Errors are never technical and never terminal (§2). */}
          {phase === 'failed' && FAILURE_COPY[failure]}
        </AppText>

        {phase === 'recording' ? <View style={styles.track}><View style={[styles.fill, { width: `${progress * 100}%` }]} /></View> : null}
      </View>

      {canRetry ? (
        <PrimaryButton label={phase === 'idle' ? 'Start recording' : 'Try again'} onPress={start} />
      ) : phase === 'recording' ? (
        <PrimaryButton label="Done" onPress={stop} disabled={elapsed < MIN_MS} />
      ) : null}

      {/*
        The way out. Without this the error state was a dead end: one button
        that retried, and no way back to the stories — on a screen a parent
        reaches at bedtime, having already been promised the story is over.
      */}
      {stuck ? (
        <Pressable onPress={leave} style={styles.leave} accessibilityRole="button">
          <AppText variant="body" muted center>
            {failure === 'rateLimited' ? 'Back to stories' : 'Not tonight'}
          </AppText>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', marginBottom: space.xl },
  ring: {
    width: 140,
    height: 140,
    borderRadius: radius.pill,
    backgroundColor: shell.accent,
    marginBottom: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Microphone, drawn from three primitives. Sits on `accent`, so it uses the
     ground colour for contrast rather than white-on-periwinkle. */
  micCapsule: {
    width: 20,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: shell.background,
  },
  micStem: { width: 3, height: 10, backgroundColor: shell.background, marginTop: 4 },
  micBase: { width: 26, height: 3, borderRadius: radius.pill, backgroundColor: shell.background },
  script: { marginBottom: space.lg },
  status: { minHeight: 56 },
  body: { marginTop: space.md },
  track: {
    width: '70%',
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: shell.surface,
    marginTop: space.md,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: shell.accent },
  leave: { marginTop: space.lg, padding: space.md, opacity: 0.7 },
});
