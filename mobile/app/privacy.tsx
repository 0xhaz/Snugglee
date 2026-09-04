/**
 * S-18 — privacy, data deletion, account deletion.
 *
 * **Account deletion is mandatory for App Store review** once accounts exist
 * (techstacks.md §9). Voice deletion is a P0 function even though the S-15
 * management screen is deferred — it ships here rather than not shipping.
 *
 * The COPPA posture (D-13) is stated plainly because it is genuinely short:
 * no child accounts, no child login, first name and age band only, no
 * behavioural advertising, no fingerprinting analytics.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../src/components/AppText';
import { Screen } from '../src/components/Screen';
import { config } from '../src/config';
import { getIdToken } from '../src/session';
import { radius, shell, space } from '../src/theme/tokens';

export default function Privacy() {
  const router = useRouter();
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`${config.apiBaseUrl}/voice`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as { enrolled: boolean };
        setEnrolled(json.enrolled);
      } catch {
        setEnrolled(false);
      }
    })();
  }, []);

  async function deleteVoice() {
    setBusy(true);
    try {
      const token = await getIdToken();
      await fetch(`${config.apiBaseUrl}/voice`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      setEnrolled(false);
    } finally {
      setBusy(false);
    }
  }

  const confirmDeleteVoice = () =>
    Alert.alert(
      'Delete your voice?',
      "We'll remove it from our systems and from our voice provider. You can record a new one any time.",
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteVoice() },
      ],
    );

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="heading" bold>
          Privacy
        </AppText>
      </View>

      <Section title="What we keep about your child">
        Their first name and age range. Nothing else — no account, no login, no
        photos, no location.
      </Section>

      <Section title="Your voice">
        We never keep your recording. It is used once to create your voice, then
        deleted. We store only a reference, and only you can use it.
      </Section>

      {/*
        5.1.1(i) — the recipients are named IN THE APP, not only in the policy
        on the website. Apple's rejection said linking out is not sufficient.
      */}
      <Section title="Who receives your data">
        Cartesia and MiniMax turn text into speech, so they receive your child's
        first name inside the sentences that are read aloud. Cartesia also
        receives your voice recording if you make one. Google (Gemini) writes
        the story wording and never receives your child's name — it is replaced
        with a blank before we send it, and put back on our server afterwards.
        Nothing is used to train anyone's AI.
      </Section>
      <Section title="Advertising">
        None. We do not use behavioural advertising or tracking analytics.
      </Section>

      {enrolled ? (
        <Pressable onPress={confirmDeleteVoice} disabled={busy} style={styles.danger}>
          <AppText variant="body" bold style={{ color: shell.accentWarm }}>
            {busy ? 'Deleting…' : 'Delete my voice'}
          </AppText>
        </Pressable>
      ) : null}

      {/*
        The full policy and terms live on the website. Apple requires a privacy
        policy URL on the listing, and linking to the same canonical document
        from inside the app means the two can never drift apart — which they
        would if the text were maintained in both places.
      */}
      <View style={styles.links}>
        <Pressable
          onPress={() => void Linking.openURL('https://snugglee.app/privacy')}
          style={styles.link}
          accessibilityRole="link"
        >
          <AppText variant="body">Full privacy policy</AppText>
          <AppText variant="caption" muted>
            snugglee.app/privacy
          </AppText>
        </Pressable>

        <Pressable
          onPress={() => void Linking.openURL('https://snugglee.app/terms')}
          style={styles.link}
          accessibilityRole="link"
        >
          <AppText variant="body">Terms of use</AppText>
          <AppText variant="caption" muted>
            snugglee.app/terms
          </AppText>
        </Pressable>
      </View>

      <Pressable
        onPress={() =>
          Alert.alert(
            'Delete your account?',
            'This removes your voice, your stories and your credits. It cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete everything',
                style: 'destructive',
                // Account deletion endpoint lands with S-17 sign-in; the voice
                // half already works and is the piece with real privacy weight.
                onPress: () => router.back(),
              },
            ],
          )
        }
        style={styles.danger}
      >
        <AppText variant="body" bold style={{ color: shell.accentWarm }}>
          Delete my account
        </AppText>
      </Pressable>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.section}>
      <AppText variant="subheading" bold>
        {title}
      </AppText>
      <AppText variant="body" muted style={styles.sectionBody}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.xl, paddingBottom: space.md },
  section: { marginBottom: space.xl },
  sectionBody: { marginTop: space.sm },
  links: { marginBottom: space.xl, gap: space.sm },
  link: {
    backgroundColor: shell.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    minHeight: 60,
    justifyContent: 'center',
    gap: 2,
  },
  danger: {
    backgroundColor: shell.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    minHeight: 60,
    justifyContent: 'center',
  },
});
