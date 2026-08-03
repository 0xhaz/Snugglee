/**
 * S-14 — parental gate.
 *
 * design.md §4: required before purchase flows and external links, and
 * **must not be defeatable by a four-year-old**. Sits in front of S-08 and S-16.
 *
 * A written-word arithmetic question, not a number pad. Digits are recognisable
 * to a preschooler who can count; "seven plus four" written as words needs
 * reading. It also avoids the date-of-birth pattern, which collects data we
 * have no business holding (D-13: no child PII beyond first name and age band).
 *
 * Deliberately not a maths *test* — a tired adult should pass first time.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '../src/components/AppText';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { radius, shell, space, type } from '../src/theme/tokens';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

export default function ParentalGate() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();

  // Fixed per mount so the question does not change under the user.
  const { a, b } = useMemo(
    () => ({ a: 3 + Math.floor(Math.random() * 6), b: 2 + Math.floor(Math.random() * 6) }),
    [],
  );

  const [answer, setAnswer] = useState('');
  const [wrong, setWrong] = useState(false);

  const submit = () => {
    if (Number(answer.trim()) === a + b) {
      router.replace((next as '/paywall') ?? '/paywall');
    } else {
      setWrong(true);
      setAnswer('');
    }
  };

  return (
    <Screen center scroll>
      <AppText variant="heading" bold center>
        A quick check
      </AppText>
      <AppText variant="body" muted center style={styles.sub}>
        Just making sure a grown-up is here.
      </AppText>

      <AppText variant="title" bold center style={styles.question}>
        What is {WORDS[a]} plus {WORDS[b]}?
      </AppText>

      <TextInput
        value={answer}
        onChangeText={(t) => {
          setAnswer(t);
          setWrong(false);
        }}
        onSubmitEditing={submit}
        keyboardType="number-pad"
        returnKeyType="go"
        maxLength={2}
        autoFocus
        style={styles.input}
        accessibilityLabel="Answer"
      />

      <View style={styles.hint}>
        {wrong ? (
          <AppText variant="caption" center style={{ color: shell.accentWarm }}>
            Not quite — have another go.
          </AppText>
        ) : null}
      </View>

      <PrimaryButton label="Continue" onPress={submit} disabled={!answer.trim()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: space.sm },
  question: { marginTop: space.xl, marginBottom: space.lg },
  input: {
    fontSize: type.title,
    color: shell.text,
    backgroundColor: shell.surface,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    textAlign: 'center',
    minHeight: 72,
  },
  hint: { minHeight: 32, justifyContent: 'center' },
});
