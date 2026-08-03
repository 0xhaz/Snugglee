/**
 * S-01 — child name capture. T+0:00 on the Day-0 critical path.
 *
 * design.md §3 budgets 5 seconds from here to the theme tiles, and §2's user is
 * a tired adult with an impatient child in the room. So: one field, autofocus,
 * submit on return. No welcome carousel, no account wall, no permissions.
 *
 * **No blocking account wall before first value** (§2) — the anonymous session
 * is created silently in the background; identity is asked for much later (S-17).
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '../src/components/AppText';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { mark } from '../src/metrics';
import { getChild, setChild } from '../src/store';
import { ensureSession } from '../src/session';
import { radius, shell, space, type } from '../src/theme/tokens';

const MAX_NAME = 24;

export default function NameCapture() {
  const router = useRouter();
  const [name, setName] = useState('');

  useEffect(() => {
    mark('app_open');
    /**
     * Returning parents skip straight to the library. S-01 is a Day-0 screen —
     * asking for the child's name every night would be absurd, and design.md §3
     * budgets five seconds from launch to choosing a story.
     */
    void getChild().then((child) => {
      if (child?.name) router.replace('/home');
    });
    // Warm the anonymous session while the parent types, so it is not on the
    // critical path after the theme tap (§2: no account wall before value).
    void ensureSession().catch(() => {});
  }, [router]);

  const trimmed = name.trim();
  const tooLong = trimmed.length > MAX_NAME;
  const valid = trimmed.length > 0 && !tooLong;

  const go = () => {
    if (!valid) return;
    // Stored locally, never sent to the server — D-13 keeps child data minimal.
    void setChild({ name: trimmed });
    router.push({ pathname: '/themes', params: { childName: trimmed } });
  };

  return (
    <Screen center scroll>
      <Animated.View entering={FadeIn.duration(600)}>
        <AppText variant="display" bold>
          Who is the story for?
        </AppText>
        <AppText variant="body" muted style={styles.sub}>
          Just their first name — it's all we keep.
        </AppText>

        <TextInput
          value={name}
          onChangeText={setName}
          onSubmitEditing={go}
          placeholder="Amir"
          placeholderTextColor={shell.textMuted}
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="go"
          maxLength={MAX_NAME + 8}
          style={styles.input}
          accessibilityLabel="Child's first name"
        />

        {/* Errors are never technical (§2) — this reads as guidance, not failure. */}
        <View style={styles.hintRow}>
          {tooLong ? (
            <AppText variant="caption" style={{ color: shell.accentWarm }}>
              That's a long one — try something shorter.
            </AppText>
          ) : null}
        </View>

        <PrimaryButton label="Next" onPress={go} disabled={!valid} />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: space.sm, marginBottom: space.xl },
  input: {
    fontSize: type.heading,
    color: shell.text,
    backgroundColor: shell.surface,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 64,
  },
  hintRow: { minHeight: 28, justifyContent: 'center', paddingVertical: space.sm },
});
