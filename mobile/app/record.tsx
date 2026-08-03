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
import { StyleSheet, View } from 'react-native';
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

export default function Record() {
  const router = useRouter();
  const { childName, role } = useLocalSearchParams<{ childName: string; role: string }>();
  const name = childName ?? 'your child';

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<Phase>('idle');
  const [granted, setGranted] = useState<boolean | null>(null);

  const pulse = useSharedValue(0);

  useEffect(() => {
    (async () => {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      setGranted(perm.granted);
      if (perm.granted) await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
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
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function stop() {
    await recorder.stop();
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
        body: JSON.stringify({ sampleBase64: base64, role, lang: 'en', consent: true }),
      });
      if (!res.ok) throw new Error(String(res.status));

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
      setPhase('failed');
    }
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
      </Screen>
    );
  }

  return (
    <Screen center>
      <View style={styles.center}>
        <Animated.View style={[styles.ring, ring]} />

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
          {phase === 'failed' && 'That did not quite take. Shall we try once more?'}
        </AppText>

        {phase === 'recording' ? <View style={styles.track}><View style={[styles.fill, { width: `${progress * 100}%` }]} /></View> : null}
      </View>

      {phase === 'idle' || phase === 'tooShort' || phase === 'failed' ? (
        <PrimaryButton label={phase === 'idle' ? 'Start recording' : 'Try again'} onPress={start} />
      ) : phase === 'recording' ? (
        <PrimaryButton label="Done" onPress={stop} disabled={elapsed < MIN_MS} />
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
  },
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
});
