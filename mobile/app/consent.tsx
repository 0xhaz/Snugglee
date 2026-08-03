/**
 * S-05 — voice consent gate. Also captures the speaker's role.
 *
 * Consent is **explicit, logged, timestamped and revocable** (techstacks.md §9).
 * Not a pre-ticked box, not buried in a policy link: the parent states what
 * happens to their voice before the microphone is ever offered.
 *
 * The three facts that matter are said plainly, because they are genuinely
 * reassuring rather than legalese:
 *   - the recording is not kept
 *   - only the voice can be used, and only by them
 *   - it can be deleted at any time
 *
 * The role picker is here rather than in S-06 (design.md §4.2). In most
 * non-English languages the speaker's own role is grammatically load-bearing —
 * Malay has no neutral form of "I love you" — so the reveal cannot be written
 * without it. It also improves English: "Mummy loves you" beats "I love you"
 * for a four-year-old.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '../src/components/AppText';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { radius, shell, space } from '../src/theme/tokens';

const ROLES = [
  { id: 'mother', label: 'Mummy' },
  { id: 'father', label: 'Daddy' },
  { id: 'grandmother', label: 'Granny' },
  { id: 'grandfather', label: 'Grandad' },
  { id: 'other', label: 'Someone else' },
] as const;

export default function Consent() {
  const router = useRouter();
  const { childName } = useLocalSearchParams<{ childName: string }>();
  const name = childName ?? 'your child';
  const [role, setRole] = useState<string | null>(null);

  return (
    <Screen scroll>
      <Animated.View entering={FadeIn.duration(500)} style={styles.root}>
        <AppText variant="heading" bold>
          Before we record
        </AppText>

        <View style={styles.facts}>
          <Fact>Your recording is used once to make the voice, then deleted. We never keep it.</Fact>
          <Fact>Only you can use your voice. It is never shared, exported, or given to anyone else.</Fact>
          <Fact>You can delete your voice at any time, and we delete it from our provider too.</Fact>
        </View>

        <AppText variant="subheading" bold style={styles.q}>
          Who will {name} hear?
        </AppText>

        <View style={styles.roles}>
          {ROLES.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setRole(r.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: role === r.id }}
              style={[styles.role, role === r.id && styles.roleOn]}
            >
              <AppText variant="body" bold={role === r.id}>
                {r.label}
              </AppText>
            </Pressable>
          ))}
        </View>

        <PrimaryButton
          label="I agree — record my voice"
          disabled={!role}
          onPress={() =>
            router.push({ pathname: '/record', params: { childName: name, role: role! } })
          }
        />

        <View style={styles.skip}>
          <AppText variant="body" muted center onPress={() => router.back()} accessibilityRole="button">
            Not now
          </AppText>
        </View>
      </Animated.View>
    </Screen>
  );
}

function Fact({ children }: { children: string }) {
  return (
    <View style={styles.fact}>
      <AppText variant="body" style={styles.tick}>
        ✓
      </AppText>
      <AppText variant="body" muted style={styles.factText}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: space.xl, paddingBottom: space.xl },
  facts: { marginTop: space.lg, gap: space.md },
  fact: { flexDirection: 'row', gap: space.sm },
  tick: { color: shell.accent },
  factText: { flex: 1 },
  q: { marginTop: space.xl, marginBottom: space.md },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.xl },
  role: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    backgroundColor: shell.surface,
    minHeight: 52,
    justifyContent: 'center',
  },
  roleOn: { backgroundColor: shell.accent },
  skip: { marginTop: space.lg, padding: space.md, opacity: 0.7 },
});
